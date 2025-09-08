import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { shotPrompt } from "../../lib/prompts";
import { doorLockText, floorLockText, finishesLightingText } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";
import type { CharacterProfile, SettingProfile } from "../../lib/types";
import { renderWireframeSVG, renderWireframeSVGFromModel } from "../../lib/wireframe";
import { buildRailsForCamera } from "../../lib/rails";
import { recordShot, nearestShotsMatching, getAnchor, saveAnchor } from "../../lib/continuity";
import { auditImageForDrift } from "../../lib/audit";
import { getSetting } from "../../server/settings_fs";
// removed duplicate import of finishesLightingText (already imported above)
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
    const doorText = activeSceneModel ? doorLockText(activeSceneModel) : "";
    const floorText = activeSceneModel ? floorLockText(activeSceneModel) : "";
    const expo = (activeSceneModel as any)?.exposure_lock;
    const wb = expo?.white_balance_K || (activeSceneModel as any)?.lighting?.cctK || 4300;
    const ev = expo?.ev_target || "neutral";
    const photorealStyle = `STYLE: photoreal office interior; correct global illumination; no depth-of-field blur; neutral post; respect exposure_lock (WB ${wb}K, EV ${ev}).`;
    const graphForPrompt = activeSceneModel ? modelToSceneGraph(activeSceneModel as any) : (graphJson as any);

    const prompt = shotPrompt(
      graphForPrompt as any,
      camera || (graphJson as any).default_camera,
      [doorText, floorText, finishesText, photorealStyle, extra || "", positionLockStr].filter(Boolean).join("\n\n"),
      profilesStable,
      settingStable.description || ""
    );

    // Locks hashes (used for anchor/continuity + cache key)
    const doorHash = keyOf((activeSceneModel?.doors||[]).slice().sort((a:any,b:any)=> String(a.id||"").localeCompare(String(b.id||""))));
    const carpetHash = keyOf(activeSceneModel?.carpet || null);
    const finishesVersion = activeSceneModel?.finishes_version_id || null;
    const cameraKey = keyOf(camera || (graphJson as any).default_camera);

    // Build parts (deterministic order) per new spec:
    const parts: any[] = [];
    // 0) Palette Card → 1) Door Wireframe (current cam) → 2) Generic Wireframe (current cam)
    // → 3) Carpet Pattern Card → 4) Setting Plates (line/color) → 5) Continuity refs
    try {
      const root = path.join(process.cwd(), ".cache", "render_kit");
      // Palette card (scene)
      const paletteFile = path.join(root, "palette_scene.svg");
      if (fs.existsSync(paletteFile)) parts.push(imagePart(Buffer.from(fs.readFileSync(paletteFile).toString("base64"), "base64"), "image/svg+xml"));
      // Door wireframe (per camera)
      const fov = camera?.fov_deg ?? (graphJson as any).default_camera.fov_deg;
      const doorDir = path.join(root, "door");
      const doorFile = fs.existsSync(doorDir) ? fs.readdirSync(doorDir).find(f=>f.includes(`door_${fov}_`)) : undefined;
      if (doorFile) parts.push(imagePart(fs.readFileSync(path.join(doorDir, doorFile))));
      // Rails: material_atlas, constraints, orthos, wireframe, depth, normals, ao (strict order)
      try {
        const activeSceneDoc = settingId ? getSetting(settingId) : null;
        const activeSceneModel = activeSceneDoc?.model || null;
        const cam = camera || (graphJson as any).default_camera;
        const { camKey } = await buildRailsForCamera(activeSceneModel || (graphJson as any), cam);
        const railsDir = path.join(root, "rails", camKey);
        const railsFiles = [
          "material_atlas.png",
          "constraints.svg",
          "constraints_perspective.png",
          "ortho_front.png",
          "ortho_right.png",
          "ortho_top.png",
          "wireframe.svg",
          "depth.png",
          "normals.png",
          "ao.png"
        ];
        for (const rf of railsFiles){ const pth = path.join(railsDir, rf); if (fs.existsSync(pth)) parts.push(imagePart(fs.readFileSync(pth), rf.endsWith(".svg")?"image/svg+xml":"image/png")); }
        // Append perspective line/color after rails
      } catch {}
      // Generic wireframe (from render kit perspectives wireframes dir if available)
      const wireDir = path.join(root, "wireframes");
      const wireFile = fs.existsSync(wireDir) ? fs.readdirSync(wireDir).find(f=>f.includes(`wire_${fov}_`)) : undefined;
      if (wireFile) {
        parts.push(imagePart(fs.readFileSync(path.join(wireDir, wireFile))));
      } else {
        // Fallback: generate wireframe SVG from model or static graph
        const wf = activeSceneModel ? renderWireframeSVGFromModel(activeSceneModel as any, `perspective FOV ${fov}`) : renderWireframeSVG(`perspective FOV ${fov}`);
        parts.push({ inline_data: { data: Buffer.from(wf.svg, "utf8").toString("base64"), mime_type: "image/svg+xml" } });
      }
      // Carpet pattern card (global)
      const carpetDir = path.join(root, "carpet");
      const carpetFile = path.join(carpetDir, "carpet_card.png");
      if (fs.existsSync(carpetFile)) parts.push(imagePart(fs.readFileSync(carpetFile)));
      // Setting plates for current FOV: line then color
      const persDir = path.join(root, "perspectives");
      if (fs.existsSync(persDir)){
        const files = fs.readdirSync(persDir);
        const line = files.find(f => f.includes(`perspective_${fov}_`) && f.includes("_line"));
        const color = files.find(f => f.includes(`perspective_${fov}_`) && f.includes("_color"));
        if (line) parts.push(imagePart(fs.readFileSync(path.join(persDir, line))));
        if (color) parts.push(imagePart(fs.readFileSync(path.join(persDir, color))));
      }
    } catch {}
    // 6) Prompt text (constant)
    parts.push(textPart(prompt));
    // 7) Anchor image (if available for current locks and setting)
    const activeSettingId = settingId || null;
    const locksHashes = { finishesVersion, doorHash, carpetHash, cameraKey: null } as any;
    const anchor = getAnchor(activeSettingId, locksHashes);
    if (anchor) parts.push(imagePart(anchor));
    // 8) Setting refs (sorted)
    for (const b64 of settingStable.images_base64.slice(0, 6)) {
      const buf = Buffer.from(b64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    }
    // 9) Character refs (sorted by name; each sorted internally)
    for (const p of profilesStable) {
      for (const b64 of (p.images_base64 || []).slice(0, 4)) {
        const buf = Buffer.from(b64.split(",").pop()!, "base64");
        parts.push(imagePart(buf));
      }
    }
    // 10) Continuity memory (nearest past shots; filtered to current locks; skip anchor)
    if (useNearestRefs) {
      const neighbors = nearestShotsMatching(
        camera || (graphJson as any).default_camera,
        2,
        { settingId: activeSettingId, hashes: { finishesVersion, doorHash, carpetHash }, excludeAnchor: true }
      );
      for (const nb of neighbors) parts.push(imagePart(nb, "image/png"));
    }
    // Overlay (optional): put FIRST if provided
    if (overlayBase64) {
      const buf = Buffer.from(overlayBase64.split(",").pop()!, "base64");
      parts.unshift(imagePart(buf));
    }

    const contents = [{ role: "user", parts }];

    // Stable cache key (use previously computed locks hashes)

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
      platesFov: camera?.fov_deg ?? (graphJson as any).default_camera.fov_deg,
      finishesVersion,
      doorHash,
      carpetHash,
      cameraKey
    });

    const cached = getCache(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Rails-Order", "material_atlas,constraints,ortho_front,ortho_right,ortho_top,wireframe,depth,normals,ao,plate_line,plate_color,continuity");
      res.setHeader("X-Hashes", JSON.stringify({ finishesVersion, doorHash, carpetHash, cameraKey, anchor: !!anchor }));
      res.setHeader("Content-Type", "image/png");
      return res.send(cached);
    }

    const buf = await geminiImageCall(apiKey, contents);
    const usage = bumpUsage("generate", 100);

    // Save to shotbook and cache; also save anchor if not present
    recordShot(
      camera || (graphJson as any).default_camera,
      buf,
      { settingId: activeSettingId, hashes: { finishesVersion, doorHash, carpetHash, cameraKey }, is_anchor: false }
    );
    if (!anchor) {
      saveAnchor(activeSettingId, { finishesVersion, doorHash, carpetHash, cameraKey: null } as any, buf);
    }
    setCache(cacheKey, buf);

    // Optional corrective loop (stubbed)
    const audit = await auditImageForDrift(buf);
    // If audit.drift === true, we could call /api/edit here with a correction.
    // For now we just return the first pass.

    res.setHeader("X-Cache", "MISS");
    res.setHeader("X-Usage-Remaining", String(usage.remaining));
    res.setHeader("X-Rails-Order", "material_atlas,constraints,ortho_front,ortho_right,ortho_top,wireframe,depth,normals,ao,plate_line,plate_color,continuity");
    res.setHeader("X-Hashes", JSON.stringify({ finishesVersion, doorHash, carpetHash, cameraKey, anchor: !!anchor }));
    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}

