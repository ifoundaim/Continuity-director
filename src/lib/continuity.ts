import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = path.join(process.cwd(), ".cache");
const BOOK = path.join(ROOT, "shotbook.json");

type Camera = { fov_deg:number; pos:[number,number,number]; look_at:[number,number,number] };
type Entry = { id:string; camera:Camera; created_at:number; file:string };

function ensure() { fs.mkdirSync(ROOT, { recursive: true }); if (!fs.existsSync(BOOK)) fs.writeFileSync(BOOK, "[]"); }
function load(): Entry[] { ensure(); return JSON.parse(fs.readFileSync(BOOK, "utf-8")); }
function save(all: Entry[]) { ensure(); fs.writeFileSync(BOOK, JSON.stringify(all, null, 2)); }

export function recordShot(camera: Camera, png: Buffer): Entry {
  ensure();
  const id = crypto.createHash("sha1").update(png).digest("hex").slice(0, 16);
  const file = path.join(ROOT, `shot-${id}.png`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, png);
  const all = load();
  all.push({ id, camera, created_at: Date.now(), file });
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


