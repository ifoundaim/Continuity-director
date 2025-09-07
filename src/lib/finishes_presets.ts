import type { Finishes, Lighting } from "./scene_model";

export const PRESETS = {
  yc_room: {
    finishes: <Finishes>{
      wallHex: "#F7F6F2",                 // off-white matte
      trimHex: "#E7E4DE",
      floor: {
        kind: "carpet_tiles",
        baseHex: "#2E3135",               // charcoal
        pattern: "heather",
        tileInches: 24,
        accentHex: "#FF6D00"              // YC orange (stable string)
      },
      mullionHex: "#1C1F22",              // slim black mullions
      glassTintHex: "#EAF2F6",            // very light blue
      accentHex: "#FF6D00",
      notes: "YC aesthetic: clean, modern, minimal; YC orange used sparingly as stripe/decal."
    },
    lighting: <Lighting>{
      cctK: 4300, lux: 500, contrast: "neutral", style: "even_panel"
    }
  },

  neutral_office: {
    finishes: <Finishes>{
      wallHex: "#F4F4F4",
      floor: { kind: "polished_concrete", tintHex: "#CFCFCF", glossGU: 10 },
      mullionHex: "#2B2B2B",
      glassTintHex: "#EDF3F6",
    },
    lighting: <Lighting>{
      cctK: 4000, lux: 450, contrast: "soft", style: "even_panel"
    }
  }
};

export function ensureDefaults(fin?: Finishes | undefined, lit?: Lighting | undefined) {
  const f = fin ?? PRESETS.yc_room.finishes;
  const l = lit ?? PRESETS.yc_room.lighting;
  return { finishes: f, lighting: l };
}


