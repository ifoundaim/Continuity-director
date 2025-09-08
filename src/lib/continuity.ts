import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = path.join(process.cwd(), ".cache");
const BOOK = path.join(ROOT, "shotbook.json");
const ANCHORS = path.join(ROOT, "anchors");

type Camera = { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number] };
type Hashes = { finishesVersion: string | null; doorHash: string | null; carpetHash: string | null; cameraKey?: string | null };
type Entry = { id:string; camera:Camera; created_at:number; file:string; settingId?: string | null; hashes?: Hashes; is_anchor?: boolean };

function ensure() { fs.mkdirSync(ROOT, { recursive: true }); if (!fs.existsSync(BOOK)) fs.writeFileSync(BOOK, "[]"); }
function load(): Entry[] { ensure(); return JSON.parse(fs.readFileSync(BOOK, "utf-8")); }
function save(all: Entry[]) { ensure(); fs.writeFileSync(BOOK, JSON.stringify(all, null, 2)); }

export function recordShot(camera: Camera, png: Buffer, meta?: { settingId?: string | null; hashes?: Hashes; is_anchor?: boolean }): Entry {
  ensure();
  const id = crypto.createHash("sha1").update(png).digest("hex").slice(0, 16);
  const file = path.join(ROOT, `shot-${id}.png`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, png);
  const all = load();
  all.push({ id, camera, created_at: Date.now(), file, settingId: meta?.settingId ?? null, hashes: meta?.hashes, is_anchor: !!meta?.is_anchor });
  save(all);
  return all[all.length - 1];
}

function dist(a: Camera, b: Camera) {
  const d = (u:[number,number,number], v:[number,number,number]) => Math.sqrt((u[0]-v[0])**2 + (u[1]-v[1])**2 + (u[2]-v[2])**2);
  return d(a.pos, b.pos) + 0.5 * d(a.look_at, b.look_at) + 0.05 * Math.abs(a.fov_deg - b.fov_deg);
}

/** return up to k nearest past shots as buffers (oldest first for stability) */
export function nearestShots(camera: Camera, k = 2): Buffer[] {
  const all = load();
  const sorted = all
    .map(e => ({ e, d: dist(e.camera, camera) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, k)
    .sort((a, b) => a.e.created_at - b.e.created_at); // oldest first
  return sorted.map(s => fs.readFileSync(s.e.file));
}

/** filter-aware nearest shots that match current locks; excludes anchors when requested */
export function nearestShotsMatching(
  camera: Camera,
  k = 2,
  filter?: { settingId?: string | null; hashes?: Partial<Hashes>; excludeAnchor?: boolean }
): Buffer[] {
  const all = load();
  const cand = all.filter(e => {
    if (filter?.excludeAnchor && e.is_anchor) return false;
    if (filter?.settingId != null && e.settingId !== filter.settingId) return false;
    if (filter?.hashes) {
      const h = e.hashes || {} as Hashes;
      if (filter.hashes.finishesVersion !== undefined && h.finishesVersion !== filter.hashes.finishesVersion) return false;
      if (filter.hashes.doorHash !== undefined && h.doorHash !== filter.hashes.doorHash) return false;
      if (filter.hashes.carpetHash !== undefined && h.carpetHash !== filter.hashes.carpetHash) return false;
    }
    return true;
  });
  const sorted = cand
    .map(e => ({ e, d: dist(e.camera, camera) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, k)
    .sort((a, b) => a.e.created_at - b.e.created_at);
  return sorted.map(s => fs.readFileSync(s.e.file));
}

function anchorDir(settingId: string | null | undefined, hashes: Hashes){
  const key = crypto.createHash("sha256").update(JSON.stringify({ settingId: settingId||null, hashes })).digest("hex");
  const dir = path.join(ANCHORS, settingId || "default", key);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getAnchor(settingId: string | null | undefined, hashes: Hashes): Buffer | null {
  try{
    const file = path.join(anchorDir(settingId, hashes), "anchor.png");
    if (fs.existsSync(file)) return fs.readFileSync(file);
    return null;
  } catch { return null; }
}

export function saveAnchor(settingId: string | null | undefined, hashes: Hashes, png: Buffer){
  try{
    const file = path.join(anchorDir(settingId, hashes), "anchor.png");
    if (!fs.existsSync(file)) fs.writeFileSync(file, png);
  } catch {}
}


