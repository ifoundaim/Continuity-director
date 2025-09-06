/** Minimal stub for a corrective loop.
 * In future: inspect the generated image to measure heights, panel counts,
 * mullion spacing, etc. For now we always return drift:false.
 */
export async function auditImageForDrift(_png: Buffer): Promise<{ drift: boolean; notes?: string }> {
  return { drift: false };
}


