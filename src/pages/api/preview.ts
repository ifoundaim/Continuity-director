import type { NextApiRequest, NextApiResponse } from "next";
import { shotPrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import type { CharacterProfile } from "../../lib/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { camera, extra, profiles, refImagesBase64 } = req.body as {
      camera: any; extra?: string; profiles?: CharacterProfile[]; refImagesBase64?: string[];
    };

    const prompt = shotPrompt(
      graphJson as any,
      camera || (graphJson as any).default_camera,
      extra || "Anime style enforced; SceneLock fixed.",
      profiles || []
    );

    const refCount = (refImagesBase64 || []).length;
    const charImageCount = (profiles || []).reduce((n, p) => n + (p.images_base64?.length || 0), 0);

    res.json({
      prompt,
      counts: { refImages: refCount, characterImages: charImageCount, characters: (profiles || []).length },
      length: prompt.length
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
