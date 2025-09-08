import fs from "fs";
import path from "path";
import kit from "../scene/render_kit_v1.json";
import scene from "../scene/yc_room_v1.json";
import { getActiveId, getSetting } from "../server/settings_fs";
import { modelToSceneGraph } from "./graph";
import type { CharacterProfile, SettingProfile } from "./types";
import { geminiImageCall, textPart, imagePart } from "./gemini";
import { renderWireframeSVG } from "./wireframe";
import { paletteSVG } from "./palette";
import { keyOf } from "./cache";
import { shotPrompt } from "./prompts";
import { recordShot } from "./continuity";

type Camera = { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number] };

const ROOT = path.join(process.cwd(), ".cache", "render_kit");
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function b64OfSVG(svg: string) { return Buffer.from(svg).toString("base64"); }
function bufOfDataURL(s: string) { return Buffer.from(s.split(",").pop()!, "base64"); }

function stableImages(list?: string[]) { return [...(list || [])].sort((a,b)=>keyOf(a).localeCompare(keyOf(b))); }
function stableProfiles(list?: CharacterProfile[]) {
  const L = [...(list || [])].sort((a,b)=>a.name.localeCompare(b.name));
  return L.map(p => ({ ...p, images_base64: stableImages(p.images_base64) }));
}

function constantStyle(): string {
  return (kit as any).style_tokens || "STYLE: ANIME / CEL-SHADED ONLY. Clean line art, flat color blocks, soft AO. Avoid photoreal language.";
}

// ---------- Builders ----------
export async function buildCharacterSheets(profiles: CharacterProfile[], setting: SettingProfile) {
  const outDir = path.join(ROOT, "character_sheets");
  ensureDir(outDir);
  const palette = paletteSVG((kit as any).palette_hex || [], "palette");
  const poses: string[] = (kit as any).character_sheet.poses;

  const manifest: any[] = [];

  for (const p of stableProfiles(profiles)) {
    const charDir = path.join(outDir, p.name.replace(/\s+/g, "_"));
    ensureDir(charDir);

    for (const pose of poses) {
      const prompt = [
        "Character Sheet — single character on flat background.",
        constantStyle(),
        `NAME: ${p.name}. HEIGHT: ${p.height_cm} cm.`,
        `POSE: ${pose}. Keep proportions from height anchor; include cm scale bar at bottom-right.`,
        `BACKGROUND: ${(kit as any).character_sheet.background || "flat #F6F7F9"}.`,
        "OUTPUT: full-body, uncluttered; also draw tiny face close-up inset if pose hides features."
      ].join("\n");

      const parts:any[] = [];
      parts.push(textPart(prompt));
      // character refs (sorted)
      for (const b64 of (p.images_base64 || []).slice(0,4)) parts.push(imagePart(bufOfDataURL(b64)));
      // palette card
      parts.push({ inline_data: { data: b64OfSVG(palette.svg), mime_type: palette.mime } });

      const contents = [{ role: "user", parts }];
      const buf = await geminiImageCall(process.env.GEMINI_API_KEY!, contents);

      const file = path.join(charDir, `${pose}.png`);
      fs.writeFileSync(file, buf);
      manifest.push({ type: "character_pose", name: p.name, pose, file });
      await throttle();
    }
  }
  return manifest;
}

async function svgToPngBase64(svg: string): Promise<string> {
  try {
    const mod:any = await import("sharp");
    const sharp = mod.default || mod;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return png.toString("base64");
  } catch {
    // Fallback tiny PNG if converter not available
    const oneByOnePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    return oneByOnePngBase64;
  }
}

export async function buildFloorPlan(setting: SettingProfile) {
  const outDir = path.join(ROOT, "floor_plan"); ensureDir(outDir);
  const wire = renderWireframeSVG("floor_plan");
  const prompt = [
    "Floor Plan — top-down measured drawing of the fixed YC room.",
    constantStyle(),
    "LINE-ART ONLY; include grid, labeled objects, tick marks, and scale bar (ft and cm).",
    (kit as any).object_lock_tokens
  ].join("\n");

  const parts:any[] = [];
  const png = await svgToPngBase64(wire.svg);
  parts.push({ inline_data: { data: png, mime_type: "image/png" } });
  parts.push(textPart(prompt));
  for (const b64 of stableImages(setting.images_base64).slice(0,4)) parts.push(imagePart(bufOfDataURL(b64)));

  const contents = [{ role: "user", parts }];
  const buf = await geminiImageCall(process.env.GEMINI_API_KEY!, contents);
  const file = path.join(outDir, `floor_plan.png`);
  fs.writeFileSync(file, buf);
  return [{ type:"floor_plan", file }];
}

export async function buildElevations(setting: SettingProfile) {
  const outDir = path.join(ROOT, "elevations"); ensureDir(outDir);
  const items = (kit as any).setting_plates.elevations as {id:string,size_px:number[]}[];
  const results:any[] = [];

  for (const e of items) {
    const wire = renderWireframeSVG(`elevation_${e.id}`);
    const prompt = [
      `Elevation ${e.id.toUpperCase()} — measured wall drawing of the fixed YC room.`,
      constantStyle(),
      "LINE-ART ONLY; show objects on this wall with sizes/heights, tick marks, and a small scale bar (ft/cm).",
      (kit as any).object_lock_tokens
    ].join("\n");

    const parts:any[] = [];
    const png = await svgToPngBase64(wire.svg);
    parts.push({ inline_data: { data: png, mime_type: "image/png" } });
    parts.push(textPart(prompt));
    for (const b64 of stableImages(setting.images_base64).slice(0,4)) parts.push(imagePart(bufOfDataURL(b64)));

    const contents = [{ role: "user", parts }];
    const buf = await geminiImageCall(process.env.GEMINI_API_KEY!, contents);
    const file = path.join(outDir, `elevation_${e.id}.png`);
    fs.writeFileSync(file, buf);
    results.push({ type:"elevation", id:e.id, file });
    await throttle();
  }
  return results;
}

