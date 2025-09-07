import type { DetectedObject, SceneModel, SceneObject } from "./scene_model";

export type Calibration = {
  imageW: number; imageH: number;
  p1: {x:number; y:number}; p2: {x:number; y:number};
  distanceFt: number;       // e.g., mullion spacing 3.5 or table width 7
  backWall: "N"|"S"|"E"|"W"; // which wall those anchors lie on
};

export function estimateScaleFtPerPx(cal?: Calibration) {
  if (!cal) return 0; // means: fallback later
  const dx = cal.p1.x - cal.p2.x, dy = cal.p1.y - cal.p2.y;
  const dpx = Math.hypot(dx, dy) || 1;
  return cal.distanceFt / dpx; // feet per pixel along that wall
}

export function proposePlacements(
  det: { width_px:number; height_px:number; objects: DetectedObject[] },
  scene: SceneModel,
  cal?: Calibration
): Array<{ obj: Partial<SceneObject> & {kind: SceneObject["kind"]}, conf?:number, reason?:string }> {
  const W = det.width_px || 1, H = det.height_px || 1;
  const ftPerPx = estimateScaleFtPerPx(cal) || (scene.room.width / W + scene.room.depth / H) / 2;

  const toRoom = (x:number, y:number) => ({
    cx: (x / W) * scene.room.width,
    cy: (y / H) * scene.room.depth
  });

  const out: Array<{ obj: any, conf?:number, reason?:string }> = [];

  for (const d of det.objects || []) {
    const cxpx = d.bbox_px.x + d.bbox_px.w/2;
    const cypx = d.bbox_px.y + d.bbox_px.h/2;
    const { cx, cy } = toRoom(cxpx, cypx);

    let obj: any = { kind: d.kind, cx, cy, rotation: (d.facing as any) ?? 0, label: d.label };
    if (d.size_hint_ft?.w) obj.w = d.size_hint_ft.w;
    if (d.size_hint_ft?.d) obj.d = d.size_hint_ft.d;
    if (d.size_hint_ft?.h) obj.h = d.size_hint_ft.h;

    if (d.kind === "table" && !obj.w) { obj.w = 7; obj.d = 3; obj.h = 2.5; }
    if (d.kind === "chair" && !obj.w) { obj.w = 1.6; obj.d = 1.6; obj.h = 3; }
    if (d.kind === "panel" && !obj.w) { obj.w = 2; obj.d = 0.2; obj.h = 4; }
    if (d.kind === "whiteboard" && !obj.w) { obj.w = 6; obj.d = 0.5; obj.h = 4; }
    if (d.kind === "tv" && !obj.w) { obj.w = 4.8; obj.d = 0.5; obj.h = 2.7; }
    if (d.kind === "decal" && !obj.w) { obj.w = 6; obj.d = 0.1; obj.h = 1; }

    if (d.wall) {
      obj.wall = d.wall;
      if (d.wall === "W") obj.cx = 0;
      if (d.wall === "E") obj.cx = scene.room.width;
      if (d.wall === "N") obj.cy = 0;
      if (d.wall === "S") obj.cy = scene.room.depth;
    }

    out.push({ obj, conf: d.conf ?? 0.7, reason: "auto-proposed from reference" });
  }
  return out;
}


