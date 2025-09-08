import type { SceneGraph } from "./types";
import type { SceneModel, SceneObject } from "./scene_model";

function avg(nums: number[]): number { return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : 0; }

/** Convert a rich SceneModel (designer) into a minimal SceneGraph used by prompt tokens. */
export function modelToSceneGraph(model: SceneModel): SceneGraph {
  // Base graph shell
  const graph: any = {
    scene_id: model.name || "yc_room_v1",
    units: model.units || "ft",
    room: { width: model.room.width, depth: model.room.depth, height: model.room.height },
    lighting: { key: "overhead_led_center", color_temp_k: (model.exposure_lock?.white_balance_K || model.lighting?.cctK || 4300), window_side: "glass_wall_right" },
    objects: [],
    scale_anchors: {
      aim_height_cm: 170,
      em_height_cm: 160.02,
      codex_to_aim_ratio: 0.37,
      table_h_ft: 2.5,
      chair_seat_h_ft: 1.5
    }
  };

  // Helpers to find items
  const tables = model.objects.filter(o => o.kind === "table");
  const chairs = model.objects.filter(o => o.kind === "chair");
  const whiteboard = model.objects.find(o => o.kind === "whiteboard");
  const tv = model.objects.find(o => o.kind === "tv");
  const panels = model.objects.filter(o => o.kind === "panel");

  // Glass wall (E) mullions from meta if present
  const mullion = (model.meta as any)?.glassE?.mullionSpacingFt ?? 3.5;
  graph.objects.push({ id: "glass_wall", type: "glass_wall", wall: "right", span_ft: model.room.depth, mullion_spacing_ft: mullion });

  // Table (pick largest by area)
  if (tables.length) {
    const t = [...tables].sort((a,b)=> (b.w*b.d)-(a.w*a.d))[0];
    graph.objects.push({ id: "table", type: "table", pos: [t.cx, t.cy], size: [t.w, t.d], height_ft: t.h ?? 2.5 });
  }

  // Chairs → split to north/south relative to table center if table present, else by room midline
  if (chairs.length) {
    const ty = tables[0]?.cy ?? (model.room.depth/2);
    const north = chairs.filter(c => c.cy <= ty);
    const south = chairs.filter(c => c.cy >  ty);
    const spacingN = north.length > 1 ? avg(north.map(c=>c.cx)).toFixed(2) : undefined;
    const spacingS = south.length > 1 ? avg(south.map(c=>c.cx)).toFixed(2) : undefined;
    if (north.length) graph.objects.push({ id: "chairs_north", type: "chairs", count: north.length, center_ft: [avg(north.map(c=>c.cx)), avg(north.map(c=>c.cy))], spacing_ft: north.length>1 ? Math.abs(north[0].cx - north[north.length-1].cx) / Math.max(1,(north.length-1)) : 2.5, seat_h_in: 18 });
    if (south.length) graph.objects.push({ id: "chairs_south", type: "chairs", count: south.length, center_ft: [avg(south.map(c=>c.cx)), avg(south.map(c=>c.cy))], spacing_ft: south.length>1 ? Math.abs(south[0].cx - south[south.length-1].cx) / Math.max(1,(south.length-1)) : 2.5, seat_h_in: 18 });
  }

  // Whiteboard (W wall)
  if (whiteboard) {
    graph.objects.push({ id: "whiteboard", type: "whiteboard", wall: "left", center_ft: [0 + (whiteboard.cx ?? 0), whiteboard.cy], size: [whiteboard.w || 6, whiteboard.h || 4] });
  }

  // TV (E wall) → infer diag inches from width approx (16:9)
  if (tv) {
    const wft = tv.w || 4.8;
    const hft = (wft/16)*9;
    const diagIn = Math.round(Math.sqrt((wft*12)**2 + (hft*12)**2));
    graph.objects.push({ id: "tv", type: "display", wall: "right", center_ft: [model.room.width, tv.cy], diag_in: diagIn });
  }

  // Panels along rear (N) wall
  if (panels.length) {
    const size: [number, number] = [panels[0].w || 2, panels[0].h || 4];
    const centers_ft: [number, number][] = panels.map(p => [p.cx, model.room.depth - 0.8]);
    graph.objects.push({ id: "panels", type: "panels", wall: "rear", centers_ft, size });
  }

  return graph as SceneGraph;
}


