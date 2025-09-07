import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { getActiveId, getSetting } from "../../server/settings_fs";
import { YC_DESCRIPTIONS } from "../../lib/object_descriptions";
import { ensureDefaults } from "../../lib/finishes_presets";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const active = getActiveId();
    if (active){
      const doc = getSetting(active);
      if (doc?.model) {
        const scene = doc.model as any;
        try {
          for (const o of scene.objects ?? []) {
            const key =
              o.kind === "chair" ? "chair" :
              o.kind === "panel" ? "panel" :
              o.kind === "whiteboard" ? "whiteboard" :
              o.kind === "tv" ? "tv" :
              o.kind === "decal" ? "decal" :
              o.kind === "grommet" ? "grommet" :
              o.kind === "ceiling_light" ? "ceiling_light" :
              o.kind === "table" ? "table" : undefined;
            if (key && YC_DESCRIPTIONS[key]) {
              o.meta = o.meta || {};
              if (!o.meta.description) o.meta.description = YC_DESCRIPTIONS[key].description;
              if (!o.meta.styleTokens) o.meta.styleTokens = YC_DESCRIPTIONS[key].styleTokens;
            }
          }
          const ensured = ensureDefaults(scene.finishes, scene.lighting);
          scene.finishes = ensured.finishes; scene.lighting = ensured.lighting;
          scene.wallMaterials = { E: "glass", N: "solid", S: "solid", W: "solid", ...(scene.wallMaterials || {}) };
          scene.meta = {
            ...(scene.meta || {}),
            glassE: { mullionSpacingFt: 3.5, doorHasStile: true },
            roomFinish: YC_DESCRIPTIONS.room_finish.description,
            preset: scene.meta?.preset || "yc_room"
          };
        } catch {}
        return res.status(200).json({ ok:true, scene, meta:{ id:active, name:doc.name }});
      }
    }
    const userPath = path.join(process.cwd(), ".cache/setting_model.json");
    const fallback = path.join(process.cwd(), "src/scene/yc_room_v1.json");
    const p = fs.existsSync(userPath) ? userPath : fallback;
    const json = fs.readFileSync(p, "utf-8");
    const scene = JSON.parse(json);
    try {
      for (const o of scene.objects ?? []) {
        const key =
          o.kind === "chair" ? "chair" :
          o.kind === "panel" ? "panel" :
          o.kind === "whiteboard" ? "whiteboard" :
          o.kind === "tv" ? "tv" :
          o.kind === "decal" ? "decal" :
          o.kind === "grommet" ? "grommet" :
          o.kind === "ceiling_light" ? "ceiling_light" :
          o.kind === "table" ? "table" : undefined;
        if (key && YC_DESCRIPTIONS[key]) {
          o.meta = o.meta || {};
          if (!o.meta.description) o.meta.description = YC_DESCRIPTIONS[key].description;
          if (!o.meta.styleTokens) o.meta.styleTokens = YC_DESCRIPTIONS[key].styleTokens;
        }
      }
      const ensured = ensureDefaults(scene.finishes, scene.lighting);
      scene.finishes = ensured.finishes; scene.lighting = ensured.lighting;
      scene.wallMaterials = { E: "glass", N: "solid", S: "solid", W: "solid", ...(scene.wallMaterials || {}) };
      scene.meta = {
        ...(scene.meta || {}),
        glassE: { mullionSpacingFt: 3.5, doorHasStile: true },
        roomFinish: YC_DESCRIPTIONS.room_finish.description,
        preset: scene.meta?.preset || "yc_room"
      };
    } catch {}
    res.status(200).json({ ok:true, scene, meta:{ id:"fallback", name:"yc_room_v1" } });
  } catch (e:any) {
    res.status(200).json({ ok:false, error: e?.message || "failed to load scene", scene: null });
  }
}


