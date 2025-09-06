import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = process.env.CACHE_DIR || ".cache";
export const ensureCache = () => fs.mkdirSync(CACHE_DIR, { recursive: true });
export const keyOf = (obj: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");

export const getCache = (key: string) => {
  ensureCache();
  const p = path.join(CACHE_DIR, key + ".bin");
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
};

export const setCache = (key: string, data: Buffer) => {
  ensureCache();
  const p = path.join(CACHE_DIR, key + ".bin");
  fs.writeFileSync(p, data);
};

