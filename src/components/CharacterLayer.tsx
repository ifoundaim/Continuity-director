import React, { useEffect, useRef, useState } from "react";
import type { SceneModel } from "../lib/scene_model";
import { loadPlacements, savePlacements } from "../lib/placements";

export type CharPlacement = { id:string; name:string; heightCm:number; x:number; y:number; facingDeg?:number; color:string };

function uid(){ return Math.random().toString(36).slice(2,9); }

export default function CharacterLayer({
  model, toCanvasX, toCanvasY, screenToFtX, screenToFtY, onChange
}:{ model: SceneModel;
   toCanvasX:(ft:number)=>number; toCanvasY:(ft:number)=>number; screenToFtX:(px:number)=>number; screenToFtY:(px:number)=>number;
   onChange:(list:CharPlacement[])=>void;
}){
  // Start empty on first render to avoid SSR hydration mismatch; load after mount
  const [chars, setChars] = useState<CharPlacement[]>([]);
  useEffect(()=>{ const L = loadPlacements().map(p=>({ color: "hsl(200,80%,60%)", ...p })); setChars(L as any); }, []);
  useEffect(()=>{ onChange(chars); savePlacements(chars); }, [chars]);

  function add(){ 
    const name = prompt("Character name?", "Aim");
    if(name===null) return;
    const h = Number(prompt("Height (cm)?", "170"))||170;
    setChars(cs=>[...cs, { id:uid(), name, heightCm:h, x:model.room.width/2, y:model.room.depth/2, color: randomColor() }]);
  }
  function remove(id:string){ setChars(cs=>cs.filter(c=>c.id!==id)); }
  function randomColor(){ return `hsl(${Math.floor(Math.random()*360)},85%,65%)`; }

  const [dragId,setDragId]=useState<string|null>(null);
  const prevUserSelect = useRef<string>("");
  const prevCursor = useRef<string>("");
  function startDrag(e:React.MouseEvent, id:string){
    setDragId(id);
    e.stopPropagation();
    e.preventDefault();
    try { window.getSelection()?.removeAllRanges(); } catch {}
    prevUserSelect.current = document.body.style.userSelect;
    prevCursor.current = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }
  function endDrag(){
    setDragId(null);
    document.body.style.userSelect = prevUserSelect.current || "";
    document.body.style.cursor = prevCursor.current || "";
  }
  function move(e:React.MouseEvent){
    if(!dragId) return;
    const svg = (e.target as any).ownerSVGElement as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    // convert screen px -> scene feet using designer pan/zoom and canvas origin
    setChars(list=>list.map(c=> c.id!==dragId ? c : {
      ...c, x: clamp(screenToFtX(x), 0, model.room.width), y: clamp(screenToFtY(y), 0, model.room.depth)
    }));
  }
  function clamp(v:number,a:number,b:number){ return Math.max(a,Math.min(b,v)); }

  useEffect(()=>()=>{ document.body.style.userSelect = prevUserSelect.current || ""; document.body.style.cursor = prevCursor.current || ""; },[]);

  return (
    <g onMouseMove={move as any} onMouseUp={endDrag} onMouseLeave={endDrag} style={{ userSelect:"none" }}>
      {/* UI toolbar (in-canvas, top-left) */}
      <g transform={`translate(${toCanvasX(0)+10},${toCanvasY(0)+20})`} >
        <rect x={-6} y={-16} width={140} height={24} fill="#1b2230" stroke="#3a4255" rx={6}/>
        <text x={8} y={0} fill="#cbd3e1" fontSize={12}>Characters</text>
        <g transform="translate(100,-6)" style={{ cursor:"pointer" }} onClick={add}>
          <rect width={20} height={20} rx={4} fill="#253049" stroke="#7c9cff"/><text x={10} y={14} textAnchor="middle" fill="#7c9cff">+</text>
        </g>
      </g>

      {/* markers */}
      {chars.map(c=>{
        const x = toCanvasX(c.x), y = toCanvasY(c.y);
        return (
          <g key={c.id} transform={`translate(${x},${y})`} style={{ cursor:"grab", userSelect:"none" }} onMouseDown={(e)=>startDrag(e,c.id)} onDragStart={(e)=>e.preventDefault()}>
            <circle r={10} fill={c.color} stroke="#0f1217" strokeWidth={2}/>
            <text y={-14} textAnchor="middle" fontSize={12} fill="#e9ecf1">{c.name}</text>
            <text y={22} textAnchor="middle" fontSize={11} fill="#9aa3b2">{Math.round(c.heightCm)}cm</text>
            {/* Facing arrow */}
            {(() => {
              const ang = ((c.facingDeg ?? 0) - 90) * Math.PI/180; const len = 22;
              const ax = Math.cos(ang)*len; const ay = Math.sin(ang)*len;
              return (
                <g onMouseDown={(e)=>{ e.stopPropagation(); setDragId(c.id+"__rot"); }}>
                  <defs>
                    <marker id="charArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L9,3 z" fill="#60d394" />
                    </marker>
                  </defs>
                  <line x1={0} y1={0} x2={ax} y2={ay} stroke="#60d394" strokeWidth={2} markerEnd="url(#charArrow)"/>
                </g>
              );
            })()}
            <g transform="translate(16,-16)" onClick={(e)=>{ e.stopPropagation(); if(confirm(`Remove ${c.name}?`)) remove(c.id); }} style={{ cursor:"pointer" }}>
              <rect width={12} height={12} rx={2} fill="#1b2230" stroke="#3a4255"/><text x={6} y={9} textAnchor="middle" fontSize={10} fill="#9aa3b2">×</text>
            </g>
            {/* Rotate knob */}
            <g transform={`translate(${18},${-18})`} style={{ cursor:"grab" }} onMouseDown={(e)=>{
              e.stopPropagation();
              const svg = (e.target as any).ownerSVGElement as SVGSVGElement; const rect = svg.getBoundingClientRect();
              function onMove(ev:MouseEvent){
                const mx = ev.clientX - rect.left - x; const my = ev.clientY - rect.top - y;
                const ang = Math.atan2(my, mx) * 180/Math.PI; const deg = Math.round(ang + 90);
                setChars(list=>list.map(p=> p.id!==c.id ? p : { ...p, facingDeg: ((deg%360)+360)%360 }));
              }
              function onUp(){ window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
              window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
            }}>
              <circle r={9} fill="#7c9cff" />
              <path d="M -4 -2 L 0 -6 L 4 -2" stroke="white" strokeWidth="2" fill="none" />
            </g>
          </g>
        );
      })}
    </g>
  );
}


