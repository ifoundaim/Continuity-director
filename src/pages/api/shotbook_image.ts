import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  try {
    const id = (req.query.id as string)||"";
    if (!id) return res.status(400).end("missing id");
    const root = path.join(process.cwd(), ".cache");
    const book = path.join(root, "shotbook.json");
    if (!fs.existsSync(book)) return res.status(404).end("not found");
    const all = JSON.parse(fs.readFileSync(book, "utf-8")) as Array<{ id:string; file:string }>;
    const entry = all.find(x=>x.id===id);
    if (!entry || !fs.existsSync(entry.file)) return res.status(404).end("not found");
    res.setHeader("Content-Type", "image/png");
    return res.send(fs.readFileSync(entry.file));
  } catch (e:any) {
    res.status(500).end(e?.message||"error");
  }
}


