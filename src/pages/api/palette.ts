import type { NextApiRequest, NextApiResponse } from "next";
import type { SceneModel } from "../../lib/scene_model";
import { paletteSVG, svgToDataUrl } from "../../lib/palette_card";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error:"POST only" });
    const { scene } = req.body as { scene: SceneModel };
    if (!scene?.finishes) return res.status(400).json({ error:"scene.finishes required" });
    const svg = paletteSVG(scene.finishes as any);
    const dataUrl = svgToDataUrl(svg);
    return res.status(200).json({ dataUrl });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "palette error" });
  }
}


