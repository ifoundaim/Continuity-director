import type { NextApiRequest, NextApiResponse } from "next";
import kit from "../../scene/render_kit_v1.json";
import { buildCharacterSheets, buildElevations, buildFloorPlan, buildPerspectives } from "../../lib/render_kit";
import type { CharacterProfile, SettingProfile } from "../../lib/types";

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

    res.json({ ok:true, items: manifest });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e.message });
  }
}


