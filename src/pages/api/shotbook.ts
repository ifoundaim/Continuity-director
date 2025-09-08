import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(_req: NextApiRequest, res: NextApiResponse){
  try {
    const root = path.join(process.cwd(), ".cache");
    const book = path.join(root, "shotbook.json");
    if (!fs.existsSync(book)) return res.status(200).json({ ok:true, shots: [] });
    const json = JSON.parse(fs.readFileSync(book, "utf-8"));
    res.status(200).json({ ok:true, shots: json });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e?.message || "shotbook error" });
  }
}


