import React, { useEffect, useMemo, useRef, useState } from "react";
import { SceneModel, SceneObject, defaultYCModel, Units } from "../lib/scene_model";
import { degClamp } from "../lib/scene_model";
import { PRESETS, applyPreset } from "../lib/presets";
import { enforceMinClearance } from "../lib/constraints";
import { detectCollisions, resolveCollisions, countErrors, countWarnings } from "../lib/collision";
import { CLEARANCES, QUALITY, REASONS, ROOM_TEMPLATES, OBJECT_DEFAULTS } from "../lib/physics";
import DimensionOverlay from "./DimensionOverlay";
import CharacterLayer, { CharPlacement } from "./CharacterLayer";
import { renderOverlayPNG } from "../lib/overlay";
import type { CameraPose } from "../lib/camera";
import ElevationEditor from "./ElevationEditor";
import { exportSceneLockJSON, exportIsometricSVG } from "../lib/exporters";
import { YC_DESCRIPTIONS } from "../lib/object_descriptions";
import { PRESETS as FIN_PRESETS } from "../lib/finishes_presets";

type Props = {
  initial?: SceneModel;
  onChange?: (m: SceneModel)=>void;
  onExport?: (m: SceneModel)=>void;
  onBuildPlates?: (m: SceneModel)=>void;
};

const GRID_FT = 0.5;               // snap every 6 inches
const CANVAS_W_FALLBACK = 960, CANVAS_H_FALLBACK = 560;

function uid(){ return Math.random().toString(36).slice(2,9); }
function snap(ft:number){ return Math.round(ft/GRID_FT)*GRID_FT; }
function clamp(v:number, a:number, b:number){ return Math.max(a, Math.min(b, v)); }

