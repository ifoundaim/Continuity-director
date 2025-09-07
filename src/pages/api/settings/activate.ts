import type { NextApiRequest, NextApiResponse } from "next";
import { setActiveId } from "../../../server/settings_fs";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== "POST") return res.status(405).end();
  const { id } = req.body || {};
  setActiveId(id);
  res.status(200).json({ ok:true });
}


