import type { NextApiRequest, NextApiResponse } from "next";
import kit from "../../scene/render_kit_v1.json";
import fs from "fs";
import path from "path";
import { buildCharacterSheets, buildElevations, buildFloorPlan, buildPerspectives, buildRoomRefs } from "../../lib/render_kit";
import { getActiveId, getSetting } from "../../server/settings_fs";
import { paletteSVG as scenePaletteSVG } from "../../lib/palette_card";
import { buildDoorWireframesFromModel, buildCarpetPatternCardFromModel } from "../../lib/render_kit_extras";
import { buildRailsForCamera } from "../../lib/rails";
import type { CharacterProfile, SettingProfile } from "../../lib/types";
import { modelToSceneGraph } from "../../lib/graph";
import { doorLockText, floorLockText, finishesLightingText } from "../../lib/prompts";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { keyOf } from "../../lib/cache";
import { getAnchor, saveAnchor } from "../../lib/continuity";
import { renderWireframeSVGFromModel } from "../../lib/wireframe";

type BuildTargets = ("character_sheets"|"floor_plan"|"elevations"|"perspectives"|"full_pack")[];

export const config = { api: { bodyParser: { sizeLimit: "30mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { targets, dryRun, profiles, settingProfile } = req.body as {
      targets: BuildTargets; dryRun?: boolean; profiles?: CharacterProfile[]; settingProfile?: SettingProfile;
    };

    const t = new Set(targets || []);
    const manifest:any[] = [];
    const profilesSafe = profiles || [];
    const settingSafe  = settingProfile || { description:"", images_base64:[] };

    if (dryRun) {
      const plan:any[] = [];
      if (t.has("character_sheets") || t.has("full_pack")) plan.push({ id:"character_sheets", poses:(kit as any).character_sheet.poses.length });
      if (t.has("floor_plan") || t.has("full_pack"))       plan.push({ id:"floor_plan" });
      if (t.has("elevations") || t.has("full_pack"))       plan.push({ id:"elevations", count:(kit as any).setting_plates.elevations.length });
      if (t.has("perspectives") || t.has("full_pack"))     plan.push({ id:"perspectives", count:(kit as any).setting_plates.perspectives.length });
      return res.json({ ok:true, dryRun:true, plan });
    }

    // reset status log and mark start
    try{
      const outDir = path.join(process.cwd(), ".cache", "render_kit");
      fs.mkdirSync(outDir,{recursive:true});
      // create a lightweight lock so UI can show running immediately
      const lock = path.join(outDir, "build.lock");
      try{ fs.writeFileSync(lock, String(Date.now())); } catch{}
      const status = path.join(outDir, "status.json");
      fs.writeFileSync(status, "[]");
      const list = [{ ts: Date.now(), message: `started: ${[...t].join(',')}` }];
      fs.writeFileSync(status, JSON.stringify(list, null, 2));
    }catch{}

    try{
      if (t.has("character_sheets") || t.has("full_pack")) {
        manifest.push(...await buildCharacterSheets(profilesSafe, settingSafe));
      }
      if (t.has("floor_plan") || t.has("full_pack")) {
        manifest.push(...await buildFloorPlan(settingSafe));
      }
      if (t.has("elevations") || t.has("full_pack")) {
        manifest.push(...await buildElevations(settingSafe));
      }
      if (t.has("perspectives") || t.has("full_pack")) {
        // generate both line-art and color plates for perspectives
        manifest.push(...await buildPerspectives(profilesSafe, settingSafe, false));
        manifest.push(...await buildPerspectives(profilesSafe, settingSafe, true));
      }
    } finally {
      // progress tick
      try{
        const outDir = path.join(process.cwd(), ".cache", "render_kit");
        const status = path.join(outDir, "status.json");
        const list = fs.existsSync(status)? JSON.parse(fs.readFileSync(status,"utf-8")) : [];
        list.push({ ts: Date.now(), message: `progress: ${manifest.length} files` });
        fs.writeFileSync(status, JSON.stringify(list, null, 2));
      }catch{}
    }

    // Always append 3 consistent room references after plates when full pack requested
    if (t.has("full_pack")) {
      manifest.push(...await buildRoomRefs(profilesSafe, settingSafe));
    }

    // Also write palette card derived from active setting finishes, if available
    try {
      const active = getActiveId();
      if (active){
        const doc = getSetting(active);
        const fin = doc?.model?.finishes;
        if (fin) {
          const svg = scenePaletteSVG(fin);
          const outDir = path.join(process.cwd(), ".cache", "render_kit");
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(path.join(outDir, "palette_scene.svg"), svg, "utf8");
          manifest.push({ type:"palette_scene", file: path.join(outDir, "palette_scene.svg") });
        }
        // Build door wireframes and carpet pattern card from active model
        if (doc?.model){
          await buildDoorWireframesFromModel(doc.model);
          await buildCarpetPatternCardFromModel(doc.model);
          // Rails per camera
          try {
            const cams:any[] = (kit as any).camera_presets || [];
            for (const cam of cams){ await buildRailsForCamera(doc.model, cam); }
            // After rails: ensure an anchor image exists for current locks (use first camera preset)
            try{
              const cam = (cams && cams[0]) || (kit as any).camera_presets?.[0];
              if (cam){
                const finishesVersion = doc.model?.finishes_version_id || null;
                const doorHash = keyOf((doc.model?.doors||[]).slice().sort((a:any,b:any)=> String(a.id||"").localeCompare(String(b.id||""))));
                const carpetHash = keyOf(doc.model?.carpet || null);
                const locks = { finishesVersion, doorHash, carpetHash, cameraKey: null } as any;
                const existingAnchor = getAnchor(active, locks);
                if (!existingAnchor){
                  const root = path.join(process.cwd(), ".cache", "render_kit");
                  const parts:any[] = [];
                  // Palette card
                  const paletteFile = path.join(root, "palette_scene.svg");
                  if (fs.existsSync(paletteFile)) parts.push({ inline_data: { data: Buffer.from(fs.readFileSync(paletteFile)).toString("base64"), mime_type: "image/svg+xml" } });
                  // Door wireframe (per camera)
                  const doorDir = path.join(root, "door");
                  const doorFile = fs.existsSync(doorDir) ? fs.readdirSync(doorDir).find(f=>f.includes(`door_${cam.fov_deg}_`)) : undefined;
                  if (doorFile) parts.push(imagePart(fs.readFileSync(path.join(doorDir, doorFile))));
                  // Rails (strict order)
                  const railsDir = path.join(root, "rails", keyOf(cam));
                  const railsFiles = [
                    "material_atlas.png","constraints.svg","constraints_perspective.png","ortho_front.png","ortho_right.png","ortho_top.png","wireframe.svg","depth.png","normals.png","ao.png"
                  ];
                  for (const rf of railsFiles){ const pth = path.join(railsDir, rf); if (fs.existsSync(pth)) parts.push(imagePart(fs.readFileSync(pth), rf.endsWith(".svg")?"image/svg+xml":"image/png")); }
                  // Generic wireframe fallback
                  try{ const wf = renderWireframeSVGFromModel(doc.model as any, `perspective FOV ${cam.fov_deg}`); parts.push({ inline_data: { data: Buffer.from(wf.svg, "utf8").toString("base64"), mime_type: "image/svg+xml" } }); } catch{}
                  // Carpet pattern card
                  const carpetDir = path.join(root, "carpet"); const carpetFile = path.join(carpetDir, "carpet_card.png"); if (fs.existsSync(carpetFile)) parts.push(imagePart(fs.readFileSync(carpetFile)));
                  // Perspective plates (line then color)
                  const persDir = path.join(root, "perspectives"); if (fs.existsSync(persDir)){ const files = fs.readdirSync(persDir); const line = files.find(f => f.includes(`perspective_${cam.fov_deg}_`) && f.includes("_line")); const color = files.find(f => f.includes(`perspective_${cam.fov_deg}_`) && f.includes("_color")); if (line) parts.push(imagePart(fs.readFileSync(path.join(persDir, line)))); if (color) parts.push(imagePart(fs.readFileSync(path.join(persDir, color)))); }
                  // Prompt text
                  const graph = modelToSceneGraph(doc.model);
                  const finishesText = finishesLightingText(doc.model);
                  const doorText = doorLockText(doc.model);
                  const floorText = floorLockText(doc.model);
                  const wb = (doc.model as any)?.exposure_lock?.white_balance_K || (doc.model as any)?.lighting?.cctK || 4300;
                  const ev = (doc.model as any)?.exposure_lock?.ev_target || "neutral";
                  const style = `STYLE: photoreal office interior; correct global illumination; no depth-of-field blur; neutral post; respect exposure_lock (WB ${wb}K, EV ${ev}).`;
                  const prompt = [
                    // keep wording close to /api/generate
                    `Scene "${graph.scene_id}" anchor frame.`,
                    finishesText,
                    doorText,
                    floorText,
                    style
                  ].filter(Boolean).join("\n\n");
                  parts.push(textPart(prompt));
                  const contents = [{ role: "user", parts }];
                  const buf = await geminiImageCall(process.env.GEMINI_API_KEY!, contents);
                  saveAnchor(active, locks, buf);
                  try{
                    const outDir = path.join(process.cwd(), ".cache", "render_kit");
                    const status = path.join(outDir, "status.json");
                    const list = fs.existsSync(status)? JSON.parse(fs.readFileSync(status,"utf-8")) : [];
                    list.push({ ts: Date.now(), message: `anchor generated (fov=${cam.fov_deg})` });
                    fs.writeFileSync(status, JSON.stringify(list, null, 2));
                  } catch{}
                  manifest.push({ type:"anchor", file:"(cached) anchors/.../anchor.png" });
                }
              }
            } catch{}
          } catch {}
        }
      }
    } catch {}

    // write a copy of last scene model if provided via settingProfile.description/images only (optional future)
    try {
      const cacheDir = path.join(process.cwd(), ".cache"); fs.mkdirSync(cacheDir, { recursive: true });
      // If a user previously exported SceneLock JSON to .cache/setting_model.json, prefer that elsewhere
    } catch {}
    try{
      const outDir = path.join(process.cwd(), ".cache", "render_kit");
      const status = path.join(outDir, "status.json");
      const list = fs.existsSync(status)? JSON.parse(fs.readFileSync(status,"utf-8")) : [];
      list.push({ ts: Date.now(), message: `done: ${manifest.length} files` });
      fs.writeFileSync(status, JSON.stringify(list, null, 2));
      // remove lock
      try{ fs.unlinkSync(path.join(outDir, "build.lock")); } catch{}
    }catch{}
    res.json({ ok:true, items: manifest });
  } catch (e:any) {
    try{
      const outDir = path.join(process.cwd(), ".cache", "render_kit");
      fs.mkdirSync(outDir,{recursive:true});
      const status = path.join(outDir, "status.json");
      const list = fs.existsSync(status)? JSON.parse(fs.readFileSync(status,"utf-8")) : [];
      list.push({ ts: Date.now(), message: `error: ${e?.message || 'unknown'}` });
      fs.writeFileSync(status, JSON.stringify(list, null, 2));
    }catch{}
    res.status(500).json({ ok:false, error: e.message });
  }
}


