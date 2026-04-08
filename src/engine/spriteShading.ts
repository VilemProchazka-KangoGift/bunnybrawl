import { hexToRGB } from './fastMath';

export interface BodyEllipseParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

function blendColors(hex1: string, hex2: string, t: number): string {
  const c1 = hexToRGB(hex1), c2 = hexToRGB(hex2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
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
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(hx, hy, hr, hr * 0.75, -0.3, 0, Math.PI * 2);
  ctx.fill();
}
