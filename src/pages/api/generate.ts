import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { shotPrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";
import type { CharacterProfile } from "../../lib/types";

export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { camera, extra, profiles, refImagesBase64 } = req.body as {
      camera: any; extra?: string; profiles?: CharacterProfile[]; refImagesBase64?: string[];
    };

    const prompt = shotPrompt(graphJson as any, camera || (graphJson as any).default_camera, extra || "", profiles || []);

    const parts: any[] = [ textPart(prompt) ];

    // attach global refs (floor/elevation/grid)
    (refImagesBase64 || []).forEach((b64) => {
      const buf = Buffer.from(b64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    });

    // attach character reference images
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
      refs: (refImagesBase64 || []).map(keyOf),
      chars: (profiles || []).map(cp => ({ name: cp.name, h: cp.height_cm, d: cp.description, imgs: (cp.images_base64||[]).map(keyOf) }))
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

