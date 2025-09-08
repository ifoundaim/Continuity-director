import type { NextApiRequest, NextApiResponse } from "next";
import { textPart, imagePart } from "../../lib/gemini";
import { geminiVisionJSON } from "../../server/gemini";
import { bumpUsage } from "../../server/usage_fs";

const URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export const config = { api: { bodyParser: { sizeLimit: "30mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { imagesBase64 } = req.body as { imagesBase64: string[] };
    if (!imagesBase64?.length) return res.status(400).json({ error: "No images" });

    // JSON mode (structured) first
    const SCHEMA = `type Output = { description: string }`;
    const PROMPT = `Summarize consistent, EDITABLE appearance tokens for an ANIME character. \nReturn JSON ONLY matching Output with a single 'description' field (≤60 words). Focus on hair style/color/length, eye color/shape, notable accessories, outfit silhouette, and vibe. Avoid ethnicity/age guesses.`;

    const jsonParts: any[] = [{ text: SCHEMA }, { text: PROMPT }];
    for (const url of imagesBase64.slice(0, 4)) {
      const m = /^data:(.*?);base64,(.*)$/.exec(url || "");
      const mimeType = m?.[1] || "image/jpeg";
      const data = m?.[2] || (url.split(",").pop() || "");
      jsonParts.push({ inlineData: { mimeType, data } });
    }
    try {
      const out = await geminiVisionJSON(jsonParts as any, null);
      const desc = (out as any)?.description?.trim?.() || "";
      if (desc) { return res.status(200).json({ description: desc }); }
    } catch {}

    // Fallback to text mode if JSON mode didn’t yield text
    const parts: any[] = [textPart(
      `Summarize consistent, EDITABLE appearance tokens for an ANIME character.\nReturn 1 short paragraph (≤60 words): hair length/style/color, eye color/shape, notable accessories, outfit silhouette, vibe. Avoid ethnicity/age guesses.`
    )];
    for (const url of imagesBase64.slice(0, 4)) {
      const m = /^data:(.*?);base64,(.*)$/.exec(url || "");
      const mime = m?.[1] || "image/jpeg";
      const data = m?.[2] || (url.split(",").pop() || "");
      const buf = Buffer.from(data, "base64");
      parts.push(imagePart(buf, mime));
    }
    const r = await fetch(`${URL}?key=${apiKey}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ contents:[{ role:"user", parts }] })});
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text)?.filter(Boolean)?.join("\n")?.trim() || "";
    res.json({ description: text });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}
