import type { NextApiRequest, NextApiResponse } from "next";
import { listSettings, getActiveId } from "../../../server/settings_fs";

export default function handler(_req: NextApiRequest, res: NextApiResponse){
  const list = listSettings();
  res.status(200).json({ ok:true, list, activeId: getActiveId() });
}


