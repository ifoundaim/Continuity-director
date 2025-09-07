export type Units = "ft" | "cm";

export type SceneObject = {
  id: string;
  kind: "table" | "chair" | "panel" | "tv" | "whiteboard" | "plant" | "decal" | "custom";
  label?: string;
  // Floor-plan placement (center-based)
  cx: number; cy: number; // in scene units
  w: number; d: number; h?: number; // w=width (x), d=depth (y), h=height
  rotation?: number;        // plan rotation (deg)
  facing?: number;          // front direction (deg, 0=north/up)
  count?: number; spacing?: number; // for repeated rows
  wall?: "N"|"S"|"E"|"W"; mount_h?: number; // for wall-mounted (tv, whiteboard, panel)
  material?: string; decalUrl?: string;
  desc?: string;            // human description (materials, style)
  images?: string[];        // per-object refs
};

export type SceneModel = {
  version: "v1";
  units: Units;
  room: { width: number; depth: number; height: number }; // scene box
  objects: SceneObject[];
  notes?: string;
  refImages?: string[]; // data URLs
};

export const FT_PER_CM = 0.0328084;
export function toFt(u:Units, v:number){ return u==="ft" ? v : v*FT_PER_CM; }
export function fromFt(u:Units, vft:number){ return u==="ft" ? vft : vft/FT_PER_CM; }

// utils
export function degClamp(v:number){ v = v % 360; return v<0 ? v+360 : v; }

export function defaultYCModel(): SceneModel {
  return {
    version: "v1",
    units: "ft",
    room: { width: 20, depth: 14, height: 10 },
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
      { id:"decal", kind:"decal", label:"yc_decal", cx:18.8, cy:7, w:6, d:0.1, h:1, wall:"E", mount_h:4.5, decalUrl:"" }
    ],
    notes: "YC interview room baseline.",
    refImages: []
  };
}


