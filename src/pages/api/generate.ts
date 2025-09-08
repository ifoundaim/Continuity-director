import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { shotPrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";
import type { CharacterProfile, SettingProfile } from "../../lib/types";
import { renderWireframeSVG, renderWireframeSVGFromModel } from "../../lib/wireframe";
import { recordShot, nearestShots } from "../../lib/continuity";
import { auditImageForDrift } from "../../lib/audit";
import { getSetting } from "../../server/settings_fs";
import { finishesLightingText } from "../../lib/prompts";
import { paletteSVG as scenePaletteSVG } from "../../lib/palette_card";
import { bumpUsage } from "../../server/usage_fs";
import fs from "fs";
import path from "path";
import { modelToSceneGraph } from "../../lib/graph";

export const config = { api: { bodyParser: { sizeLimit: "30mb" } } };

function stableImages(list?: string[]) {
  return [...(list || [])].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

function stableProfiles(list?: CharacterProfile[]) {
  const L = [...(list || [])].sort((a, b) => a.name.localeCompare(b.name));
  // sort each profile's images deterministically
  return L.map(p => ({ ...p, images_base64: stableImages(p.images_base64) }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const { camera, extra, profiles, settingProfile, useNearestRefs, overlayBase64, charPlacements, positionLock, settingId } = req.body as {
      camera: any; extra?: string; profiles?: CharacterProfile[]; settingProfile?: SettingProfile; useNearestRefs?: boolean;
      overlayBase64?: string; charPlacements?: { name:string; x:number; y:number; heightCm:number }[]; positionLock?: string; settingId?: string;
    };

    const profilesStable = stableProfiles(profiles);
    const settingStable = { ...(settingProfile || { description: "", images_base64: [] }), images_base64: stableImages(settingProfile?.images_base64) };

    // Position Lock block (optional)
    const positionLockStr = positionLock || ((charPlacements && charPlacements.length) ? [
      "Position Lock (ft; room origin at SW floor corner):",
      ...charPlacements.map((c:any)=>`- ${c.name}: at (${Number(c.x).toFixed(2)}, ${Number(c.y).toFixed(2)}) ft; height ${Math.round(Number(c.heightCm)||0)} cm.`),
      "Keep characters within 1 ft of these coordinates in the final image."
    ].join("\n") : "");

    // Load active SceneLock (if provided), else fall back to static graph
    const activeSceneDoc = settingId ? getSetting(settingId) : null;
    const activeSceneModel = activeSceneDoc?.model || null;

    const finishesText = activeSceneModel ? finishesLightingText(activeSceneModel) : "";
    const graphForPrompt = activeSceneModel ? modelToSceneGraph(activeSceneModel as any) : (graphJson as any);

    const prompt = shotPrompt(
      graphForPrompt as any,
      camera || (graphJson as any).default_camera,
      [extra || "", positionLockStr, finishesText].filter(Boolean).join("\n\n"),
      profilesStable,
      settingStable.description || ""
    );

    // Build parts (deterministic order):
    const parts: any[] = [];
    // Build parts in intended strict order (avoid SVG images for Gemini):
    // 0) Setting Plates (line then color) for current camera FOV if available in .cache/render_kit/perspectives
    try {
      const rkDir = path.join(process.cwd(), ".cache", "render_kit", "perspectives");
      if (fs.existsSync(rkDir)) {
        const files = fs.readdirSync(rkDir);
        const fov = camera?.fov_deg ?? (graphJson as any).default_camera.fov_deg;
        const line = files.find(f => f.includes(`perspective_${fov}_`) && f.includes("_line"));
        const color = files.find(f => f.includes(`perspective_${fov}_`) && f.includes("_color"));
        if (line) parts.push(imagePart(fs.readFileSync(path.join(rkDir, line))));
        if (color) parts.push(imagePart(fs.readFileSync(path.join(rkDir, color))));
      }
    } catch {}
    // 1) Prompt text (constant)
    parts.push(textPart(prompt));
    // 2) Setting refs (sorted)
    for (const b64 of settingStable.images_base64.slice(0, 6)) {
      const buf = Buffer.from(b64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    }
    // 3) Character refs (sorted by name; each sorted internally)
    for (const p of profilesStable) {
      for (const b64 of (p.images_base64 || []).slice(0, 4)) {
        const buf = Buffer.from(b64.split(",").pop()!, "base64");
        parts.push(imagePart(buf));
      }
    }
    // 4) Continuity memory (nearest past shots; older first)
    if (useNearestRefs) {
      const neighbors = nearestShots(camera || (graphJson as any).default_camera, 2);
      for (const nb of neighbors) parts.push(imagePart(nb, "image/png"));
    }
    // Overlay (optional): put FIRST if provided
    if (overlayBase64) {
      const buf = Buffer.from(overlayBase64.split(",").pop()!, "base64");
      parts.unshift(imagePart(buf));
    }

    const contents = [{ role: "user", parts }];

    // Stable cache key
    const cacheKey = keyOf({
      endpoint: "generate",
      prompt, // already stable wording/order
      wireHash: null,
      overlayHash: overlayBase64 ? keyOf(overlayBase64) : null,
      settingRefs: settingStable.images_base64.map(keyOf),
      chars: profilesStable.map(cp => ({ n: cp.name, h: cp.height_cm, d: cp.description, imgs: (cp.images_base64 || []).map(keyOf) })),
      posLock: (charPlacements||[]).map(c=>({ n:c.name, x:+c.x, y:+c.y, h:Math.round(+c.heightCm||0) })),
      useNearestRefs: !!useNearestRefs,
      positionLock: positionLockStr || null,
      settingId: settingId || null,
      paletteHash: null,
      platesFov: camera?.fov_deg ?? (graphJson as any).default_camera.fov_deg
    });

    const cached = getCache(cacheKey);
    if (cached) { res.setHeader("X-Cache", "HIT"); res.setHeader("Content-Type", "image/png"); return res.send(cached); }

    const buf = await geminiImageCall(apiKey, contents);
    const usage = bumpUsage("generate", 100);

    // Save to shotbook and cache
    recordShot(camera || (graphJson as any).default_camera, buf);
    setCache(cacheKey, buf);

    // Optional corrective loop (stubbed)
    const audit = await auditImageForDrift(buf);
    // If audit.drift === true, we could call /api/edit here with a correction.
    // For now we just return the first pass.

    res.setHeader("X-Cache", "MISS");
    res.setHeader("X-Usage-Remaining", String(usage.remaining));
    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}

