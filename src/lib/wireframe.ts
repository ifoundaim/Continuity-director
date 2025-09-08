import graphJson from "../scene/yc_room_v1.json";
import type { SceneGraph } from "./types";
import type { SceneModel } from "./scene_model";
import { modelToSceneGraph } from "./graph";

/**
 * Render a deterministic, camera-agnostic top-down SVG wireframe.
 * This anchors layout: room box, table, whiteboard, TV, rear panels,
 * glass wall mullions, and a small ft/cm scale bar.
 */
export function renderWireframeSVG(cameraLabel: string): { svg: string; mime: string } {
  const g = graphJson as unknown as SceneGraph;
  const W = 1000, H = 700, m = 40;

  const sx = (x: number) => m + (x / g.room.width) * (W - 2 * m);
  const sy = (y: number) => m + (y / g.room.depth) * (H - 2 * m);
  const wRoom = sx(g.room.width) - sx(0);
  const hRoom = sy(g.room.depth) - sy(0);

  const glass = g.objects.find(o => o.id === "glass_wall");
  const table = g.objects.find(o => o.id === "table");
  const tv = g.objects.find(o => o.id === "tv");
  const wb = g.objects.find(o => o.id === "whiteboard");
  const panels = g.objects.find(o => o.id === "panels");

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  parts.push(`<rect x="${sx(0)}" y="${sy(0)}" width="${wRoom}" height="${hRoom}" fill="none" stroke="black" stroke-width="2"/>`);
  // table
  if (table?.pos && table.size) {
    const [cx, cy] = table.pos; const [tw, td] = table.size;
    parts.push(`<rect x="${sx(cx - tw/2)}" y="${sy(cy - td/2)}" width="${(tw/g.room.width)*(W-2*m)}" height="${(td/g.room.depth)*(H-2*m)}" fill="none" stroke="black" stroke-width="2"/>`);
    parts.push(`<text x="${sx(cx)}" y="${sy(cy) - 6}" text-anchor="middle" font-size="12">table ${tw}×${td} ft</text>`);
  }
  // TV right wall (small block)
  if (tv?.center_ft) {
    const [x, y] = tv.center_ft;
    parts.push(`<rect x="${sx(g.room.width - 0.4)}" y="${sy(y - 0.6)}" width="${sx(g.room.width) - sx(g.room.width - 0.4)}" height="${sy(y + 0.6) - sy(y - 0.6)}" fill="none" stroke="black" stroke-width="2"/>`);
    parts.push(`<text x="${sx(g.room.width - 0.2)}" y="${sy(y - 0.8)}" text-anchor="end" font-size="12">TV 65"</text>`);
  }
  // whiteboard left
  if (wb?.center_ft && wb.size) {
    const [ , y] = wb.center_ft; const [, hft] = wb.size;
    parts.push(`<rect x="${sx(0)}" y="${sy(y - hft/2)}" width="${sx(0.4)-sx(0)}" height="${(hft/g.room.depth)*(H-2*m)}" fill="none" stroke="black" stroke-width="2"/>`);
    parts.push(`<text x="${sx(0.2)}" y="${sy(y - hft/2) - 6}" text-anchor="middle" font-size="12">WB</text>`);
  }
  // rear panels
  if (panels?.centers_ft && panels.size) {
    for (const [cx] of panels.centers_ft) {
      parts.push(`<rect x="${sx(cx - panels.size[0]/2)}" y="${sy(g.room.depth - 0.4)}" width="${(panels.size[0]/g.room.width)*(W-2*m)}" height="${sy(g.room.depth)-sy(g.room.depth-0.4)}" fill="none" stroke="black" stroke-width="1.5"/>`);
    }
    parts.push(`<text x="${sx(g.room.width/2)}" y="${sy(g.room.depth) + 14}" text-anchor="middle" font-size="12">rear acoustic panels</text>`);
  }
  // glass wall mullions
  if (glass?.mullion_spacing_ft) {
    for (let x = glass.mullion_spacing_ft; x < g.room.width; x += glass.mullion_spacing_ft) {
      const X = sx(x);
      parts.push(`<line x1="${X}" y1="${sy(0)}" x2="${X}" y2="${sy(g.room.depth)}" stroke="black" stroke-width="1" stroke-dasharray="4 3"/>`);
    }
    parts.push(`<text x="${sx(g.room.width - 0.8)}" y="${sy(0.8)}" font-size="12">glass wall + door</text>`);
  }
  // scale bar
  const barX = W - m - 160, barY = H - m - 46;
  parts.push(`<rect x="${barX}" y="${barY}" width="160" height="46" fill="white" stroke="black" stroke-width="1.5"/>`);
  parts.push(`<line x1="${barX+12}" y1="${barY+32}" x2="${barX+132}" y2="${barY+32}" stroke="black" stroke-width="2"/>`);
  parts.push(`<line x1="${barX+12}" y1="${barY+26}" x2="${barX+12}" y2="${barY+38}" stroke="black" stroke-width="2"/>`);
  parts.push(`<line x1="${barX+132}" y1="${barY+26}" x2="${barX+132}" y2="${barY+38}" stroke="black" stroke-width="2"/>`);
  parts.push(`<text x="${barX+12}" y="${barY+18}" font-size="12">10 ft ≈ 304.8 cm</text>`);
  // camera label
  parts.push(`<text x="${m}" y="${m-10}" font-size="12">wireframe — ${cameraLabel}</text>`);
  parts.push(`</svg>`);
  return { svg: parts.join(""), mime: "image/svg+xml" };
}

