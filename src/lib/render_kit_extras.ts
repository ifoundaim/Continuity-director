import fs from "fs";
import path from "path";
import kit from "../scene/render_kit_v1.json";
import type { SceneModel } from "./scene_model";
import { keyOf } from "./cache";

type Camera = { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number] };

const ROOT = path.join(process.cwd(), ".cache", "render_kit");
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

async function svgToPngBase64(svg: string): Promise<string> {
  try {
    const mod:any = await import("sharp");
    const sharp = mod.default || mod;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return png.toString("base64");
  } catch {
    const oneByOnePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    return oneByOnePngBase64;
  }
}

export async function buildDoorWireframesFromModel(model: SceneModel){
  const cams = (kit as any).camera_presets as Camera[];
  const outDir = path.join(ROOT, "door"); ensureDir(outDir);

  function doorOverlaySVG(m: SceneModel, label: string){
    const W = 800, H = 600, pad = 40;
    const sx = (x:number)=> pad + (x / m.room.width) * (W - 2*pad);
    const sy = (y:number)=> pad + (y / m.room.depth) * (H - 2*pad);
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`);
    parts.push(`<rect width="100%" height="100%" fill="#FFFFFF"/>`);
    parts.push(`<rect x="${sx(0)}" y="${sy(0)}" width="${sx(m.room.width)-sx(0)}" height="${sy(m.room.depth)-sy(0)}" fill="none" stroke="#000" stroke-width="2"/>`);
    parts.push(`<text x="${pad}" y="${pad-10}" font-size="12">Door wireframe — ${label}</text>`);
    const doors = [...(m.doors||[])].sort((a,b)=> String(a.id||"").localeCompare(String(b.id||"")));
    for (const d of doors){
      const center = { x: d.cx_ft, y: d.cy_ft };
      const leafWft = (d.width_in||36)/12;
      const thickft = Math.max(0.1, (d.thickness_in||2)/12);
      let ux = 0, uy = 0, vx = 0, vy = 0;
      if (d.wall === "E" || d.wall === "W"){
        ux = 0; uy = 1; vx = (d.wall === "E" ? -1 : 1); vy = 0;
      } else {
        ux = 1; uy = 0; vx = 0; vy = (d.wall === "S" ? -1 : 1);
      }
      const sign = (d.hinge === "right") ? 1 : -1;
      const hx = center.x + (ux * sign) * (leafWft/2);
      const hy = center.y + (uy * sign) * (leafWft/2);
      const corners = [
        { x: center.x - ux*(leafWft/2) - vx*(thickft/2), y: center.y - uy*(leafWft/2) - vy*(thickft/2) },
        { x: center.x + ux*(leafWft/2) - vx*(thickft/2), y: center.y + uy*(leafWft/2) - vy*(thickft/2) },
        { x: center.x + ux*(leafWft/2) + vx*(thickft/2), y: center.y + uy*(leafWft/2) + vy*(thickft/2) },
        { x: center.x - ux*(leafWft/2) + vx*(thickft/2), y: center.y - uy*(leafWft/2) + vy*(thickft/2) },
      ];
      parts.push(`<polygon points="${corners.map(p=>`${sx(p.x)},${sy(p.y)}`).join(" ")}" fill="none" stroke="#1C1F22" stroke-width="2"/>`);
      parts.push(`<circle cx="${sx(hx)}" cy="${sy(hy)}" r="5" fill="#1C1F22"/>`);
      const steps = Math.max(8, Math.round((d.swing_deg||0)/10));
      const pts: string[] = [];
      for (let i=0;i<=steps;i++){
        const ang = (Math.min(180, Math.max(0, d.swing_deg||0)) * (i/steps)) * Math.PI/180;
        const px = hx + Math.cos(ang)*(-ux*leafWft) + Math.sin(ang)*(vx*leafWft);
        const py = hy + Math.cos(ang)*(-uy*leafWft) + Math.sin(ang)*(vy*leafWft);
        pts.push(`${sx(px)},${sy(py)}`);
      }
      parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="#888" stroke-width="2" stroke-dasharray="5 4"/>`);
      const txt = `${Math.round(d.width_in||0)}×${Math.round(d.height_in||0)} in, hinge ${d.hinge}, swing ${Math.round(d.swing_deg||0)}°${d.glass?", glass":""}`;
      parts.push(`<text x="${sx(center.x)}" y="${sy(center.y)-10}" text-anchor="middle" font-size="12" fill="#222">${txt}</text>`);
    }
    parts.push(`</svg>`);
    return { svg: parts.join(""), mime: "image/svg+xml" };
  }

  for (const cam of cams){
    const wire = doorOverlaySVG(model, `FOV ${cam.fov_deg}`);
    const png = await svgToPngBase64(wire.svg);
    const file = path.join(outDir, `door_${cam.fov_deg}_${keyOf(cam)}.png`);
    fs.writeFileSync(file, Buffer.from(png, "base64"));
  }
}

