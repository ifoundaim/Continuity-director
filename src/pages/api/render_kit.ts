// Optional endpoint to rebuild render kit using active SceneLock model if needed later.
import type { NextApiRequest, NextApiResponse } from "next";
import { buildCharacterSheets, buildElevations, buildFloorPlan, buildPerspectives } from "../../lib/render_kit";

export const config = { api: { bodyParser: { sizeLimit: "30mb" } } };

export default async function handler(_req: NextApiRequest, res: NextApiResponse){
  try{
    const manifest:any[] = [];
    manifest.push(...await buildFloorPlan({ description:"", images_base64:[] } as any));
    manifest.push(...await buildElevations({ description:"", images_base64:[] } as any));
    res.status(200).json({ ok:true, items: manifest });
  }catch(e:any){ res.status(500).json({ ok:false, error:e?.message||"render_kit error" }); }
}


