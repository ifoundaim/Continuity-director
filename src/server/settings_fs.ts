import fs from "fs";
import path from "path";
import { YC_DESCRIPTIONS } from "../lib/object_descriptions";

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
  try {
    for (const o of model.objects ?? []) {
      const mapKey = YC_DESCRIPTIONS[(o?.kind||"") as string] ? o.kind : undefined;
      if (mapKey) {
        o.meta = o.meta || {};
        if (!o.meta.description) o.meta.description = YC_DESCRIPTIONS[mapKey].description;
        if (!o.meta.styleTokens) o.meta.styleTokens = YC_DESCRIPTIONS[mapKey].styleTokens;
      }
    }
    // Ensure new locks have sensible defaults for backward-compat
    if (!model.finishes_version_id) model.finishes_version_id = "finishes_v1";
    if (!model.doors) model.doors = [];
    if (!model.carpet) model.carpet = { pattern: "carpet_tiles", tile_w_in: 24, tile_h_in: 24, rotation_deg: 90, accent_hex_list:["#FF6D00"], accent_rule:"every_nth", accent_n:8, grout_hex: "#2E3135", grout_w_in: 0.2 };
    if (!model.exposure_lock) model.exposure_lock = { white_balance_K: model?.lighting?.cctK || 4300, ev_target: "neutral", contrast: "neutral" };
  } catch {}
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


