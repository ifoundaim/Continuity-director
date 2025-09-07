import { SceneModel, SceneObject } from "./scene_model";

export type Violation = { id: string; type: "overlap"|"clearance"|"out_of_bounds"; detail: string };

export function detectCollisions(model: SceneModel): Violation[] {
  const v: Violation[] = [];
  const objs = model.objects;
  const r = (o:SceneObject) => ({ x:o.cx-o.w/2, y:o.cy-o.d/2, w:o.w, h:o.d });
  for (let i=0;i<objs.length;i++){
    for (let j=i+1;j<objs.length;j++){
      const A=r(objs[i]), B=r(objs[j]);
      const inter = !(A.x+A.w<=B.x || B.x+B.w<=A.x || A.y+A.h<=B.y || B.y+B.h<=A.y);
      if(inter) v.push({ id: `${objs[i].id}:${objs[j].id}`, type:"overlap", detail:`${objs[i].label||objs[i].kind} intersects ${objs[j].label||objs[j].kind}` });
    }
  }
  // bounds
  for (const o of objs){
    if (o.cx-o.w/2 < 0 || o.cx+o.w/2 > model.room.width || o.cy-o.d/2 < 0 || o.cy+o.d/2 > model.room.depth){
      v.push({ id:o.id, type:"out_of_bounds", detail:`${o.label||o.kind} exceeds room` });
    }
  }
  return v;
}

export function enforceMinClearance(model: SceneModel, minFt=0.5): SceneModel {
  // very light push apart (single pass)
  const m = { ...model, objects:[...model.objects] };
  for (let i=0;i<m.objects.length;i++){
    for (let j=i+1;j<m.objects.length;j++){
      const A=m.objects[i], B=m.objects[j];
      const dx = (A.cx - B.cx), dy = (A.cy - B.cy);
      const dist = Math.hypot(dx,dy);
      const need = minFt + (A.w+B.w)/4 + (A.d+B.d)/4;
      if (dist < need && dist > 0){
        const push = (need - dist)/2;
        const ux = dx/dist, uy = dy/dist;
        A.cx += ux*push; A.cy += uy*push;
        B.cx -= ux*push; B.cy -= uy*push;
      }
    }
  }
  return m;
}


