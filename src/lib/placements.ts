export type CharPlacement = { id:string; name:string; heightCm:number; x:number; y:number; facingDeg?:number; color?:string };

const KEY = "charLayer:list";

export function loadPlacements(): CharPlacement[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function savePlacements(list: CharPlacement[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function positionLockText(chars: CharPlacement[]) {
  if (!chars?.length) return "";
  const lines = chars.map(c =>
    `- ${c.name}: at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}) ft; height ${Math.round(c.heightCm)} cm; facing ${(c.facingDeg ?? 0)|0}°.`);
  return [
    "Position Lock (ft; room origin at SW floor corner):",
    ...lines,
    "Keep characters within 1 ft of these coordinates in the final image."
  ].join("\n");
}


