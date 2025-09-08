import fs from "fs";
import path from "path";
import type { SceneModel } from "./scene_model";
import type { Vector3 } from "./types";
import { keyOf } from "./cache";
import { projectPt } from "./camera";

export type Camera = { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number]; up?:[number,number,number]; near?:number; far?:number };

const ROOT = path.join(process.cwd(), ".cache", "render_kit");
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

async function svgToPng(svg: string): Promise<Buffer> {
  try {
    const mod:any = await import("sharp");
    const sharp = mod.default || mod;
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==","base64");
  }
}

function svgHeader(w:number,h:number){ return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`; }

function clamp(v:number,a:number,b:number){ return Math.max(a, Math.min(b, v)); }

function constraintsSVG(model: SceneModel, w=1000, h=700){
  const pad = 40; const sx = (x:number)=> pad + (x / model.room.width) * (w - 2*pad); const sy = (y:number)=> pad + (y / model.room.depth) * (h - 2*pad);
  const parts: string[] = [];
  parts.push(svgHeader(w,h));
  parts.push(`<rect width="100%" height="100%" fill="#FFFFFF"/>`);
  parts.push(`<rect x="${sx(0)}" y="${sy(0)}" width="${sx(model.room.width)-sx(0)}" height="${sy(model.room.depth)-sy(0)}" fill="none" stroke="#000" stroke-width="2"/>`);
  parts.push(`<text x="${pad}" y="${pad-12}" font-size="12">constraints</text>`);
  // Mullion ticks on E wall
  const mull = (model.meta as any)?.glassE?.mullionSpacingFt ?? 3.5;
  for(let x=mull; x<model.room.width; x+=mull){ const X = sx(x); parts.push(`<line x1="${X}" y1="${sy(0)}" x2="${X}" y2="${sy(model.room.depth)}" stroke="#888" stroke-width="1" stroke-dasharray="4 3"/>`); }
  // Carpet grid (tiles)
  const c:any = (model as any).carpet || null;
  if (c?.pattern === "carpet_tiles"){ const tw = (c.tile_w_in||24)/12; const th=(c.tile_h_in||24)/12; for(let x=0;x<=model.room.width;x+=tw){ parts.push(`<line x1="${sx(x)}" y1="${sy(0)}" x2="${sx(x)}" y2="${sy(model.room.depth)}" stroke="#bbb" stroke-width="0.8"/>`);} for(let y=0;y<=model.room.depth;y+=th){ parts.push(`<line y1="${sy(y)}" x1="${sx(0)}" y2="${sy(y)}" x2="${sx(model.room.width)}" stroke="#bbb" stroke-width="0.8"/>`);} }
  // Door swing arcs
  for(const d of (model.doors||[])){
    const leafWft = (d.width_in||36)/12; const thickft = Math.max(0.1,(d.thickness_in||2)/12);
    let ux=0,uy=0,vx=0,vy=0; if(d.wall==="E"||d.wall==="W"){ ux=0; uy=1; vx=(d.wall==="E"?-1:1); vy=0; } else { ux=1; uy=0; vx=0; vy=(d.wall==="S"?-1:1); }
    const sign = (d.hinge === "right") ? 1 : -1; const hx = d.cx_ft + (ux * sign) * (leafWft/2); const hy = d.cy_ft + (uy * sign) * (leafWft/2);
    const steps = Math.max(8, Math.round((d.swing_deg||0)/10)); const pts:string[]=[];
    for(let k=0;k<=steps;k++){ const ang=(clamp(d.swing_deg||0,0,180)*(k/steps))*Math.PI/180; const px= hx + Math.cos(ang)*(-ux*leafWft) + Math.sin(ang)*(vx*leafWft); const py= hy + Math.cos(ang)*(-uy*leafWft) + Math.sin(ang)*(vy*leafWft); pts.push(`${sx(px)},${sy(py)}`); }
    parts.push(`<circle cx="${sx(hx)}" cy="${sy(hy)}" r="4" fill="#111"/>`);
    parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="#1C1F22" stroke-width="2" stroke-dasharray="5 4"/>`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

function perspectiveConstraintsSVG(model: SceneModel, camera: Camera, w=1000, h=700){
  const parts: string[] = [];
  const svgHeader = (W:number,H:number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`;
  parts.push(svgHeader(w,h));
  parts.push(`<rect width="100%" height="100%" fill="#FFFFFF"/>`);
  // camera pose
  const camPose = {
    pos: { x: camera.pos[0], y: camera.pos[1], z: camera.pos[2] },
    lookAt: { x: camera.look_at[0], y: camera.look_at[1], z: camera.look_at[2] },
    up: { x:0, y:0, z:1 }, fovDeg: camera.fov_deg, imgW: w, imgH: h
  } as any;
  const drawLine = (a:any,b:any,stroke="#1C1F22",width=2, dash?:string)=>{
    if(!a||!b) return; parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:``}/>`);
  };
  // Floor perimeter
  const P = [
    projectPt(camPose, {x:0,y:0,z:0}),
    projectPt(camPose, {x:model.room.width,y:0,z:0}),
    projectPt(camPose, {x:model.room.width,y:model.room.depth,z:0}),
    projectPt(camPose, {x:0,y:model.room.depth,z:0}),
  ];
  for(let i=0;i<4;i++) drawLine(P[i], P[(i+1)%4], "#000", 2);
  // Carpet grid (axis-aligned)
  const c:any = (model as any).carpet || null;
  if (c?.pattern === "carpet_tiles"){
    const tw = Math.max(0.5, (c.tile_w_in||24)/12);
    const th = Math.max(0.5, (c.tile_h_in||24)/12);
    for(let x=0; x<=model.room.width; x+=tw){
      const a = projectPt(camPose, {x, y:0, z:0});
      const b = projectPt(camPose, {x, y:model.room.depth, z:0});
      drawLine(a,b,"#bbbbbb",1);
    }
    for(let y=0; y<=model.room.depth; y+=th){
      const a = projectPt(camPose, {x:0, y, z:0});
      const b = projectPt(camPose, {x:model.room.width, y, z:0});
      drawLine(a,b,"#bbbbbb",1);
    }
  }
  // Door swing arc
  for(const d of (model.doors||[])){
    const leafWft = (d.width_in||36)/12; const thickft = Math.max(0.1,(d.thickness_in||2)/12);
    let ux=0,uy=0,vx=0,vy=0; if(d.wall==="E"||d.wall==="W"){ ux=0; uy=1; vx=(d.wall==="E"?-1:1); vy=0; } else { ux=1; uy=0; vx=0; vy=(d.wall==="S"?-1:1); }
    const sign = (d.hinge === "right") ? 1 : -1; const hx = d.cx_ft + (ux * sign) * (leafWft/2); const hy = d.cy_ft + (uy * sign) * (leafWft/2);
    const steps = Math.max(8, Math.round((d.swing_deg||0)/10)); let last:any=null;
    for(let k=0;k<=steps;k++){
      const ang=(Math.max(0,Math.min(180,d.swing_deg||0))*(k/steps))*Math.PI/180; const px= hx + Math.cos(ang)*(-ux*leafWft) + Math.sin(ang)*(vx*leafWft); const py= hy + Math.cos(ang)*(-uy*leafWft) + Math.sin(ang)*(vy*leafWft);
      const cur = projectPt(camPose,{x:px,y:py,z:0}); if(last&&cur) drawLine(last,cur,"#1C1F22",2,"5 4"); last=cur;
    }
    const hinge = projectPt(camPose,{x:hx,y:hy,z:0}); if(hinge) parts.push(`<circle cx="${hinge.x}" cy="${hinge.y}" r="4" fill="#1C1F22"/>`);
  }
  // Scale bar ~5 ft at far wall
  const a = projectPt(camPose,{x:0,y:model.room.depth-0.5,z:0});
  const b = projectPt(camPose,{x:5,y:model.room.depth-0.5,z:0});
  if(a&&b){ drawLine(a,b,"#222",2); parts.push(`<text x="${b.x+6}" y="${b.y+4}" font-size="12">5 ft</text>`); }
  parts.push(`</svg>`);
  return parts.join("");
}

