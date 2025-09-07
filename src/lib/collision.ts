import { SceneModel, SceneObject } from "./scene_model";
import { CLEARANCES, REASONS } from "./physics";

// simple OBB vs OBB using rotation (in radians) for plan view
function obb(o: SceneObject){
  const th = (o.rotation ?? 0) * Math.PI/180;
  const c = Math.cos(th), s = Math.sin(th);
  const hw = (o.w||0)/2, hd = (o.d||0)/2;
  return { cx:o.cx, cy:o.cy, c, s, hw, hd };
}
function overlap2D(a:any,b:any){
  // Separating axis for two rectangles (a,b) in 2D
  const axes = [
    {x:a.c, y:a.s},
    {x:-a.s, y:a.c},
    {x:b.c, y:b.s},
    {x:-b.s, y:b.c},
  ];
  for(const ax of axes){
    const pa = projLen(a,ax), pb = projLen(b,ax);
    const da = a.cx*ax.x + a.cy*ax.y;
    const db = b.cx*ax.x + b.cy*ax.y;
    if (Math.abs(da - db) > pa + pb) return false;
  }
  return true;
}
function projLen(r:any, ax:any){
  // projection radius of OBB on axis
  return Math.abs(r.hw*r.c*ax.x + r.hd*(-r.s)*ax.x) + Math.abs(r.hw*r.s*ax.y + r.hd*r.c*ax.y);
}

export type Collision = { a: SceneObject; b?: SceneObject; reason: string; severity: "error"|"warning" };

export function detectCollisions(model: SceneModel): Collision[] {
  const out: Collision[] = [];
  const R = model.room;

  // 0) bounds & wall fit
  for(const o of model.objects){
    const r = obb(o);
    // quick bounds check using AABB of OBB (conservative)
    const minX = o.cx - Math.max(o.w, o.d);
    const maxX = o.cx + Math.max(o.w, o.d);
    const minY = o.cy - Math.max(o.w, o.d);
    const maxY = o.cy + Math.max(o.w, o.d);
    if (minX < 0 || maxX > R.width || minY < 0 || maxY > R.depth){
      out.push({ a:o, reason:REASONS.OUT_OF_BOUNDS, severity:"error" });
    }
    if (o.wall){
      const eps = CLEARANCES.wallGapMin;
      const bad =
        (o.wall==="E" && Math.abs(o.cx - R.width) > eps) ||
        (o.wall==="W" && Math.abs(o.cx - 0) > eps) ||
        (o.wall==="N" && Math.abs(o.cy - 0) > eps) ||
        (o.wall==="S" && Math.abs(o.cy - R.depth) > eps);
      if (bad) out.push({ a:o, reason:REASONS.WALL_MISALIGNED, severity:"error" });
    }
  }

  // 1) object–object overlaps by layer
  const objs = model.objects.slice();
  for (let i=0;i<objs.length;i++){
    for (let j=i+1;j<objs.length;j++){
      const A = objs[i], B = objs[j];

      // Skip parent-child overlap
      if (A.attachTo===B.id || B.attachTo===A.id) continue;

      // Layer rules: collide only when competing for the same real estate
      const sameLayer = (A.layer||"floor") === (B.layer||"floor");
      const bothWall   = (A.layer==="wall" && B.layer==="wall" && A.wall===B.wall);
      const bothFloor  = (A.layer==="floor" && B.layer==="floor");
      const bothSurface= (A.layer==="surface" && B.layer==="surface");

      const test = (bothWall || bothFloor || bothSurface || sameLayer);
      if (!test) continue;

      const pa = obb(A), pb = obb(B);
      if (overlap2D(pa,pb)) out.push({ a:A, b:B, reason:REASONS.OVERLAP, severity:"error" });
    }
  }

  // 2) soft clearances (chairs around tables)
  const chairs = objs.filter(o=>o.kind==="chair");
  const tables = objs.filter(o=>o.kind==="table");
  const seatBack = CLEARANCES.chairBackToTable; // 18 in
  const chairSpacing = CLEARANCES.chairToChair; // 30 in
  for (const c of chairs){
    for (const t of tables){
      // distance from chair center to table edge (approx with axis align)
      const dx = Math.max(0, Math.abs(c.cx - t.cx) - t.w/2);
      const dy = Math.max(0, Math.abs(c.cy - t.cy) - t.d/2);
      const edgeDist = Math.hypot(dx, dy);
      if (edgeDist < seatBack) out.push({ a:c, b:t, reason:REASONS.CHAIR_BACK, severity:"warning" });
    }
  }
  for (let i=0;i<chairs.length;i++){
    for (let j=i+1;j<chairs.length;j++){
      const A = chairs[i], B = chairs[j];
      const dist = Math.hypot(A.cx-B.cx, A.cy-B.cy);
      if (dist < chairSpacing) out.push({ a:A, b:B, reason:REASONS.CHAIR_SPACING, severity:"warning" });
    }
  }

  // Aisle rule for tables: distance to nearest wall
  for (const t of tables){
    const nearestWall = Math.min(t.cx, R.width - t.cx, t.cy, R.depth - t.cy) - Math.max(t.w,t.d)/2;
    if (nearestWall < CLEARANCES.aisleMin) {
      out.push({ a:t, reason:REASONS.AISLE, severity:"warning" });
    }
  }

  return out;
}

