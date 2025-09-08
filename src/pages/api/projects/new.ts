import type { NextApiRequest, NextApiResponse } from "next";
import { newProject } from "../../../server/projects_fs";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  try{
    if (req.method !== 'POST') return res.status(405).end();
    const { name, goal } = req.body || {};
    if (!name) return res.status(400).json({ ok:false, error:'name required' });
    const { id } = newProject(name, goal);
    res.status(200).json({ ok:true, id });
  }catch(e:any){ res.status(500).json({ ok:false, error:e?.message||'error' }); }
}


