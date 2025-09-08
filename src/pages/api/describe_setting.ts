import type { NextApiRequest, NextApiResponse } from "next";
import { modelToSceneGraph } from "../../lib/graph";
import { finishesLightingText, objectLockText, sceneLockHeader } from "../../lib/prompts";

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try{
    const model = req.body?.model;
    if (!model) return res.status(400).json({ error: "model required" });
    const graph = modelToSceneGraph(model);
    const summary = [
      sceneLockHeader(graph as any),
      objectLockText({ objects: (model.objects||[]), meta: model.meta }),
      finishesLightingText(model)
    ].join("\n\n");
    return res.status(200).json({ text: summary });
  } catch(e:any){
    return res.status(500).json({ error: e?.message || "describe_setting error" });
  }
}


