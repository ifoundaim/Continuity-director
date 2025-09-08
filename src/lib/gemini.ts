const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";

export async function geminiImageCall(apiKey: string, contents: any) {
  // Stub mode for demos/tests: return tiny 1x1 PNG
  if (process.env.STUB_MODE === "1" || process.env.NEXT_PUBLIC_STUB_MODE === "1") {
    const oneByOnePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    return Buffer.from(oneByOnePngBase64, "base64");
  }
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p: any) => p.inline_data?.mime_type?.startsWith("image/"));
  if (!img) throw new Error("No image in response");
  return Buffer.from(img.inline_data.data, "base64");
}

export const textPart = (text: string) => ({ text });
export const imagePart = (buffer: Buffer, mime = "image/png") => ({
  inline_data: { data: buffer.toString("base64"), mime_type: mime }
});

