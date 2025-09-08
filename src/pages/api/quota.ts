import type { NextApiRequest, NextApiResponse } from "next";
import { getUsage } from "../../server/usage_fs";

export default function handler(_req: NextApiRequest, res: NextApiResponse){
  try{ const u = getUsage(100); res.status(200).json({ ok:true, usage: u }); }
  catch(e:any){ res.status(500).json({ ok:false, error: e?.message||"quota error" }); }
}


