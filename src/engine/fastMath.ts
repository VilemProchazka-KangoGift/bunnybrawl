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

/** Convert hex color "#RRGGBB" to HSL components (h ∈ [0,360], s,l ∈ [0,1]). */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const { r: r255, g: g255, b: b255 } = hexToRGB(hex);
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}
