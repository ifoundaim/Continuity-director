import type { NextApiRequest, NextApiResponse } from "next";
import { geminiVisionJSON } from "../../server/gemini";

type Payload = { imagesBase64: string[] };

const TS_SCHEMA = `
type Output = { label?: string; description: string }`;

const PROMPT = `
You will see 1–4 reference photos of a SINGLE OBJECT used in a meeting room.
- Identify the object succinctly (brand/model if obvious).
- Write a concise, neutral, one-sentence description of the object itself.
- Do NOT mention characters, people, or styles. This is NOT a character description.
Return JSON ONLY matching Output.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try{
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" } as any);
    const { imagesBase64 } = req.body as Payload;
    if (!imagesBase64?.length) return res.status(400).json({ error: "No images" } as any);

    const parts: any[] = [{ text: TS_SCHEMA }, { text: PROMPT }];
    for (const url of imagesBase64.slice(0,4)){
      const m = /^data:(.*?);base64,(.*)$/.exec(url || "");
      const mimeType = m?.[1] || "image/jpeg";
      const data = m?.[2] || (url.split(",").pop() || "");
      parts.push({ inlineData: { mimeType, data } });
    }
    const out = await geminiVisionJSON(parts as any, null);
    return res.status(200).json({ label: out?.label, description: out?.description || "" });
  } catch (e:any){
    return res.status(500).json({ error: e?.message || "describe_object error" });
  }
}


