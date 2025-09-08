import type { NextApiRequest, NextApiResponse } from "next";
import { geminiVisionJSON } from "../../server/gemini";

type Payload = { imagesBase64: string[]; hint?: string };

const TS_SCHEMA = `
type Output = {
  label?: string;               // e.g., "MacBook Pro 14"
  kind?: "table"|"chair"|"panel"|"whiteboard"|"tv"|"decal"|"plant"|"grommet"|"laptop"|"unknown";
  size_ft?: { w?: number; d?: number; h?: number };
};`;

const PROMPT = `
You will see 1–4 images of a SINGLE object used in a meeting room.
- Identify the object label succinctly (e.g., "MacBook Pro 14") if possible.
- Infer its typical real-world size in feet as {w,d,h}. Be practical and use common-sense defaults if the exact model is uncertain.
- Return JSON ONLY matching Output. Do not add explanations.`;

const COMMON_SIZES_FT: Record<string, { w:number; d:number; h:number }> = {
  // Laptops
  "macbook pro 14": { w: 12.31/12, d: 8.71/12, h: 0.61/12 },
  "macbook pro 16": { w: 14.01/12, d: 9.77/12, h: 0.66/12 },
  "macbook air 13": { w: 11.97/12, d: 8.46/12, h: 0.44/12 },
  "laptop": { w: 12.5/12, d: 9.0/12, h: 0.7/12 },

  // Tablets
  "ipad pro 12.9": { w: 11.04/12, d: 8.46/12, h: 0.25/12 },
  "ipad 10.9": { w: 9.79/12, d: 7.07/12, h: 0.28/12 },
  "tablet": { w: 10.0/12, d: 7.0/12, h: 0.35/12 },

  // Phones
  "iphone 14 pro": { w: 5.81/12, d: 2.81/12, h: 0.31/12 },
  "phone": { w: 6.0/12, d: 3.0/12, h: 0.35/12 },
  "smartphone": { w: 6.0/12, d: 3.0/12, h: 0.35/12 },

  // Desk accessories
  "magic keyboard": { w: 10.98/12, d: 4.52/12, h: 0.35/12 },
  "keyboard": { w: 17.0/12, d: 5.0/12, h: 1.0/12 },
  "magic mouse": { w: 4.5/12, d: 2.3/12, h: 0.9/12 },
  "mouse": { w: 4.7/12, d: 2.7/12, h: 1.5/12 },
  "trackpad": { w: 6.3/12, d: 4.5/12, h: 0.8/12 },

  // Paper / notebooks
  "paper letter": { w: 8.5/12, d: 11/12, h: 0.1/12 },
  "legal pad": { w: 8.5/12, d: 14/12, h: 0.25/12 },
  "paper notebook": { w: 8.5/12, d: 11/12, h: 0.5/12 },
  "journal": { w: 5.0/12, d: 8.25/12, h: 0.75/12 },

  // Drinkware
  "water bottle": { w: 3.0/12, d: 3.0/12, h: 11.0/12 },
  "hydro flask": { w: 3.0/12, d: 3.0/12, h: 10.9/12 },
  "coffee cup": { w: 3.5/12, d: 3.5/12, h: 4.5/12 },
  "mug": { w: 3.7/12, d: 3.7/12, h: 3.7/12 },
};

function mapCommonSize(label?: string){
  if(!label) return null;
  const key = label.toLowerCase();
  for (const k of Object.keys(COMMON_SIZES_FT)){
    if (key.includes(k)) return { ...COMMON_SIZES_FT[k], label: label };
  }
  // Loose category matches / synonyms
  if (key.includes("macbook") || key.includes("notebook pc") || key.includes("laptop")) return { ...COMMON_SIZES_FT["laptop"], label };
  if (key.includes("ipad pro 12.9") || (key.includes("12.9") && key.includes("ipad"))) return { ...COMMON_SIZES_FT["ipad pro 12.9"], label };
  if (key.includes("ipad") || key.includes("tablet")) return { ...COMMON_SIZES_FT["tablet"], label };
  if (key.includes("iphone") || key.includes("smartphone") || key.includes("phone")) return { ...COMMON_SIZES_FT["phone"], label };
  if (key.includes("hydro flask") || (key.includes("water") && key.includes("bottle"))) return { ...COMMON_SIZES_FT["water bottle"], label };
  if (key.includes("legal pad")) return { ...COMMON_SIZES_FT["legal pad"], label };
  if (key.includes("clipboard") || key.includes("letter paper")) return { ...COMMON_SIZES_FT["paper letter"], label };
  if (key.includes("journal") || key.includes("paper notebook") || key.includes("moleskine")) return { ...COMMON_SIZES_FT["paper notebook"], label };
  if (key.includes("keyboard")) return { ...COMMON_SIZES_FT["keyboard"], label };
  if (key.includes("mouse") || key.includes("magic mouse")) return { ...COMMON_SIZES_FT["mouse"], label };
  if (key.includes("trackpad")) return { ...COMMON_SIZES_FT["trackpad"], label };
  if (key.includes("coffee") || key.includes("cup")) return { ...COMMON_SIZES_FT["coffee cup"], label };
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try{
    if (req.method!=="POST") return res.status(405).json({ error: "POST only" });
    const { imagesBase64, hint } = req.body as Payload;
    if (!imagesBase64?.length) return res.status(400).json({ error: "imagesBase64 required" });

    // Ask Gemini for label + rough size
    const parts: any[] = [{ text: TS_SCHEMA }, { text: PROMPT }];
    for (const url of imagesBase64.slice(0,4)){
      const m = /^data:(.*?);base64,(.*)$/.exec(url || "");
      const mimeType = m?.[1] || "image/jpeg";
      const data = m?.[2] || (url.split(",").pop() || "");
      parts.push({ inlineData: { mimeType, data } });
    }
    if (hint) parts.push({ text: `Hint: likely this object is ${hint}.` });
    let out: any = {};
    try { out = await geminiVisionJSON(parts as any, null); } catch {}

    // Prefer our commons mapping if label matches; otherwise return model guess
    const mapped = mapCommonSize(out?.label || hint);
    if (mapped){
      return res.status(200).json({ label: mapped.label, size_ft: { w: mapped.w, d: mapped.d, h: mapped.h } });
    }
    if (out?.size_ft){
      return res.status(200).json({ label: out?.label || hint || undefined, size_ft: out.size_ft });
    }
    return res.status(200).json({ label: out?.label || hint || undefined, size_ft: null });
  } catch (e:any){
    return res.status(500).json({ error: e?.message || "object_size error" });
  }
}


