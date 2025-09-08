import React, { useState } from "react";
import { useRouter } from "next/router";

export default function NewProject(){
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  return (
    <main className="container">
      <h1>Create Project</h1>
      <div className="card" style={{ maxWidth:520 }}>
        <label>Name<input className="input" value={name} onChange={e=>setName(e.target.value)} /></label>
        <div className="spacer" />
        <label>Goal<textarea className="textarea" rows={3} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="e.g., YC Room Interview Demo" /></label>
        <div className="spacer" />
        <button className="btn btn--primary" disabled={busy || !name.trim()} onClick={async()=>{
          setBusy(true);
          const r2 = await fetch('/api/projects/new',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name, goal })});
          const j = await r2.json(); setBusy(false);
          if (!j.ok) return alert(j.error||'Failed');
          localStorage.setItem('cd_active_project', j.id);
          r.push('/');
        }}>{busy? 'Creating…':'Create'}</button>
      </div>
    </main>
  );
}


