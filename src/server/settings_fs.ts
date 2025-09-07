import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), ".cache", "settings");
const INDEX = path.join(ROOT, "index.json"); // { activeId?: string }

function ensureRoot(){
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
  if (!fs.existsSync(INDEX)) fs.writeFileSync(INDEX, JSON.stringify({ activeId: undefined }, null, 2));
}

export type SettingMeta = { id: string; name: string; updatedAt: number };

export function listSettings(): SettingMeta[] {
  ensureRoot();
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith(".json") && f !== "index.json");
  return files.map(f => {
    const p = path.join(ROOT, f);
    const stat = fs.statSync(p);
    const json = JSON.parse(fs.readFileSync(p, "utf-8"));
    return { id: path.basename(f, ".json"), name: json?.name || path.basename(f, ".json"), updatedAt: +stat.mtime };
  }).sort((a,b)=>b.updatedAt - a.updatedAt);
}

export function getActiveId(): string | undefined {
  ensureRoot();
  try { return JSON.parse(fs.readFileSync(INDEX, "utf-8")).activeId; } catch { return undefined; }
}
export function setActiveId(id: string){
  ensureRoot();
  fs.writeFileSync(INDEX, JSON.stringify({ activeId: id }, null, 2));
}

export function getSetting(id: string){
  ensureRoot();
  const p = path.join(ROOT, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveSetting(id: string, name: string, model: any){
  ensureRoot();
  const p = path.join(ROOT, `${id}.json`);
  const data = { id, name, model };
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return data;
}

export function deleteSetting(id: string){
  ensureRoot();
  const p = path.join(ROOT, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  // if active, clear active
  if (getActiveId() === id) setActiveId(undefined as any);
}

export function newId(){ return Math.random().toString(36).slice(2, 10); }


