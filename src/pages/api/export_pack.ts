import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { ZipBuilder } from "../../lib/zip";
import scene from "../../scene/yc_room_v1.json";
import kit from "../../scene/render_kit_v1.json";
import { paletteSVG } from "../../lib/palette";
import { getActiveId, getSetting } from "../../server/settings_fs";
import { paletteSVG as scenePaletteSVG } from "../../lib/palette_card";
import type { CharacterProfile, SettingProfile } from "../../lib/types";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

function addIfExists(z: ZipBuilder, abs: string, rel: string) {
  if (fs.existsSync(abs)) {
    if (fs.statSync(abs).isDirectory()) {
      for (const name of fs.readdirSync(abs)) addIfExists(z, path.join(abs, name), path.join(rel, name));
    } else {
      z.addFile(rel, fs.readFileSync(abs));
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { profiles, settingProfile } = req.body as {
      profiles: CharacterProfile[]; settingProfile: SettingProfile;
    };

    const z = new ZipBuilder();

    // Render Kit files
    const rk = path.join(process.cwd(), ".cache", "render_kit");
    addIfExists(z, rk, "render_kit");

    // Shotbook if present
    const cacheRoot = path.join(process.cwd(), ".cache");
    addIfExists(z, path.join(cacheRoot, "shotbook.json"), "continuity/shotbook.json");

    // Scene + kit specs
    z.addFile("specs/yc_room_v1.json", Buffer.from(JSON.stringify(scene, null, 2)));
    z.addFile("specs/render_kit_v1.json", Buffer.from(JSON.stringify(kit, null, 2)));

    // Profiles + setting as provided from UI
    z.addFile("profiles/characters.json", Buffer.from(JSON.stringify(profiles || [], null, 2)));
    z.addFile("profiles/setting.json", Buffer.from(JSON.stringify(settingProfile || {}, null, 2)));

    // Palette cards: legacy kit palette and current scene finishes palette
    const pal = paletteSVG((kit as any).palette_hex || []);
    z.addFile("specs/palette_kit.svg", Buffer.from(pal.svg, "utf8"));
    try {
      const active = getActiveId();
      if (active){
        const doc = getSetting(active);
        const fin = doc?.model?.finishes;
        if (fin) {
          const svg = scenePaletteSVG(fin);
          z.addFile("specs/palette_scene.svg", Buffer.from(svg, "utf8"));
        }
      }
    } catch {}

    // Include active SceneLock JSON if exported/available
    try {
      const userScene = path.join(process.cwd(), ".cache", "setting_model.json");
      if (fs.existsSync(userScene)) {
        z.addFile("specs/setting_model.json", fs.readFileSync(userScene));
      }
    } catch {}

    // README with exact render instructions and ref order
    const readme = [
      "Continuity Pack",
      "",
      "This bundle includes:",
      "- Render Kit plates (wireframes, elevations, perspectives)",
      "- SceneLock JSON (setting_model.json if present) and static specs",
      "- Character and setting profiles",
      "- Palette cards (kit + scene finishes)",
      "",
      "Reference order used for generation:",
      "1) Palette (scene finishes)",
      "2) Wireframe (matching camera FOV)",
      "3) Setting Plates (line, then color)",
      "4) Character reference images (sorted per character)",
      "5) Continuity shots (nearest past views)",
      "",
      "Prompt sections:",
      "- SceneLock header",
      "- Characters",
      "- Finish & Lighting Lock",
      "- Object Lock",
      "- Camera language",
      "- Task",
    ].join("\n");
    z.addFile("README.txt", Buffer.from(readme, "utf8"));

    const zipBuf = z.build();
    const fname = `continuity-pack-${new Date().toISOString().slice(0,10)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(zipBuf);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}


