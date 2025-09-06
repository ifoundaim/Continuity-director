import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { ZipBuilder } from "../../lib/zip";
import scene from "../../scene/yc_room_v1.json";
import kit from "../../scene/render_kit_v1.json";
import { paletteSVG } from "../../lib/palette";
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

    // Palette card
    const pal = paletteSVG((kit as any).palette_hex || []);
    z.addFile("specs/palette.svg", Buffer.from(pal.svg, "utf8"));

    const zipBuf = z.build();
    const fname = `continuity-pack-${new Date().toISOString().slice(0,10)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(zipBuf);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}


