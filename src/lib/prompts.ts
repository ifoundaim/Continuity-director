import type { SceneGraph } from "./types";
import type { CharacterProfile } from "./types";
import type { SceneModel } from "./scene_model";

export const charactersSection = (profiles: CharacterProfile[]) => {
  const list = [...(profiles || [])].sort((a,b)=>a.name.localeCompare(b.name));
  if (!list.length) return "No characters provided.";
  const lines = list.map(p=>`- ${p.name} — height ${p.height_cm} cm. ${p.description || "Keep facial structure and hairstyle consistent."}`);
  return `Characters (ANIME / CEL-SHADED):
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
STYLE: ANIME / CEL-SHADED ONLY. Clean line art, flat color blocks, soft ambient occlusion. Avoid photoreal language.
Camera: FOV ${camera.fov_deg}°, position ${camera.pos.join(", ")}, look_at ${camera.look_at.join(", ")}. Adhere to perspective and room proportions. Keep all fixed objects in place.
${objectLock(graph)}
${extra}
`;

export const editOnlyPrompt = (graph: SceneGraph, instruction: string) => `
STYLE: ANIME / CEL-SHADED ONLY.
EDIT ONLY: ${instruction}.
Do NOT alter: room layout or object sizes/placements from ${graph.scene_id}, camera pose/FOV, or the fixed character features and heights. Preserve lighting/shadows.`;

export const fusePrompt = (_graph: SceneGraph, placement: string) => `
Integrate the provided object image: ${placement}. Match overhead LED shadows; add soft contact shadow; do not change room geometry or character scale.`;

