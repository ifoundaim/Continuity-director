import type { NextApiRequest, NextApiResponse } from "next";
import { deleteSetting } from "../../../server/settings_fs";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== "POST") return res.status(405).end();
  const { id } = req.body || {};
  if (!id) return res.status(200).json({ ok:false, error:"missing id" });
  deleteSetting(id);
  res.status(200).json({ ok:true });
}


