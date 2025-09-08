import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(_req: NextApiRequest, res: NextApiResponse){
  try{
    const root = path.join(process.cwd(), ".cache", "render_kit");
    const status = path.join(root, "status.json");
    const lock = path.join(root, "build.lock");
    const exists = fs.existsSync(status);
    const list = exists ? JSON.parse(fs.readFileSync(status, "utf-8")) : [];
    const files = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes:true }) : [];
    const count = files.filter(d=>d.isFile()).length + files.filter(d=>d.isDirectory()).reduce((s,d)=>{
      try{ return s + fs.readdirSync(path.join(root,d.name)).length; } catch{ return s; }
    },0);
    const running = fs.existsSync(lock) || (!!list.length && (Date.now() - (list[list.length-1]?.ts||0) < 5*60*1000));
    res.status(200).json({ ok:true, running, itemsDone: count, lastMessage: list[list.length-1]?.message || null, log: list });
  } catch(e:any){
    res.status(500).json({ ok:false, error: e?.message || "status error" });
  }
}


