import { CameraPose, projectPt } from "./camera";
import type { SceneModel } from "./scene_model";

// Render a wireframe + stick-figure overlay for a given camera and character placements.
// Returns dataURL (PNG) to use as the FIRST reference image.
export function renderOverlayPNG(model: SceneModel, cam: CameraPose, charPlc: { name:string; heightCm:number; x:number; y:number; facingDeg?:number }[], w=1024, h=576){
  const imgW = w, imgH = h;
  const cnv = document.createElement("canvas"); cnv.width = imgW; cnv.height = imgH;
  const g = cnv.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0,0,imgW,imgH);

  // draw room rectangle edges (floor)
  g.strokeStyle = "#6b86ff"; g.lineWidth = 2;
  const floor = [
    {x:0,y:0},{x:model.room.width,y:0},{x:model.room.width,y:model.room.depth},{x:0,y:model.room.depth}
  ];
  const p0 = (pt:any)=>projectPt({ ...cam, imgW, imgH }, {x:pt.x,y:pt.y,z:0});
  const pH = (pt:any)=>projectPt({ ...cam, imgW, imgH }, {x:pt.x,y:pt.y,z:model.room.height});
  const P = floor.map(p0);
  g.beginPath();
  for(let i=0;i<4;i++){ const a=P[i], b=P[(i+1)%4]; if(a&&b){ g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); } }
  g.stroke();

  // vertical pillars
  for(const c of [0,1,2,3]){
    const a = p0(floor[c]); const b = pH(floor[c]);
    if(a&&b){ g.strokeStyle="#44507a"; g.lineWidth=1; g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke(); }
  }

  // Apply attachments: place child relative to parent center and mount height
  const byId = new Map(model.objects.map((o:any)=>[o.id,o]));
  const objects = model.objects.map((o:any)=>{
    if (!o.attachTo) return o;
    const p = byId.get(o.attachTo);
    if (!p) return o;
    const dx = o.local?.dx || 0, dy = o.local?.dy || 0;
    const placed = { ...o, cx: p.cx + dx, cy: p.cy + dy };
    if (o.layer==="surface" && (p.kind==="table" || p.layer==="surface")){
      placed.mount_h = (p.h || 2.5);
    }
    return placed;
  });

  // table/TV rough rectangles (optional): draw mounted/large objects to help geometry lock
  g.strokeStyle="#9aa8ff"; g.lineWidth=1.5;
  for(const o of objects){
    // draw footprint at z=0
    const a = p0({x:o.cx-o.w/2,y:o.cy-o.d/2});
    const b = p0({x:o.cx+o.w/2,y:o.cy-o.d/2});
    const c = p0({x:o.cx+o.w/2,y:o.cy+o.d/2});
    const d = p0({x:o.cx-o.w/2,y:o.cy+o.d/2});
    if(a&&b&&c&&d){ g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(c.x,c.y); g.lineTo(d.x,d.y); g.closePath(); g.stroke(); }
  }

  // Door overlay: hinge point and swing arc in camera projection
  try{
    const doors:any[] = (model as any).doors || [];
    for (const d of doors){
      const leafWft = (d.width_in||36)/12; const thickft = Math.max(0.1,(d.thickness_in||2)/12);
      let ux=0,uy=0,vx=0,vy=0;
      if(d.wall==="E"||d.wall==="W"){ ux=0; uy=1; vx=(d.wall==="E"?-1:1); vy=0; } else { ux=1; uy=0; vx=0; vy=(d.wall==="S"?-1:1); }
      const hx = d.cx_ft + (d.hinge==="right"?1:-1)*ux*(leafWft/2);
      const hy = d.cy_ft + (d.hinge==="right"?1:-1)*uy*(leafWft/2);
      const hinge = projectPt({ ...cam, imgW, imgH }, { x:hx, y:hy, z:0 });
      if(!hinge) continue;
      g.fillStyle = "#1C1F22"; g.beginPath(); g.arc(hinge.x, hinge.y, 4, 0, Math.PI*2); g.fill();
      const steps = Math.max(8, Math.round((d.swing_deg||0)/10));
      g.strokeStyle = "#8aa6ff"; g.lineWidth = 2; g.setLineDash([5,4]); g.beginPath();
      for(let k=0;k<=steps;k++){
        const ang = (Math.min(180, Math.max(0, d.swing_deg||0)) * (k/steps)) * Math.PI/180;
        const px = hx + Math.cos(ang)*(-ux*leafWft) + Math.sin(ang)*(vx*leafWft);
        const py = hy + Math.cos(ang)*(-uy*leafWft) + Math.sin(ang)*(vy*leafWft);
        const P = projectPt({ ...cam, imgW, imgH }, { x:px, y:py, z:0 });
        if (!P) continue; if (k===0) g.moveTo(P.x,P.y); else g.lineTo(P.x,P.y);
      }
      g.stroke(); g.setLineDash([]);
    }
  } catch {}

  // characters: stick figures scaled by height and placed at (x,y)
  for(const C of charPlc){
    const zFeet = C.heightCm/30.48; // approx standing height in ft
    const base = projectPt({ ...cam, imgW, imgH }, { x:C.x, y:C.y, z:0 });
    const head = projectPt({ ...cam, imgW, imgH }, { x:C.x, y:C.y, z:zFeet });
    if(!base || !head) continue;
    g.strokeStyle="#60d394"; g.lineWidth=3;
    // spine
    g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(head.x, head.y); g.stroke();
    // head circle
    const r = Math.hypot(head.x-base.x, head.y-base.y) * 0.1 + 6;
    g.beginPath(); g.arc(head.x, head.y - r*0.4, r, 0, Math.PI*2); g.stroke();
    // feet mark
    g.fillStyle="#60d394"; g.beginPath(); g.arc(base.x, base.y, 3, 0, Math.PI*2); g.fill();
    // label
    g.fillStyle="#cbd3e1"; g.font="12px sans-serif"; g.textAlign="center";
    g.fillText(`${C.name} • ${Math.round(C.heightCm)}cm`, base.x, base.y-6);
    // facing arrow (2D indicator)
    if ((C.facingDeg ?? 0) !== 0){
      const ang = ((C.facingDeg ?? 0) - 90) * Math.PI/180; const len = 18;
      const ax = base.x + Math.cos(ang)*len; const ay = base.y + Math.sin(ang)*len;
      g.strokeStyle="#60d394"; g.lineWidth=2; g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(ax, ay); g.stroke();
    }
  }

  // scale bar (ft)
  const barFeet = 5;
  const a = projectPt({ ...cam, imgW, imgH }, { x:0, y:model.room.depth-0.5, z:0 });
  const b = projectPt({ ...cam, imgW, imgH }, { x:barFeet, y:model.room.depth-0.5, z:0 });
  if(a&&b){
    g.strokeStyle="#ffffffaa"; g.lineWidth=2; g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke();
    g.fillStyle="#ffffffaa"; g.font="12px sans-serif"; g.textAlign="left"; g.fillText(`${barFeet} ft`, b.x+6, b.y+4);
  }

  return cnv.toDataURL("image/png");
}


