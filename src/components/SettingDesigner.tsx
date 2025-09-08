import React, { useEffect, useMemo, useRef, useState } from "react";
import { SceneModel, SceneObject, defaultYCModel, Units } from "../lib/scene_model";
import { degClamp } from "../lib/scene_model";
import { PRESETS, applyPreset } from "../lib/presets";
import { enforceMinClearance } from "../lib/constraints";
import { detectCollisions, resolveCollisions, countErrors, countWarnings } from "../lib/collision";
import { CLEARANCES, QUALITY, REASONS, ROOM_TEMPLATES, OBJECT_DEFAULTS } from "../lib/physics";
import { proposePlacements, type Calibration } from "../lib/placement";
import type { ObjectProposal } from "../lib/scene_model";
import DimensionOverlay from "./DimensionOverlay";
import CharacterLayer, { CharPlacement } from "./CharacterLayer";
import { renderOverlayPNG } from "../lib/overlay";
import type { CameraPose } from "../lib/camera";
import ElevationEditor from "./ElevationEditor";
import dynamic from "next/dynamic";
const ThreePreview = dynamic(()=>import("./ThreePreview"), { ssr:false });
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
  const [showGuides, setShowGuides] = useState(true);
  const [showProposals, setShowProposals] = useState(true);
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
  // Auto-propose from refs
  const [objRefFiles, setObjRefFiles] = useState<FileList|null>(null);
  const [proposals, setProposals] = useState<ObjectProposal[]|null>(null);
  const [busyObj, setBusyObj] = useState(false);
  const [cal, setCal] = useState<Calibration|undefined>(undefined);
  const [calMode, setCalMode] = useState<null|"p1"|"p2">(null);
  const [calTemp, setCalTemp] = useState<{p1?:{x:number;y:number}, p2?:{x:number;y:number}}>({});
  const [labelEdit, setLabelEdit] = useState<{ id:string; x:number; y:number; value:string } | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  // CSS variable helper
  function getCss(varName: string){
    if (typeof window === "undefined") return "";
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

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
    // calibration clicks
    if (calMode){
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      const cx = screenToCanvasX(sx); const cy = screenToCanvasY(sy);
      if (calMode === "p1"){ setCalTemp(v=>({ ...v, p1:{ x: cx, y: cy } })); setCalMode("p2"); }
      else if (calMode === "p2"){
        const p1 = calTemp.p1!; const p2 = { x: cx, y: cy };
        const dft = Number((window.prompt("Distance between points (ft)", "3.5")||"3.5")) || 3.5;
        const wall = (window.prompt("Back wall (N/S/E/W)?", "E") as any) || "E";
        setCal({ imageW: CANVAS_W, imageH: CANVAS_H, p1, p2, distanceFt: dft, backWall: wall });
        setCalMode(null); setCalTemp({});
      }
      return; // don't start pan/drag
    }
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

  function addPreset(key:string){
    const k = key.toLowerCase();
    if (k === "table") return add("table");
    if (k === "chair") return add("chair");
    if (k === "tv") return add("tv");
    if (k === "panel") return add("panel");
    if (k === "whiteboard") return add("whiteboard");
    if (k === "plant") return add("plant");
    if (k === "decal") return add("decal");
    if (k === "custom") return addCustom();
  }

  function zoomFit(){
    const pad = 60; const sx = (CANVAS_W - pad*2) / model.room.width; const sy = (CANVAS_H - pad*2) / model.room.depth;
    const fit = Math.min(sx, sy); setZoom(fit / (pxPerFt||1)); setPan({ x:0, y:0 });
  }
  function zoom100(){ setZoom(1); setPan({ x:0, y:0 }); }

  async function generatePaletteCard(){
    const r = await fetch("/api/palette", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ scene: model })}).then(r=>r.json());
    if (r?.dataUrl){ setPaletteUrl(r.dataUrl); const a=document.createElement("a"); a.href=r.dataUrl; a.download=`${(model.name||"scene").replace(/\s+/g,"_")}_palette.svg`; a.click(); }
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

  const errs = countErrors(collisions);
  const warns = countWarnings(collisions);

  return (
    <div className="grid" style={{ gridTemplateColumns:"240px 1fr 320px", gap:12 }}>
      
      <aside style={{ display:"grid", gap:10, gridAutoRows:"min-content", alignContent:"start", alignItems:"start" }}>
        <details className="panel compact" open>
          <summary>Objects</summary>
          <div className="section-body" style={{ display:"grid", gap:8 }}>
            {["Table","Chair","TV","Panel","Whiteboard","Plant","Decal","Custom"].map(k=> (
              <button key={k} className="btn" title={`Add ${k}`} onClick={()=>addPreset(k)}>{k}</button>
            ))}
          </div>
        </details>
        <details className="panel compact">
          <summary>Tools</summary>
          <div className="section-body" style={{ display:"grid", gap:6 }}>
            <input type="file" accept="image/*" multiple onChange={e=>setObjRefFiles(e.target.files)} title="Upload refs for auto-propose" />
            <button className="btn" title="Suggest objects from refs" disabled={!objRefFiles || busyObj} onClick={async ()=>{
              if (!objRefFiles) return; setBusyObj(true);
              const arr = await Promise.all(Array.from(objRefFiles).map(async f=>{ const buf = await f.arrayBuffer(); return Buffer.from(buf as any).toString("base64"); }));
              const det = await fetch("/api/interpret/objects", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ imagesBase64: arr })}).then(r=>r.json());
              try{ const mapped = proposePlacements(det, model, cal); const P: ObjectProposal[] = mapped.map((p:any)=>({ action:"add", object:p.obj, conf:p.conf, reason:p.reason })); setProposals(P); } finally { setBusyObj(false); }
            }}>{busyObj?"Interpreting…":"Auto-Propose (objects)"}</button>
            <button className="btn" title="Calibrate scale from two points" onClick={()=> setCalMode(calMode?null:"p1")}>{calMode?"Exit calibration":"Calibrate scale"}</button>
            <button className="btn" title="Resolve collisions" onClick={()=>{ const r = resolveCollisions(model, 8); setModel(r.model); setCollisions(r.remaining); }}>Resolve collisions</button>
            <button className="btn" title="Run full validity pass" onClick={makeItValid}>Make it valid</button>
          </div>
        </details>
        <details className="panel compact">
          <summary>View options</summary>
          <div className="section-body">
            <label><input type="checkbox" checked={showCollisions} onChange={e=>setShowCollisions(e.target.checked)} /> Show collisions</label><br/>
            <label><input type="checkbox" checked={showGuides} onChange={e=>setShowGuides(e.target.checked)} /> Show guides</label><br/>
            <label><input type="checkbox" checked={showProposals} onChange={e=>setShowProposals(e.target.checked)} /> Show proposals</label>
          </div>
        </details>
        <details className="panel compact">
          <summary>Room template</summary>
          <div className="section-body">
            <label>Room template: </label>
            <select onChange={async e=>{ const v = e.target.value; if (v === "standard"){ setModel(m => ({ ...m, room: { ...m.room, ...ROOM_TEMPLATES.yc_interview }, objects: m.objects.map(o=> o.kind==="table" ? { ...o, ...OBJECT_DEFAULTS.table84x36 } : o) })); setTimeout(()=>makeItValid(), 0); } else if (v === "compact"){ setModel(m => ({ ...m, room: { ...m.room, ...ROOM_TEMPLATES.compact }, objects: m.objects.map(o=> o.kind==="table" ? { ...o, ...OBJECT_DEFAULTS.table72x36 } : o) })); setTimeout(()=>makeItValid(), 0); } e.currentTarget.selectedIndex = 0; }}>
              <option>(choose)</option>
              <option value="standard">Standard (20×14 ft, 84×36 table)</option>
              <option value="compact">Compact (18×12 ft, 72×36 table)</option>
            </select>
          </div>
        </details>
      </aside>
      <section className="panel" style={{ position:"relative", overflow:"hidden" }}>
        {/* Command bar */}
        <div className="toolbar">
          <select value={currentId || ""} onChange={e=>{ const v = e.target.value; if (v) loadSettingDoc(v); }} className="pill" title="Switch setting" style={{ minWidth:220 }}>
            <option value="">{currentName}{dirty?" *":""}</option>
            {settings.map(s=><option key={s.id} value={s.id}>{s.name}{activeSettingId===s.id?" (active)":""}</option>)}
          </select>
          <button className="btn" title="Save (overwrite)" onClick={()=>saveSettingDoc({ asNew:false })} disabled={!dirty && !!currentId}>Save</button>
          <button className="btn" title="Save as new" onClick={()=>saveSettingDoc({ asNew:true })}>Save As…</button>
          <button className="btn" title="Duplicate as new" onClick={()=>{ if (!currentId) return saveSettingDoc({ asNew:true }); saveSettingDoc({ asNew:true }).then(()=>{}); }}>Duplicate</button>
          <div style={{ display:"flex", gap:6, marginLeft:8 }}>
            {(["plan","iso"] as const).map(t=> (
              <button key={t} className={`btn-ghost ${activeTab===t ? "btn" : ""}`} title={`Switch to ${t==="plan"?"Floor plan":"Isometric"}`}
                onClick={()=>setActiveTab(t)}>{t==="plan"?"Floor plan":"Isometric"}</button>
            ))}
          </div>
          <div style={{ flex:1 }} />
          <div className="badge" title="Collision status" style={{ background: errs?"rgba(239,68,68,0.15)":(warns?"rgba(245,158,11,0.15)":"rgba(52,211,153,0.12)"), borderColor: errs?"var(--err)":(warns?"var(--warn)":"var(--chip-border)"), color: errs?"var(--err)":(warns?"var(--warn)":"#7bd7b2") }}>
            {errs? `${errs} error${errs>1?"s":""}` : warns? `${warns} warning${warns>1?"s":""}` : "Collisions: 0"}
          </div>
          <div className="badge" title="Zoom level">Zoom {Math.round(zoom*100)}%</div>
          <button className="btn-ghost" title="Fit to room" onClick={zoomFit}>Fit</button>
          <button className="btn-ghost" title="Zoom 100%" onClick={zoom100}>100%</button>
          <button className="btn-ghost" title="Diagnostics" onClick={()=>setShowDiag(s=>!s)}>Diagnostics</button>
        </div>
        {/* Finishes & Lighting collapsible; moved camera tabs into toolbar to avoid duplication */}
        <details className="panel compact" style={{ margin:12 }}>
          <summary style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span>Finishes & Lighting</span>
            <div className="palette" style={{ marginLeft:6 }}>
              <div className="swatch" style={{ background: model.finishes?.wallHex || "#F7F6F2" }} title={`Walls ${model.finishes?.wallHex||""}`} />
              <div className="swatch" style={{ background: (model.finishes?.floor as any)?.kind==="carpet_tiles" ? (model.finishes?.floor as any)?.baseHex : (model.finishes?.floor as any)?.tintHex }} title="Floor" />
              <div className="swatch" style={{ background: model.finishes?.accentHex || "#FF6D00" }} title="Accent" />
              <div className="swatch" style={{ background: model.finishes?.mullionHex || "#1C1F22" }} title="Mullion" />
              <div className="swatch" style={{ background: model.finishes?.glassTintHex || "#EAF2F6" }} title="Glass" />
            </div>
            <div className="badge" title="Correlated color temperature">{model.lighting?.cctK || 4300}K</div>
          </summary>
          <div className="section-body" style={{ padding:12 }}>
            <button className="btn" title="Generate palette card SVG" onClick={generatePaletteCard} style={{ marginBottom:12 }}>Generate Palette Card</button>
          </div>
        </details>
        

        <details className="panel compact" style={{ margin:12 }}>
          <summary>Finishes & Lighting controls</summary>
          <div className="section-body">
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
            ) : (
              (()=>{
                const fin = model.finishes; const floor:any = fin?.floor as any;
                if (fin && floor){
                  return (
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
                  );
                }
                return null;
              })()
            )}

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
          </div>
        </details>

        {/* removed duplicate camera tabs to avoid redundancy */}

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

        {showProposals && proposals && (
          <div style={{margin:"6px 0", padding:"6px", border:"1px dashed #444", borderRadius:8}}>
            <b>Proposals</b> ({proposals.length})
            <div style={{maxHeight:160, overflow:"auto", marginTop:6}}>
              {proposals.map((p,i)=> (
                <div key={i} style={{display:"flex", gap:8, alignItems:"center", fontSize:12, marginBottom:4}}>
                  <span>{p.object.kind}</span>
                  <span>conf {Math.round((p.conf||0)*100)}%</span>
                  <button onClick={()=>{
                    setModel(m=>({ ...m, objects:[...m.objects, {
                      id: crypto.randomUUID(),
                      kind: p.object.kind as any,
                      cx: (p.object as any).cx, cy: (p.object as any).cy,
                      w: (p.object as any).w, d: (p.object as any).d, h: (p.object as any).h,
                      wall: (p.object as any).wall, rotation: (p.object as any).rotation||0, label: (p.object as any).label
                    }]}));
                    setProposals(prev=> prev!.filter((_,j)=>j!==i));
                  }}>Accept</button>
                  <button onClick={()=> setProposals(prev=> prev!.filter((_,j)=>j!==i))}>Dismiss</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex", gap:8, marginTop:6}}>
              <button onClick={()=>{
                setModel(m=>({ ...m, objects:[...m.objects, ...proposals.map(p=>({
                  id: crypto.randomUUID(), kind:p.object.kind as any,
                  cx:(p.object as any).cx, cy:(p.object as any).cy,
                  w:(p.object as any).w, d:(p.object as any).d, h:(p.object as any).h,
                  wall:(p.object as any).wall, rotation:(p.object as any).rotation||0, label:(p.object as any).label
                }))]}));
                setProposals(null);
              }}>Accept all</button>
              <button onClick={()=> setProposals(null)}>Clear proposals</button>
            </div>
          </div>
        )}

        {activeTab==="plan" && (
          <svg ref={containerRef as any} width={CANVAS_W} height={CANVAS_H}
               onWheel={onWheel}
               onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
               onMouseDown={onSvgMouseDown} onMouseMove={onSvgMouseMove} onMouseUp={onSvgMouseUp} onMouseLeave={onSvgMouseUp}
               style={{ background:"#0f1217", border:"1px solid #232833", borderRadius:12 }}>
            {defs}
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {Array.from({length:Math.ceil(model.room.width/GRID_FT)+1}).map((_,i)=>{ const x = toCanvasX(i*GRID_FT); const major = i%5===0; return <line key={"gx"+i} x1={x} x2={x} y1={toCanvasY(0)} y2={toCanvasY(model.room.depth)} stroke={major ? (getCss("--grid-strong")||"#23304a") : (getCss("--grid")||"#1a2233")} strokeWidth={major?1:0.5} /> })}
              {Array.from({length:Math.ceil(model.room.depth/GRID_FT)+1}).map((_,i)=>{ const y = toCanvasY(i*GRID_FT); const major = i%5===0; return <line key={"gy"+i} y1={y} y2={y} x1={toCanvasX(0)} x2={toCanvasX(model.room.width)} stroke={major ? (getCss("--grid-strong")||"#23304a") : (getCss("--grid")||"#1a2233")} strokeWidth={major?1:0.5} /> })}
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
              {model.objects.map(o=>{ const x = toCanvasX(o.cx) - toPx(o.w)/2; const y = toCanvasY(o.cy) - toPx(o.d)/2; const seld = sel===o.id; const rot = o.rotation || 0; const hitCols = collisions.filter((c:any)=> (c.a?.id===o.id || c.b?.id===o.id)); const sev = hitCols.find((h:any)=>h.severity==="error")?"error":(hitCols.find((h:any)=>h.severity==="warning")?"warning":null); const ringColor = sev==="error" ? (getCss("--err")||"#ef4444") : (sev? (getCss("--warn")||"#f59e0b") : null); return (
                <g key={o.id} transform={`rotate(${rot},${toCanvasX(o.cx)},${toCanvasY(o.cy)})`} onMouseDown={(e)=>{ setSel(o.id); begin(e,o.id,"move"); }}>
                  {showCollisions && ringColor && (()=>{ const rr = Math.max(12, Math.hypot(o.w||0, o.d||0) * scale * 0.55); return (
                    <circle cx={toCanvasX(o.cx)} cy={toCanvasY(o.cy)} r={rr} fill={ringColor+"44"} stroke={ringColor} strokeWidth={1.5} />
                  ); })()}
                  <rect x={x} y={y} width={toPx(o.w)} height={toPx(o.d)} fill={seld?"#253049":"#1b2230"} stroke={seld?(getCss("--accent")||"#7aa2ff"):"#3a4255"} strokeWidth={2} rx={6} />
                  <rect x={x+toPx(o.w)-8} y={y+toPx(o.d)-8} width={14} height={14} fill="var(--chip)" stroke={(getCss("--accent")||"#7aa2ff")} strokeWidth={1.5} rx={3} onMouseDown={(e)=>{ e.stopPropagation(); setSel(o.id); begin(e,o.id,"resize"); }} />
                  <text x={toCanvasX(o.cx)} y={toCanvasY(o.cy)} fill="#cbd3e1" textAnchor="middle" dy="0.35em" fontSize={12}>
                    {o.label || o.kind}
                  </text>
                  {showGuides && seld && dragging.current && dragging.current.mode==="move" && (
                    <g>
                      <line x1={toCanvasX(o.cx)} x2={toCanvasX(o.cx)} y1={toCanvasY(0)} y2={toCanvasY(model.room.depth)} stroke={(getCss("--accent")||"#7aa2ff")} strokeDasharray="4 4" strokeWidth={1} opacity={0.6}/>
                      <line y1={toCanvasY(o.cy)} y2={toCanvasY(o.cy)} x1={toCanvasX(0)} x2={toCanvasX(model.room.width)} stroke={(getCss("--accent")||"#7aa2ff")} strokeDasharray="4 4" strokeWidth={1} opacity={0.6}/>
                    </g>
                  )}
                  {seld && <>
                    <RotationAndFacing o={o} />
                    <Bubbles o={o} />
                  </>}
                </g>
              ); })}
              {/* Proposed ghost objects */}
              {proposals && proposals.map((p,i)=>{
                const o:any = p.object; if (o?.cx==null || o?.cy==null) return null;
                const gx = toCanvasX(o.cx) - toPx((o.w||2))/2; const gy = toCanvasY(o.cy) - toPx((o.d||2))/2;
                const rot = o.rotation||0;
                return (
                  <g key={`prop-${i}`} transform={`rotate(${rot},${toCanvasX(o.cx)},${toCanvasY(o.cy)})`}>
                    <rect x={gx} y={gy} width={toPx(o.w||2)} height={toPx(o.d||2)} fill="none" stroke="#66CCFF" strokeDasharray="6 4" strokeWidth={2}/>
                    <text x={toCanvasX(o.cx)} y={toCanvasY(o.cy)-(toPx(o.d||2)/2+8)} fill="#66CCFF" textAnchor="middle" fontSize={12}>{o.kind} (prop {Math.round((p.conf||0)*100)}%)</text>
                  </g>
                );
              })}
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

        {/* Vertical Z-axis mini-ruler (2.5D) */}
        {(activeTab==="plan") && (()=>{
          const roomH = model.room.height||10;
          function zRange(o:any){
            const L = (o?.layer||"floor");
            if(L==="wall"){
              if(o?.mount_h && o?.h){ const half=(o.h||0)/2; return { z0: Math.max(0, o.mount_h-half), z1: Math.min(roomH, (o.mount_h+half)) }; }
              return { z0:0, z1:roomH };
            }
            if(L==="surface") return { z0:2.3, z1:5 };
            if(L==="ceiling") return { z0:roomH-1.5, z1:roomH };
            return { z0:0, z1:3 };
          }
          const rng = selected ? zRange(selected) : null;
          const H = 160; const W = 28; const pad=8;
          const pxPerFt = (H-2*pad)/(roomH||10);
          const yTop = pad; const yBottom = H-pad;
          const selTop = rng ? (yBottom - rng.z1*pxPerFt) : 0;
          const selHeight = rng ? Math.max(2, (rng.z1-rng.z0)*pxPerFt) : 0;
          return (
            <div style={{ position:"absolute", right:12, top: 160, width:W, height:H, border:"1px solid var(--stroke)", borderRadius:6, background:"linear-gradient(180deg, rgba(122,162,255,0.15), rgba(0,0,0,0))" }} title="Z axis (ft)">
              <div style={{ position:"absolute", left:0, right:0, top:yTop-1, height:1, background:"var(--stroke-2)" }} />
              <div style={{ position:"absolute", left:0, right:0, bottom:pad-1, height:1, background:"var(--stroke-2)" }} />
              {rng && (
                <div style={{ position:"absolute", left:4, right:4, top: selTop, height: selHeight, borderRadius:4, background:"rgba(122,162,255,0.45)", border:"1px solid var(--accent)" }} />
              )}
              <div style={{ position:"absolute", left:2, top:2, fontSize:10, color:"var(--ink-dim)" }}>{roomH}′</div>
              <div style={{ position:"absolute", left:2, bottom:2, fontSize:10, color:"var(--ink-dim)" }}>0′</div>
            </div>
          );
        })()}

        {showDiag && (
          <div className="panel" style={{ position:"absolute", top: 52, left: 16, padding:10, maxWidth:380 }}>
            <b>Diagnostics</b>
            <div style={{ fontSize:12, color:"var(--ink-dim)", marginTop:6 }}>
              Errors: {collisions.filter((c:any)=>c.severity==="error").length} • Warnings: {collisions.filter((c:any)=>c.severity==="warning").length}
            </div>
            <div style={{ maxHeight:180, overflow:"auto", marginTop:6 }}>
              {collisions.map((c:any,i:number)=> (
                <div key={i} style={{ fontSize:12, marginBottom:4 }}>
                  <span style={{ color: c.severity==="error"?"var(--err)":"var(--warn)" }}>{c.severity}</span>
                  {": "}
                  <span>{c.reason}</span>
                  {" — "}
                  <span>{c.a?.label||c.a?.kind}</span>
                  {c.b && <span>{" ↔ "}{c.b?.label||c.b?.kind}</span>}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <button className="btn" title="Resolve (sweep)" onClick={()=>{ const r = resolveCollisions(model, 12); setModel(r.model); setCollisions(r.remaining); }}>Auto-separate</button>
              <button className="btn-ghost" onClick={()=>setShowDiag(false)}>Close</button>
            </div>
          </div>
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
            <div style={{ border:"1px solid #232833", borderRadius:12, background:"#0f1217", position:"relative" }}>
              <ThreePreview model={model} width={CANVAS_W} height={CANVAS_H} onPick={(id)=>{
                const found = model.objects.find(o=>o.id===id);
                if(found){ setSel(found.id); }
              }} onEditLabel={(id, x, y)=>{
                const found = model.objects.find(o=>o.id===id);
                if(!found) return;
                setLabelEdit({ id, x, y, value: found.label || found.kind });
              }} />
            </div>
            {labelEdit && (
              <input
                className="label3d"
                style={{ position:"fixed", left: Math.round(labelEdit.x)+10, top: Math.round(labelEdit.y)+10, zIndex:1000 }}
                value={labelEdit.value}
                onChange={e=> setLabelEdit(v=> v ? { ...v, value:e.target.value } : v)}
                onKeyDown={e=>{
                  if(e.key==="Enter"){ const v = labelEdit; if(!v) return; setModel(m=>({ ...m, objects: m.objects.map(o=> o.id===v.id ? { ...o, label:v.value } : o ) })); setSel(v.id); setLabelEdit(null); }
                  if(e.key==="Escape"){ setLabelEdit(null); }
                }}
                onBlur={()=>{ const v = labelEdit; if(!v) return; setModel(m=>({ ...m, objects: m.objects.map(o=> o.id===v.id ? { ...o, label:v.value } : o ) })); setSel(v.id); setLabelEdit(null); }}
                autoFocus
              />
            )}
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
      </section>

      <aside className="panel" style={{ padding:12 }}>
        <h3 style={{ margin:"4px 0 8px" }}>Properties</h3>
        <div className="panel" style={{ padding:10, marginBottom:8 }}>
          <b>Placement</b>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
            {selected ? (<>
              <label>Center X<input type="number" step={0.1} value={selected.cx} onChange={e=>updateSelected({ cx:+e.target.value })} /></label>
              <label>Center Y<input type="number" step={0.1} value={selected.cy} onChange={e=>updateSelected({ cy:+e.target.value })} /></label>
              <label>Rotation°<input type="number" step={1} value={selected.rotation||0} onChange={e=>updateSelected({ rotation: degClamp(+e.target.value) })} /></label>
              <label>Facing°<input type="number" step={1} value={selected.facing ?? selected.rotation ?? 0} onChange={e=>updateSelected({ facing: degClamp(+e.target.value) })} /></label>
              <label>Wall<select value={selected.wall||""} onChange={e=>updateSelected({ wall:(e.target.value||undefined) as any })}>
                <option value="">(none)</option><option value="N">N</option><option value="S">S</option><option value="E">E</option><option value="W">W</option>
              </select></label>
            </>) : <span style={{ color:"var(--ink-dim)" }}>Select an object</span>}
          </div>
        </div>
        <div className="panel" style={{ padding:10, marginBottom:8 }}>
          <b>Size</b>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
            {selected ? (<>
              <label>Width<input type="number" step={0.1} value={selected.w} onChange={e=>updateSelected({ w:+e.target.value })} /></label>
              <label>Depth<input type="number" step={0.1} value={selected.d} onChange={e=>updateSelected({ d:+e.target.value })} /></label>
              <label>Height<input type="number" step={0.1} value={selected.h||0} onChange={e=>updateSelected({ h:+e.target.value })} /></label>
              <label>Mount H<input type="number" step={0.1} value={selected.mount_h||0} onChange={e=>updateSelected({ mount_h:+e.target.value })} /></label>
            </>) : <span style={{ color:"var(--ink-dim)" }}>Select an object</span>}
          </div>
        </div>
        <div className="panel" style={{ padding:10, marginBottom:8 }}>
          <b>Materials</b>
          <div style={{ marginTop:8 }}>
            {selected ? (<>
              <label>Description
                <textarea rows={4} style={{ width:"100%" }} value={selected.meta?.description ?? (YC_DESCRIPTIONS[(selected.kind||"") as string]?.description || "")} onChange={e=>updateSelected({ meta:{ ...(selected.meta||{}), description:e.target.value } as any })} />
              </label>
              <div style={{ marginTop:6 }}>
                <div>Object reference images</div>
                <input type="file" accept="image/*" multiple onChange={async e=>{ const files = e.target.files; if(!files) return; const urls = await Promise.all([...files].map(f=> new Promise<string>(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result as string); fr.readAsDataURL(f); }))); updateSelected({ } as any); }}/>
                <button className="btn-ghost" style={{ marginTop:6 }} onClick={()=>autoDescribeObject(selected!)}>Auto-Describe from refs</button>
              </div>
            </>) : <span style={{ color:"var(--ink-dim)" }}>Select an object</span>}
          </div>
        </div>
        <div className="panel" style={{ padding:10 }}>
          <b>Notes</b>
          <div style={{ marginTop:6 }}>
            <label>Scene notes<textarea style={{ width:"100%", minHeight:90 }} value={model.notes||""} onChange={e=>setModel(m=>({...m, notes:e.target.value}))} /></label>
          </div>
        </div>
      </aside>
    </div>
  );
}


