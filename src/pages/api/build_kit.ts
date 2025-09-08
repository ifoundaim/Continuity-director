import type { NextApiRequest, NextApiResponse } from "next";
import kit from "../../scene/render_kit_v1.json";
import fs from "fs";
import path from "path";
import { buildCharacterSheets, buildElevations, buildFloorPlan, buildPerspectives, buildRoomRefs } from "../../lib/render_kit";
import type { CharacterProfile, SettingProfile } from "../../lib/types";
import { getActiveId, getSetting } from "../../server/settings_fs";
import { paletteSVG as scenePaletteSVG } from "../../lib/palette_card";

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
      }
    } catch {}

    // write a copy of last scene model if provided via settingProfile.description/images only (optional future)
    try {
      const cacheDir = path.join(process.cwd(), ".cache"); fs.mkdirSync(cacheDir, { recursive: true });
      // If a user previously exported SceneLock JSON to .cache/setting_model.json, prefer that elsewhere
    } catch {}
    res.json({ ok:true, items: manifest });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e.message });
  }
}


