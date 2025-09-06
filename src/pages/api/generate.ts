import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { shotPrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";
import type { CharacterProfile, SettingProfile } from "../../lib/types";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { camera, extra, profiles, settingProfile } = req.body as {
      camera: any; extra?: string; profiles?: CharacterProfile[]; settingProfile?: SettingProfile;
    };

    const prompt = shotPrompt(
      graphJson as any,
      camera || (graphJson as any).default_camera,
      extra || "",
      profiles || [],
      settingProfile?.description || ""
    );

    const parts: any[] = [ textPart(prompt) ];

    // Attach SETTING refs first (floor/elevation/grid/mood)
    for (const b64 of (settingProfile?.images_base64 || []).slice(0, 6)) {
      const buf = Buffer.from(b64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    }

    // Then attach character refs
    for (const p of (profiles || [])) {
      for (const b64 of (p.images_base64 || []).slice(0, 4)) {
        const buf = Buffer.from(b64.split(",").pop()!, "base64");
        parts.push(imagePart(buf));
      }
    }

    const contents = [{ role: "user", parts }];

    const cacheKey = keyOf({
      endpoint: "generate",
      prompt,
      settingRefs: (settingProfile?.images_base64 || []).map(keyOf),
      chars: (profiles || []).map(cp => ({ n: cp.name, h: cp.height_cm, d: cp.description, imgs: (cp.images_base64||[]).map(keyOf) }))
    });
    const cached = getCache(cacheKey);
    if (cached) { res.setHeader("Content-Type", "image/png"); return res.send(cached); }

    const buf = await geminiImageCall(apiKey, contents);
    setCache(cacheKey, buf);
    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}

