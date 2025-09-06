import type { NextApiRequest, NextApiResponse } from "next";
import { textPart, imagePart } from "../../lib/gemini";

const URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { imagesBase64 } = req.body as { imagesBase64: string[] };
    if (!imagesBase64?.length) return res.status(400).json({ error: "No images" });

    const parts: any[] = [
      textPart(
        `Summarize consistent, EDITABLE appearance tokens for an ANIME character.
Return 1 short paragraph (max ~60 words): hair length/style/color, eye color/shape, notable accessories, outfit silhouette, vibe. Avoid ethnicity/age guesses.`
      )
    ];
    for (const b64 of imagesBase64.slice(0, 4)) { // cap to 4 refs
      const buf = Buffer.from(b64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    }

    const r = await fetch(`${URL}?key=${apiKey}`, { method:"POST", headers:{ "Content-Type":"application/json"}, body: JSON.stringify({ contents:[{ role:"user", parts }] })});
    if (!r.ok) throw new Error(await r.text());
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    res.json({ description: text });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}
