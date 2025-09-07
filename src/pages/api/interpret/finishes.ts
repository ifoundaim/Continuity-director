import type { NextApiRequest, NextApiResponse } from "next";
import { geminiVisionJSON } from "../../../server/gemini";
import type { Finishes, Lighting } from "../../../lib/scene_model";

type Payload = { imagesBase64: string[] };

type Out = {
  finishes?: Finishes;
  lighting?: Lighting;
  paletteHex?: string[]; // convenience palette summary
};

const TS_SCHEMA = `
type FloorCarpet = { kind:"carpet_tiles"; baseHex:string; pattern?:"solid"|"heather"|"quarter-turn"; tileInches?:number; accentHex?:string; };
type FloorConcrete = { kind:"polished_concrete"; tintHex:string; glossGU?:number; };
type FloorFinish = FloorCarpet | FloorConcrete;
type Finishes = { wallHex:string; trimHex?:string; floor:FloorFinish; mullionHex?:string; glassTintHex?:string; accentHex?:string; notes?:string; };
type Lighting = { cctK:number; lux?:number; contrast?:"soft"|"neutral"|"crisp"; style?:"even_panel"|"spot_key_fill"; };
type Output = { finishes?:Finishes; lighting?:Lighting; paletteHex?:string[] };
`;

const PROMPT = `
Given reference photos of a YC-style interview room (glass wall with slim mullions, simple table & chairs), extract finishes and lighting:

- wallHex: dominant wall paint color (matte).
- trimHex: optional light trim/baseboard.
- floor: either carpet_tiles { baseHex, pattern ("solid"|"heather"|"quarter-turn"), tileInches (~24), accentHex } or polished_concrete { tintHex, glossGU (≈10)}.
- mullionHex: slim metal/glass mullion color (often near-black).
- glassTintHex: subtle blue/grey tint.
- accentHex: brand accent if visible (YC orange ~#FF6D00 if present).
- lighting: cctK (estimate from 3500–5000), lux rough (400–600 typical), contrast ("soft"/"neutral"/"crisp"), style ("even_panel" for troffers/grid).

Output MUST match the Output type exactly. If unsure on a field, omit it.
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Out|{error:string}>) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" } as any);
    const { imagesBase64 } = req.body as Payload;
    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) return res.status(400).json({ error: "imagesBase64 required" } as any);

    const parts: any[] = [{ text: TS_SCHEMA }, { text: PROMPT }];
    for (const b64 of imagesBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: b64.replace(/^data:image\/\w+;base64,/, "") } });
    }

    const out = await geminiVisionJSON(parts, null);
    const normHex = (h?:string) => (typeof h === "string" && /^#?[0-9a-fA-F]{6}$/.test(h.replace("#",""))) ? ("#"+h.replace("#","").toUpperCase()) : undefined;
    if ((out as any)?.finishes){
      const f = (out as any).finishes as Finishes;
      f.wallHex = normHex(f.wallHex) || f.wallHex;
      if (f.trimHex) f.trimHex = normHex(f.trimHex);
      if (f.mullionHex) f.mullionHex = normHex(f.mullionHex);
      if (f.glassTintHex) f.glassTintHex = normHex(f.glassTintHex);
      if (f.accentHex) f.accentHex = normHex(f.accentHex);
      if (f.floor?.kind === "carpet_tiles") {
        const fc:any = f.floor as any; fc.baseHex = normHex(fc.baseHex) || fc.baseHex; if (fc.accentHex) fc.accentHex = normHex(fc.accentHex); fc.pattern = fc.pattern || "heather"; fc.tileInches = fc.tileInches || 24;
      } else if (f.floor?.kind === "polished_concrete") {
        const fp:any = f.floor as any; fp.tintHex = normHex(fp.tintHex) || fp.tintHex; fp.glossGU = fp.glossGU ?? 10;
      }
      (out as any).finishes = f;
    }
    if ((out as any)?.lighting){
      const L = (out as any).lighting as Lighting; L.cctK = Math.round(L.cctK || 4300); if (L.lux) L.lux = Math.round(L.lux); L.contrast = L.contrast || "neutral"; L.style = L.style || "even_panel"; (out as any).lighting = L;
    }
    return res.status(200).json(out as Out);
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "interpret error" } as any);
  }
}


