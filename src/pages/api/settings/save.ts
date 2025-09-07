import type { NextApiRequest, NextApiResponse } from "next";
import { saveSetting, newId, setActiveId } from "../../../server/settings_fs";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== "POST") return res.status(405).end();
  const { id, name, model, activate } = req.body || {};
  const _id = id || newId();
  const doc = saveSetting(_id, name || _id, model);
  if (activate) setActiveId(_id);
  res.status(200).json({ ok:true, id:_id, doc });
}