export async function buildCarpetPatternCardFromModel(model: SceneModel){
  const outDir = path.join(ROOT, "carpet"); ensureDir(outDir);
  function cardSVG(){
    const W = 512, H = 512; const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`);
    parts.push(`<rect width="100%" height="100%" fill="#FFFFFF"/>`);
    const c:any = model.carpet || { pattern: "broadloom" } as any;
    if (c.pattern === "carpet_tiles"){
      const tw = Math.max(4, Math.round((c.tile_w_in||24) * 2));
      const th = Math.max(4, Math.round((c.tile_h_in||24) * 2));
      const accentList: string[] = (c.accent_hex_list||[]);
      const base = model.finishes && (model.finishes as any).floor?.kind==="carpet_tiles" ? (model.finishes as any).floor.baseHex : "#2E3135";
      const grout = c.grout_hex || "#2E3135"; const groutW = Math.max(0, Math.round((c.grout_w_in||0)*2));
      const cols = Math.ceil(W / tw); const rows = Math.ceil(H / th);
      const everyN = Math.max(0, c.accent_rule==="every_nth" ? (c.accent_n||0) : 0);
      const stripeW = c.accent_rule==="stripe" ? Math.max(1, Math.round((c.stripe_w_in||4)*2)) : 0;
      function isAccent(i:number,j:number){
        if (!accentList?.length) return false;
        if (c.accent_rule==="every_nth") return everyN>0 && ((i+j)%everyN===0);
        if (c.accent_rule==="checker") return (i+j)%2===0;
        if (c.accent_rule==="stripe") return ((i*tw) % (stripeW*2)) < stripeW;
        if (c.accent_rule==="custom_map") return false;
        return false;
      }
      for(let j=0;j<rows;j++){
        for(let i=0;i<cols;i++){
          const x=i*tw, y=j*th;
          const fill = isAccent(i,j) ? (accentList[0]||base) : base;
          parts.push(`<rect x="${x}" y="${y}" width="${tw - (groutW?groutW:0)}" height="${th - (groutW?groutW:0)}" fill="${fill}"/>`);
          if (groutW>0){
            parts.push(`<rect x="${x+tw-groutW}" y="${y}" width="${groutW}" height="${th}" fill="${grout}"/>`);
            parts.push(`<rect x="${x}" y="${y+th-groutW}" width="${tw}" height="${groutW}" fill="${grout}"/>`);
          }
        }
      }
      parts.push(`<text x="8" y="${H-40}" font-size="12">rotation ${Math.round(c.rotation_deg||0)}°</text>`);
    } else if (c.pattern === "rug_on_concrete"){
      const border = c.border_hex || "#2E3135"; const field = c.field_hex || "#3A3E42";
      parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#D8D8D8"/>`);
      const rw = Math.round(W*0.8), rh = Math.round(H*0.6);
      const rx = Math.round((W-rw)/2), ry = Math.round((H-rh)/2);
      parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${border}"/>`);
      parts.push(`<rect x="${rx+16}" y="${ry+16}" width="${rw-32}" height="${rh-32}" fill="${field}"/>`);
      parts.push(`<text x="8" y="${H-40}" font-size="12">rug ${Number(c.rug_w_ft||0).toFixed(1)}×${Number(c.rug_d_ft||0).toFixed(1)} ft</text>`);
    } else {
      const base = model.finishes && (model.finishes as any).floor?.kind==="carpet_tiles" ? (model.finishes as any).floor.baseHex : "#AAAAAA";
      parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${base}"/>`);
    }
    parts.push(`<rect x="16" y="${H-24}" width="${24*2}" height="6" fill="#222"/>`);
    parts.push(`<text x="${16 + 24*2 + 8}" y="${H-20}" font-size="12">12 in</text>`);
    parts.push(`</svg>`);
    return { svg: parts.join("") };
  }
  const svg = cardSVG();
  const png = await svgToPngBase64(svg.svg);
  const file = path.join(outDir, `carpet_card.png`);
  fs.writeFileSync(file, Buffer.from(png, "base64"));
}