export default function SettingDesigner({ initial, onChange, onExport, onBuildPlates }: Props){
  const [model, setModel] = useState<SceneModel>(initial || defaultYCModel());
  const [sel, setSel] = useState<string|null>(null);
  const [units, setUnits] = useState<Units>(model.units || "ft");
  const [scale, setScale] = useState(1);
  const [charPlc, setCharPlc] = useState<CharPlacement[]>([]);
  const [activeTab, setActiveTab] = useState<"plan"|"elevN"|"elevS"|"elevE"|"elevW"|"iso">("plan");
  // settings CRUD state
  type SettingMeta = { id:string; name:string; updatedAt:number };
  const [settings, setSettings] = useState<SettingMeta[]>([]);
  const [activeSettingId, setActiveSettingId] = useState<string|undefined>(undefined);
  const [currentId, setCurrentId] = useState<string|undefined>(undefined);
  const [currentName, setCurrentName] = useState<string>("(unsaved)");
  const [dirty, setDirty] = useState(false);
  const violations = useMemo(()=>detectCollisions(model), [model]);
  const [collisions, setCollisions] = useState<any[]>([]);
  const [showCollisions, setShowCollisions] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showErrors, setShowErrors] = useState(true);
  useEffect(()=>{ setCollisions(detectCollisions(model)); }, [model]);
  const containerRef = useRef<HTMLDivElement|null>(null);
  const [canvasSize, setCanvasSize] = useState<{w:number; h:number}>({ w: 1200, h: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const lastTouches = useRef<{d:number; cx:number; cy:number} | null>(null);
  // iso/elevation zoom & pan
  const [isoZoom, setIsoZoom] = useState(1);
  const [isoPan, setIsoPan] = useState({ x:0, y:0 });
  const lastTouchesIso = useRef<{d:number; cx:number; cy:number} | null>(null);
  const [isoAngle, setIsoAngle] = useState(0);
  const [elevZoom, setElevZoom] = useState(1);
  const [elevPan, setElevPan] = useState({ x:0, y:0 });
  const lastTouchesElev = useRef<{d:number; cx:number; cy:number} | null>(null);
  const [finRefFiles, setFinRefFiles] = useState<FileList|null>(null);
  const [busyFin, setBusyFin] = useState(false);
  const [paletteUrl, setPaletteUrl] = useState<string | null>(null);

  const CANVAS_W = canvasSize.w || CANVAS_W_FALLBACK;
  const CANVAS_H = canvasSize.h || CANVAS_H_FALLBACK;

  const pxPerFt = useMemo(()=>{
    const m = model.room, pad = 40;
    const sx = (CANVAS_W - pad*2) / m.width;
    const sy = (CANVAS_H - pad*2) / m.depth;
    return Math.min(sx, sy);
  }, [model.room]);
  useEffect(()=>setScale(pxPerFt),[pxPerFt]);

  useEffect(()=>{ onChange?.(model); localStorage.setItem("settingDesigner:model", JSON.stringify(model)); }, [model]);
  useEffect(()=>{ const s = localStorage.getItem("settingDesigner:model"); if(s && !initial){ try{ setModel(JSON.parse(s)); }catch{} } }, []);
  useEffect(()=>{ setDirty(true); }, [model]);

  useEffect(()=>{
    function onResize(){
      if(!containerRef.current) return;
      const w = Math.min(window.innerWidth - 80, 1400);
      const h = Math.min(window.innerHeight - 220, 860);
      setCanvasSize({ w, h });
    }
    onResize(); window.addEventListener("resize", onResize);
    return ()=>window.removeEventListener("resize", onResize);
  }, []);

  // coordinate helpers
  const toPx = (ft:number)=> ft*scale;
  const fromPx = (px:number)=> px/scale;
  const toOriginX = ()=> (CANVAS_W - toPx(model.room.width))/2;
  const toOriginY = ()=> (CANVAS_H - toPx(model.room.depth))/2;
  const toCanvasX = (ft:number)=> toPx(ft) + toOriginX();
  const toCanvasY = (ft:number)=> toPx(ft) + toOriginY();
  // inverse helpers for CharacterLayer
  const fromCanvasX = (px:number)=> (px - toOriginX())/scale;
  const fromCanvasY = (px:number)=> (px - toOriginY())/scale;
  const screenToCanvasX = (sx:number)=> (sx / (zoom||1)) - pan.x;
  const screenToCanvasY = (sy:number)=> (sy / (zoom||1)) - pan.y;
  const screenToFtX = (sx:number)=> fromCanvasX(screenToCanvasX(sx));
  const screenToFtY = (sy:number)=> fromCanvasY(screenToCanvasY(sy));

  // pointer interaction
  const dragging = useRef<{id:string; mode:"move"|"resize"|"rotate"|"bubble"; lastX:number; lastY:number} | null>(null);
  const bubbleDir = useRef<"N"|"E"|"S"|"W"|null>(null);

  function getSvgRectFromEvent(e: React.MouseEvent) {
    const el = e.currentTarget as any;
    const svg: any = (el as any).ownerSVGElement || el; // fall back to self if already <svg>
    return (svg as Element).getBoundingClientRect();
  }

  function begin(e:React.MouseEvent, id:string, mode: "move"|"resize"|"rotate"|"bubble", dir?: "N"|"E"|"S"|"W"){
    const rect = getSvgRectFromEvent(e);
    dragging.current = { id, mode, lastX: e.clientX - rect.left, lastY: e.clientY - rect.top };
    bubbleDir.current = dir || null;
  }
  function end(){ dragging.current = null; bubbleDir.current = null; }
  function move(e:React.MouseEvent){
    const drag = dragging.current; if(!drag) return;
    const rect = getSvgRectFromEvent(e);
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - drag.lastX, dy = y - drag.lastY;
    drag.lastX = x; drag.lastY = y;

    const dirNow = bubbleDir.current;

    setModel(m=>{
      const i = m.objects.findIndex(o=>o.id===drag.id);
      if(i<0) return m;
      const o = { ...m.objects[i] };

      if(drag.mode === "move"){
        const nx = snap(fromPx(toPx(o.cx) + dx));
        const ny = snap(fromPx(toPx(o.cy) + dy));
        o.cx = Math.max(0, Math.min(m.room.width, nx));
        o.cy = Math.max(0, Math.min(m.room.depth, ny));
      } else if (drag.mode === "resize"){
        const nw = snap(o.w + fromPx(dx));
        const nd = snap(o.d + fromPx(dy));
        o.w = Math.max(0.2, nw);
        o.d = Math.max(0.2, nd);
      } else if (drag.mode === "rotate"){
        const cx = toCanvasX(o.cx), cy = toCanvasY(o.cy);
        const ang = Math.atan2(y - cy, x - cx) * 180/Math.PI; // -180..180 (0 = east)
        let rot = degClamp(ang + 90);
        if ((e as any).shiftKey) rot = Math.round(rot/15)*15;
        o.rotation = rot; o.facing = rot;
      } else if (drag.mode === "bubble"){
        const dir = dirNow; if(!dir) return m;
        const step = fromPx(Math.abs(dir==="N"||dir==="S" ? dy : dx));
        const sign = (dir==="E"||dir==="S") ? 1 : -1;
        if(dir==="N"||dir==="S") o.cy = Math.max(0, Math.min(m.room.depth, snap(o.cy + sign*step)));
        else o.cx = Math.max(0, Math.min(m.room.width, snap(o.cx + sign*step)));
      }
      const arr = [...m.objects]; arr[i] = o; 
      return { ...m, objects: arr };
    });
  }

  function onSvgMouseDown(e:React.MouseEvent){
    // Hold Space to pan
    if ((e as any).nativeEvent?.getModifierState?.(" ")) { setPanning(true); }
  }
  function onSvgMouseMove(e:React.MouseEvent){
    if(panning){ setPan(p=>({ x: p.x + (e as any).movementX, y: p.y + (e as any).movementY })); return; }
    move(e as any);
  }
  function onSvgMouseUp(){ setPanning(false); end(); }

  // Wheel zoom (centered around cursor)
  function onWheel(e: React.WheelEvent<SVGSVGElement>){
    if (activeTab !== "plan") return;
    const isZoomGesture = e.ctrlKey || e.metaKey; // pinch on mac sets ctrlKey; Cmd/Ctrl+wheel to zoom
    if (isZoomGesture) {
      const delta = -e.deltaY; if (delta === 0) return;
      const factor = delta > 0 ? 1.08 : 0.92;
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const mx = e.clientX - rect.left - pan.x; const my = e.clientY - rect.top - pan.y;
      const newZoom = Math.min(3, Math.max(0.4, zoom * factor));
      const k = newZoom/zoom;
      setPan(p=>({ x: mx - k*(mx - p.x), y: my - k*(my - p.y) }));
      setZoom(newZoom);
      e.preventDefault();
    } else {
      // Two-finger scroll pans the canvas; adjust for zoom so pan feels constant
      const dx = (e.deltaX || 0) / (zoom || 1);
      const dy = (e.deltaY || 0) / (zoom || 1);
      setPan(p=>({ x: p.x - dx, y: p.y - dy }));
      e.preventDefault();
    }
  }

  // Touch pinch-to-zoom + pan with two fingers
  function onTouchStart(e: React.TouchEvent<SVGSVGElement>){
    if (activeTab !== "plan") return;
    if (e.touches.length === 2){
      const [a,b] = [e.touches[0], e.touches[1]];
      const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
      const d = Math.hypot(dx, dy);
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const cx = ((a.clientX + b.clientX)/2) - rect.left - pan.x;
      const cy = ((a.clientY + b.clientY)/2) - rect.top - pan.y;
      lastTouches.current = { d, cx, cy };
    }
  }
  function onTouchMove(e: React.TouchEvent<SVGSVGElement>){
    if (activeTab !== "plan") return;
    if (e.touches.length === 2 && lastTouches.current){
      e.preventDefault();
      const [a,b] = [e.touches[0], e.touches[1]];
      const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
      const d = Math.hypot(dx, dy);
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const cx = ((a.clientX + b.clientX)/2) - rect.left - pan.x;
      const cy = ((a.clientY + b.clientY)/2) - rect.top - pan.y;
      const prev = lastTouches.current;
      const k = d / prev.d;
      const newZoom = Math.min(3, Math.max(0.4, zoom * k));
      const kz = newZoom/zoom;
      setPan(p=>({ x: prev.cx - kz*(prev.cx - p.x), y: prev.cy - kz*(prev.cy - p.y) }));
      setZoom(newZoom);
      lastTouches.current = { d, cx, cy };
    }
  }
  function onTouchEnd(){ lastTouches.current = null; }

  // ---------- Iso handlers ----------
  function onIsoWheel(e: React.WheelEvent<HTMLDivElement>){
    if (activeTab !== "iso") return;
    const isZoomGesture = e.ctrlKey || e.metaKey;
    if (isZoomGesture) {
      const delta = -e.deltaY; if (delta===0) return;
      const factor = delta > 0 ? 1.08 : 0.92;
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const mx = e.clientX - rect.left - isoPan.x; const my = e.clientY - rect.top - isoPan.y;
      const newZoom = Math.min(3, Math.max(0.4, isoZoom * factor));
      const k = newZoom/isoZoom;
      setIsoPan(p=>({ x: mx - k*(mx - p.x), y: my - k*(my - p.y) }));
      setIsoZoom(newZoom); e.preventDefault();
    } else {
      const dx = (e.deltaX||0)/(isoZoom||1); const dy = (e.deltaY||0)/(isoZoom||1);
      setIsoPan(p=>({ x: p.x - dx, y: p.y - dy })); e.preventDefault();
    }
  }
  function onIsoTouchStart(e: React.TouchEvent<HTMLDivElement>){
    if (activeTab !== "iso") return;
    if (e.touches.length===2){
      const [a,b] = [e.touches[0], e.touches[1]];
      const dx=b.clientX-a.clientX, dy=b.clientY-a.clientY; const d=Math.hypot(dx,dy);
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const cx=((a.clientX+b.clientX)/2)-rect.left-isoPan.x; const cy=((a.clientY+b.clientY)/2)-rect.top-isoPan.y;
      lastTouchesIso.current={d,cx,cy};
    }
  }
  function onIsoTouchMove(e: React.TouchEvent<HTMLDivElement>){
    if (activeTab !== "iso") return;
    if (e.touches.length===2 && lastTouchesIso.current){
      e.preventDefault(); const [a,b]=[e.touches[0],e.touches[1]];
      const dx=b.clientX-a.clientX, dy=b.clientY-a.clientY; const d=Math.hypot(dx,dy);
      const prev=lastTouchesIso.current; const k=d/prev.d; const newZoom=Math.min(3, Math.max(0.4, isoZoom*k));
      const kz=newZoom/isoZoom; setIsoPan(p=>({ x: prev.cx - kz*(prev.cx - p.x), y: prev.cy - kz*(prev.cy - p.y) })); setIsoZoom(newZoom);
      lastTouchesIso.current={ d, cx:prev.cx, cy:prev.cy };
    }
  }
  function onIsoTouchEnd(){ lastTouchesIso.current=null; }

  // ---------- Elevation handlers ----------
  function onElevWheel(e: React.WheelEvent<HTMLDivElement>){
    if (!activeTab.startsWith("elev")) return;
    const isZoomGesture = e.ctrlKey || e.metaKey;
    if (isZoomGesture){
      const delta=-e.deltaY; if(delta===0) return; const factor=delta>0?1.08:0.92;
      const rect=(e.currentTarget as Element).getBoundingClientRect(); const mx=e.clientX-rect.left-elevPan.x; const my=e.clientY-rect.top-elevPan.y;
      const newZoom=Math.min(3, Math.max(0.4, elevZoom*factor)); const k=newZoom/elevZoom;
      setElevPan(p=>({ x: mx - k*(mx - p.x), y: my - k*(my - p.y) })); setElevZoom(newZoom); e.preventDefault();
    } else {
      const dx=(e.deltaX||0)/(elevZoom||1); const dy=(e.deltaY||0)/(elevZoom||1); setElevPan(p=>({ x:p.x - dx, y:p.y - dy })); e.preventDefault();
    }
  }
  function onElevTouchStart(e: React.TouchEvent<HTMLDivElement>){
    if (!activeTab.startsWith("elev")) return; if(e.touches.length===2){ const [a,b]=[e.touches[0],e.touches[1]]; const dx=b.clientX-a.clientX, dy=b.clientY-a.clientY; const d=Math.hypot(dx,dy); const rect=(e.currentTarget as Element).getBoundingClientRect(); const cx=((a.clientX+b.clientX)/2)-rect.left-elevPan.x; const cy=((a.clientY+b.clientY)/2)-rect.top-elevPan.y; lastTouchesElev.current={d,cx,cy}; }
  }
  function onElevTouchMove(e: React.TouchEvent<HTMLDivElement>){
    if (!activeTab.startsWith("elev")) return; if(e.touches.length===2 && lastTouchesElev.current){ e.preventDefault(); const [a,b]=[e.touches[0],e.touches[1]]; const dx=b.clientX-a.clientX, dy=b.clientY-a.clientY; const d=Math.hypot(dx,dy); const prev=lastTouchesElev.current; const k=d/prev.d; const newZoom=Math.min(3, Math.max(0.4, elevZoom*k)); const kz=newZoom/elevZoom; setElevPan(p=>({ x: prev.cx - kz*(prev.cx - p.x), y: prev.cy - kz*(prev.cy - p.y) })); setElevZoom(newZoom); lastTouchesElev.current={ d, cx:prev.cx, cy:prev.cy }; }
  }
  function onElevTouchEnd(){ lastTouchesElev.current=null; }

  // toolbar
  function add(kind:SceneObject["kind"], name?:string){
    const o: SceneObject = { id: uid(), kind, label: name || kind, cx: model.room.width/2, cy: model.room.depth/2, w: 2, d: 1, h: 3, rotation: 0, facing: 0 } as any;
    setModel(m=>({ ...m, objects:[...m.objects, o]}));
    setSel(o.id);
  }
  function addCustom(){ const name = window.prompt("Object name (e.g., YC decal strip):", "custom"); if(name===null) return; add("custom", name.trim() || "custom"); }
  function remove(id:string){ setModel(m=>({ ...m, objects: m.objects.filter(o=>o.id!==id) })); if(sel===id) setSel(null); }

  const selected = model.objects.find(o=>o.id===sel) || null;
  function updateSelected(patch: Partial<SceneObject>){ if(!selected) return; setModel(m=>({ ...m, objects: m.objects.map(o=> o.id===selected.id ? { ...o, ...patch } : o ) })); }

  // keyboard
  useEffect(()=>{
    function onKey(ev:KeyboardEvent){
      if(!selected) return;
      const step = ev.shiftKey ? 2 : 0.5;
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Backspace","Delete","r","R"].includes(ev.key)) ev.preventDefault();
      if(ev.key==="ArrowUp") updateSelected({ cy: snap(Math.max(0, (selected.cy||0) - step)) });
      if(ev.key==="ArrowDown") updateSelected({ cy: snap(Math.min(model.room.depth, (selected.cy||0) + step)) });
      if(ev.key==="ArrowLeft") updateSelected({ cx: snap(Math.max(0, (selected.cx||0) - step)) });
      if(ev.key==="ArrowRight") updateSelected({ cx: snap(Math.min(model.room.width, (selected.cx||0) + step)) });
      if(ev.key==="Backspace"||ev.key==="Delete") remove(selected.id);
      if(ev.key==="r"||ev.key==="R") updateSelected({ rotation: degClamp((selected.rotation||0)+ (ev.shiftKey? -15:15)), facing: degClamp((selected.facing||0)+ (ev.shiftKey? -15:15)) });
    }
    window.addEventListener("keydown", onKey); return ()=>window.removeEventListener("keydown", onKey);
  }, [selected, model.room]);

  // auto-describe (per-object)
  async function autoDescribeObject(obj: SceneObject){
    const imgs = ((obj as any).images||[]).slice(0,4); if(!imgs.length) return alert("Add 1–4 object reference images first.");
    const r = await fetch("/api/describe", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ imagesBase64: imgs })});
    const j = await r.json(); if(j.error) return alert(j.error); if (selected) updateSelected({ meta: { ...((selected as any).meta||{}), description: j.description } as any });
  }

  function Bubbles({o}:{o:SceneObject}){
    const cx = toCanvasX(o.cx), cy = toCanvasY(o.cy); const r = 16;
    const bubbles: {d:"N"|"E"|"S"|"W"; x:number;y:number}[] = [
      { d:"N", x:cx, y:cy - toPx(o.d)/2 - 22 },
      { d:"S", x:cx, y:cy + toPx(o.d)/2 + 22 },
      { d:"W", x:cx - toPx(o.w)/2 - 22, y:cy },
      { d:"E", x:cx + toPx(o.w)/2 + 22, y:cy },
    ];
    const arrow = (d:"N"|"E"|"S"|"W") => d==="N"?"↑":d==="S"?"↓":d==="E"?"→":"←";
    return (
      <g>
        {bubbles.map(b=> (
          <g key={b.d} transform={`translate(${b.x},${b.y})`} style={{ cursor:"pointer" }}
             onMouseDown={(e)=>{ e.stopPropagation(); begin(e, o.id, "bubble", b.d); }}
             onClick={(e)=>{ e.stopPropagation(); const delta = GRID_FT; if(b.d==="N") updateSelected({ cy: snap(o.cy - delta) }); if(b.d==="S") updateSelected({ cy: snap(o.cy + delta) }); if(b.d==="W") updateSelected({ cx: snap(o.cx - delta) }); if(b.d==="E") updateSelected({ cx: snap(o.cx + delta) }); }}>
            <circle r={r} fill="#1d2433" stroke="#7c9cff" strokeWidth={1.5} />
            <text textAnchor="middle" dy="0.35em" fill="#cbd3e1" fontSize={12}>{arrow(b.d)}</text>
          </g>
        ))}
      </g>
    );
  }

  function RotationAndFacing({o}:{o:SceneObject}){
    const cx = toCanvasX(o.cx), cy = toCanvasY(o.cy);
    const rx = cx + toPx(o.w)/2 + 18; const ry = cy - toPx(o.d)/2 - 18;
    const ang = (o.facing ?? o.rotation ?? 0) - 90; const len = 28;
    const ax = cx + Math.cos((ang)*Math.PI/180) * len; const ay = cy + Math.sin((ang)*Math.PI/180) * len;
    return (
      <g>
        <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="#60d394" strokeWidth={3} markerEnd="url(#arrowhead)" />
        <g transform={`translate(${rx},${ry})`} style={{ cursor:"grab" }} onMouseDown={(e)=>{ e.stopPropagation(); begin(e, o.id, "rotate"); }}>
          <circle r={10} fill="#7c9cff" />
          <path d="M -4 -2 L 0 -6 L 4 -2" stroke="white" strokeWidth="2" fill="none" />
        </g>
      </g>
    );
  }

  const defs = (
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L0,6 L9,3 z" fill="#60d394" />
      </marker>
    </defs>
  );

  function FinishesActions(){
    return (
      <div style={{ gridColumn:"1 / span 6", display:"flex", gap:8, alignItems:"center", marginTop:8 }}>
        <input type="file" accept="image/*" multiple onChange={e=>setFinRefFiles(e.target.files)} />
        <button disabled={!finRefFiles || busyFin} onClick={async ()=>{
          if (!finRefFiles) return; setBusyFin(true);
          const arr = await Promise.all(Array.from(finRefFiles).map(async f=>{
            const buf = await f.arrayBuffer(); return Buffer.from(buf as any).toString("base64");
          }));
          const r = await fetch("/api/interpret/finishes", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ imagesBase64: arr })}).then(r=>r.json());
          if (r.finishes) setModel(m=>({ ...m, finishes: r.finishes }));
          if (r.lighting) setModel(m=>({ ...m, lighting: r.lighting }));
          setBusyFin(false);
        }}>{busyFin ? "Interpreting…" : "Auto-interpret from refs"}</button>
        <button onClick={async ()=>{
          const r = await fetch("/api/palette", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ scene: model })}).then(r=>r.json());
          if (r?.dataUrl){ setPaletteUrl(r.dataUrl); const a=document.createElement("a"); a.href=r.dataUrl; a.download=`${(model.name||"scene").replace(/\s+/g,"_")}_palette.svg`; a.click(); }
        }}>Generate Palette Card</button>
        {paletteUrl && <span style={{fontSize:12,opacity:0.8}}>Palette generated ✓</span>}
      </div>
    );
  }

  // ----- Layout helpers -----
  function distributeChairs(m: SceneModel): SceneModel {
    const tables = m.objects.filter(o => (o as any).kind === "table");
    if (!tables.length) return m;
    const t = [...tables].sort((a,b)=> (b.w*b.d)-(a.w*a.d))[0];

    const seatBack = CLEARANCES.chairBackToTable;
    const spacing = CLEARANCES.chairToChair;
    const chairs = m.objects.filter(o => (o as any).kind === "chair" && !(o as any).locked);
    if (!chairs.length) return m;

    const north: any[] = []; const south: any[] = [];
    for (const c of chairs) ((c.cy <= t.cy) ? north : south).push(c);

    const placeRow = (row: any[], side: "N"|"S") => {
      const y = t.cy + (side === "N" ? -(t.d/2 + seatBack) : (t.d/2 + seatBack));
      const n = row.length; if (!n) return;
      const total = (n-1) * spacing; let startX = t.cx - total/2;
      row.sort((a,b)=>a.cx-b.cx);
      for (let i=0;i<n;i++){
        const c = row[i];
        c.cx = startX + i*spacing; c.cy = y; c.rotation = side === "N" ? 180 : 0;
      }
    };

    placeRow(north, "N"); placeRow(south, "S");
    return { ...m, objects: m.objects.map(o => {
      const hit = [...north, ...south].find(c=>c.id===o.id);
      return hit ? { ...o, cx: hit.cx, cy: hit.cy, rotation: hit.rotation } : o;
    })};
  }

  function spaceWallItems(m: SceneModel): SceneModel {
    const res = { ...m, objects: m.objects.map(o=>({ ...o })) } as SceneModel;
    const walls: ("N"|"S"|"E"|"W")[] = ["N","S","E","W"];
    for (const w of walls){
      const items = res.objects.filter((o:any)=> (o.wall===w) && !(o.locked));
      if (!items.length) continue;
      if (w==="E"||w==="W"){
        // distribute along Y (depth)
        const pad = 0.5; const start = pad; const end = res.room.depth - pad;
        items.sort((a:any,b:any)=>a.cy-b.cy);
        const total = items.reduce((s:any,o:any)=> s + (o.d||0.2), 0);
        const gaps = Math.max(0, end - start - total);
        const gap = Math.max(0.5, gaps / (items.length+1));
        let cur = start + gap;
        for (const o of items){
          o.cy = clamp(cur + (o.d||0.2)/2, 0, res.room.depth);
          // ensure pinned to wall x
          o.cx = (w==="E" ? res.room.width : 0);
          cur += (o.d||0.2) + gap;
        }
      } else {
        // N/S: distribute along X (width)
        const pad = 0.5; const start = pad; const end = res.room.width - pad;
        items.sort((a:any,b:any)=>a.cx-b.cx);
        const total = items.reduce((s:any,o:any)=> s + (o.w||1), 0);
        const gaps = Math.max(0, end - start - total);
        const gap = Math.max(0.5, gaps / (items.length+1));
        let cur = start + gap;
        for (const o of items){
          o.cx = clamp(cur + (o.w||1)/2, 0, res.room.width);
          o.cy = (w==="N" ? 0 : res.room.depth);
          cur += (o.w||1) + gap;
        }
      }
    }
    return res;
  }

  async function makeItValid() {
    let working = JSON.parse(JSON.stringify(model)) as SceneModel;
    for (let pass = 0; pass < QUALITY.maxPasses; pass++) {
      const r = resolveCollisions(working, 8); working = r.model;
      working = distributeChairs(working);
      working = spaceWallItems(working);

      const cols = detectCollisions(working);
      const aisleHits = cols.filter(c => c.reason === REASONS.AISLE && (c as any).a.kind==="table" && !(c as any).a.locked);
      if (aisleHits.length) {
        const t:any = aisleHits[0].a; const cx = working.room.width/2, cy = working.room.depth/2;
        t.cx = (t.cx*2 + cx)/3; t.cy = (t.cy*2 + cy)/3;
      }

      const after = detectCollisions(working);
      const errs = countErrors(after); const warns = countWarnings(after);
      if (errs === 0 && warns <= QUALITY.maxWarnings) {
        setModel(working); setCollisions(after);
        alert(`Valid: 0 errors, ${warns} warnings (≤ ${QUALITY.maxWarnings}).`);
        return;
      }
    }
    const finalCols = detectCollisions(working); setModel(working); setCollisions(finalCols);
    alert(`Stopped after ${QUALITY.maxPasses} passes: ${countErrors(finalCols)} errors, ${countWarnings(finalCols)} warnings remain.`);
  }

  // settings CRUD helpers
  useEffect(()=>{ refreshList(); },[]);
  async function refreshList(){
    try{
      const r = await fetch("/api/settings/list"); const j = await r.json();
      if (j.ok){ setSettings(j.list); setActiveSettingId(j.activeId); if (!currentId && j.activeId){ loadSettingDoc(j.activeId); } }
    }catch{}
  }
  async function loadSettingDoc(id:string){
    const r = await fetch(`/api/settings/get?id=${id}`); const j = await r.json();
    if (j.ok && j.doc){ setModel(j.doc.model); setCurrentId(j.doc.id); setCurrentName(j.doc.name); setDirty(false); setSel(null); }
  }
  async function saveSettingDoc({ asNew=false, activate=false } = {}){
    const name = asNew ? (prompt("Name this setting:", currentName || "YC Room") || "Untitled") : currentName;
    const id = asNew ? undefined : currentId;
    const r = await fetch("/api/settings/save", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id, name, model, activate }) });
    const j = await r.json();
    if (j.ok){ setCurrentId(j.id); setCurrentName(name || j.id); setDirty(false); await refreshList(); if (activate) setActiveSettingId(j.id); }
  }
  async function removeSettingDoc(){
    if (!currentId) return alert("Nothing to delete.");
    if (!confirm(`Delete setting “${currentName}”?`)) return;
    await fetch("/api/settings/delete", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id: currentId }) });
    setCurrentId(undefined); setCurrentName("(unsaved)"); setDirty(false);
    await refreshList();
  }
  async function activateSetting(id?:string){
    const target = id || currentId; if (!target) return alert("Save first.");
    await fetch("/api/settings/activate", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id: target }) });
    setActiveSettingId(target); await refreshList();
  }

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:12 }}>
      <div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
          <strong>Setting:</strong>
          <select value={currentId || ""} onChange={e=>{ const v = e.target.value; if (v) loadSettingDoc(v); }} style={{ minWidth:220 }}>
            <option value="">{currentName}{dirty?" *":""}</option>
            {settings.map(s=><option key={s.id} value={s.id}>{s.name}{activeSettingId===s.id?" (active)":""}</option>)}
          </select>
          <button onClick={()=>saveSettingDoc({ asNew:true })}>Save As…</button>
          <button onClick={()=>saveSettingDoc({ asNew:false })} disabled={!dirty && !!currentId}>Save</button>
          <button onClick={()=>{ if (!currentId) return saveSettingDoc({ asNew:true }); saveSettingDoc({ asNew:true }).then(()=>{}); }}>Duplicate</button>
          <button onClick={()=>activateSetting()}>Activate</button>
          <button onClick={removeSettingDoc} disabled={!currentId}>Delete</button>
          <span style={{ marginLeft:8, color:"#9aa3b2" }}>{activeSettingId ? `Active: ${settings.find(s=>s.id===activeSettingId)?.name||activeSettingId}` : "No active setting"}</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
          {/* presets */}
          <select onChange={e=>{ const o = applyPreset(e.target.value); if(o){ setModel(m=>({...m, objects:[...m.objects, o]})); setSel(o.id);} e.currentTarget.selectedIndex=0; }}>
            <option>Add preset…</option>
            {PRESETS.map(p=>
              <option key={p.name} value={p.name}>{p.name}</option>
            )}
          </select>
          <button onClick={()=>add("decal")} title="Add decal">+ Decal</button>
          <button onClick={addCustom} title="Add custom object">+ Custom…</button>
          <button onClick={()=>{ const r = resolveCollisions(model, 8); setModel(r.model); setCollisions(r.remaining); }}>Resolve Collisions</button>
          <button onClick={makeItValid}>Make it valid</button>
          <label style={{ marginLeft:8 }}>
            <input type="checkbox" checked={showCollisions} onChange={e=>setShowCollisions(e.target.checked)} />
            Show collisions
          </label>
          {showCollisions && (
            <span style={{ marginLeft:8 }}>
              <label><input type="checkbox" checked={showErrors} onChange={e=>setShowErrors(e.target.checked)} /> Errors</label>
              <label style={{ marginLeft:6 }}><input type="checkbox" checked={showWarnings} onChange={e=>setShowWarnings(e.target.checked)} /> Warnings</label>
            </span>
          )}
          <label style={{ marginLeft:8 }}>Room template:</label>
          <select onChange={async e=>{
            const v = e.target.value;
            if (v === "standard"){
              setModel(m => ({
                ...m,
                room: { ...m.room, ...ROOM_TEMPLATES.yc_interview },
                objects: m.objects.map(o=> o.kind==="table" ? { ...o, ...OBJECT_DEFAULTS.table84x36 } : o)
              }));
              setTimeout(()=>makeItValid(), 0);
            } else if (v === "compact"){
              setModel(m => ({
                ...m,
                room: { ...m.room, ...ROOM_TEMPLATES.compact },
                objects: m.objects.map(o=> o.kind==="table" ? { ...o, ...OBJECT_DEFAULTS.table72x36 } : o)
              }));
              setTimeout(()=>makeItValid(), 0);
            }
            e.currentTarget.selectedIndex = 0;
          }}>
            <option>(choose)</option>
            <option value="standard">Standard (20×14 ft, 84×36 table)</option>
            <option value="compact">Compact (18×12 ft, 72×36 table)</option>
          </select>
          <span style={{ marginLeft:8, color:"#9aa3b2" }}>{violations.length ? `⚠ ${violations.length} collision(s)` : "✅ No collisions"}</span>

          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <select value={units} onChange={e=>{ const u=e.target.value as Units; setUnits(u); setModel(m=>({ ...m, units:u })); }}>
              <option value="ft">ft</option><option value="cm">cm</option>
            </select>
            <button onClick={()=>{ localStorage.removeItem("settingDesigner:model"); setModel(defaultYCModel()); }}>Reset</button>
          </div>
        </div>

        <fieldset style={{ margin:"6px 0", border:"1px solid #333", padding:"8px", borderRadius:6 }}>
          <legend>Finishes & Lighting</legend>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6, minmax(120px, 1fr))", gap:8 }}>
            <div>
              <label>Preset</label>
              <select
                value={(model.meta?.preset)||"yc_room"}
                onChange={(e)=> {
                  const p = FIN_PRESETS[e.target.value as keyof typeof FIN_PRESETS];
                  if (!p) return;
                  setModel(m=>({ ...m, finishes: p.finishes, lighting: p.lighting, meta:{ ...(m.meta||{}), preset: e.target.value } }));
                }}>
                <option value="yc_room">YC room</option>
                <option value="neutral_office">Neutral office</option>
              </select>
            </div>
            <div>
              <label>Wall</label>
              <input type="color" value={model.finishes?.wallHex||"#F7F6F2"}
                onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ floor:{ kind:"carpet_tiles", baseHex:"#2E3135" } as any }), wallHex: e.target.value } as any }))}/>
            </div>
            <div>
              <label>Mullions</label>
              <input type="color" value={model.finishes?.mullionHex||"#1C1F22"}
                onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ floor:{ kind:"carpet_tiles", baseHex:"#2E3135" } as any }), mullionHex: e.target.value } as any }))}/>
            </div>
            <div>
              <label>Glass tint</label>
              <input type="color" value={model.finishes?.glassTintHex||"#EAF2F6"}
                onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ floor:{ kind:"carpet_tiles", baseHex:"#2E3135" } as any }), glassTintHex: e.target.value } as any }))}/>
            </div>
            <div>
              <label>Accent</label>
              <input type="color" value={model.finishes?.accentHex||"#FF6D00"}
                onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ floor:{ kind:"carpet_tiles", baseHex:"#2E3135" } as any }), accentHex: e.target.value } as any }))}/>
            </div>
            <div>
              <label>Floor type</label>
              <select
                value={model.finishes?.floor?.kind||"carpet_tiles"}
                onChange={(e)=>{
                  const kind = e.target.value as any;
                  setModel(m=>{
                    const next:any = { ...(m.finishes||{}) };
                    next.floor = kind==="polished_concrete"
                      ? { kind, tintHex: "#CFCFCF", glossGU: 10 }
                      : { kind, baseHex:"#2E3135", pattern:"heather", tileInches:24, accentHex: "#FF6D00" };
                    return { ...m, finishes: next };
                  });
                }}>
                <option value="carpet_tiles">Carpet tiles</option>
                <option value="polished_concrete">Polished concrete</option>
              </select>
            </div>
            {model.finishes && model.finishes.floor && (model.finishes.floor as any).kind==="carpet_tiles" ? (
              <>
                <div>
                  <label>Carpet base</label>
                  <input type="color" value={(model.finishes!.floor as any).baseHex}
                    onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ wallHex:"#F7F6F2" } as any), floor:{ ...(m.finishes!.floor as any), baseHex: e.target.value } as any } as any }))}/>
                </div>
                <div>
                  <label>Pattern</label>
                  <select
                    value={(model.finishes!.floor as any).pattern || "heather"}
                    onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ wallHex:"#F7F6F2" } as any), floor:{ ...(m.finishes!.floor as any), pattern: e.target.value as any } as any } as any }))}>
                    <option>solid</option><option>heather</option><option>quarter-turn</option>
                  </select>
                </div>
                <div>
                  <label>Tile (in)</label>
                  <input type="number" min={12} step={12} value={(model.finishes!.floor as any).tileInches||24}
                    onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ wallHex:"#F7F6F2" } as any), floor:{ ...(m.finishes!.floor as any), tileInches: +e.target.value } as any } as any }))}/>
                </div>
                <div>
                  <label>Carpet accent</label>
                  <input type="color" value={(model.finishes!.floor as any).accentHex || "#FF6D00"}
                    onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ wallHex:"#F7F6F2" } as any), floor:{ ...(m.finishes!.floor as any), accentHex: e.target.value } as any } as any }))}/>
                </div>
              </>
            ) : (model.finishes && model.finishes.floor ? (
              <>
                <div>
                  <label>Concrete tint</label>
                  <input type="color" value={(model.finishes!.floor as any).tintHex}
                    onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ wallHex:"#F7F6F2" } as any), floor:{ ...(m.finishes!.floor as any), tintHex: e.target.value } as any } as any }))}/>
                </div>
                <div>
                  <label>Gloss (GU)</label>
                  <input type="number" min={0} max={40} step={1} value={(model.finishes!.floor as any).glossGU ?? 10}
                    onChange={e=>setModel(m=>({ ...m, finishes:{ ...(m.finishes||{ wallHex:"#F7F6F2" } as any), floor:{ ...(m.finishes!.floor as any), glossGU: +e.target.value } as any } as any }))}/>
                </div>
              </>
            ) : null}

            <div>
              <label>CCT (K)</label>
              <input type="number" min={3000} max={6500} step={50} value={model.lighting?.cctK || 4300}
                onChange={e=>setModel(m=>({ ...m, lighting:{ ...(m.lighting||{}), cctK: +e.target.value }}))}/>
            </div>
            <div>
              <label>Lux</label>
              <input type="number" min={200} max={1000} step={50} value={model.lighting?.lux || 500}
                onChange={e=>setModel(m=>({ ...m, lighting:{ ...(m.lighting||{ cctK: 4300 }), lux: +e.target.value } as any }))}/>
            </div>
            <div>
              <label>Contrast</label>
              <select value={model.lighting?.contrast || "neutral"}
                onChange={e=>setModel(m=>({ ...m, lighting:{ ...(m.lighting||{ cctK: 4300 }), contrast: e.target.value as any } as any }))}>
                <option>soft</option><option>neutral</option><option>crisp</option>
              </select>
            </div>

            {/* Auto-interpret + Palette */}
            <FinishesActions />
          </div>
        </fieldset>

        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          {(["plan","elevN","elevS","elevE","elevW","iso"] as const).map(t=> (
            <button key={t} onClick={()=>setActiveTab(t)} style={{ background: activeTab===t ? "#253049" : "#1b2230", border:"1px solid #3a4255", color:"#e9ecf1", padding:"6px 10px", borderRadius:8, cursor:"pointer" }}>
              {t==="plan"?"Floor plan":t==="iso"?"Isometric":"Elevation "+t.slice(-1)}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
          <button onClick={()=>setZoom(z=>Math.max(0.5, z-0.1))}>−</button>
          <span style={{ color:"#9aa3b2" }}>Zoom {(zoom*100)|0}%</span>
          <button onClick={()=>setZoom(z=>Math.min(3, z+0.1))}>+</button>
          <button onClick={()=>{ setZoom(1); setPan({x:0,y:0}); }}>Reset</button>
          <button onClick={()=>{
            const pad = 60; const sx = (CANVAS_W - pad*2) / model.room.width; const sy = (CANVAS_H - pad*2) / model.room.depth;
            const fit = Math.min(sx, sy); setZoom(fit / (pxPerFt||1)); setPan({ x:0, y:0 });
          }}>Fit</button>
          <span style={{ color:"#5a6374", marginLeft:8 }}>Tip: hold Space and drag to pan</span>
        </div>

        {activeTab==="plan" && (
          <svg ref={containerRef as any} width={CANVAS_W} height={CANVAS_H}
               onWheel={onWheel}
               onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
               onMouseDown={onSvgMouseDown} onMouseMove={onSvgMouseMove} onMouseUp={onSvgMouseUp} onMouseLeave={onSvgMouseUp}
               style={{ background:"#0f1217", border:"1px solid #232833", borderRadius:12 }}>
            {defs}
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {Array.from({length:Math.ceil(model.room.width/GRID_FT)+1}).map((_,i)=>{ const x = toCanvasX(i*GRID_FT); return <line key={"gx"+i} x1={x} x2={x} y1={toCanvasY(0)} y2={toCanvasY(model.room.depth)} stroke="#222a38" strokeWidth={i%2===0?1:0.5} /> })}
              {Array.from({length:Math.ceil(model.room.depth/GRID_FT)+1}).map((_,i)=>{ const y = toCanvasY(i*GRID_FT); return <line key={"gy"+i} y1={y} y2={y} x1={toCanvasX(0)} x2={toCanvasX(model.room.width)} stroke="#222a38" strokeWidth={i%2===0?1:0.5} /> })}
              <rect x={toCanvasX(0)} y={toCanvasY(0)} width={toPx(model.room.width)} height={toPx(model.room.depth)} fill="none" stroke="#3a4255" strokeWidth={2} />
              {/* Glass wall tint (E) */}
              <rect
                x={toCanvasX(model.room.width)-2}
                y={toCanvasY(0)}
                width={4}
                height={toCanvasY(model.room.depth)-toCanvasY(0)}
                fill="#6bd5ff"
                opacity={0.35}
              />
              {/* Wall labels */}
              <text x={(toCanvasX(0)+toCanvasX(model.room.width))/2} y={toCanvasY(0)-8} fill="#8aa6ff" fontSize={12} textAnchor="middle" opacity={0.8}>N</text>
              <text x={(toCanvasX(0)+toCanvasX(model.room.width))/2} y={toCanvasY(model.room.depth)+14} fill="#8aa6ff" fontSize={12} textAnchor="middle" opacity={0.8}>S</text>
              <text x={toCanvasX(0)-10} y={(toCanvasY(0)+toCanvasY(model.room.depth))/2} fill="#8aa6ff" fontSize={12} textAnchor="middle" opacity={0.8}>W</text>
              <text x={toCanvasX(model.room.width)+32} y={(toCanvasY(0)+toCanvasY(model.room.depth))/2} fill="#8aa6ff" fontSize={12} textAnchor="middle" opacity={0.8}>E (glass)</text>
              {model.objects.map(o=>{ const x = toCanvasX(o.cx) - toPx(o.w)/2; const y = toCanvasY(o.cy) - toPx(o.d)/2; const seld = sel===o.id; const rot = o.rotation || 0; const idsToHalo = new Set(collisions.filter((c:any)=> showCollisions && ((c.severity==="error" && showErrors) || (c.severity==="warning" && showWarnings))).flatMap((c:any)=>[c.a?.id,c.b?.id].filter(Boolean))); const isBad = idsToHalo.has(o.id); const haloColor = (collisions.find((c:any)=> (c.a?.id===o.id || c.b?.id===o.id) && c.severity==="error") ? "#ff6b6b" : "#ffb86b"); return (
                <g key={o.id} transform={`rotate(${rot},${toCanvasX(o.cx)},${toCanvasY(o.cy)})`} onMouseDown={(e)=>{ setSel(o.id); begin(e,o.id,"move"); }}>
                  {isBad && (
                    <circle cx={toCanvasX(o.cx)} cy={toCanvasY(o.cy)} r={Math.max(20, (o.w+o.d)*scale*0.6)} fill="none" stroke={haloColor} strokeWidth={2} strokeDasharray="4 4" opacity={0.9}/>
                  )}
                  <rect x={x} y={y} width={toPx(o.w)} height={toPx(o.d)} fill={seld?"#253049":"#1b2230"} stroke={seld?"#7c9cff":"#3a4255"} strokeWidth={2} rx={6} />
                  <rect x={x+toPx(o.w)-8} y={y+toPx(o.d)-8} width={14} height={14} fill="#7c9cff" rx={3} onMouseDown={(e)=>{ e.stopPropagation(); setSel(o.id); begin(e,o.id,"resize"); }} />
                  <text x={toCanvasX(o.cx)} y={toCanvasY(o.cy)} fill="#cbd3e1" textAnchor="middle" dy="0.35em" fontSize={12}>
                    {o.label || o.kind}
                  </text>
                  {seld && <>
                    <RotationAndFacing o={o} />
                    <Bubbles o={o} />
                  </>}
                </g>
              ); })}
              {/* Character markers */}
              <CharacterLayer
                model={model}
                toCanvasX={toCanvasX}
                toCanvasY={toCanvasY}
                screenToFtX={screenToFtX}
                screenToFtY={screenToFtY}
                onChange={setCharPlc}
              />
              <DimensionOverlay model={model} selected={selected} toCanvasX={toCanvasX} toCanvasY={toCanvasY} toPx={toPx} />
            </g>
          </svg>
        )}

        {activeTab.startsWith("elev") && (
          <div onWheel={onElevWheel} onTouchStart={onElevTouchStart} onTouchMove={onElevTouchMove} onTouchEnd={onElevTouchEnd}
               style={{ border:"1px solid #232833", borderRadius:12, overflow:"hidden", background:"#0f1217" }}>
            <div style={{ transform:`translate(${elevPan.x}px,${elevPan.y}px) scale(${elevZoom})`, transformOrigin:"0 0" }}>
              <ElevationEditor
                model={model}
                wall={activeTab.endsWith("N")?"N":activeTab.endsWith("S")?"S":activeTab.endsWith("E")?"E":"W"}
                onSelect={(id)=>setSel(id)}
                onChange={(o)=>setModel(m=>({...m, objects: m.objects.map(x=>x.id===o.id?o:x)}))}
                selectedId={sel}
              />
            </div>
          </div>
        )}

        {activeTab==="iso" && (
          <>
            <div onWheel={onIsoWheel} onTouchStart={onIsoTouchStart} onTouchMove={onIsoTouchMove} onTouchEnd={onIsoTouchEnd}
                 style={{ border:"1px solid #232833", borderRadius:12, background:"#0f1217", position:"relative" }}>
              <div style={{ width:CANVAS_W, height:CANVAS_H, overflow:"auto" }}>
                <div style={{ width:2000, height:1400, transform:`translate(${isoPan.x}px,${isoPan.y}px) scale(${isoZoom})`, transformOrigin:"0 0" }}
                     dangerouslySetInnerHTML={{ __html: exportIsometricSVG(model, isoAngle) }} />
              </div>
            </div>
            <div style={{ color:"#9aa3b2", fontSize:12, marginTop:6 }}>
              Isometric wireframe shows room (blue cage) and objects as extrusions with facing arrows (green). Use this as a geometry ref.
              <div style={{ marginTop:6 }}>
                <label>Rotate: </label>
                <input type="range" min={-180} max={180} value={isoAngle} onChange={e=>setIsoAngle(+e.target.value)} />
                <span style={{ marginLeft:6 }}>{Math.round(isoAngle)}°</span>
              </div>
            </div>
          </>
        )}

        <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
          <button onClick={()=>{
            // Preview/Export overlay for current camera
            const camPreset = { fov_deg: 50, pos:[6,5.0,5.2] as [number,number,number], look_at:[10,7,4.8] as [number,number,number] };
            const cam: CameraPose = { fovDeg: camPreset.fov_deg, pos:{ x:camPreset.pos[0], y:camPreset.pos[1], z:camPreset.pos[2] }, lookAt:{ x:camPreset.look_at[0], y:camPreset.look_at[1], z:camPreset.look_at[2] }, imgW:1024, imgH:576 };
            const dataUrl = renderOverlayPNG(model, cam, charPlc.map(c=>({ name:c.name, heightCm:c.heightCm, x:c.x, y:c.y })), 1024, 576);
            const a = document.createElement("a"); a.href = dataUrl; a.download = "overlay.png"; a.click();
          }}>Export Overlay (current cam)</button>
          <button onClick={async()=>{
            const camPreset = { fov_deg: 50, pos:[6,5.0,5.2] as [number,number,number], look_at:[10,7,4.8] as [number,number,number] };
            const cam: CameraPose = { fovDeg: camPreset.fov_deg, pos:{ x:camPreset.pos[0], y:camPreset.pos[1], z:camPreset.pos[2] }, lookAt:{ x:camPreset.look_at[0], y:camPreset.look_at[1], z:camPreset.look_at[2] }, imgW:1024, imgH:576 };
            const overlay = renderOverlayPNG(model, cam, charPlc.map(c=>({ name:c.name, heightCm:c.heightCm, x:c.x, y:c.y })), 1024, 576);
            const r = await fetch("/api/generate", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({
              camera: { fov_deg: cam.fovDeg, pos:[cam.pos.x, cam.pos.y, cam.pos.z], look_at:[cam.lookAt.x, cam.lookAt.y, cam.lookAt.z] },
              overlayBase64: overlay,
              charPlacements: charPlc.map(c=>({ name:c.name, x:c.x, y:c.y, heightCm:c.heightCm })),
              settingProfile: { description: model.notes || "", images_base64: model.refImages || [] }
            })});
            if(!r.ok){ alert(await r.text()); return; }
            const blob = await r.blob(); const url = URL.createObjectURL(blob);
            const w = window.open(url, "_blank"); setTimeout(()=>{ URL.revokeObjectURL(url); }, 30000);
          }}>Generate with Overlay</button>
          <button onClick={()=>{
            const text = exportSceneLockJSON(model);
            const blob = new Blob([text], { type:"application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "yc_room_v1.json"; a.click(); URL.revokeObjectURL(a.href);
          }}>Export SceneLock JSON</button>
          <button onClick={()=>{
            const svg = exportIsometricSVG(model);
            const blob = new Blob([svg], { type:"image/svg+xml" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "iso_wireframe.svg"; a.click(); URL.revokeObjectURL(a.href);
          }}>Export Isometric SVG</button>
          <button onClick={()=>onBuildPlates?.(model)}>Generate Plates</button>
          <button onClick={()=>{ const a = document.createElement("a"); const blob = new Blob([JSON.stringify(model,null,2)], { type:"application/json" }); a.href = URL.createObjectURL(blob); a.download = "setting_model.json"; a.click(); URL.revokeObjectURL(a.href); }}>Download Model</button>
        </div>
        <div style={{ display:"flex", gap:12, color:"#9aa3b2", marginTop:6, fontSize:12 }}>
          <span>Units: {units}</span>
          {selected && <span>
            Sel: <strong>{selected.label||selected.kind}</strong> • {selected.cx.toFixed(2)},{selected.cy.toFixed(2)} ft • {selected.w.toFixed(2)}×{selected.d.toFixed(2)}×{(selected.h||0).toFixed(2)} ft • rot {Math.round(selected.rotation||0)}° • face {Math.round(selected.facing ?? selected.rotation ?? 0)}°
          </span>}
        </div>
      </div>

      <div style={{ background:"#14161b", border:"1px solid #232833", borderRadius:12, padding:12 }}>
        <h3 style={{ marginTop:0 }}>Properties</h3>
        <div style={{ color:"#9aa3b2", fontSize:13, marginBottom:8 }}>Room: {model.room.width}×{model.room.depth}×{model.room.height} {model.units}</div>
        {selected ? (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <label>Name<input value={selected.label||""} onChange={e=>updateSelected({ label:e.target.value })} /></label>
              <label>Kind<select value={selected.kind} onChange={e=>updateSelected({ kind: e.target.value as any })}>
                <option>table</option><option>chair</option><option>tv</option><option>whiteboard</option>
                <option>panel</option><option>plant</option><option>decal</option><option>custom</option>
              </select></label>
              <label>Center X<input type="number" step={0.1} value={selected.cx} onChange={e=>updateSelected({ cx:+e.target.value })} /></label>
              <label>Center Y<input type="number" step={0.1} value={selected.cy} onChange={e=>updateSelected({ cy:+e.target.value })} /></label>
              <label>Width<input type="number" step={0.1} value={selected.w} onChange={e=>updateSelected({ w:+e.target.value })} /></label>
              <label>Depth<input type="number" step={0.1} value={selected.d} onChange={e=>updateSelected({ d:+e.target.value })} /></label>
              <label>Height<input type="number" step={0.1} value={selected.h||0} onChange={e=>updateSelected({ h:+e.target.value })} /></label>
              <label>Rotation°<input type="number" step={1} value={selected.rotation||0} onChange={e=>updateSelected({ rotation: degClamp(+e.target.value) })} /></label>
              <label>Facing°<input type="number" step={1} value={selected.facing ?? selected.rotation ?? 0} onChange={e=>updateSelected({ facing: degClamp(+e.target.value) })} /></label>
              <label>Wall<select value={selected.wall||""} onChange={e=>updateSelected({ wall:(e.target.value||undefined) as any })}>
                <option value="">(none)</option><option value="N">N</option><option value="S">S</option><option value="E">E</option><option value="W">W</option>
              </select></label>
              <label>Mount H<input type="number" step={0.1} value={selected.mount_h||0} onChange={e=>updateSelected({ mount_h:+e.target.value })} /></label>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
              <label><input type="checkbox" checked={selected.locked||false} onChange={e=>updateSelected({ locked:e.target.checked })}/> Lock</label>
              <label>Layer<select value={selected.layer || "floor"} onChange={e=>updateSelected({ layer:e.target.value as any })}>
                <option>floor</option><option>surface</option><option>wall</option><option>ceiling</option>
              </select></label>
              <label>Attach to<select value={selected.attachTo||""} onChange={e=>updateSelected({ attachTo: (e.target.value||null) as any })}>
                <option value="">(none)</option>
                {model.objects.filter(p => p.id!==selected.id).map(p=><option key={p.id} value={p.id}>{p.label||p.kind}</option>)}
              </select></label>
              <label>Local dx<input type="number" step={0.1} value={selected.local?.dx||0} onChange={e=>updateSelected({ local:{ ...(selected.local||{dx:0,dy:0}), dx:+e.target.value }})} /></label>
              <label>Local dy<input type="number" step={0.1} value={selected.local?.dy||0} onChange={e=>updateSelected({ local:{ ...(selected.local||{dx:0,dy:0}), dy:+e.target.value }})} /></label>
            </div>

            <div style={{ marginTop:10 }}>
              <label>Notes (local UI only)<textarea style={{ width:"100%", minHeight:80 }} value={(selected as any).desc||""} onChange={e=>updateSelected({ } as any)} /></label>
              <label>Description (prompt)
                <textarea rows={4} style={{ width:"100%" }}
                  value={selected.meta?.description ?? (YC_DESCRIPTIONS[(selected.kind||"") as string]?.description || "")}
                  onChange={e=>updateSelected({ meta:{ ...(selected.meta||{}), description:e.target.value } as any })}
                />
              </label>
              <div style={{ marginTop:6 }}>
                <div>Object reference images</div>
                <input type="file" accept="image/*" multiple onChange={async e=>{ const files = e.target.files; if(!files) return; const urls = await Promise.all([...files].map(f=> new Promise<string>(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result as string); fr.readAsDataURL(f); }))); updateSelected({} as any); }}/>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                  {(((selected as any).images)||[]).map((s:any,i:number)=><img key={i} src={s} style={{ width:60, height:60, objectFit:"cover", borderRadius:6, border:"1px solid #232833" }}/>)}
                </div>
                <button style={{ marginTop:6 }} onClick={()=>autoDescribeObject(selected)}>Auto-Describe from refs</button>
              </div>
            </div>

            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={()=>remove(selected.id)}>Delete</button>
            </div>
          </>
        ) : (
          <div style={{ color:"#9aa3b2" }}>Select an object to edit.</div>
        )}

        <hr style={{ borderColor:"#232833", margin:"12px 0" }}/>
        <label>Notes<textarea style={{ width:"100%", minHeight:90 }} value={model.notes||""} onChange={e=>setModel(m=>({...m, notes:e.target.value}))} /></label>
        <div style={{ marginTop:8 }}>
          <div>Reference images</div>
          <input type="file" accept="image/*" multiple onChange={async e=>{ const files = e.target.files; if(!files) return; const urls = await Promise.all([...files].map(f=> new Promise<string>(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result as string); fr.readAsDataURL(f); }))); setModel(m=>({...m, refImages:[...(m.refImages||[]), ...urls]})); }}/>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
            {(model.refImages||[]).map((s,i)=><img key={i} src={s} style={{ width:74, height:74, objectFit:"cover", borderRadius:8, border:"1px solid #232833" }}/>)}
          </div>
        </div>
        <div style={{ marginTop:8, color:"#c8d1e0", fontSize:12 }}>
          <strong>Collisions: {collisions.length}</strong>
          <ul style={{ maxHeight:120, overflow:"auto", paddingLeft:16 }}>
            {collisions.map((c:any,i:number)=>(
              <li key={i}>{c.b ? `${(c.a.label||c.a.kind)} ↔ ${(c.b.label||c.b.kind)} — ${c.reason}` : `${(c.a.label||c.a.kind)} — ${c.reason}`}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}


