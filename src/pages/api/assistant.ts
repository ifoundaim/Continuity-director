import type { NextApiRequest, NextApiResponse } from "next";
import { getSetting } from "../../server/settings_fs";
import graphJson from "../../scene/yc_room_v1.json";
import { modelToSceneGraph } from "../../lib/graph";

/**
 * Interpret a free-form user request into a suggested camera preset and an extra instruction string.
 * Uses active setting if available for context.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try{
    const { message, settingId } = req.body as { message: string; settingId?: string };
    const text = (message||"").toLowerCase();

    // Context (currently unused in logic but can be expanded)
    const active = settingId ? getSetting(settingId) : null;
    const scene = active?.model ? modelToSceneGraph(active.model) : (graphJson as any);

    // Very simple intent mapping
    let camera: "interview"|"coach"|"glass"|"low" = "interview";
    if (/(glass|window|east)/.test(text)) camera = "glass";
    else if (/(coach|wide|two shot)/.test(text)) camera = "coach";
    else if (/(low|dramatic)/.test(text)) camera = "low";

    const extras: string[] = [];
    if (/aim(\s|$)/.test(text) && /speak|speaking/.test(text)) extras.push("Aim speaking; Em listening.");
    if (/look at em|eye contact/.test(text)) extras.push("Ensure Aim looking at Em.");
    if (/show tv|tv on/.test(text)) extras.push("TV visible with neutral reflection; avoid glare.");
    if (/yc|decal/.test(text)) extras.push("Keep YC decal band on glass aligned and consistent.");
    if (/tighter|close|portrait/.test(text)) extras.push("Crop tighter around table area; keep scale correct.");

    const extra = (extras.join(" ") || "").trim();
    res.status(200).json({ ok:true, camera, extra });
  } catch (e:any){ res.status(500).json({ ok:false, error: e?.message || "assistant error" }); }
}


