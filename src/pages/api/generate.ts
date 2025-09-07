import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImageCall, textPart, imagePart } from "../../lib/gemini";
import { shotPrompt } from "../../lib/prompts";
import graphJson from "../../scene/yc_room_v1.json";
import { keyOf, getCache, setCache } from "../../lib/cache";
import type { CharacterProfile, SettingProfile } from "../../lib/types";
import { renderWireframeSVG } from "../../lib/wireframe";
import { recordShot, nearestShots } from "../../lib/continuity";
import { auditImageForDrift } from "../../lib/audit";

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

    const prompt = shotPrompt(
      graphJson as any,
      camera || (graphJson as any).default_camera,
      [extra || "", positionLockStr].filter(Boolean).join("\n\n"),
      profilesStable,
      settingStable.description || ""
    );

    // Build parts (deterministic order):
    const parts: any[] = [];
    // 0) Overlay FIRST if provided
    if (overlayBase64) {
      const buf = Buffer.from(overlayBase64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    }
    // 1) Wireframe next
    const wire = renderWireframeSVG(`FOV ${camera?.fov_deg ?? (graphJson as any).default_camera.fov_deg}`);
    parts.push({ inline_data: { data: Buffer.from(wire.svg).toString("base64"), mime_type: wire.mime } });
    // 2) Prompt text next (constant style/wording)
    parts.push(textPart(prompt));
    // 3) Setting refs (sorted)
    for (const b64 of settingStable.images_base64.slice(0, 6)) {
      const buf = Buffer.from(b64.split(",").pop()!, "base64");
      parts.push(imagePart(buf));
    }
    // 4) Character refs (sorted by name; each sorted internally)
    for (const p of profilesStable) {
      for (const b64 of (p.images_base64 || []).slice(0, 4)) {
        const buf = Buffer.from(b64.split(",").pop()!, "base64");
        parts.push(imagePart(buf));
      }
    }
    // 5) Continuity memory (nearest past shots; older first)
    if (useNearestRefs) {
      const neighbors = nearestShots(camera || (graphJson as any).default_camera, 2);
      for (const nb of neighbors) parts.push(imagePart(nb, "image/png"));
    }

    const contents = [{ role: "user", parts }];

    // Stable cache key
    const cacheKey = keyOf({
      endpoint: "generate",
      prompt, // already stable wording/order
      wireHash: keyOf(wire.svg),
      overlayHash: overlayBase64 ? keyOf(overlayBase64) : null,
      settingRefs: settingStable.images_base64.map(keyOf),
      chars: profilesStable.map(cp => ({ n: cp.name, h: cp.height_cm, d: cp.description, imgs: (cp.images_base64 || []).map(keyOf) })),
      posLock: (charPlacements||[]).map(c=>({ n:c.name, x:+c.x, y:+c.y, h:Math.round(+c.heightCm||0) })),
      useNearestRefs: !!useNearestRefs,
      positionLock: positionLockStr || null,
      settingId: settingId || null
    });

    const cached = getCache(cacheKey);
    if (cached) { res.setHeader("Content-Type", "image/png"); return res.send(cached); }

    const buf = await geminiImageCall(apiKey, contents);

    // Save to shotbook and cache
    recordShot(camera || (graphJson as any).default_camera, buf);
    setCache(cacheKey, buf);

    // Optional corrective loop (stubbed)
    const audit = await auditImageForDrift(buf);
    // If audit.drift === true, we could call /api/edit here with a correction.
    // For now we just return the first pass.

    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
}

