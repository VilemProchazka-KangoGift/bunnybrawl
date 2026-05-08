// Background primitives — distant/mid-ground decorations drawn behind platforms.

import type { Ctx2D } from '../../types';

export interface TreeColors {
  trunk: string;
  bark: string;
  foliage: Array<{ color: string; yOff: number; rx: number; ry: number }>;
}

const DEFAULT_TREE_COLORS: TreeColors = {
  trunk: '#6B4226',
  bark: '#553318',
  foliage: [
    { color: '#2D8B2D', yOff: 0.4, rx: 0.55, ry: 0.3 },
    { color: '#3AA03A', yOff: 0.6, rx: 0.45, ry: 0.28 },
    { color: '#4AB84A', yOff: 0.8, rx: 0.32, ry: 0.22 },
  ],
};

export function drawTree(
  ctx: Ctx2D,
  x: number,
  groundY: number,
  size: number,
  colors: TreeColors = DEFAULT_TREE_COLORS,
): void {
  const trunkW = size * 0.2;
  const trunkH = size * 0.8;

  // Trunk
  ctx.fillStyle = colors.trunk;
  ctx.fillRect(x - trunkW / 2, groundY - trunkH, trunkW, trunkH);
  // Bark lines
  ctx.strokeStyle = colors.bark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 2, groundY - trunkH * 0.3);
  ctx.lineTo(x - 1, groundY - trunkH * 0.6);
  ctx.stroke();

  // Foliage layers (bottom to top)
  for (const l of colors.foliage) {
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.ellipse(x, groundY - trunkH * l.yOff - size * 0.2, size * l.rx, size * l.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface BushColors {
  base: string;
  highlight: string;
  dark: string;
}

const DEFAULT_BUSH_COLORS: BushColors = {
  base: '#3A8C3A',
  highlight: '#4CA64C',
  dark: '#2D6B2D',
};

export function drawBush(
  ctx: Ctx2D,
  x: number,
  groundY: number,
  size: number,
  colors: BushColors = DEFAULT_BUSH_COLORS,
): void {
  ctx.fillStyle = colors.base;
  ctx.beginPath();
  ctx.ellipse(x, groundY - size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.highlight;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.15, groundY - size * 0.55, size * 0.35, size * 0.25, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.ellipse(x - size * 0.1, groundY - size * 0.2, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFlower(ctx: Ctx2D, x: number, groundY: number, color: string): void {
  ctx.strokeStyle = '#3A7A3A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, groundY - 12);
  ctx.stroke();

  ctx.fillStyle = color;
  const petalR = 3;
  for (let a = 0; a < 5; a++) {
    const angle = (a / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 3, groundY - 14 + Math.sin(angle) * 3, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFE04A';
  ctx.beginPath();
  ctx.arc(x, groundY - 14, 2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawMushroom(ctx: Ctx2D, x: number, groundY: number): void {
  ctx.fillStyle = '#F5F0E0';
  ctx.fillRect(x - 3, groundY - 10, 6, 10);
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath();
  ctx.ellipse(x, groundY - 10, 8, 6, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(x - 3, groundY - 13, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 3, groundY - 12, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGrassTuft(ctx: Ctx2D, x: number, groundY: number, color = '#5DAF4A'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 3, groundY);
    ctx.lineTo(x + i * 5, groundY - 6 - Math.random() * 3);
    ctx.stroke();
  }
}

export function drawHill(ctx: Ctx2D, x: number, baseY: number, width: number, height: number): void {
  ctx.beginPath();
  ctx.moveTo(x, baseY + 60);
  ctx.quadraticCurveTo(x + width / 2, baseY - height, x + width, baseY + 60);
  ctx.fill();
}

export function drawCloud(ctx: Ctx2D, x: number, y: number, size: number, color = 'rgba(255, 255, 255, 0.7)'): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
  ctx.arc(x + size * 0.35, y + size * 0.1, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPlatformMoss(ctx: Ctx2D, edgeX: number, platY: number, platH: number): void {
  ctx.fillStyle = '#3A7A3A';
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * 4;
    const hang = 5 + i * 2;
    ctx.beginPath();
    ctx.ellipse(edgeX + ox, platY + platH + hang * 0.5, 3, hang * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2D6B2D';
  ctx.beginPath();
  ctx.ellipse(edgeX, platY + platH + 2, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}
