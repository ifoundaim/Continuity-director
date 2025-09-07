import type { NextApiRequest, NextApiResponse } from "next";

// For now, just return a simple arrangement suggestion. Later we can call Gemini to analyze refs.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { description, images, units } = req.body as { description?: string; images?: string[]; units?: "ft"|"cm" };
    // naive stub: just acknowledge and return empty (or we could tweak sizes based on keywords)
    res.json({ ok:true, objects: undefined });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e.message });
  }
}


