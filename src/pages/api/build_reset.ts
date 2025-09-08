import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  try{
    const wipe = req.method === "POST" && (req.body?.wipe === true || req.query?.wipe === "1");
    const root = path.join(process.cwd(), ".cache", "render_kit");
    const status = path.join(root, "status.json");
    if (wipe){
      try{ fs.rmSync(root, { recursive: true, force: true }); } catch{}
      fs.mkdirSync(root, { recursive: true });
    } else {
      if (fs.existsSync(status)) fs.unlinkSync(status);
    }
    res.status(200).json({ ok:true, wiped: !!wipe });
  } catch(e:any){
    res.status(500).json({ ok:false, error: e?.message || "reset failed" });
  }
}


