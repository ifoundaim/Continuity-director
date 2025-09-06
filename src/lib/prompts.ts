import type { CharacterProfile, SceneGraph } from "./types";

export const charactersSection = (profiles: CharacterProfile[]) => {
  if (!profiles?.length) return "No characters provided.";
  const lines = profiles.map(p => 
    `- ${p.name} — height ${p.height_cm} cm. ${p.description || "Keep facial structure and hairstyle consistent."}`
  );
  return `Characters (ANIME / CEL-SHADED):
${lines.join("\n")}
Scale rule: all props and characters must respect real-world scale.`;
};

export const characterCard = (
  aimHeightCm: number,
  emHeightCm: number,
  aimDesc: string = "brown-blonde wavy hair tied back, ocean-blue eyes, dark hoodie over tee, round glowing pendant",
  emDesc: string = "shoulder-length dark hair, light blazer over tee"
) => `
Characters (ANIME / CEL-SHADED):
- Aim — height ${aimHeightCm} cm (5'7"), ${aimDesc}. Keep face structure, hair length, eye color, and pendant shape identical in every image.
- Em — height ${emHeightCm} cm (5'3"), ${emDesc}. Keep facial structure and hairstyle consistent in every image.
Scale rule: all props and characters must respect these heights in world scale.`;

export const sceneLockHeader = (graph: SceneGraph) => `
Scene "${graph.scene_id}". Room size ${graph.room.width}×${graph.room.depth}×${graph.room.height} ${graph.units}. Key light ${graph.lighting.key} at ${graph.lighting.color_temp_k}K.
Fixed objects and placements must not move or change size: ${graph.objects.map(o => o.id).join(", ")}. Maintain table height ${graph.scale_anchors.table_h_ft} ft and chair seat height ${graph.scale_anchors.chair_seat_h_ft} ft.`;

export const shotPrompt = (
  graph: SceneGraph,
  camera: { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number]},
  extra: string = "",
  profiles?: CharacterProfile[]
) => `
${sceneLockHeader(graph)}
${charactersSection(profiles || [])}
MEDIUM & STYLE: Draw as an ANIME / CEL-SHADED illustration with clean line art, flat color blocks, soft ambient occlusion. No photoreal textures.
Camera: FOV ${camera.fov_deg}°, position ${camera.pos.join(", ")}, look_at ${camera.look_at.join(", ")}. Adhere to perspective and room proportions. Keep all fixed objects in place.
${extra}
`;

export const editOnlyPrompt = (graph: SceneGraph, instruction: string) => `
MEDIUM & STYLE: ANIME / CEL-SHADED illustration. No photoreal textures.
EDIT ONLY: ${instruction}.
Do NOT alter: room layout or object sizes/placements from ${graph.scene_id}, camera pose/FOV, or the fixed character features and heights (Aim ${graph.scale_anchors.aim_height_cm} cm; Em ${graph.scale_anchors.em_height_cm} cm). Preserve lighting/shadows.`;

export const fusePrompt = (graph: SceneGraph, placement: string) => `
Integrate the provided object image into ${graph.scene_id}: ${placement}. Match overhead LED shadows; add soft contact shadow; do not change room geometry or character scale.`;

