export type Layer = "floor" | "surface" | "wall" | "ceiling";

export type SceneObject = {
  id: string;
  kind: string;        // "table","chair","tv","whiteboard","panel","decal","laptop",...
  label?: string;
  cx: number; cy: number;     // center (ft) in room coordinates (top-down)
  w: number; d: number; h?: number;  // size in ft
  rotation?: number; facing?: number;
  wall?: "N"|"S"|"E"|"W";      // for wall items
  mount_h?: number;            // ft from floor to bottom for wall/suspended
  layer?: Layer;               // NEW
  attachTo?: string | null;    // NEW: parent object id (e.g., laptop -> table)
  local?: { dx:number; dy:number; dz?:number }; // NEW: local offset within parent footprint
  locked?: boolean;            // NEW: resolver won't move
  meta?: Record<string, any>;
};

export type FinishCarpet = {
  kind: "carpet_tiles";
  baseHex: string;        // e.g. "#2E3135"
  pattern?: "solid" | "heather" | "quarter-turn";
  tileInches?: number;    // e.g. 24
  accentHex?: string;     // stripe or scatter accent
};

export type FinishConcrete = {
  kind: "polished_concrete";
  tintHex: string;        // warm grey
  glossGU?: number;       // 5–20 gloss units
};

export type FloorFinish = FinishCarpet | FinishConcrete;

export type Finishes = {
  wallHex: string;           // off-white matte
  trimHex?: string;          // subtle base/trim if any
  floor: FloorFinish;
  mullionHex?: string;       // glass mullions
  glassTintHex?: string;     // very light blue/grey
  accentHex?: string;        // e.g. YC orange stripes/decals
  notes?: string;            // human notes
};

export type Lighting = {
  cctK: number;              // e.g. 4300
  ev100?: number;            // exposure value @ ISO100 (optional descriptor)
  lux?: number;              // ~400-600 lux typical office
  contrast?: "soft" | "neutral" | "crisp";
  style?: "even_panel" | "spot_key_fill";
};

export type DetectedObject = {
  kind: "table"|"chair"|"panel"|"whiteboard"|"tv"|"decal"|"plant"|"grommet"|"unknown";
  label?: string;
  conf?: number;                 // 0..1
  bbox_px: { x:number; y:number; w:number; h:number }; // image pixels
  facing?: 0|90|180|270;         // deg (coarse)
  wall?: "N"|"S"|"E"|"W"|null;   // if mounted
  size_hint_ft?: { w?:number; d?:number; h?:number };
};

export type ObjectProposal = {
  action: "add"|"update";
  targetId?: string;             // if update
  object: Partial<SceneObject> & { kind: SceneObject["kind"] };
  reason?: string;
  conf?: number;
};

export type SceneModel = {
  name?: string;
  room: { width:number; depth:number; height:number };
  wallMaterials?: { N?:"solid"|"glass"; S?:"solid"|"glass"; E?:"solid"|"glass"; W?:"solid"|"glass" };
  finishes?: Finishes;        // NEW
  lighting?: Lighting;        // NEW
  objects: SceneObject[];
  // compatibility fields used elsewhere in the app
  units?: Units;
  notes?: string;
  refImages?: string[];
  meta?: Record<string, any>;
};

export function isSurface(o: SceneObject){ return (o.layer==="surface") || (o.kind==="table"); }
export function defaultLayerFor(o: SceneObject): Layer {
  if (o.wall) return "wall";
  if (o.kind==="decal") return "wall";
  if (o.kind==="tv" || o.kind==="whiteboard" || o.kind==="panel") return "wall";
  if (o.kind==="ceiling_light") return "ceiling";
  if (o.kind==="table") return "floor";
  return "floor";
}

// ----- legacy helpers (units + default model + degClamp) -----
export type Units = "ft" | "cm";
export const FT_PER_CM = 0.0328084;
export function toFt(u:Units, v:number){ return u==="ft" ? v : v*FT_PER_CM; }
export function fromFt(u:Units, vft:number){ return u==="ft" ? vft : vft/FT_PER_CM; }
export function degClamp(v:number){ v = v % 360; return v<0 ? v+360 : v; }

export function defaultYCModel(): SceneModel {
  return {
    name: "yc_room_v1",
    units: "ft",
    room: { width: 20, depth: 14, height: 10 },
    wallMaterials: { E: "glass", N: "solid", S: "solid", W: "solid" },
    finishes: undefined,
    lighting: undefined,
    objects: [
      { id:"table", kind:"table", label:"table", cx:10, cy:7, w:7, d:3, h:2.5, rotation:0 },
      { id:"chairs_n1", kind:"chair", label:"chair_N1", cx:10-1.25, cy:5.5, w:1.6, d:1.6, h:1.5 },
      { id:"chairs_n2", kind:"chair", label:"chair_N2", cx:10+1.25, cy:5.5, w:1.6, d:1.6, h:1.5 },
      { id:"chairs_s1", kind:"chair", label:"chair_S1", cx:10-1.25, cy:8.5, w:1.6, d:1.6, h:1.5 },
      { id:"chairs_s2", kind:"chair", label:"chair_S2", cx:10+1.25, cy:8.5, w:1.6, d:1.6, h:1.5 },
      { id:"whiteboard", kind:"whiteboard", label:"whiteboard", cx:1, cy:7, w:6/12*1, d:0.2, h:4/12*1, wall:"W", mount_h:7 },
      { id:"tv", kind:"tv", label:"tv_65", cx:19, cy:7, w:5.7/12*1, d:0.3, h:3.2/12*1, wall:"E", mount_h:7 },
      { id:"panels1", kind:"panel", label:"panel1", cx:12, cy:7, w:2, d:0.2, h:4, wall:"N", mount_h:5.5 },
      { id:"panels2", kind:"panel", label:"panel2", cx:14.5, cy:7, w:2, d:0.2, h:4, wall:"N", mount_h:5.5 },
      { id:"panels3", kind:"panel", label:"panel3", cx:17, cy:7, w:2, d:0.2, h:4, wall:"N", mount_h:5.5 },
      { id:"decal", kind:"decal", label:"yc_decal", cx:18.8, cy:7, w:6, d:0.1, h:1, wall:"E", mount_h:4.5 }
    ],
    notes: "YC interview room baseline.",
    refImages: []
  };
}

