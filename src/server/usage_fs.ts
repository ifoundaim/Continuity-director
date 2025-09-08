import fs from "fs";
import path from "path";

export type Endpoint = "generate" | "edit" | "fuse" | "describe";

type Usage = { date: string; counts: Record<Endpoint, number>; total: number };

function today(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

const ROOT = path.join(process.cwd(), ".cache");
const FILE = path.join(ROOT, "usage.json");

function load(): Usage {
  try {
    if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
    if (!fs.existsSync(FILE)) {
      const fresh: Usage = { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
      fs.writeFileSync(FILE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    const u = JSON.parse(fs.readFileSync(FILE, "utf-8")) as Usage;
    if (u.date !== today()) {
      const fresh: Usage = { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
      fs.writeFileSync(FILE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    return u;
  } catch {
    return { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
  }
}

function save(u: Usage){ try { fs.writeFileSync(FILE, JSON.stringify(u, null, 2)); } catch {} }

export function bumpUsage(ep: Endpoint, limit = 100){
  const u = load();
  if (u.total >= limit) return { ...u, limit, remaining: 0 };
  u.counts[ep] = (u.counts[ep] || 0) + 1;
  u.total += 1;
  save(u);
  return { ...u, limit, remaining: Math.max(0, limit - u.total) };
}

export function getUsage(limit = 100){
  const u = load();
  return { ...u, limit, remaining: Math.max(0, limit - u.total) };
}