/** Render wireframe from a dynamic SceneModel (Designer) by converting to SceneGraph first. */
export function renderWireframeSVGFromModel(model: SceneModel, cameraLabel: string): { svg: string; mime: string } {
  const g = modelToSceneGraph(model);
  const W = 1000, H = 700, m = 40;

  const sx = (x: number) => m + (x / g.room.width) * (W - 2 * m);
  const sy = (y: number) => m + (y / g.room.depth) * (H - 2 * m);
  const wRoom = sx(g.room.width) - sx(0);
  const hRoom = sy(g.room.depth) - sy(0);

  const glass = g.objects.find((o:any) => o.id === "glass_wall");
  const table = g.objects.find((o:any) => o.id === "table");
  const tv = g.objects.find((o:any) => o.id === "tv");
  const wb = g.objects.find((o:any) => o.id === "whiteboard");
  const panels = g.objects.find((o:any) => o.id === "panels");

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  parts.push(`<rect x="${sx(0)}" y="${sy(0)}" width="${wRoom}" height="${hRoom}" fill="none" stroke="black" stroke-width="2"/>`);
  // table
  if ((table as any)?.pos && (table as any).size) {
    const [cx, cy] = (table as any).pos; const [tw, td] = (table as any).size;
    parts.push(`<rect x="${sx(cx - tw/2)}" y="${sy(cy - td/2)}" width="${(tw/g.room.width)*(W-2*m)}" height="${(td/g.room.depth)*(H-2*m)}" fill="none" stroke="black" stroke-width="2"/>`);
    parts.push(`<text x="${sx(cx)}" y="${sy(cy) - 6}" text-anchor="middle" font-size="12">table ${tw}×${td} ft</text>`);
  }
  // TV right wall (small block)
  if ((tv as any)?.center_ft) {
    const [x, y] = (tv as any).center_ft;
    parts.push(`<rect x="${sx(g.room.width - 0.4)}" y="${sy(y - 0.6)}" width="${sx(g.room.width) - sx(g.room.width - 0.4)}" height="${sy(y + 0.6) - sy(y - 0.6)}" fill="none" stroke="black" stroke-width="2"/>`);
    parts.push(`<text x="${sx(g.room.width - 0.2)}" y="${sy(y - 0.8)}" text-anchor="end" font-size="12">TV</text>`);
  }
  // whiteboard left
  if ((wb as any)?.center_ft && (wb as any).size) {
    const [ , y] = (wb as any).center_ft; const [, hft] = (wb as any).size;
    parts.push(`<rect x="${sx(0)}" y="${sy(y - hft/2)}" width="${sx(0.4)-sx(0)}" height="${(hft/g.room.depth)*(H-2*m)}" fill="none" stroke="black" stroke-width="2"/>`);
    parts.push(`<text x="${sx(0.2)}" y="${sy(y - hft/2) - 6}" text-anchor="middle" font-size="12">WB</text>`);
  }
  // rear panels
  if ((panels as any)?.centers_ft && (panels as any).size) {
    for (const [cx] of (panels as any).centers_ft) {
      parts.push(`<rect x="${sx(cx - (panels as any).size[0]/2)}" y="${sy(g.room.depth - 0.4)}" width="${((panels as any).size[0]/g.room.width)*(W-2*m)}" height="${sy(g.room.depth)-sy(g.room.depth-0.4)}" fill="none" stroke="black" stroke-width="1.5"/>`);
    }
    parts.push(`<text x="${sx(g.room.width/2)}" y="${sy(g.room.depth) + 14}" text-anchor="middle" font-size="12">rear acoustic panels</text>`);
  }
  // glass wall mullions
  if ((glass as any)?.mullion_spacing_ft) {
    for (let x = (glass as any).mullion_spacing_ft; x < g.room.width; x += (glass as any).mullion_spacing_ft) {
      const X = sx(x);
      parts.push(`<line x1="${X}" y1="${sy(0)}" x2="${X}" y2="${sy(g.room.depth)}" stroke="black" stroke-width="1" stroke-dasharray="4 3"/>`);
    }
    parts.push(`<text x="${sx(g.room.width - 0.8)}" y="${sy(0.8)}" font-size="12">glass wall + door</text>`);
  }
  // scale bar
  const barX = W - m - 160, barY = H - m - 46;
  parts.push(`<rect x="${barX}" y="${barY}" width="160" height="46" fill="white" stroke="black" stroke-width="1.5"/>`);
  parts.push(`<line x1="${barX+12}" y1="${barY+32}" x2="${barX+132}" y2="${barY+32}" stroke="black" stroke-width="2"/>`);
  parts.push(`<line x1="${barX+12}" y1="${barY+26}" x2="${barX+12}" y2="${barY+38}" stroke="black" stroke-width="2"/>`);
  parts.push(`<line x1="${barX+132}" y1="${barY+26}" x2="${barX+132}" y2="${barY+38}" stroke="black" stroke-width="2"/>`);
  parts.push(`<text x="${barX+12}" y="${barY+18}" font-size="12">10 ft ≈ 304.8 cm</text>`);
  // camera label
  parts.push(`<text x="${m}" y="${m-10}" font-size="12">wireframe — ${cameraLabel}</text>`);
  parts.push(`</svg>`);
  return { svg: parts.join(""), mime: "image/svg+xml" };
}


