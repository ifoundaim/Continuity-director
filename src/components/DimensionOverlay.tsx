import React from "react";
import { SceneModel, SceneObject } from "../lib/scene_model";

type Props = {
  model: SceneModel;
  selected: SceneObject | null;
  toCanvasX: (ft:number)=>number;
  toCanvasY: (ft:number)=>number;
  toPx: (ft:number)=>number;
};

export default function DimensionOverlay({ model, selected, toCanvasX, toCanvasY, toPx }: Props){
  if(!selected) return null as any;
  const sx = toCanvasX(selected.cx - selected.w/2);
  const ex = toCanvasX(selected.cx + selected.w/2);
  const sy = toCanvasY(selected.cy - selected.d/2);
  const ey = toCanvasY(selected.cy + selected.d/2);

  const label = (x:number,y:number,text:string) => <text x={x} y={y} fill="#9aa3b2" fontSize={11} textAnchor="middle">{text}</text>;
  const ft = (v:number) => `${v.toFixed(2)} ft`;

  return (
    <g>
      {/* width */}
      <line x1={sx} y1={sy-18} x2={ex} y2={sy-18} stroke="#9aa8ff" strokeWidth={1}/>
      <line x1={sx} y1={sy-22} x2={sx} y2={sy-14} stroke="#9aa8ff"/><line x1={ex} y1={sy-22} x2={ex} y2={sy-14} stroke="#9aa8ff"/>
      {label((sx+ex)/2, sy-24, ft(selected.w))}
      {/* depth */}
      <line x1={ex+18} y1={sy} x2={ex+18} y2={ey} stroke="#9aa8ff" strokeWidth={1}/>
      <line x1={ex+14} y1={sy} x2={ex+22} y2={sy} stroke="#9aa8ff"/><line x1={ex+14} y1={ey} x2={ex+22} y2={ey} stroke="#9aa8ff"/>
      {label(ex+18, (sy+ey)/2, ft(selected.d))}
      {/* to walls */}
      <line x1={sx} y1={ey+18} x2={toCanvasX(0)} y2={ey+18} stroke="#60d394" strokeDasharray="4 3"/>
      {label((sx+toCanvasX(0))/2, ey+30, ft(selected.cx-selected.w/2))}
      <line x1={ex} y1={ey+18} x2={toCanvasX(model.room.width)} y2={ey+18} stroke="#60d394" strokeDasharray="4 3"/>
      {label((ex+toCanvasX(model.room.width))/2, ey+30, ft(model.room.width - (selected.cx+selected.w/2)))}
    </g>
  );
}


