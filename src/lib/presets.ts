import { SceneObject } from "./scene_model";

export type Preset = { name: string; make: () => SceneObject };

const uid = () => Math.random().toString(36).slice(2,9);

export const PRESETS: Preset[] = [
  { name: "84x36 in Table", make: () => ({ id: uid(), kind:"table", label:"table_84x36", cx:10, cy:7, w:7, d:3, h:2.5 }) },
  { name: "Chair (18 in seat)", make: () => ({ id: uid(), kind:"chair", label:"chair", cx:10, cy:5.5, w:1.6, d:1.6, h:1.5 }) },
  { name: "TV 65\"", make: () => ({ id: uid(), kind:"tv", label:"tv_65", cx:19, cy:7, w:5.7/12, d:0.3, h:3.2/12, wall:"E", mount_h:7 }) },
  { name: "Whiteboard 72x48", make: () => ({ id: uid(), kind:"whiteboard", label:"whiteboard", cx:1, cy:7, w:6/12, d:0.2, h:4/12, wall:"W", mount_h:7 }) },
  { name: "Acoustic Panel 24x48", make: () => ({ id: uid(), kind:"panel", label:"panel", cx:14, cy:7, w:2, d:0.2, h:4, wall:"N", mount_h:5.5 }) },
  { name: "YC Decal Strip", make: () => ({ id: uid(), kind:"decal", label:"yc_decal", cx:18.8, cy:7, w:6, d:0.1, h:1, wall:"E", mount_h:4.5 }) },
];

export function applyPreset(presetName: string): SceneObject | null {
  const p = PRESETS.find(x => x.name === presetName);
  return p ? p.make() : null;
}


