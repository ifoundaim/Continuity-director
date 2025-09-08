import type { SceneGraph } from "./types";
import type { CharacterProfile } from "./types";
import type { SceneModel } from "./scene_model";

export const charactersSection = (profiles: CharacterProfile[]) => {
  const list = [...(profiles || [])].sort((a,b)=>a.name.localeCompare(b.name));
  if (!list.length) return "No characters provided.";
  const lines = list.map(p=>`- ${p.name} — height ${p.height_cm} cm. ${p.description || "Keep facial structure and hairstyle consistent."}`);
  return `Characters (PHOTOREAL):
${lines.join("\n")}
Scale rule: all props and characters must respect real-world scale.`;
};

export const sceneLockHeader = (graph: SceneGraph) => `
Scene "${graph.scene_id}". Room size ${graph.room.width}×${graph.room.depth}×${graph.room.height} ${graph.units}. Key light ${graph.lighting.key} at ${graph.lighting.color_temp_k}K.
Fixed objects and placements must not move or change size: ${graph.objects.map(o=>o.id).join(", ")}. Maintain table height ${graph.scale_anchors.table_h_ft} ft and chair seat height ${graph.scale_anchors.chair_seat_h_ft} ft.`;

function objectLock(graph: SceneGraph) {
  // Deterministic, compact tokens; stable wording/order.
  const glass = graph.objects.find(o=>o.id==="glass_wall");
  const table = graph.objects.find(o=>o.id==="table");
  const tv = graph.objects.find(o=>o.id==="tv");
  const chairsN = graph.objects.find(o=>o.id==="chairs_north");
  const chairsS = graph.objects.find(o=>o.id==="chairs_south");
  const wb = graph.objects.find(o=>o.id==="whiteboard");
  const panels = graph.objects.find(o=>o.id==="panels");

  const lines: string[] = [];
  if (table?.pos && table.size) lines.push(`table size=${table.size[0]}x${table.size[1]} ft center=[${table.pos[0]},${table.pos[1]}] ft`);
  if (chairsN?.count && chairsN.center_ft) lines.push(`chairs_north count=${chairsN.count} center=[${chairsN.center_ft[0]},${chairsN.center_ft[1]}] ft spacing=${chairsN.spacing_ft} ft`);
  if (chairsS?.count && chairsS.center_ft) lines.push(`chairs_south count=${chairsS.count} center=[${chairsS.center_ft[0]},${chairsS.center_ft[1]}] ft spacing=${chairsS.spacing_ft} ft`);
  if (wb?.center_ft && wb.size) lines.push(`whiteboard size=${wb.size[0]}x${wb.size[1]} ft center=[${wb.center_ft[0]},${wb.center_ft[1]}] ft`);
  if (tv?.center_ft && tv.diag_in) lines.push(`tv diag=${tv.diag_in} in center=[${tv.center_ft[0]},${tv.center_ft[1]}] ft`);
  if (glass?.mullion_spacing_ft) lines.push(`glass_wall mullion_spacing=${glass.mullion_spacing_ft} ft`);
  if (panels?.centers_ft && panels.size) lines.push(`rear_panels count=${panels.centers_ft.length} size=${panels.size[0]}x${panels.size[1]} ft`);

  return `Object Lock:
${lines.join("; ")}.`;
}

function lineInches(ft:number){ return `${Math.round(ft*12)} in`; }

export function objectLockText(scene: any){
  const lines: string[] = [];
  // Descriptions appended for each object
  lines.push("Descriptions:");
  for (const o of (scene.objects || [])){
    const label = o.label || o.kind;
    const size = (o.w && o.d) ? `${lineInches(o.w)} × ${lineInches(o.d)}` : "";
    const where = o.wall ? `wall ${o.wall}` : `center (${o.cx?.toFixed(2)}, ${o.cy?.toFixed(2)}) ft`;
    const desc = (o.meta?.description ? ` — ${o.meta.description}` : "");
    lines.push(`- ${label}: ${where}${size ? `; size ${size}` : ""}${desc}`);
  }
  if (scene?.meta?.glassE?.mullionSpacingFt){
    lines.push(`- East wall glass: mullions every ${scene.meta.glassE.mullionSpacingFt} ft; slim door stile.`);
  }
  if (scene?.meta?.roomFinish){
    lines.push(`- Room finish: ${scene.meta.roomFinish}`);
  }
  return lines.join("\n");
}

