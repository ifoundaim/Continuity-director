import React, { useEffect, useMemo, useState } from "react";
import type { CharacterProfile } from "../lib/types";
import { getTotals, bump } from "../lib/quota";

const cameraPresets = {
  interview: { fov_deg: 50, pos: [6, 5.0, 5.2], look_at: [10, 7, 4.8] },
  coach:     { fov_deg: 45, pos: [4, 7.5, 4.8], look_at: [10, 7, 4.8] },
  glass:     { fov_deg: 45, pos: [15, 6.0, 5.0], look_at: [10, 7, 4.8] },
  low:       { fov_deg: 35, pos: [9, 6.5, 3.0],  look_at: [10, 7, 4.8] }
};

function uid() { return Math.random().toString(36).slice(2, 10); }
const debounce = <T extends any[]>(fn: (...a:T)=>void, ms=300) => {
  let t: any; return (...a:T) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); };
};

export default function Home() {
  const [img, setImg] = useState<string | null>(null);
  const [editImg, setEditImg] = useState<string | null>(null);
  const [objImg, setObjImg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("If Em height drifted, correct to 160.02 cm. Remove table cup.");
  const [refs, setRefs] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<CharacterProfile[]>([
    { id: uid(), name: "Aim", height_cm: 170, description: "brown-blonde wavy hair tied back, ocean-blue eyes, dark hoodie over tee, round glowing pendant", images_base64: [] },
    { id: uid(), name: "Em",  height_cm: 160.02, description: "shoulder-length dark hair, light blazer over tee", images_base64: [] }
  ]);

  // PREVIEW STATE
  const [cameraKey, setCameraKey] = useState<keyof typeof cameraPresets>("interview");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [preview, setPreview] = useState<{prompt:string; counts:{refImages:number; characterImages:number; characters:number}; length:number} | null>(null);
  const updatePreview = useMemo(()=>debounce(async (_profiles: CharacterProfile[], _refs: string[], _cameraKey: string) => {
    const r = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ camera: cameraPresets[_cameraKey as keyof typeof cameraPresets], extra: "Anime style enforced; SceneLock fixed.", profiles: _profiles, refImagesBase64: _refs })
    });
    const j = await r.json(); setPreview(j);
  }, 300), []);

  useEffect(()=> { updatePreview(profiles, refs, cameraKey); }, [profiles, refs, cameraKey, updatePreview]);

  // QUOTA STATE
  const [quota, setQuota] = useState(() => {
    // Initialize with safe defaults for SSR
    if (typeof window === 'undefined') {
      return { date: '', counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0, limit: 100, remaining: 100 };
    }
    return getTotals();
  });
  
  useEffect(() => {
    // Load actual quota on client side
    setQuota(getTotals());
    const t = setInterval(() => setQuota(getTotals()), 30_000); // refresh every 30s in case of other tabs
    return () => clearInterval(t);
  }, []);

  // helpers
  const handleRefs = async (files: FileList | null) => {
    if (!files) return;
    const readers = [...files].map(f => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f); }));
    setRefs(await Promise.all(readers));
  };
  const updateProfile = (id: string, patch: Partial<CharacterProfile>) =>
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const addProfile = () => setProfiles(ps => [...ps, { id: uid(), name: "New Character", height_cm: 170, description: "", images_base64: [] }]);
  const removeProfile = (id: string) => setProfiles(ps => ps.filter(p => p.id !== id));
  const uploadFor = async (id: string, files: FileList | null) => {
    if (!files) return;
    const readers = [...files].map(f => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f); }));
    const imgs = await Promise.all(readers);
    updateProfile(id, { images_base64: [...(profiles.find(p=>p.id===id)?.images_base64||[]), ...imgs] });
  };
  const autoDescribe = async (id: string) => {
    const p = profiles.find(x => x.id === id)!;
    if (!p.images_base64.length) return alert("Upload 1–4 reference images first.");
    const r = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagesBase64: p.images_base64.slice(0,4) })});
    bump("describe"); setQuota(getTotals());
    const j = await r.json(); if (j.error) return alert(j.error);
    updateProfile(id, { description: j.description });
  };

  // actions
  const gen = async (preset: keyof typeof cameraPresets) => {
    if (quota.remaining <= 0) { alert("Daily budget reached (100). Try again tomorrow or adjust."); return; }
    setCameraKey(preset);
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ camera: cameraPresets[preset], extra: "Anime style enforced; SceneLock fixed.", profiles, refImagesBase64: refs })
    });
    bump("generate"); setQuota(getTotals());
    if (!r.ok) { alert(await r.text()); return; }
    const b = await r.arrayBuffer();
    setImg(`data:image/png;base64,${Buffer.from(b).toString("base64")}`);
  };

  const edit = async () => {
    if (!editImg) return;
    const r = await fetch("/api/edit", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ instruction, imageBase64: editImg })});
    bump("edit"); setQuota(getTotals());
    if (!r.ok) { alert(await r.text()); return; }
    const b = await r.arrayBuffer();
    setImg(`data:image/png;base64,${Buffer.from(b).toString("base64")}`);
  };

  const fuse = async () => {
    if (!img || !objImg) return;
    const r = await fetch("/api/fuse", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ baseImageBase64: img, objectImageBase64: objImg, placement: "place centered on TV; treat as decal; match LED reflections" }) });
    bump("fuse"); setQuota(getTotals());
    if (!r.ok) { alert(await r.text()); return; }
    const b = await r.arrayBuffer();
    setImg(`data:image/png;base64,${Buffer.from(b).toString("base64")}`);
  };

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Continuity Director + SceneLock (YC Room)</h1>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop: 6 }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          <strong>Daily budget:</strong> {quota.total}/{quota.limit} used • {quota.remaining} left
        </div>
        <div style={{ flex: "0 0 220px", height: 8, background: "#eee", borderRadius: 6, overflow:"hidden" }}>
          <div style={{
            width: `${Math.min(100, (quota.total / quota.limit) * 100)}%`,
            height: "100%"
          }} />
        </div>
      </div>
      <p><strong>Style:</strong> Anime / cel-shaded enforced. Setting & scale locked.</p>

      <section>
        <h2>Character Cards</h2>
        <button onClick={addProfile} style={{ marginBottom: 12 }}>+ Add Character</button>
        {profiles.map(p => (
          <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input value={p.name} onChange={e=>updateProfile(p.id,{name:e.target.value})} style={{ width: 180 }} />
              <label>Height (cm):</label>
              <input type="number" value={p.height_cm} onChange={e=>updateProfile(p.id,{height_cm: Number(e.target.value)})} style={{ width: 100 }} />
              <button onClick={()=>removeProfile(p.id)} style={{ marginLeft: "auto" }}>Remove</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <textarea value={p.description} onChange={e=>updateProfile(p.id,{description:e.target.value})} placeholder="Describe appearance…" rows={3} style={{ width: "100%" }} />
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="file" accept="image/*" multiple onChange={e=>uploadFor(p.id, e.target.files)} />
                <button onClick={()=>autoDescribe(p.id)}>Auto-Describe</button>
              </div>
              {p.images_base64.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.images_base64.map((s, i) => <img key={i} src={s} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #ccc" }} />)}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Global Reference Images (floor / elevation / grid)</h2>
        <input type="file" accept="image/*" multiple onChange={e=>handleRefs(e.target.files)} />
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>1) Generate Shots</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          {Object.keys(cameraPresets).map(k => (
            <button key={k} onClick={() => { setCameraKey(k as any); gen(k as any); }}>{k}</button>
          ))}
          <span style={{ marginLeft: 8, opacity: 0.7 }}>current: {cameraKey}</span>
        </div>

        {/* PROMPT PREVIEW */}
        <details open={previewOpen} onToggle={e=>setPreviewOpen((e.target as HTMLDetailsElement).open)}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Prompt Preview (free)</summary>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>
              Characters: {preview?.counts.characters ?? 0} • Global refs: {preview?.counts.refImages ?? 0} • Char ref images: {preview?.counts.characterImages ?? 0} • Length: {preview?.length ?? 0} chars
              <button
                style={{ marginLeft: 12 }}
                onClick={() => navigator.clipboard.writeText(preview?.prompt || "")}
              >Copy</button>
            </div>
            <textarea readOnly value={preview?.prompt || ""} rows={14} style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }} />
          </div>
        </details>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>2) Edit-Only (Surgical)</h2>
        <input type="file" accept="image/*" onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          const reader = new FileReader(); reader.onload = () => setEditImg(reader.result as string); reader.readAsDataURL(f);
        }} />
        <input value={instruction} onChange={e=>setInstruction(e.target.value)} style={{ width: 500, marginLeft: 8 }} />
        <button onClick={edit} style={{ marginLeft: 8 }}>Run Edit</button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>3) Fuse Object onto TV</h2>
        <input type="file" accept="image/*" onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          const reader = new FileReader(); reader.onload = () => setObjImg(reader.result as string); reader.readAsDataURL(f);
        }} />
        <button onClick={fuse} style={{ marginLeft: 8 }}>Fuse</button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Output</h2>
        {img && <img src={img} style={{ maxWidth: "100%", border: "1px solid #ddd", borderRadius: 8 }} />}
      </section>
    </main>
  );
}

