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
    <main style={{ padding:20, maxWidth:1500, margin:"0 auto", color:"#e9ecf1" }}>
      <h1>Setting Designer</h1>
      <p style={{ color:"#9aa3b2", marginTop:-6 }}>Lay out your room with exact sizes. Export SceneLock JSON and build plates.</p>
      <SettingDesigner onExport={exportJSON} onBuildPlates={buildPlates} />
    </main>
  );
}