// sweep-and-separate resolution (doesn't move locked or wall items)
export function resolveCollisions(model: SceneModel, iters=6): { model: SceneModel; remaining: Collision[] } {
  const m = { ...model, objects: model.objects.map(o=>({ ...o })) };
  const pri = (o:SceneObject) =>
    (o.locked ? 0 :
     o.wall ? 1 :
     o.kind==="table" ? 2 :
     o.kind==="panel" ? 3 :
     o.kind==="chair" ? 4 : 5);

  for (let k=0;k<iters;k++){
    const cols = detectCollisions(m).filter(c=>c.severity==="error");
    if (!cols.length) return { model:m, remaining:[] };

    for (const col of cols){
      const A = col.a, B = col.b;
      if (!B){ // bounds/wall fit → nudge inward
        if (!A.locked && !A.wall){
          A.cx = clamp(A.cx, 0.5, m.room.width-0.5);
          A.cy = clamp(A.cy, 0.5, m.room.depth-0.5);
        }
        continue;
      }
      const mover = pri(A) >= pri(B) ? A : B;  // move lower-priority
      if (mover.locked || mover.wall) continue;

      // push along smallest axis away from the other center
      const angle = Math.atan2(mover.cy - (A===mover?B.cy:A.cy), mover.cx - (A===mover?B.cx:A.cx));
      const step = 0.25; // ft
      mover.cx = clamp(mover.cx + Math.cos(angle)*step, 0.25, m.room.width-0.25);
      mover.cy = clamp(mover.cy + Math.sin(angle)*step, 0.25, m.room.depth-0.25);
    }
  }
  // extra pass for warnings (gentle)
  for (const col of detectCollisions(m).filter(c=>c.severity==="warning")){
    if (col.reason === REASONS.CHAIR_BACK && col.a.kind==="chair" && col.b?.kind==="table"){
      const c = col.a, t = col.b;
      const dx = c.cx - t.cx, dy = c.cy - t.cy; const len = Math.hypot(dx,dy) || 1;
      const need = (CLEARANCES.chairBackToTable + 0.1);
      const ax = t.cx + (dx/len) * (t.w/2 + need);
      const ay = t.cy + (dy/len) * (t.d/2 + need);
      c.cx = clamp(ax, 0.25, m.room.width-0.25);
      c.cy = clamp(ay, 0.25, m.room.depth-0.25);
    }
    if (col.reason === REASONS.CHAIR_SPACING && col.a.kind==="chair" && col.b?.kind==="chair"){
      const A = col.a, B = col.b!;
      const dx = A.cx - B.cx, dy = A.cy - B.cy, len = Math.hypot(dx,dy)||1;
      const midx = (A.cx + B.cx)/2, midy = (A.cy + B.cy)/2;
      const half = CLEARANCES.chairToChair/2 + 0.05;
      A.cx = midx + (dx/len)*half; A.cy = midy + (dy/len)*half;
      B.cx = midx - (dx/len)*half; B.cy = midy - (dy/len)*half;
    }
    if (col.reason === REASONS.AISLE && col.a.kind==="table" && !col.a.locked){
      const t = col.a; const cx = m.room.width/2; const cy = m.room.depth/2;
      t.cx = (t.cx*3 + cx)/4; t.cy = (t.cy*3 + cy)/4;
    }
  }
  return { model:m, remaining: detectCollisions(m) };
}

export function countErrors(cols: Collision[]) {
  return cols.filter(c => c.severity === "error").length;
}
export function countWarnings(cols: Collision[]) {
  return cols.filter(c => c.severity === "warning").length;
}

function clamp(v:number, a:number, b:number){ return Math.max(a, Math.min(b, v)); }


