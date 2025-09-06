import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { fusePrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { baseImageBase64, objectImageBase64, placement } = req.body || {};
    const prompt = fusePrompt(graphJson as any, placement || "place centered on TV; treat as decal; match LED reflections");

    const baseBuf = Buffer.from((baseImageBase64 || "").split(",").pop()!, "base64");
    const objBuf  = Buffer.from((objectImageBase64 || "").split(",").pop()!, "base64");
    const contents = [{ role: "user", parts: [textPart(prompt), imagePart(baseBuf), imagePart(objBuf)] }];

    const cacheKey = keyOf({ endpoint: "fuse", placement, baseHash: keyOf(baseImageBase64), objHash: keyOf(objectImageBase64) });
    const cached = getCache(cacheKey);
    if (cached) { res.setHeader("Content-Type", "image/png"); return res.send(cached); }

    const buf = await geminiImageCall(apiKey, contents);
    setCache(cacheKey, buf);
    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