function gridOrthoSVG(label:string, w:number, h:number){
  const parts: string[] = []; const pad=40; const tick=40; parts.push(svgHeader(w,h)); parts.push(`<rect width="100%" height="100%" fill="#FFFFFF"/>`); parts.push(`<text x="${pad}" y="${pad-12}" font-size="12">${label}</text>`);
  for(let x=pad; x<=w-pad; x+=tick){ parts.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${h-pad}" stroke="#bbb" stroke-width="1"/>`); }
  for(let y=pad; y<=h-pad; y+=tick){ parts.push(`<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="#bbb" stroke-width="1"/>`); }
  for(let x=pad; x<=w-pad; x+=tick*2){ parts.push(`<text x="${x}" y="${h-pad+16}" font-size="10">1 ft</text>`); }
  parts.push(`</svg>`); return parts.join("");
}

function solidSVG(hex:string, w=1000, h=700){ return `${svgHeader(w,h)}<rect width="100%" height="100%" fill="${hex}"/></svg>`; }

function gradientDepthSVG(w=1000,h=700){
  return `${svgHeader(w,h)}<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#111"/><stop offset="100%" stop-color="#EEE"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

export async function buildRailsForCamera(model: SceneModel, camera: Camera){
  const camKey = keyOf(camera);
  const outDir = path.join(ROOT, "rails", camKey); ensureDir(outDir);
  const W = 1000, H = 700;
  // material_atlas.png (derived from finishes)
  const fin:any = model.finishes || {};
  const sw = 120, sh = 120, pad = 16, gap = 8;
  const colors = [
    { name:"Walls", hex: fin.wallHex || "#F7F6F2" },
    { name:"Floor", hex: fin.floor?.kind==="carpet_tiles" ? fin.floor?.baseHex : (fin.floor?.tintHex || "#CFCFCF") },
    { name:"Accent", hex: fin.accentHex || "#FF6D00" },
    { name:"Mullion", hex: fin.mullionHex || "#1C1F22" },
    { name:"Glass", hex: fin.glassTintHex || "#EAF2F6" },
    { name:"Trim", hex: fin.trimHex || "#E7E4DE" },
  ];
  const Wm = pad*2 + sw*colors.length + gap*(colors.length-1);
  const Hm = pad*2 + sh + 28;
  const atlasSvg = [svgHeader(Wm,Hm), `<rect width="100%" height="100%" fill="#ffffff"/>`, ...colors.map((c,i)=>{ const x=pad+i*(sw+gap); const y=pad; return `<g><rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="10" ry="10" fill="${c.hex}"/><text x="${x+sw/2}" y="${y+sh+18}" text-anchor="middle" font-size="14" fill="#222">${c.name}</text></g>`; }), `</svg>`].join("");
  fs.writeFileSync(path.join(outDir, "material_atlas.png"), await svgToPng(atlasSvg));
  // constraints.svg
  fs.writeFileSync(path.join(outDir, "constraints.svg"), constraintsSVG(model, W, H), "utf8");
  // orthos
  fs.writeFileSync(path.join(outDir, "ortho_front.png"), await svgToPng(gridOrthoSVG("ortho_front", W, H)));
  fs.writeFileSync(path.join(outDir, "ortho_right.png"), await svgToPng(gridOrthoSVG("ortho_right", W, H)));
  fs.writeFileSync(path.join(outDir, "ortho_top.png"), await svgToPng(gridOrthoSVG("ortho_top", W, H)));
  // wireframe.svg (simple room bounds)
  const wireSvg = `${svgHeader(W,H)}<rect width="100%" height="100%" fill="#FFFFFF"/><rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="#000" stroke-width="2"/></svg>`;
  fs.writeFileSync(path.join(outDir, "wireframe.svg"), wireSvg, "utf8");
  // depth (grayscale gradient), normals (flat 128,128,255), ao (mid-gray)
  fs.writeFileSync(path.join(outDir, "depth.png"), await svgToPng(gradientDepthSVG(W,H)));
  fs.writeFileSync(path.join(outDir, "normals.png"), await svgToPng(solidSVG("#8080FF", W, H)));
  fs.writeFileSync(path.join(outDir, "ao.png"), await svgToPng(solidSVG("#CCCCCC", W, H)));
  // idmap (flat colors per class) as simple grid
  const classes = ["room","table","chair","tv","whiteboard","panel","decal","door","carpet","rug"];
  const cell = 60; const cols = 5; const rows = Math.ceil(classes.length/cols); const Wi = pad*2 + cols*cell; const Hi = pad*2 + rows*cell;
  const colorsId = ["#222222","#7aa2ff","#90e0c6","#ffb86b","#d7e3ff","#9aa8ff","#ffd26b","#333333","#2E3135","#3A3E42"]; let tiles = "";
  for(let i=0;i<classes.length;i++){ const x = pad + (i%cols)*cell; const y = pad + Math.floor(i/cols)*cell; tiles += `<rect x="${x}" y="${y}" width="${cell-6}" height="${cell-6}" fill="${colorsId[i%colorsId.length]}"/>`; }
  const idmapSvg = `${svgHeader(Wi,Hi)}<rect width="100%" height="100%" fill="#FFFFFF"/>${tiles}</svg>`;
  fs.writeFileSync(path.join(outDir, "idmap.png"), await svgToPng(idmapSvg));
  // camera.json
  const cam = { ...camera, up: camera.up || [0,0,1], near: camera.near || 0.1, far: camera.far || 100 };
  const cameraJson = { ...cam, camera_key: camKey };
  fs.writeFileSync(path.join(outDir, "camera.json"), JSON.stringify(cameraJson, null, 2), "utf8");
  // perspective constraints overlay
  const overlaySvg = perspectiveConstraintsSVG(model, camera, W, H);
  fs.writeFileSync(path.join(outDir, "constraints_perspective.png"), await svgToPng(overlaySvg));
  return { outDir, camKey };
}


