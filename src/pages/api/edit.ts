import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { editOnlyPrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";
import { bumpUsage } from "../../server/usage_fs";

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { instruction, imageBase64 } = req.body || {};
    const prompt = editOnlyPrompt(graphJson as any, instruction || "");
    const imgBuf = Buffer.from((imageBase64 || "").split(",").pop()!, "base64");
    const contents = [{ role: "user", parts: [textPart(prompt), imagePart(imgBuf)] }];

    const cacheKey = keyOf({ endpoint: "edit", instruction, imageHash: keyOf(imageBase64) });
    const cached = getCache(cacheKey);
    if (cached) { res.setHeader("Content-Type", "image/png"); return res.send(cached); }

    const buf = await geminiImageCall(apiKey, contents);
    const usage = bumpUsage("edit", 100);
    setCache(cacheKey, buf);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Usage-Remaining", String(usage.remaining));
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

