import { SceneModel, SceneObject, defaultLayerFor } from "./scene_model";
import { CLEARANCES, REASONS } from "./physics";

// simple OBB vs OBB using rotation (in radians) for plan view
function obb(o: SceneObject){
  let rotDeg = o.rotation ?? 0;
  let w = o.w || 0; let d = o.d || 0;
  // Wall-mounted orientation: items span along the wall using width, and protrude into the room by depth
  if (o.wall === "E" || o.wall === "W") { rotDeg = 90; const t=w; w=d; d=t; }
  if (o.wall === "N" || o.wall === "S") { rotDeg = 0; }
  const th = rotDeg * Math.PI/180;
  const c = Math.cos(th), s = Math.sin(th);
  const hw = w/2, hd = d/2;
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

  // Simple vertical ranges per layer (feet)
  const layerZ = {
    floor: { z0: 0.0, z1: 3.0 },        // floor-standing objects up to ~3 ft
    surface: { z0: 2.3, z1: 5.0 },      // on-table/surfaces
    wall: { z0: 0.0, z1: R.height },    // mounted on walls (span entire height)
    ceiling: { z0: R.height - 1.5, z1: R.height } // lights etc
  } as const;

  function zRange(o: SceneObject){
    const L = (o.layer||"floor") as keyof typeof layerZ;
    const base = layerZ[L];
    // If mount_h provided, center the object's vertical range around it when applicable
    if (L === "wall" && o.mount_h && o.h){
      const half = (o.h||0)/2; return { z0: Math.max(0, o.mount_h - half), z1: Math.min(R.height, o.mount_h + half) };
    }
    return base;
  }
  function zOverlap(a: SceneObject, b: SceneObject){
    const A = zRange(a), B = zRange(b); return (Math.min(A.z1, B.z1) > Math.max(A.z0, B.z0));
  }

  // 0) bounds & wall fit
  for(const o of model.objects){
    const r = obb(o);
    // quick bounds check using AABB of OBB (conservative)
    const minX = o.cx - Math.max(o.w, o.d);
    const maxX = o.cx + Math.max(o.w, o.d);
    const minY = o.cy - Math.max(o.w, o.d);
    const maxY = o.cy + Math.max(o.w, o.d);

    if (!o.wall) {
      if (minX < 0 || maxX > R.width || minY < 0 || maxY > R.depth){
        out.push({ a:o, reason:REASONS.OUT_OF_BOUNDS, severity:"error" });
      }
    } else {
      // For wall-mounted objects, semantics: center sits exactly on the wall line
      const eps = CLEARANCES.wallGapMin;
      const dEff = (o.d||0);
      if (o.wall === "E"){
        if (Math.abs(o.cx - R.width) > eps) out.push({ a:o, reason:REASONS.WALL_MISALIGNED, severity:"error" });
        // interior edge must be inside room by depth/2
        if ((o.cx - dEff/2) < -eps) out.push({ a:o, reason:REASONS.OUT_OF_BOUNDS, severity:"error" });
      } else if (o.wall === "W"){
        if (Math.abs(o.cx - 0) > eps) out.push({ a:o, reason:REASONS.WALL_MISALIGNED, severity:"error" });
        if ((o.cx + dEff/2) > R.width + eps) out.push({ a:o, reason:REASONS.OUT_OF_BOUNDS, severity:"error" });
      } else if (o.wall === "N"){
        if (Math.abs(o.cy - 0) > eps) out.push({ a:o, reason:REASONS.WALL_MISALIGNED, severity:"error" });
        if ((o.cy + dEff/2) > R.depth + eps) out.push({ a:o, reason:REASONS.OUT_OF_BOUNDS, severity:"error" });
      } else if (o.wall === "S"){
        if (Math.abs(o.cy - R.depth) > eps) out.push({ a:o, reason:REASONS.WALL_MISALIGNED, severity:"error" });
        if ((o.cy - dEff/2) < -eps) out.push({ a:o, reason:REASONS.OUT_OF_BOUNDS, severity:"error" });
      }
    }
  }

  // 1) object–object overlaps by layer (2.5D: allow stacking across layers)
  const objs = model.objects.slice();
  for (let i=0;i<objs.length;i++){
    for (let j=i+1;j<objs.length;j++){
      const A = objs[i], B = objs[j];

      // Skip parent-child overlap
      if (A.attachTo===B.id || B.attachTo===A.id) continue;

      // Layer + 2.5D vertical check: require same layer AND vertical overlap
      const layerA = (A.layer || defaultLayerFor(A)) as any;
      const layerB = (B.layer || defaultLayerFor(B)) as any;
      if (layerA !== layerB) continue; // different layers are allowed to stack
      if (!zOverlap(A,B)) continue;    // no vertical intersection → no collision
      // Special case: wall items on different walls never collide
      if (layerA === "wall" && A.wall && B.wall && A.wall !== B.wall) continue;

      // Ignore hard overlaps between table and chairs; handled via chair clearance warnings
      const isChairTable = (A.kind==="chair" && B.kind==="table") || (A.kind==="table" && B.kind==="chair");
      if (isChairTable) continue;

      const pa = obb(A), pb = obb(B);
      if (overlap2D(pa,pb)) out.push({ a:A, b:B, reason:REASONS.OVERLAP, severity:"error" });
    }
  }

  // 2) soft clearances (chairs around tables) – floor layer only
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


