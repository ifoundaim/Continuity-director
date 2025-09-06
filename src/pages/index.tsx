import React, { useEffect, useMemo, useState } from "react";
import type { CharacterProfile, SettingProfile } from "../lib/types";
import { loadProfiles, saveProfiles, loadSetting, saveSetting } from "../lib/storage";
import { getTotals, bump } from "../lib/quota";

const cameraPresets = {
  interview: { fov_deg: 50, pos: [6, 5.0, 5.2], look_at: [10, 7, 4.8] },
  coach:     { fov_deg: 45, pos: [4, 7.5, 4.8], look_at: [10, 7, 4.8] },
  glass:     { fov_deg: 45, pos: [15, 6.0, 5.0], look_at: [10, 7, 4.8] },
  low:       { fov_deg: 35, pos: [9, 6.5, 3.0],  look_at: [10, 7, 4.8] }
};

function uid() { return Math.random().toString(36).slice(2, 10); }
const debounce = <T extends any[]>(fn: (...a:T)=>void, ms=300) => { let t:any; return (...a:T)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

export default function Home() {
  const [img, setImg] = useState<string | null>(null);
  const [editImg, setEditImg] = useState<string | null>(null);
  const [objImg, setObjImg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("If Em height drifted, correct to 160.02 cm. Remove table cup.");

  // PERSISTED STATE
  const defaultProfiles: CharacterProfile[] = [
    { id: uid(), name: "Aim", height_cm: 170, description: "brown-blonde wavy hair tied back, ocean-blue eyes, dark hoodie over tee, round glowing pendant", images_base64: [] },
    { id: uid(), name: "Em",  height_cm: 160.02, description: "shoulder-length dark hair, light blazer over tee", images_base64: [] }
  ];
  const [profiles, setProfiles] = useState<CharacterProfile[]>(loadProfiles(defaultProfiles));
  const [setting, setSetting]   = useState<SettingProfile>(loadSetting<SettingProfile>({ description: "", images_base64: [] }));
  useEffect(()=>{ saveProfiles(profiles); }, [profiles]);
  useEffect(()=>{ saveSetting(setting); }, [setting]);

  // QUOTA
  const [quota, setQuota] = useState(getTotals());
  useEffect(() => { const t = setInterval(() => setQuota(getTotals()), 30_000); return () => clearInterval(t); }, []);

  // PROMPT PREVIEW
  const [cameraKey, setCameraKey] = useState<keyof typeof cameraPresets>("interview");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [preview, setPreview] = useState<{prompt:string; counts:{refImages:number; characterImages:number; characters:number}; length:number} | null>(null);
  const updatePreview = useMemo(()=>debounce(async (_profiles: CharacterProfile[], _setting: SettingProfile, _cameraKey: string) => {
    const r = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ camera: cameraPresets[_cameraKey as keyof typeof cameraPresets], extra: "Anime style enforced; SceneLock fixed.", profiles: _profiles, settingProfile: _setting })
    });
    const j = await r.json(); setPreview(j);
  }, 300), []);
  useEffect(()=>{ updatePreview(profiles, setting, cameraKey); }, [profiles, setting, cameraKey, updatePreview]);

  // Character helpers
  const updateProfile = (id: string, patch: Partial<CharacterProfile>) => setProfiles(ps => ps.map(p => p.id === id ? ({ ...p, ...patch }) : p));
  const addProfile    = () => setProfiles(ps => [...ps, { id: uid(), name: "New Character", height_cm: 170, description: "", images_base64: [] }]);
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
    const r = await fetch("/api/describe", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ imagesBase64: p.images_base64.slice(0,4) })});
    const j = await r.json(); if (j.error) return alert(j.error);
    updateProfile(id, { description: j.description }); bump("describe"); setQuota(getTotals());
  };

  // Setting profile uploads
  const uploadSetting = async (files: FileList | null) => {
    if (!files) return;
    const readers = [...files].map(f => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f); }));
    const imgs = await Promise.all(readers);
    setSetting(s => ({ ...s, images_base64: [...s.images_base64, ...imgs] }));
  };

  // Actions
  const gen = async (preset: keyof typeof cameraPresets) => {
    if (quota.remaining <= 0) { alert("Daily budget reached (100)"); return; }
    setCameraKey(preset);
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ camera: cameraPresets[preset], extra: "Anime style enforced; SceneLock fixed.", profiles, settingProfile: setting })
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
    <main style={{ fontFamily:"ui-sans-serif, system-ui", padding:24, maxWidth:1100, margin:"0 auto" }}>
      <h1>Continuity Director + SceneLock (YC Room)</h1>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:6 }}>
        <div style={{ fontSize:13, opacity:0.85 }}><strong>Daily budget:</strong> {quota.total}/{quota.limit} used • {quota.remaining} left</div>
        <div style={{ flex:"0 0 220px", height:8, background:"#eee", borderRadius:6, overflow:"hidden" }}>
          <div style={{ width:`${Math.min(100, (quota.total/quota.limit)*100)}%`, height:"100%" }} />
        </div>
      </div>
      <p><strong>Style:</strong> Anime / cel-shaded enforced. Setting & scale locked.</p>

      {/* Setting Profile */}
      <section>
        <h2>Setting Profile</h2>
        <textarea
          value={setting.description}
          onChange={e=>setSetting(s=>({ ...s, description: e.target.value }))}
          placeholder="Extra setting notes (e.g., YC decal on glass; chair centers 2.5 ft; neutral tones...)"
          rows={3}
          style={{ width:"100%" }}
        />
        <div style={{ marginTop:6, display:"flex", gap:8, alignItems:"center" }}>
          <input type="file" accept="image/*" multiple onChange={e=>uploadSetting(e.target.files)} />
          <span style={{ fontSize:12, opacity:0.8 }}>{setting.images_base64.length} refs</span>
        </div>
        {setting.images_base64.length > 0 && (
          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
            {setting.images_base64.map((s,i)=><img key={i} src={s} style={{ width:90, height:90, objectFit:"cover", borderRadius:6, border:"1px solid #ccc" }}/>)}
          </div>
        )}
      </section>

      {/* Character Cards */}
      <section style={{ marginTop:16 }}>
        <h2>Character Cards</h2>
        <button onClick={addProfile} style={{ marginBottom:12 }}>+ Add Character</button>
        {profiles.map(p=>(
          <div key={p.id} style={{ border:"1px solid #ddd", borderRadius:8, padding:12, marginBottom:12 }}>
            <div style={{ display:"flex", gap:12, alignItems:"center" }}>
              <input value={p.name} onChange={e=>updateProfile(p.id,{name:e.target.value})} style={{ width:180 }} />
              <label>Height (cm):</label>
              <input type="number" value={p.height_cm} onChange={e=>updateProfile(p.id,{height_cm:Number(e.target.value)})} style={{ width:100 }} />
              <button onClick={()=>removeProfile(p.id)} style={{ marginLeft:"auto" }}>Remove</button>
            </div>
            <div style={{ marginTop:8 }}>
              <textarea value={p.description} onChange={e=>updateProfile(p.id,{description:e.target.value})} placeholder="Describe appearance…" rows={3} style={{ width:"100%" }} />
              <div style={{ marginTop:6, display:"flex", gap:8, alignItems:"center" }}>
                <input type="file" accept="image/*" multiple onChange={e=>uploadFor(p.id, e.target.files)} />
                <button onClick={()=>autoDescribe(p.id)}>Auto-Describe</button>
                <span style={{ fontSize:12, opacity:0.8 }}>{p.images_base64.length} refs</span>
              </div>
              {p.images_base64.length>0 && (
                <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
                  {p.images_base64.map((s,i)=><img key={i} src={s} style={{ width:80, height:80, objectFit:"cover", borderRadius:6, border:"1px solid #ccc" }}/>)}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Generate + Preview */}
      <section style={{ marginTop:16 }}>
        <h2>1) Generate Shots</h2>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
          {Object.keys(cameraPresets).map(k=>(
            <button key={k} onClick={()=>gen(k as any)}>{k}</button>
          ))}
          <span style={{ marginLeft:8, opacity:0.7 }}>current: {cameraKey}</span>
        </div>

        <details open={previewOpen} onToggle={e=>setPreviewOpen((e.target as HTMLDetailsElement).open)}>
          <summary style={{ cursor:"pointer", fontWeight:600 }}>Prompt Preview (free)</summary>
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:12, marginBottom:6, opacity:0.8 }}>
              Characters: {preview?.counts.characters ?? 0} • Setting refs: {preview?.counts.refImages ?? 0} • Char ref images: {preview?.counts.characterImages ?? 0} • Length: {preview?.length ?? 0}
              <button style={{ marginLeft:12 }} onClick={()=>navigator.clipboard.writeText(preview?.prompt || "")}>Copy</button>
            </div>
            <textarea readOnly value={preview?.prompt || ""} rows={14} style={{ width:"100%", fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }} />
          </div>
        </details>
      </section>

      {/* Edit / Fuse / Output (unchanged) */}
      <section style={{ marginTop:16 }}>
        <h2>2) Edit-Only (Surgical)</h2>
        <input type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>setEditImg(fr.result as string); fr.readAsDataURL(f); }} />
        <input value={instruction} onChange={e=>setInstruction(e.target.value)} style={{ width: 500, marginLeft:8 }} />
        <button onClick={edit} style={{ marginLeft:8 }}>Run Edit</button>
      </section>

      <section style={{ marginTop:16 }}>
        <h2>3) Fuse Object onto TV</h2>
        <input type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>setObjImg(fr.result as string); fr.readAsDataURL(f); }} />
        <button onClick={fuse} style={{ marginLeft:8 }}>Fuse</button>
      </section>

      <section style={{ marginTop:16 }}>
        <h2>Output</h2>
        {img && <img src={img} style={{ maxWidth:"100%", border:"1px solid #ddd", borderRadius:8 }} />}
      </section>
    </main>
  );
}