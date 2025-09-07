export const ROOM_TEMPLATES = {
  yc_interview: { width: 20, depth: 14, height: 10 },   // ft (your current)
  compact:      { width: 18, depth: 12, height: 10 },   // tighter, still workable
};

export const OBJECT_DEFAULTS = {
  table84x36: { w: 7, d: 3, h: 2.5 },                   // 84" x 36" x 30"
  table72x36: { w: 6, d: 3, h: 2.5 },                   // option for compact rooms
  chair:      { w: 1.6, d: 1.6, h: 3, seatH: 1.5 },     // ~19" seat height
  panel24x48: { w: 2, d: 0.2, h: 4 },                   // acoustic panel
  tv65:       { w: 4.8, d: 0.5, h: 2.7, mountCenterH: 5 },
  whiteboard: { w: 6, d: 0.5, h: 4, mountCenterH: 4.5 },
};

export const CLEARANCES = {
  aisleMin: 3.0,            // 36" walkway
  chairBackToTable: 1.5,    // 18"
  chairToChair: 2.5,        // 30"
  tableToWallPrefer: 4.0,   // 48" preferred to glass/whiteboard
  tableToWallMin: 3.0,      // 36" minimum
  wallGapMin: 0.1,          // float tolerance
};

// classify reasons
export const REASONS = {
  OUT_OF_BOUNDS: "out_of_bounds",
  WALL_MISALIGNED: "wall_not_on",
  OVERLAP: "overlap",
  CHAIR_BACK: "chair_too_close_to_table",
  CHAIR_SPACING: "chairs_too_close",
  AISLE: "aisle_violation",
};

export function isError(reason: string) {
  return (
    reason === REASONS.OUT_OF_BOUNDS ||
    reason === REASONS.WALL_MISALIGNED ||
    reason === REASONS.OVERLAP
  );
}

export function isWarning(reason: string) {
  return (
    reason === REASONS.CHAIR_BACK ||
    reason === REASONS.CHAIR_SPACING ||
    reason === REASONS.AISLE
  );
}

export const QUALITY = {
  maxWarnings: 2,   // stop once warnings <= this
  maxPasses: 12,    // safety cap for the validator loop
};


