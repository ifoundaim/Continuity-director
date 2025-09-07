import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { jsonText } = req.body as { jsonText: string };
    if (!jsonText) return res.status(400).json({ ok:false, error:"Missing jsonText" });
    const dir = path.join(process.cwd(), ".cache");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "setting_model.json"), jsonText, "utf-8");
    res.json({ ok:true });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e.message });
  }
}


