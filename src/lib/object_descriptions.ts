export const YC_DESCRIPTIONS: Record<string, { description: string; styleTokens?: string[] }> = {
  // Tables
  table: {
    description:
      "Rectangular conference table, 84×36 in (7×3 ft), height 30 in (2.5 ft). Light maple/birch veneer top, matte low-gloss finish (≈10 GU), soft 2 mm edge chamfer. Thin powder-coated steel legs inset ≈14 in from corners. Cable feed via floor grommet under center.",
    styleTokens: ["matte wood", "light maple", "thin black legs", "no specular highlights"]
  },

  // Chairs (armless, x4 around table)
  chair: {
    description:
      "Armless meeting chair, charcoal fabric upholstery with medium density foam, matte black sled base. Overall height ≈31 in, seat height 18 in (1.5 ft). Non-reflective fabric; simple silhouette.",
    styleTokens: ["charcoal upholstery", "black sled base", "non-reflective", "simple form"]
  },

  // Acoustic panels (24×48 in) — three on the north wall
  panel: {
    description:
      "Acoustic absorption panel, 24×48×1.75 in, square corners, wrapped in light grey fabric. Mounted as a clean trio on the north wall with even spacing; panel faces flush to wall.",
    styleTokens: ["light grey fabric", "rectangular", "no pattern", "flush mount"]
  },

  // Whiteboard (west wall)
  whiteboard: {
    description:
      "Magnetic whiteboard, 72×48 in (6×4 ft) with slim aluminum frame. Center height ≈4.5 ft from floor. Surface is satin/matte to minimize glare; thin marker tray.",
    styleTokens: ["satin white surface", "slim aluminum frame", "minimal glare"]
  },

  // TV / display (east/glass wall area, on a slim mount)
  tv: {
    description:
      "65-inch 16:9 display, thin black bezel, matte anti-glare screen, wall-mounted on east side. Keep screen off (dark charcoal) unless content is fused; avoid strong reflections.",
    styleTokens: ["matte anti-glare", "thin bezel", "screen off", "no reflections"]
  },

  // YC decal on glass
  decal: {
    description:
      "Frosted vinyl decal of the PurposePath compass-heart mark, band width ≈6 ft and height ≈12 in, centered on the east glass wall at mid-glass. Semi-opaque, soft edge; no high gloss.",
    styleTokens: ["frosted vinyl", "semi-opaque", "soft edge", "no specular"]
  },

  // Floor grommet under table
  grommet: {
    description:
      "Floor cable grommet centered under table: 6-inch circular brushed stainless cover, flush with polished concrete.",
    styleTokens: ["brushed steel", "circular", "flush mount"]
  },

  // Glass wall & mullions (modeled via wall material + meta)
  mullions: {
    description:
      "East wall is full-height tempered glass with slim black aluminum mullions at 3.5-ft spacing; one glass door with matching stile.",
    styleTokens: ["tempered glass", "black mullions", "3.5 ft spacing", "slim door stile"]
  },

  // Lighting / ceiling (ambient)
  ceiling_light: {
    description:
      "Recessed 2×4-ft LED troffers, neutral 4300 K, even soft key. Acoustic ceiling grid; keep lighting neutral and shadowing soft.",
    styleTokens: ["4300 K neutral", "soft even light", "ceiling grid"]
  },

  // Room finishes (context)
  room_finish: {
    description:
      "Walls: off-white matte paint; trims minimal. Floor: polished concrete, warm light grey. Overall YC aesthetic: clean, modern, uncluttered.",
    styleTokens: ["off-white matte walls", "polished concrete floor", "minimal trims"]
  }
};


