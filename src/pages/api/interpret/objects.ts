import type { NextApiRequest, NextApiResponse } from "next";
import { geminiVisionJSON } from "../../../server/gemini";

type Payload = {
  imagesBase64: string[]; // 1..4
};

const TS_SCHEMA = `
type DetectedObject = {
  kind: "table"|"chair"|"panel"|"whiteboard"|"tv"|"decal"|"plant"|"grommet"|"unknown";
  label?: string;
  conf?: number;
  bbox_px: { x:number; y:number; w:number; h:number };
  facing?: 0|90|180|270;
  wall?: "N"|"S"|"E"|"W"|null;
  size_hint_ft?: { w?:number; d?:number; h?:number };
};
type Output = { width_px:number; height_px:number; objects: DetectedObject[] };
`;

const PROMPT = `
You see 1–4 photos of the SAME small interview room (YC style).
Detect objects relevant to a meeting room: table, chairs, acoustic panels, whiteboard, TV/display, glass decal, plants, floor grommet.
For each object output:
- kind (exact enum word)
- bbox_px (x,y,w,h) within the current image
- wall if the object is wall-mounted (choose N,S,E,W from the camera's point of view; if uncertain use null)
- facing (0,90,180,270) if meaningful for chairs/table
- size_hint_ft if the object’s real size is obvious (approximate is OK)
Return JSON ONLY matching Output.
Do not include text explanations.
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const { imagesBase64 } = req.body as Payload;
    if (!imagesBase64 || !imagesBase64.length) return res.status(400).json({ error: "imagesBase64 required" });

    const img = imagesBase64[0].replace(/^data:image\/\w+;base64,/, "");
    const mime = "image/jpeg";
    const parts = [{ text: TS_SCHEMA }, { text: PROMPT }, { inlineData: { mimeType: mime, data: img } }];
    const out = await geminiVisionJSON(parts as any, null);
    return res.status(200).json(out);
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "interpret objects error" });
  }
}


