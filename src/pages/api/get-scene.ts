import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { getActiveId, getSetting } from "../../server/settings_fs";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const active = getActiveId();
    if (active){
      const doc = getSetting(active);
      if (doc?.model) return res.status(200).json({ ok:true, scene: doc.model, meta:{ id:active, name:doc.name }});
    }
    const userPath = path.join(process.cwd(), ".cache/setting_model.json");
    const fallback = path.join(process.cwd(), "src/scene/yc_room_v1.json");
    const p = fs.existsSync(userPath) ? userPath : fallback;
    const json = fs.readFileSync(p, "utf-8");
    res.status(200).json({ ok:true, scene: JSON.parse(json), meta:{ id:"fallback", name:"yc_room_v1" } });
  } catch (e:any) {
    res.status(200).json({ ok:false, error: e?.message || "failed to load scene", scene: null });
  }
}


