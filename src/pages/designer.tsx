import React from "react";
import SettingDesigner from "../components/SettingDesigner";
import { SceneModel } from "../lib/scene_model";
import { exportSceneLockJSON } from "../lib/exporters";

async function saveToCache(jsonText: string){
  try {
    await fetch("/api/save_model", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ jsonText })});
  } catch {}
}

export default function DesignerPage(){
  async function exportJSON(m: SceneModel){
    // Export to our SceneLock JSON file shape (compatible with existing prompts)
    const text = exportSceneLockJSON(m);
    const file = new Blob([text], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = "yc_room_v1.json"; a.click(); URL.revokeObjectURL(a.href);
    await saveToCache(text);
  }
  async function buildPlates(m: SceneModel){
    const r = await fetch("/api/build_kit", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ targets:["full_pack"], dryRun:false, profiles:[], settingProfile: { description: m.notes || "", images_base64: m.refImages || [] } })
    });
    const j = await r.json(); if(!j.ok) alert(j.error); else alert(`Built ${j.items.length} items. Check .cache/render_kit/`);
  }
  return (
    <main className="max-w-[1500px] mx-auto p-5">
      <div className="panel p-3 mb-3">
        <h1 style={{ margin:"4px 0 2px" }}>Setting Designer</h1>
        <div className="text-ink-dim">Lay out your room with exact sizes. Export SceneLock JSON and build plates.</div>
        <div style={{ marginTop:8 }}>
          <a href="/" style={{ color:"#7c9cff", fontSize:12 }}>← Back to Continuity Director</a>
        </div>
      </div>
      <SettingDesigner onExport={exportJSON} onBuildPlates={buildPlates} />
    </main>
  );
}


