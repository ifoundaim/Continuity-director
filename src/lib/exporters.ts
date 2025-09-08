import { SceneModel } from "./scene_model";

export function exportSceneLockJSON(model: SceneModel){
  // Export full SceneLock including new first-class locks for determinism
  const out: any = {
    scene_id: model.name || "yc_room_v1",
    units: model.units,
    room: model.room,
    wallMaterials: model.wallMaterials,
    finishes: model.finishes,
    lighting: model.lighting,
    finishes_version_id: model.finishes_version_id,
    doors: (model.doors||[]),
    carpet: model.carpet,
    exposure_lock: model.exposure_lock,
    objects: model.objects,
    notes: model.notes
  };
  return JSON.stringify(out, null, 2);
}

// Minimal shapes for iso rendering
type IsoBox = { x:number; y:number; z:number; w:number; d:number; h:number; color?:string; label?:string; arrowDeg?: number };

export function exportIsometricSVG(model: any, angleDeg = 0): string {
  const sx = 14, sy = 8, sz = 10; // iso scales
  const yaw = angleDeg * Math.PI/180;
  const toIso = (x:number,y:number,z:number)=>{
    const xr = x*Math.cos(yaw) - y*Math.sin(yaw);
    const yr = x*Math.sin(yaw) + y*Math.cos(yaw);
    return { X: (xr-yr)*sx, Y: (xr+yr)*sy - z*sz };
  };

  const W = 960, H = 640;
  const cx = W/2, cy = H*0.7;

  // room shell
  const room: IsoBox = { x:0, y:0, z:0, w:model.room.width, d:model.room.depth, h:model.room.height, color:"#2a3350" };

  // Apply attachments for stacked/surface items
  const byId = new Map((model.objects||[]).map((o:any)=>[o.id,o]));
  const resolved = (model.objects||[]).map((o:any)=>{
    if(!o.attachTo) return o;
    const p:any = byId.get(o.attachTo); if(!p) return o;
    const dx=o.local?.dx||0, dy=o.local?.dy||0;
    const placed:any = { ...o, cx:(p.cx||0)+dx, cy:(p.cy||0)+dy };
    if (o.layer==="surface" && (p.kind==="table" || p.layer==="surface")) placed.mount_h = (p.h||2.5);
    return placed;
  });

  // convert scene objects → simple iso boxes
  const boxes: IsoBox[] = resolved.map((o:any)=>{
    const x = o.cx - o.w/2, y = o.cy - o.d/2, z = 0;
    const color =
      o.kind==="table"      ? "#6b86ff" :
      o.kind==="chair"      ? "#82d1ff" :
      o.kind==="tv"         ? "#ffb86b" :
      o.kind==="whiteboard" ? "#d7e3ff" :
      o.kind==="panel"      ? "#9aa8ff" :
      o.kind==="decal"      ? "#ffd26b" : "#9ad4b3";
    return { x, y, z, w:o.w, d:o.d, h: Math.max(0.3, o.h || 3), color, label: (o.label||o.kind), arrowDeg: (o.facing ?? o.rotation ?? 0) };
  });

  function poly(points:[number,number,number][], opts:{fill?:string; stroke?:string; opacity?:number}){
    const ps = points.map(([x,y,z])=>{ const p=toIso(x,y,z); return `${cx+p.X},${cy+p.Y}`}).join(" ");
    const f = opts.fill??"none", s=opts.stroke??"#44507a", op=opts.opacity??1;
    return `<polygon points="${ps}" fill="${f}" fill-opacity="${op}" stroke="${s}" stroke-width="1"/>`;
  }

  function drawBox(b:IsoBox){
    // top
    const t = poly([[b.x, b.y, b.h],[b.x+b.w,b.y,b.h],[b.x+b.w,b.y+b.d,b.h],[b.x,b.y+b.d,b.h]], { fill:b.color||"#789", opacity:.25, stroke:"#5e6ea3" });
    // left
    const l = poly([[b.x, b.y, 0],[b.x,b.y,b.h],[b.x,b.y+b.d,b.h],[b.x,b.y+b.d,0]], { fill:b.color||"#789", opacity:.18, stroke:"#3f4a78" });
    // right
    const r = poly([[b.x, b.y+b.d,0],[b.x,b.y+b.d,b.h],[b.x+b.w,b.y+b.d,b.h],[b.x+b.w,b.y+b.d,0]], { fill:b.color||"#789", opacity:.18, stroke:"#3f4a78" });
    // front edge
    const e = poly([[b.x+b.w,b.y,0],[b.x+b.w,b.y,b.h],[b.x+b.w,b.y+b.d,b.h],[b.x+b.w,b.y+b.d,0]], { fill:"none", stroke:"#6475b0" });
    // label & arrow (from top center)
    const topC = toIso(b.x + b.w/2, b.y + b.d/2, b.h);
    const axLen = 24;
    const rad = (((b.arrowDeg ?? 0) - angleDeg) - 90) * Math.PI/180; // rotate arrow with world; then convert to iso frame
    const ax = topC.X + Math.cos(rad)*axLen;
    const ay = topC.Y + Math.sin(rad)*axLen;
    const arrow = `<defs><marker id="isoArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#60d394"/></marker></defs>` +
      `<line x1="${cx+topC.X}" y1="${cy+topC.Y}" x2="${cx+ax}" y2="${cy+ay}" stroke="#60d394" stroke-width="2" marker-end="url(#isoArrow)"/>`;
    const label = `<text x="${cx+topC.X}" y="${cy+topC.Y-8}" fill="#cbd3e1" font-size="11" text-anchor="middle">${b.label??""}</text>`;
    return t+l+r+e+arrow+label;
  }

  // draw room frame
  const shell =
    poly([[0,0,0],[room.w,0,0],[room.w,room.d,0],[0,room.d,0]], { stroke:"#6b86ff" }) +
    poly([[0,0,room.h],[room.w,0,room.h],[room.w,room.d,room.h],[0,room.d,room.h]], { stroke:"#6b86ff" }) +
    // verticals
    [ [0,0],[room.w,0],[room.w,room.d],[0,room.d] ].map(([x,y]) =>
      poly([[x,y,0],[x,y,room.h],[x,y,room.h],[x,y,0]], { stroke:"#44507a" })
    ).join("");

  const g = boxes.map(drawBox).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#0f1217">
    <g>${shell}${g}</g>
  </svg>`;
}


