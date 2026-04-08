import { hexToRGB } from './fastMath';

export interface BodyEllipseParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Returns body ellipse parameters for each character. */
export function getBodyEllipse(
  charName: string,
  cx: number,
  yOff: number,
  w: number,
  h: number,
): BodyEllipseParams {
  switch (charName) {
    case 'Bunny': return { cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.4 };
    case 'Fox': return { cx, cy: yOff + h * 0.55, rx: w * 0.38, ry: h * 0.38 };
    case 'Frog': return { cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.35 };
    case 'Bear': return { cx, cy: yOff + h * 0.5, rx: w * 0.42, ry: h * 0.42 };
    case 'Owl': return { cx, cy: yOff + h * 0.5, rx: w * 0.4, ry: h * 0.42 };
    case 'Cat': return { cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.36 };
    case 'Wolf': return { cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 };
    case 'Panda': return { cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 };
    case 'Pig': return { cx, cy: yOff + h * 0.55, rx: w * 0.4, ry: h * 0.38 };
    case 'Cow': return { cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 };
    case 'Horse': return { cx, cy: yOff + h * 0.52, rx: w * 0.38, ry: h * 0.42 };
    case 'Goat': return { cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 };
    case 'Sheep': return { cx, cy: yOff + h * 0.46, rx: 12, ry: h * 0.18 };
    case 'Monkey': return { cx, cy: yOff + h * 0.52, rx: w * 0.4, ry: h * 0.4 };
    case 'Tiger': return { cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 };
    case 'Rhino': return { cx, cy: yOff + h * 0.55, rx: w * 0.44, ry: h * 0.4 };
    case 'Hedgehog': return { cx: cx + 2, cy: yOff + h * 0.55, rx: w * 0.34, ry: h * 0.32 };
    default: return { cx, cy: yOff + h * 0.5, rx: w * 0.4, ry: h * 0.4 };
  }
}

/** Fill a body ellipse with radial gradient shading. Restores fillStyle to char.color after. */
export function fillBodyGradient(
  ctx: CanvasRenderingContext2D,
  params: BodyEllipseParams,
  char: { color: string; darkColor: string; lightColor: string },
): void {
  const { cx, cy, rx, ry } = params;
  const maxR = Math.max(rx, ry);

  // Blend 30% toward darkColor for subtle edge shading (avoids extreme contrast
  // on characters like Panda/Cow where darkColor is their patch/marking color)
  const edgeColor = blendColors(char.color, char.darkColor, 0.3);

  const grad = ctx.createRadialGradient(
    cx - rx * 0.25, cy - ry * 0.3, maxR * 0.05,
    cx, cy, maxR,
  );
  grad.addColorStop(0, char.lightColor);
  grad.addColorStop(0.5, char.color);
  grad.addColorStop(1, edgeColor);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = char.color;
}

/** Fill a circle with radial gradient (for Sheep's overlapping body circles). */
export function fillBodyGradientCircle(
  ctx: CanvasRenderingContext2D,
  circCx: number,
  circCy: number,
  radius: number,
  char: { color: string; darkColor: string; lightColor: string },
): void {
  const edgeColor = blendColors(char.color, char.darkColor, 0.3);
  const grad = ctx.createRadialGradient(
    circCx - radius * 0.25, circCy - radius * 0.3, radius * 0.05,
    circCx, circCy, radius,
  );
  grad.addColorStop(0, char.lightColor);
  grad.addColorStop(0.5, char.color);
  grad.addColorStop(1, edgeColor);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(circCx, circCy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a soft white highlight spot on the body. */
export function drawHighlightSpot(
  ctx: CanvasRenderingContext2D,
  params: BodyEllipseParams,
): void {
  const { cx, cy, rx, ry } = params;
  const hx = cx - rx * 0.3;
  const hy = cy - ry * 0.35;
  const hr = Math.max(rx, ry) * 0.25;

  const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(hx, hy, hr, hr * 0.75, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function blendColors(hex1: string, hex2: string, t: number): string {
  const c1 = hexToRGB(hex1), c2 = hexToRGB(hex2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRGBA(hex: string, alpha: number): string {
  const { r, g, b } = hexToRGB(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Per-character fur edge intensity. */
export function getFurIntensity(charName: string): number {
  switch (charName) {
    case 'Frog': return 0;
    case 'Hedgehog': return 0;
    case 'Sheep': return 0.3;
    case 'Rhino': return 0.2;
    case 'Pig': return 0.3;
    default: return 1.0;
  }
}

/** Draw subtle stipple dots along body perimeter for fur/fluff texture. */
export function drawFurEdge(
  ctx: CanvasRenderingContext2D,
  params: BodyEllipseParams,
  darkColor: string,
  intensity: number = 1.0,
): void {
  if (intensity <= 0) return;

  const { cx, cy, rx, ry } = params;
  const dotCount = 10;
  const rgba = hexToRGBA(darkColor, 0.1 * intensity);

  ctx.fillStyle = rgba;
  for (let i = 0; i < dotCount; i++) {
    // Irregular spacing via golden angle (not evenly spaced)
    const angle = i * 2.399;
    const outward = 0.5 + ((i * 1.618) % 1) * 2.5;
    const dotX = cx + Math.cos(angle) * (rx + outward);
    const dotY = cy + Math.sin(angle) * (ry + outward);
    const dotR = 0.8 + ((i * 2.414) % 1) * 0.7;

    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}
