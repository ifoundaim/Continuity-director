const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";

export async function geminiImageCall(apiKey: string, contents: any) {
  // Stub mode for demos/tests: return tiny 1x1 PNG
  if (process.env.STUB_MODE === "1" || process.env.NEXT_PUBLIC_STUB_MODE === "1") {
    const oneByOnePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    return Buffer.from(oneByOnePngBase64, "base64");
  }
  // Defensive: convert any inline SVG parts to PNG to satisfy Gemini
  try{
    for (const c of (contents||[])){
      const parts = c?.parts || [];
      for (const p of parts){
        const data = p?.inline_data || p?.inlineData; // accept both spellings
        const mime = data?.mime_type || data?.mimeType;
        if (data && mime === "image/svg+xml"){
          try{
            const mod:any = await import("sharp");
            const sharp = mod.default || mod;
            const buf = Buffer.from(data.data, "base64");
            const png = await sharp(buf).png().toBuffer();
            if (p.inline_data){ p.inline_data = { data: png.toString("base64"), mime_type: "image/png" }; }
            if (p.inlineData){ p.inlineData = { data: png.toString("base64"), mimeType: "image/png" }; }
          } catch {}
        }
      }
    }
  } catch {}
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p: any) =>
    (p.inline_data?.mime_type?.startsWith("image/")) ||
    (p.inlineData?.mimeType?.startsWith("image/")) ||
    (p.fileData?.mimeType?.startsWith?.("image/") && p.fileData?.fileUri)
  );
  if (!imgPart) throw new Error("No image in response");
  if (imgPart.inline_data) return Buffer.from(imgPart.inline_data.data, "base64");
  if (imgPart.inlineData) return Buffer.from(imgPart.inlineData.data, "base64");
  if (imgPart.fileData?.fileUri){
    const r = await fetch(imgPart.fileData.fileUri);
    if(!r.ok) throw new Error(`Failed to fetch fileData: ${await r.text()}`);
    const ab = await r.arrayBuffer();
    return Buffer.from(new Uint8Array(ab));
  }
  throw new Error("No image in response");
}

export const textPart = (text: string) => ({ text });
export const imagePart = (buffer: Buffer, mime = "image/png") => ({
  inline_data: { data: buffer.toString("base64"), mime_type: mime }
});

