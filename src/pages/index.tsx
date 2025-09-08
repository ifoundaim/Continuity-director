import React, { useEffect, useMemo, useState } from "react";
import type { CharacterProfile, SettingProfile } from "../lib/types";
import { loadProfiles, saveProfiles, loadSetting, saveSetting } from "../lib/storage";
import { loadPlacements, positionLockText, CharPlacement } from "../lib/placements";
import { renderOverlayPNG } from "../lib/overlay";
import type { CameraPose } from "../lib/camera";

const cameraPresets = {
  interview: { fov_deg: 50, pos: [6, 5.0, 5.2], look_at: [10, 7, 4.8] },
  coach:     { fov_deg: 45, pos: [4, 7.5, 4.8], look_at: [10, 7, 4.8] },
  glass:     { fov_deg: 45, pos: [15, 6.0, 5.0], look_at: [10, 7, 4.8] },
  low:       { fov_deg: 35, pos: [9, 6.5, 3.0],  look_at: [10, 7, 4.8] }
};

function uid() { return Math.random().toString(36).slice(2, 10); }
const debounce = <T extends any[]>(fn: (...a:T)=>void, ms=300) => { let t:any; return (...a:T)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

type PreviewInfo = { prompt:string; counts:{refImages:number; characterImages:number; characters:number}; length:number };

export default function Home() {
  // ---------- persisted state ----------
  // Use deterministic defaults for SSR to avoid hydration mismatch
  const defaultProfiles: CharacterProfile[] = [
    { id: "aim", name: "Aim", height_cm: 170, description: "", images_base64: [] },
    { id: "em",  name: "Em",  height_cm: 160.02, description: "", images_base64: [] }
  ];
  const [profiles, setProfiles] = useState<CharacterProfile[]>(defaultProfiles);
  const [setting, setSetting]   = useState<SettingProfile>({ description: "", images_base64: [] });
  // Load persisted values on client after mount (keeps SSR/CSR initial markup identical)
  useEffect(()=>{ setProfiles(loadProfiles(defaultProfiles)); }, []);
  useEffect(()=>{ setSetting(loadSetting<SettingProfile>({ description: "", images_base64: [] })); }, []);
  useEffect(()=>saveProfiles(profiles), [profiles]);
  useEffect(()=>saveSetting(setting), [setting]);
  useEffect(()=>{
    setPlacements(loadPlacements());
    (async ()=>{
      try{
        const r = await fetch("/api/get-scene");
        const j = await r.json();
        if (j.ok) setSceneModel(j.scene);
      } catch {}
    })();
  }, []);

  // ---------- local ui state ----------
  const [step, setStep] = useState<1|2|3|4|5|6>(1);
  const [img, setImg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("If Em height drifted, correct to 160.02 cm. Remove table cup.");
  const [objImg, setObjImg] = useState<string | null>(null);
  const [editImg, setEditImg] = useState<string | null>(null);
  const [useNearest, setUseNearest] = useState(true);
  const [cameraKey, setCameraKey] = useState<keyof typeof cameraPresets>("interview");
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [useOverlayLock, setUseOverlayLock] = useState(true);
  const [placements, setPlacements] = useState<CharPlacement[]>([]);
  const [sceneModel, setSceneModel] = useState<any | null>(null);
  type SettingMeta = { id:string; name:string; updatedAt:number };
  const [settings, setSettings] = useState<SettingMeta[]>([]);
  const [activeSettingId, setActiveSettingId] = useState<string|undefined>(undefined);
  const [assistantMsg, setAssistantMsg] = useState("");
  const [usageRemaining, setUsageRemaining] = useState<number|undefined>(undefined);
  const [shotbook, setShotbook] = useState<{ id:string; camera:any; created_at:number; file:string }[]>([]);

  // ---------- validation ----------
  const charValid = profiles.every(p => p.name.trim().length>0 && p.height_cm>0) && profiles.length>0;
  const charRefsOk = profiles.some(p => (p.images_base64||[]).length >= 1);
  const settingOk = (setting.description?.length ?? 0) >= 0; // free-form notes acceptable
  const readyForRenderKit = charValid && charRefsOk && settingOk;
  const readyForShots = readyForRenderKit; // gates

  // ---------- helpers ----------
  const updateProfile = (id: string, patch: Partial<CharacterProfile>) =>
    setProfiles(ps => ps.map(p => p.id === id ? ({ ...p, ...patch }) : p));
  const addProfile = () => setProfiles(ps => [...ps, { id: uid(), name: "New Character", height_cm: 170, description: "", images_base64: [] }]);
  const removeProfile = (id: string) => setProfiles(ps => ps.filter(p => p.id !== id));

  const uploadFiles = (files: FileList | null) =>
    files ? Promise.all([...files].map(f => new Promise<string>(r => { const fr = new FileReader(); fr.onload=()=>r(fr.result as string); fr.readAsDataURL(f); }))) : Promise.resolve([]);

  const autoDescribe = async (imgs: string[]) => {
    const r = await fetch("/api/describe", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ imagesBase64: imgs.slice(0,4) })});
    const j = await r.json(); if (j.error) throw new Error(j.error);
    return j.description as string;
  };

  // Prompt preview
  const updatePreview = useMemo(()=>debounce(async (_profiles: CharacterProfile[], _setting: SettingProfile, _camKey: string) => {
    const r = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ camera: cameraPresets[_camKey as keyof typeof cameraPresets], extra: "Anime style enforced; SceneLock fixed.", profiles, settingProfile: _setting })
    });
    const j = await r.json(); setPreview(j);
  }, 250), [profiles]);
  useEffect(()=>{ updatePreview(profiles as any, setting, cameraKey); }, [profiles, setting, cameraKey, updatePreview]);
  useEffect(()=>{
    (async ()=>{
      const r = await fetch("/api/settings/list"); const j = await r.json();
      if (j.ok){ setSettings(j.list); setActiveSettingId(j.activeId); }
    })();
  }, []);
  useEffect(()=>{
    (async ()=>{ try{ const r = await fetch('/api/quota'); const j = await r.json(); if(j.ok) setUsageRemaining(j.usage?.remaining); } catch{} })();
  }, []);
  useEffect(()=>{
    (async ()=>{
      try { const r = await fetch("/api/shotbook"); const j = await r.json(); if (j.ok) setShotbook(j.shots||[]); } catch {}
    })();
  }, [img]);

  // Actions
  const gen = async (preset: keyof typeof cameraPresets) => {
    setCameraKey(preset);
    const presetCam = cameraPresets[preset];
    const cam: CameraPose = { fovDeg: presetCam.fov_deg, pos:{ x:presetCam.pos[0], y:presetCam.pos[1], z:presetCam.pos[2] }, lookAt:{ x:presetCam.look_at[0], y:presetCam.look_at[1], z:presetCam.look_at[2] }, imgW:1024, imgH:576 };
    let overlayBase64: string | null = null;
    let posLock = "";
    if (useOverlayLock && sceneModel && placements?.length){
      overlayBase64 = renderOverlayPNG(sceneModel, cam, placements.map(p=>({ name:p.name, heightCm:p.heightCm, x:p.x, y:p.y, facingDeg:p.facingDeg })), 1024, 576);
      posLock = positionLockText(placements);
    }
    const r = await fetch("/api/generate", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ camera: presetCam, extra: "Anime style enforced; SceneLock fixed.", profiles, settingProfile: setting, useNearestRefs: useNearest, overlayBase64, charPlacements: placements, positionLock: posLock, settingId: activeSettingId })});
    if (!r.ok) return alert(await r.text());
    const b = await r.arrayBuffer();
    const remain = r.headers.get('X-Usage-Remaining'); if (remain) setUsageRemaining(+remain);
    setImg(`data:image/png;base64,${Buffer.from(b).toString("base64")}`);
    setStep(4);
  };

  // Render Kit triggers
  async function runKit(targets: string[]) {
    const r = await fetch("/api/build_kit",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ targets, dryRun:false, profiles, settingProfile: setting })});
    const j = await r.json(); if(!j.ok){ alert(j.error||"Build failed"); return; }
    alert(`Built ${j.items.length} items.\n(See .cache/render_kit/ in project.)`);
  }

  async function exportZip() {
    const r = await fetch("/api/export_pack", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ profiles, settingProfile: setting })});
    if (!r.ok) { alert(await r.text()); return; }
    const blob = await r.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "continuity-pack.zip"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ---------- UI ----------
  const StepHeader = ({ n, title, done, locked }:{ n:number; title:string; done?:boolean; locked?:boolean }) => {
    const bubble = `step__num ${done ? "step__num--ok" : locked ? "step__num--lock" : "step__num--active"}`;
    return (
      <div className="step" style={{ marginTop:18 }}>
        <div className={bubble}>{n}</div>
        <h2>{title}</h2>
        {locked && <small>(complete previous steps)</small>}
      </div>
    );
  };

  return (
    <>
    <main className="container">
      <h1>Continuity Director + SceneLock</h1>
      <p style={{ marginTop:-4 }}>
        <a href="/designer" style={{ color:"#7c9cff" }}>Open Setting Designer</a>
      </p>
      <p><strong>Style:</strong> Anime / cel-shaded only. Setting & scale locked. Wireframe and palette included for stability.</p>
      <div className="progress"><div className="progress__bar" style={{ width: `${Math.min(100, (step/6)*100)}%` }} /></div>

      {/* Step 1: Characters */}
      <section className="card">
        <StepHeader n={1} title="Create Characters" done={charValid && charRefsOk} />
        <p>Upload 1–4 refs per character, auto-describe, set exact height (cm). At least one character must have refs.</p>
        <div className="row" style={{ marginBottom:8 }}>
          <button className="btn" onClick={addProfile}>+ Add Character</button>
        </div>
        {profiles.map(p=>
          <div key={p.id} className="card">
            <div className="row">
              <input className="input" value={p.name} onChange={e=>updateProfile(p.id, { name: e.target.value })} placeholder="Name" />
              <label>Height (cm):</label>
              <input className="input" type="number" value={p.height_cm} onChange={e=>updateProfile(p.id, { height_cm: Number(e.target.value) })} />
              <button className="btn btn--danger" onClick={()=>removeProfile(p.id)}>Remove</button>
            </div>
            <div className="spacer" />
            <textarea className="textarea" value={p.description} onChange={e=>updateProfile(p.id, { description: e.target.value })} rows={3} placeholder="Describe appearance…" />
            <div className="row" style={{ marginTop:8 }}>
              <input type="file" accept="image/*" multiple onChange={async e=>{
                const imgs = await uploadFiles(e.target.files);
                updateProfile(p.id, { images_base64: [...(p.images_base64||[]), ...imgs] });
              }} />
              <button className="btn" onClick={async ()=>{
                if(!(p.images_base64||[]).length) return alert("Upload 1–4 refs first.");
                try { const d = await autoDescribe(p.images_base64!); updateProfile(p.id, { description: d }); } catch(e:any){ alert(e.message); }
              }}>Auto-Describe</button>
              <span className="chip">{p.images_base64?.length||0} refs</span>
            </div>
            {!!p.images_base64?.length && (
              <div className="row" style={{ marginTop:8 }}>
                {p.images_base64!.map((s,i)=><img key={i} src={s} className="thumb" />) }
              </div>
            )}
          </div>
        )}
        <div className="row" style={{ marginTop:6 }}>
          <button className="btn btn--primary" onClick={()=>setStep(2)} disabled={!(charValid && charRefsOk)}>Continue to Setting →</button>
          {!charValid && <span className="inline-note">Add names & heights.</span>}
          {charValid && !charRefsOk && <span className="inline-note">At least one character needs reference images.</span>}
        </div>
      </section>

      {/* Step 2: Setting */}
      <section className="card">
        <StepHeader n={2} title="Design Setting" done={settingOk} locked={step<2} />
        <p>Upload room refs and write exact details (objects, sizes, centers, spacings). This becomes the SceneLock.</p>
        <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:10 }}>
          <label>Setting:</label>
          <select value={activeSettingId || ""} onChange={async e=>{
            const id = (e.target.value || undefined) as any;
            await fetch("/api/settings/activate", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id }) });
            setActiveSettingId(id);
            const r = await fetch("/api/get-scene"); const j = await r.json(); if(j.ok) setSceneModel(j.scene);
          }}>
            <option value="">(fallback: yc_room_v1)</option>
            {settings.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <a href="/designer" style={{ marginLeft:6, fontSize:12 }}>Open Setting Designer ↗</a>
        </div>
        <textarea className="textarea" value={setting.description} onChange={e=>setSetting(s=>({ ...s, description: e.target.value }))} rows={3} placeholder="Example: YC glass wall with mullions every 3.5 ft; 84×36 in table centered at (10 ft, 7 ft); chair seat height 18 in; 65” TV at (19 ft, 7 ft); add YC decal band at mid-glass." />
        <div className="row" style={{ marginTop:8 }}>
          <input type="file" accept="image/*" multiple onChange={async e=>{
            const imgs = await uploadFiles(e.target.files);
            setSetting(s => ({ ...s, images_base64: [...(s.images_base64||[]), ...imgs] }));
          }} />
          <span className="chip">{setting.images_base64?.length || 0} refs</span>
          <label className="inline-note"><input type="checkbox" checked={useNearest} onChange={e=>setUseNearest(e.target.checked)} /> Use nearest past refs</label>
          <span className="inline-note">Ref order: Palette → Wireframe → Plates → Char refs → Continuity</span>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center", marginTop:8 }}>
          <label style={{ display:"flex", alignItems:"center", gap:6 }}>
            <input type="checkbox" checked={useOverlayLock} onChange={e=>setUseOverlayLock(e.target.checked)} />
            Use overlay & Position Lock
          </label>
          <span style={{ fontSize:12, color:"#8a93a5" }}>
            {placements.length ? `${placements.length} placement(s) loaded from Designer` : "No placements yet (open Setting Designer → add Characters)"}
          </span>
        </div>
        {!!setting.images_base64?.length && (
          <div className="row" style={{ marginTop:8 }}>
            {setting.images_base64!.map((s,i)=><img key={i} src={s} className="thumb" />) }
          </div>
        )}
        <div className="row" style={{ marginTop:6 }}>
          <button className="btn btn--primary" onClick={()=>setStep(3)} disabled={!settingOk}>Continue to Render Kit →</button>
        </div>
      </section>

      {/* Step 3: Render Kit */}
      <section className="card">
        <StepHeader n={3} title="Build Render Kit (anchors & plates)" locked={step<3} />
        <p>Generate canonical plates that lock layout, scale and palette. Consumes image budget.</p>
        <div className="row">
          <button className="btn" disabled={!readyForRenderKit} onClick={()=>runKit(["character_sheets"]) }>Character Sheets</button>
          <button className="btn" disabled={!readyForRenderKit} onClick={()=>runKit(["floor_plan"]) }>Floor Plan</button>
          <button className="btn" disabled={!readyForRenderKit} onClick={()=>runKit(["elevations"]) }>Elevations</button>
          <button className="btn" disabled={!readyForRenderKit} onClick={()=>runKit(["perspectives"]) }>Perspective Plates (line+color)</button>
          <button className="btn btn--primary" disabled={!readyForRenderKit} onClick={()=>runKit(["full_pack"]) }>Full Pack</button>
        </div>
        <div className="row" style={{ marginTop:6 }}>
          <button className="btn btn--primary" onClick={()=>setStep(4)} disabled={!readyForShots}>Continue to Direct Shots →</button>
        </div>
      </section>

      {/* Step 4: Direct Shots */}
      <section className="card">
        <StepHeader n={4} title="Direct Shots" locked={step<4} />
        <div className="row" style={{ marginBottom:8 }}>
          {Object.keys(cameraPresets).map(k=>
            <button key={k} className="btn btn--primary" onClick={()=>gen(k as any)} disabled={!readyForShots}>{k}</button>
          )}
          <span className="muted">current: {cameraKey}</span>
        </div>

        <details>
          <summary>Assistant</summary>
          <div className="row" style={{ marginTop:8 }}>
            <input className="input" style={{ flex:1, minWidth:280 }} placeholder="e.g., Aim speaking, show glass wall" value={assistantMsg} onChange={e=>setAssistantMsg(e.target.value)} />
            <button className="btn" onClick={async()=>{
              const r = await fetch('/api/assistant',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ message: assistantMsg, settingId: activeSettingId })});
              const j = await r.json(); if (!j.ok) return alert(j.error||'Assistant error');
              if (j.extra) setSetting(s=>({ ...s, description: [s.description, j.extra].filter(Boolean).join('\n') }));
              if (j.camera && cameraPresets[j.camera as keyof typeof cameraPresets]) await gen(j.camera);
            }}>Interpret</button>
          </div>
        </details>

        <details open>
          <summary>Prompt Preview (free)</summary>
          <div style={{ marginTop:8 }}>
            <div className="muted" style={{ marginBottom:6 }}>
              Characters: {preview?.counts.characters ?? 0} • Setting refs: {preview?.counts.refImages ?? 0} • Char ref images: {preview?.counts.characterImages ?? 0} • Length: {preview?.length ?? 0}
              <button className="btn" style={{ marginLeft:12 }} onClick={()=>navigator.clipboard.writeText(preview?.prompt || "")}>Copy</button>
              {typeof usageRemaining === 'number' && <span className="inline-note" style={{ marginLeft:12 }}>Budget remaining: {usageRemaining}</span>}
            </div>
            <textarea readOnly className="textarea code" value={preview?.prompt || ""} rows={14} />
          </div>
        </details>

        <div style={{ marginTop:12 }}>
          {img && <img src={img} style={{ maxWidth:"100%", border:"1px solid var(--line)", borderRadius:12 }} />}
        </div>
        <details style={{ marginTop:12 }}>
          <summary>Shotbook</summary>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:10, marginTop:10 }}>
            {shotbook.map((s,i)=>(
              <div key={i} style={{ border:"1px solid var(--line)", borderRadius:10, overflow:"hidden" }}>
                <img src={`/api/shotbook_image?id=${s.id}`} style={{ width:"100%", display:"block" }} />
                <div style={{ padding:8, fontSize:12, color:"var(--muted)" }}>FOV {s.camera?.fov_deg}</div>
              </div>
            ))}
            {!shotbook.length && <div className="muted" style={{ fontSize:12 }}>No past shots yet.</div>}
          </div>
        </details>
      </section>

      {/* Step 5: Surgical Edit & Fuse (optional) */}
      <section className="card">
        <StepHeader n={5} title="Surgical Edit / Object Fuse (optional)" locked={step<4} />
        <div className="row">
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Edit-Only</div>
            <input type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>setEditImg(fr.result as string); fr.readAsDataURL(f); }} />
            <input className="input" value={instruction} onChange={e=>setInstruction(e.target.value)} />
            <button className="btn" onClick={async ()=>{
              if (!editImg) return;
              const r = await fetch("/api/edit",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ instruction, imageBase64: editImg })});
              if (!r.ok) return alert(await r.text());
              const b = await r.arrayBuffer(); setImg(`data:image/png;base64,${Buffer.from(b).toString("base64")}`);
            }}>Run Edit</button>
          </div>
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Fuse onto TV</div>
            <input type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>setObjImg(fr.result as string); fr.readAsDataURL(f); }} />
            <button className="btn" onClick={async ()=>{
              if (!img || !objImg) return;
              const r = await fetch("/api/fuse",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ baseImageBase64: img, objectImageBase64: objImg, placement: "place centered on TV; treat as decal; match LED reflections" })});
              if (!r.ok) return alert(await r.text());
              const b = await r.arrayBuffer(); setImg(`data:image/png;base64,${Buffer.from(b).toString("base64")}`);
            }}>Fuse</button>
          </div>
        </div>
      </section>

      {/* Step 6: Export */}
      <section className="card" style={{ marginBottom:40 }}>
        <StepHeader n={6} title="Export Continuity Pack" locked={step<3} />
        <p>Zip everything: Render Kit plates, specs, palette card, profiles, and continuity shotbook.</p>
        <button className="btn btn--primary" onClick={exportZip}>Export Continuity Pack (.zip)</button>
      </section>
    </main>
    <style jsx global>{`
  :root{
    --bg:#0b0c0f;
    --panel:#14161b;
    --panel-2:#171a20;
    --text:#e9ecf1;
    --muted:#9aa3b2;
    --line:#232833;
    --brand:#7c9cff; /* soft indigo */
    --brand-2:#60d394; /* mint accent */
    --danger:#ef4444;
    --radius:16px;
    --radius-sm:10px;
    --shadow:0 10px 30px rgba(0,0,0,.35);
    --shadow-sm:0 6px 18px rgba(0,0,0,.25);
  }
  html,body{ background:var(--bg); color:var(--text); }
  *{ box-sizing:border-box; }
  .container{
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    padding:24px;
    max-width:1060px;
    margin:0 auto;
  }
  h1{ font-weight:800; letter-spacing:.2px; margin:0 0 6px; }
  h2{ font-size:18px; margin:0; }
  p{ color:var(--muted); margin:6px 0 12px; }

  /* Progress */
  .progress{ height:6px; background:#0f1217; border-radius:999px; overflow:hidden; margin:8px 0 16px; border:1px solid var(--line); }
  .progress__bar{ height:100%; background:linear-gradient(90deg,var(--brand),#9aa8ff); box-shadow: inset 0 0 6px rgba(255,255,255,.2); }

  /* Cards & layout */
  .card{
    background: linear-gradient(180deg, var(--panel), var(--panel-2));
    border:1px solid var(--line);
    border-radius: var(--radius);
    padding:16px;
    box-shadow: var(--shadow-sm);
    margin-top:18px;
  }
  .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .spacer{ height:8px; }

  /* Stepper */
  .step{ display:flex; align-items:center; gap:12px; }
  .step small{ color:var(--muted); margin-left:6px; }
  .step__num{
    width:28px; height:28px; border-radius:999px; display:grid; place-items:center;
    font-weight:800; color:#0b0c0f; background:#2b303b; border:1px solid var(--line);
  }
  .step__num--active{ background:var(--brand); color:white; }
  .step__num--ok{ background:var(--brand-2); color:#06210f; }
  .step__num--lock{ background:#2b303b; color:#8b93a6; }

  /* Inputs */
  .input{
    background:#0f1217; color:var(--text); border:1px solid var(--line);
    height:34px; border-radius:10px; padding:6px 10px; outline:none;
  }
  .input:focus, .textarea:focus{ border-color:#3d4963; box-shadow:0 0 0 3px rgba(124,156,255,.15); }
  .textarea{
    background:#0f1217; color:var(--text); border:1px solid var(--line);
    border-radius:12px; padding:10px; width:100%; outline:none;
  }
  .textarea.code{
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size:12.5px; line-height:1.4;
  }

  /* Buttons */
  .btn{
    appearance:none; border:1px solid var(--line); background:#0f1217; color:var(--text);
    padding:8px 12px; border-radius:10px; cursor:pointer; transition: all .15s ease;
  }
  .btn:hover{ transform: translateY(-1px); box-shadow: var(--shadow-sm); border-color:#394156; }
  .btn:disabled{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }
  .btn--primary{ background: linear-gradient(180deg,var(--brand),#6b86ff); color:white; border-color:transparent; }
  .btn--primary:hover{ filter:brightness(1.05); }
  .btn--ghost{ background:transparent; border-color:var(--line); }
  .btn--danger{ background: #281214; border-color:#3a1518; color:#ffb3b3; }

  .chip{
    background:#0f1217; border:1px solid var(--line); border-radius:999px; padding:4px 10px; font-size:12px;
  }

  /* Thumbs */
  .thumb{
    width:84px; height:84px; object-fit:cover; border-radius:10px; border:1px solid var(--line);
  }

  /* Sections */
  details summary{ cursor:pointer; font-weight:700; }
  textarea[readonly]{ opacity:.95; }

  /* Utility */
  .muted{ color:var(--muted); }
  .inline-note{ font-size:12px; color:var(--muted); margin-left:8px; }
`}</style>
    </>
  );
}