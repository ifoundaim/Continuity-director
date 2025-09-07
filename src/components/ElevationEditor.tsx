import React from "react";
import { SceneModel, SceneObject } from "../lib/scene_model";

type Wall = "N"|"S"|"E"|"W";
type Props = {
  model: SceneModel;
  wall: Wall;
  onChange: (o: SceneObject)=>void;
  onSelect: (id:string)=>void;
  selectedId?: string|null;
};

const W=920,H=320,pad=24;

export default function ElevationEditor({ model, wall, onChange, onSelect, selectedId }: Props){
  // project objects mounted to this wall
  const objs = model.objects.filter(o=>o.wall===wall);
  const scale = (wall==="N"||wall==="S") ? (W-2*pad)/model.room.width : (W-2*pad)/model.room.depth;

  const toX = (o:SceneObject) => {
    if (wall==="N"||wall==="S") return pad + ((o.cx - o.w/2) * scale);
    return pad + ((o.cy - o.d/2) * scale);
  };
  const width = (o:SceneObject) => ( (wall==="N"||wall==="S") ? o.w : o.d ) * scale;
  const toY = (o:SceneObject) => H - pad - ((o.mount_h||0)+(o.h||3)) * ( (H-2*pad)/model.room.height );
  const height = (o:SceneObject) => (o.h||3) * ( (H-2*pad)/model.room.height );

  return (
    <svg width={W} height={H} style={{ background:"#0f1217", border:"1px solid #232833", borderRadius:12 }}>
      {/* ground */}
      <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#3a4255"/>
      {objs.map(o=>{
        const x = toX(o), y=toY(o), w=width(o), h=height(o);
        const sel = selectedId===o.id;
        return (
          <g key={o.id} onClick={()=>onSelect(o.id)} style={{ cursor:"pointer" }}>
            <rect x={x} y={y} width={w} height={h} fill={sel?"#253049":"#1b2230"} stroke={sel?"#7c9cff":"#3a4255"} />
            <text x={x+w/2} y={y-6} fill="#cbd3e1" textAnchor="middle" fontSize={12}>{o.label||o.kind}</text>
          </g>
        );
      })}
    </svg>
  );
}


