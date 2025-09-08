import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), ".cache", "projects");
const INDEX = path.join(ROOT, "index.json"); // { activeId?: string }

export type ProjectMeta = { id:string; name:string; goal?:string; createdAt:number };

function ensureRoot(){
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
  if (!fs.existsSync(INDEX)) fs.writeFileSync(INDEX, JSON.stringify({ activeId: undefined }, null, 2));
  // ensure default project exists
  const def = path.join(ROOT, "default");
  if (!fs.existsSync(def)) {
    fs.mkdirSync(def, { recursive: true });
    fs.writeFileSync(path.join(def, "meta.json"), JSON.stringify({ id:"default", name:"Default", createdAt: Date.now() }, null, 2));
    fs.mkdirSync(path.join(def, "settings"), { recursive: true });
  }
}

export function listProjects(): ProjectMeta[] {
  ensureRoot();
  const ids = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, "meta.json")));
  return ids.map(id => {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, id, "meta.json"), "utf-8"));
    return meta as ProjectMeta;
  }).sort((a,b)=>b.createdAt - a.createdAt);
}

export function getActiveProjectId(): string {
  ensureRoot();
  try { const j = JSON.parse(fs.readFileSync(INDEX, "utf-8")); return j.activeId || "default"; } catch { return "default"; }
}

export function setActiveProjectId(id: string){ ensureRoot(); fs.writeFileSync(INDEX, JSON.stringify({ activeId: id }, null, 2)); }

export function getProjectRoot(id?: string){ ensureRoot(); const pid = id || getActiveProjectId(); const p = path.join(ROOT, pid); fs.mkdirSync(p, { recursive: true }); return p; }

export function newProject(name: string, goal?: string){
  ensureRoot();
  const id = Math.random().toString(36).slice(2, 10);
  const dir = path.join(ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id, name: name || id, goal, createdAt: Date.now() }, null, 2));
  fs.mkdirSync(path.join(dir, "settings"), { recursive: true });
  setActiveProjectId(id);
  return { id };
}


