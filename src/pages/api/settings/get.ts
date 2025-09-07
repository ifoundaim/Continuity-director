import type { NextApiRequest, NextApiResponse } from "next";
import { getSetting } from "../../../server/settings_fs";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  const id = (req.query.id as string) || "";
  const doc = id ? getSetting(id) : null;
  res.status(200).json({ ok: !!doc, doc });
}