export async function buildPerspectives(profiles: CharacterProfile[], setting: SettingProfile, color = true) {
  const outDir = path.join(ROOT, "perspectives"); ensureDir(outDir);
  const cams = (kit as any).camera_presets as Camera[];
  const palette = paletteSVG((kit as any).palette_hex || [], "palette");
  const results:any[] = [];

  // Prefer active SceneLock model if available
  let graphForKit: any = scene as any;
  try {
    const active = getActiveId();
    if (active){
      const doc = getSetting(active);
      if (doc?.model) graphForKit = modelToSceneGraph(doc.model);
    }
  } catch {}

  for (const cam of cams) {
    const wire = renderWireframeSVG(`perspective FOV ${cam.fov_deg}`);
    const prompt = shotPrompt(graphForKit as any, cam,
      color ? "FULL COLOR plate; neutral lighting; include small scale bar bottom-right." :
              "LINE-ART ONLY plate; include small scale bar bottom-right.",
      stableProfiles(profiles),
      (setting?.description || "")
    );

    const parts:any[] = [];
    // wireframe first (as PNG for Gemini)
    const png = await svgToPngBase64(wire.svg);
    parts.push({ inline_data: { data: png, mime_type: "image/png" } });
    // stable prompt
    parts.push(textPart(prompt));
    // setting refs then character refs
    for (const b64 of stableImages(setting.images_base64).slice(0,6)) parts.push(imagePart(bufOfDataURL(b64)));
    for (const p of stableProfiles(profiles)) {
      for (const b64 of (p.images_base64 || []).slice(0,4)) parts.push(imagePart(bufOfDataURL(b64)));
    }
    // palette card
    parts.push({ inline_data: { data: b64OfSVG(palette.svg), mime_type: palette.mime } });

    const contents = [{ role: "user", parts }];
    const buf = await geminiImageCall(process.env.GEMINI_API_KEY!, contents);
    const file = path.join(outDir, `perspective_${cam.fov_deg}_${keyOf(cam)}${color?"_color":"_line"}.png`);
    fs.writeFileSync(file, buf);
    results.push({ type:"perspective", fov: cam.fov_deg, color, file });

    // register in continuity memory so future shots can reference these plates
    recordShot(cam, buf);
    await throttle();
  }
  return results;
}

// Generate 3 consistent room reference images (fixed angles) after plates
export async function buildRoomRefs(profiles: CharacterProfile[], setting: SettingProfile) {
  const outDir = path.join(ROOT, "room_refs"); ensureDir(outDir);
  const palette = paletteSVG((kit as any).palette_hex || [], "palette");
  const refs: Camera[] = [
    { fov_deg: 50, pos: [6, 5.0, 5.2], look_at: [10, 7, 4.8] },
    { fov_deg: 45, pos: [15, 6.0, 5.0], look_at: [10, 7, 4.8] },
    { fov_deg: 35, pos: [9, 6.5, 3.0], look_at: [10, 7, 4.8] }
  ];
  const results:any[] = [];

  // Prefer active SceneLock model
  let graphForKit: any = scene as any;
  try {
    const active = getActiveId();
    if (active){
      const doc = getSetting(active);
      if (doc?.model) graphForKit = modelToSceneGraph(doc.model);
    }
  } catch {}

  for (const cam of refs) {
    const wire = renderWireframeSVG(`reference FOV ${cam.fov_deg}`);
    const prompt = shotPrompt(graphForKit as any, cam,
      "REFERENCE: full color, neutral lighting; consistent depiction of room geometry and materials; include small scale bar bottom-right.",
      stableProfiles(profiles),
      (setting?.description || "")
    );
    const parts:any[] = [];
    const png = await svgToPngBase64(wire.svg);
    parts.push({ inline_data: { data: png, mime_type: "image/png" } });
    parts.push(textPart(prompt));
    for (const b64 of stableImages(setting.images_base64).slice(0,6)) parts.push(imagePart(bufOfDataURL(b64)));
    for (const p of stableProfiles(profiles)) for (const b64 of (p.images_base64 || []).slice(0,4)) parts.push(imagePart(bufOfDataURL(b64)));
    parts.push({ inline_data: { data: b64OfSVG(palette.svg), mime_type: palette.mime } });
    const contents = [{ role: "user", parts }];
    const buf = await geminiImageCall(process.env.GEMINI_API_KEY!, contents);
    const file = path.join(outDir, `room_ref_${cam.fov_deg}_${keyOf(cam)}.png`);
    fs.writeFileSync(file, buf);
    results.push({ type:"room_ref", fov: cam.fov_deg, file });
    await throttle();
  }
  return results;
}

// naive throttling to avoid spamming
async function throttle(ms=400) { await new Promise(r=>setTimeout(r, ms)); }


