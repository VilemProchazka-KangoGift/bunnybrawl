// Fast trigonometric lookup tables for hot render paths.
// 1-degree resolution (360 entries) — sufficient for visual effects, animations, sparkles.
// Do NOT use for physics calculations that need full precision.

const TABLE_SIZE = 360;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_INDEX = TABLE_SIZE / (Math.PI * 2);

const SIN_TABLE = new Float32Array(TABLE_SIZE);
const COS_TABLE = new Float32Array(TABLE_SIZE);

for (let i = 0; i < TABLE_SIZE; i++) {
  const rad = i * DEG_TO_RAD;
  SIN_TABLE[i] = Math.sin(rad);
  COS_TABLE[i] = Math.cos(rad);
}

/** Fast sine using lookup table. ~1-degree precision. For visuals only. */
export function fastSin(radians: number): number {
  // Normalize to [0, TABLE_SIZE) index
  const idx = ((radians * RAD_TO_INDEX) % TABLE_SIZE + TABLE_SIZE) % TABLE_SIZE;
  return SIN_TABLE[idx | 0]; // |0 truncates to int
}

/** Fast cosine using lookup table. ~1-degree precision. For visuals only. */
export function fastCos(radians: number): number {
  const idx = ((radians * RAD_TO_INDEX) % TABLE_SIZE + TABLE_SIZE) % TABLE_SIZE;
  return COS_TABLE[idx | 0];
}

/** Parse hex color '#RRGGBB' to {r,g,b} components. Cache the result. */
export function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}