function hex(h?:string){ return (h||"").toUpperCase(); }
export function finishesLightingText(scene: SceneModel){
  const f = scene.finishes; const L = scene.lighting;
  const lines:string[] = [];
  lines.push("Finish & Lighting Lock:");
  if (f){
    lines.push(`- Walls: matte ${hex(f.wallHex)}; trims ${hex(f.trimHex||"#E7E4DE")}.`);
    if (f.floor && (f.floor as any).kind === "carpet_tiles"){
      const ft:any = f.floor as any;
      lines.push(`- Floor: carpet tiles ${hex(ft.baseHex)}, pattern ${ft.pattern||"heather"}, tile ${ft.tileInches||24} in; accent ${hex(ft.accentHex||f.accentHex||"#FF6D00")}.`);
    } else if (f.floor) {
      const fc:any = f.floor as any;
      lines.push(`- Floor: polished concrete ${hex(fc.tintHex)}; low gloss ≈${(fc.glossGU??10)} GU.`);
    }
    lines.push(`- Glass (E wall): tint ${hex(f.glassTintHex||"#EAF2F6")}; mullions ${hex(f.mullionHex||"#1C1F22")}.`);
    if (f.accentHex) lines.push(`- Accent color: YC orange ${hex(f.accentHex)} — use sparingly for stripes/decals.`);
  }
  if (L){
    lines.push(`- Lighting: recessed panel, ${L.cctK} K, ~${L.lux||500} lux, ${L.contrast||"neutral"} contrast; avoid harsh specular highlights.`);
  }
  return lines.join("\n");
}

function fmtFeet(x?: number, p=1){ return (x==null?"":Number(x).toFixed(p)); }
function fmtInches(x?: number){ return Math.round(Number(x||0)); }

export function doorLockText(scene: SceneModel){
  const doors = [...(scene as any).doors || []].sort((a:any,b:any)=> String(a.id||"").localeCompare(String(b.id||"")));
  if (!doors.length) return "";
  const lines: string[] = ["DOOR LOCK:"];
  for (const d of doors){
    lines.push(`- ${d.id} on wall ${d.wall}: center (${fmtFeet(d.cx_ft)}, ${fmtFeet(d.cy_ft)} ft), size ${fmtInches(d.width_in)}×${fmtInches(d.height_in)} in, hinge ${d.hinge}, swing ${fmtInches(d.swing_deg)}°, glass:${!!d.glass}, frame ${d.frame_hex||""}.`);
    if (d.decal){
      const deco = d.decal;
      const name = deco.svg_id || deco.png_ref || "";
      lines.push(`- ${d.id} decal: '${name}', center (${fmtFeet(deco.cx_ft)}, ${fmtFeet(deco.cy_ft)} ft), scale ${Number(deco.scale||1).toFixed(2)}, hex ${deco.hex||""}.`);
    }
  }
  lines.push("Keep door size, hinge side, swing angle, and position identical across shots.");
  return lines.join("\n");
}

export function floorLockText(scene: SceneModel){
  const c:any = (scene as any).carpet || null;
  if (!c) return "";
  const lines: string[] = ["FLOOR LOCK:"];
  if (c.pattern === "carpet_tiles"){
    const list = (c.accent_hex_list||[]);
    const rule = c.accent_rule||"every_nth";
    const n = c.accent_n!=null ? ` n=${Number(c.accent_n||0)}` : "";
    const stripe = c.stripe_w_in!=null ? ` stripe_w ${Number(c.stripe_w_in||0)} in` : "";
    const grout = c.grout_hex ? `, grout ${c.grout_hex} width ${Number(c.grout_w_in||0)} in` : "";
    lines.push(`- carpet_tiles ${fmtInches(c.tile_w_in)}×${fmtInches(c.tile_h_in)} in, rotation ${fmtInches(c.rotation_deg)}°, accent_hex ${JSON.stringify(list)} rule '${rule}'${n}${stripe}${grout}.`);
  } else if (c.pattern === "rug_on_concrete"){
    lines.push(`- rug ${fmtFeet(c.rug_w_ft,1)}×${fmtFeet(c.rug_d_ft,1)} ft centered (${fmtFeet(c.cx_ft,1)}, ${fmtFeet(c.cy_ft,1)}), border ${c.border_hex}, field ${c.field_hex}.`);
  } else {
    lines.push("- broadloom carpet over pad.");
  }
  lines.push("Keep pattern, rotation, accent rule, and scale identical across shots.");
  return lines.join("\n");
}

export const shotPrompt = (
  graph: SceneGraph,
  camera: { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number]},
  extra = "",
  profiles?: CharacterProfile[],
  settingNotes?: string
) => `
${sceneLockHeader(graph)}
${settingNotes ? `SETTING NOTES: ${settingNotes}\n` : ""}
${charactersSection(profiles || [])}
Camera: FOV ${camera.fov_deg}°, position ${camera.pos.join(", ")}, look_at ${camera.look_at.join(", ")}. Adhere to perspective and room proportions. Keep all fixed objects in place.
${objectLock(graph)}
${extra}
`;

export const editOnlyPrompt = (graph: SceneGraph, instruction: string) => `
STYLE: PHOTOREAL OFFICE INTERIOR.
EDIT ONLY: ${instruction}.
Do NOT alter: room layout or object sizes/placements from ${graph.scene_id}, camera pose/FOV, or the fixed character features and heights. Preserve lighting/shadows.`;

export const fusePrompt = (_graph: SceneGraph, placement: string) => `
Integrate the provided object image: ${placement}. Match overhead LED shadows; add soft contact shadow; do not change room geometry or character scale.`;

