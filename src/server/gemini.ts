const API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export async function geminiVisionJSON(parts: Array<{text?:string; inlineData?:{mimeType:string; data:string}}>, _schema: any) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const sys = "You are a precise visual interpreter. Respond ONLY with JSON that conforms to the provided TypeScript type. Use hex colors like #RRGGBB. If uncertain, leave fields undefined rather than guessing wildly.";
  const req = {
    contents: [{ role:"user", parts: [{ text: sys }, ...parts, { text: "Return JSON ONLY." }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
  } as any;
  const res = await fetch(`${API}?key=${key}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(txt);
  return parsed;
}


