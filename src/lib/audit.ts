/** Minimal stub for a corrective loop.
 * In future: inspect the generated image to measure heights, panel counts,
 * mullion spacing, etc. For now we always return drift:false.
 */
export async function auditImageForDrift(_png: Buffer): Promise<{ drift: boolean; notes?: string }> {
  // Stub: assume pass and provide placeholders for future checks
  const notes = [
    "door: geometry within tolerance (stub)",
    "carpet: seams/rotation consistent (stub)"
  ].join("; ");
  return { drift: false, notes };
}


