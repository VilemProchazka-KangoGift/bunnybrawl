// Main menu title-screen background. Animated sky, ground, foliage, wildlife,
// and day/night cycle — drawn every frame via the MainMenu rAF loop.

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { initWildlife, updateAndDrawWildlife, drawDayNightCycle } from '../engine/canvasAnimations';
import type { SimpleWildlife } from '../engine/canvasAnimations';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawCloud,
  drawFgBush, drawTallGrass, drawFern, drawFgWildflower,
} from '../engine/themes/drawPrimitives';

const MENU_GROUND_Y = 580;
const DAY_CYCLE_DURATION = 90;

let menuWildlife: SimpleWildlife[] | null = null;
let menuLastTime = 0;

export function drawMenuBackground(ctx: CanvasRenderingContext2D): void {
  const now = performance.now() / 1000;
  if (!menuWildlife) menuWildlife = initWildlife(8, MENU_GROUND_Y);
  const dt = menuLastTime ? Math.min(now - menuLastTime, 0.05) : 1 / 60;
  menuLastTime = now;

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  skyGrad.addColorStop(0, '#4A90D9');
  skyGrad.addColorStop(0.6, '#87CEEB');
  skyGrad.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Distant treeline
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#3A6A3A';
  ctx.beginPath();
  ctx.moveTo(-10, MENU_GROUND_Y + 10);
  for (let x = 0; x < 1300; x += 40) {
    ctx.lineTo(x, MENU_GROUND_Y - 50 - Math.sin(x * 0.013) * 20 - (x * 7 % 17));
  }
  ctx.lineTo(1300, MENU_GROUND_Y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Animated clouds
  const cloudDefs = [
    { speed: 6, offset: 0, y: 70, size: 80 },
    { speed: 4, offset: 350, y: 40, size: 90 },
    { speed: 9, offset: 700, y: 100, size: 60 },
    { speed: 5, offset: 150, y: 25, size: 70 },
    { speed: 7, offset: 550, y: 85, size: 55 },
  ];
  for (const c of cloudDefs) {
    const cx = (now * c.speed + c.offset) % (CANVAS_WIDTH + 300) - 150;
    drawCloud(ctx, cx, c.y, c.size);
  }

  // Hills
  const hills: [number, number, number, number][] = [[0, 350, 130, 580], [280, 450, 110, 590], [650, 380, 140, 575], [950, 400, 115, 590]];
  for (const [hx, hw, hh, hby] of hills) {
    ctx.fillStyle = '#5C9E4C';
    ctx.beginPath();
    ctx.moveTo(hx, hby);
    ctx.quadraticCurveTo(hx + hw / 2, hby - hh, hx + hw, hby);
    ctx.lineTo(hx + hw, MENU_GROUND_Y + 10);
    ctx.lineTo(hx, MENU_GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
  }

  // Ground
  const groundGrad = ctx.createLinearGradient(0, MENU_GROUND_Y, 0, CANVAS_HEIGHT);
  groundGrad.addColorStop(0, '#4a8c3f');
  groundGrad.addColorStop(0.15, '#3a7030');
  groundGrad.addColorStop(1, '#2a5520');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, MENU_GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - MENU_GROUND_Y);
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, MENU_GROUND_Y, CANVAS_WIDTH, 4);
  ctx.strokeStyle = '#5DAF4A';
  ctx.lineWidth = 2;
  for (let x = 5; x < CANVAS_WIDTH; x += 15) {
    ctx.beginPath();
    ctx.moveTo(x, MENU_GROUND_Y);
    ctx.lineTo(x - 2, MENU_GROUND_Y - 6 - (x * 7 % 5));
    ctx.stroke();
  }

  // Background trees
  drawTree(ctx, 40, MENU_GROUND_Y, 60);
  drawTree(ctx, 280, MENU_GROUND_Y, 45);
  drawTree(ctx, 1000, MENU_GROUND_Y, 55);
  drawTree(ctx, 1200, MENU_GROUND_Y, 48);

  // Bushes
  drawBush(ctx, 140, MENU_GROUND_Y, 30);
  drawBush(ctx, 420, MENU_GROUND_Y, 24);
  drawBush(ctx, 850, MENU_GROUND_Y, 28);
  drawBush(ctx, 1100, MENU_GROUND_Y, 22);

  // Flowers
  const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'];
  for (let fx = 60; fx < CANVAS_WIDTH; fx += 70 + (fx * 3 % 40)) {
    drawFlower(ctx, fx, MENU_GROUND_Y, flowerColors[Math.floor(fx * 0.01) % flowerColors.length]);
  }

  // Mushrooms
  drawMushroom(ctx, 200, MENU_GROUND_Y);
  drawMushroom(ctx, 750, MENU_GROUND_Y);
  drawMushroom(ctx, 1150, MENU_GROUND_Y);

  // Grass tufts
  for (let gx = 30; gx < CANVAS_WIDTH; gx += 80 + (gx * 5 % 30)) {
    drawGrassTuft(ctx, gx, MENU_GROUND_Y);
  }

  // Foreground decorations
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawFgBush(ctx, 80, MENU_GROUND_Y, 55);
  drawFgBush(ctx, 500, MENU_GROUND_Y, 48);
  drawFgBush(ctx, 920, MENU_GROUND_Y, 52);
  drawFgBush(ctx, 1180, MENU_GROUND_Y, 42);
  drawTallGrass(ctx, 180, MENU_GROUND_Y, 7);
  drawTallGrass(ctx, 660, MENU_GROUND_Y, 8);
  drawTallGrass(ctx, 1060, MENU_GROUND_Y, 6);
  drawFern(ctx, 50, MENU_GROUND_Y);
  drawFern(ctx, 780, MENU_GROUND_Y);
  drawFern(ctx, 1230, MENU_GROUND_Y);
  drawFgWildflower(ctx, 320, MENU_GROUND_Y, '#FF6B8A', 20);
  drawFgWildflower(ctx, 600, MENU_GROUND_Y, '#DDA0DD', 18);
  drawFgWildflower(ctx, 1100, MENU_GROUND_Y, '#FFD700', 16);
  ctx.restore();

  // Fog wisps
  ctx.save();
  for (let fi = 0; fi < 12; fi++) {
    const fx = (now * (2 + fi * 0.4) + fi * 110) % (CANVAS_WIDTH + 100) - 50;
    const fy = MENU_GROUND_Y - 2 + Math.sin(fi * 2.1) * 8;
    ctx.globalAlpha = 0.08 + (fi % 3) * 0.04;
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 45, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Wildlife
  updateAndDrawWildlife(ctx, menuWildlife!, dt, MENU_GROUND_Y);

  // Day/night cycle
  drawDayNightCycle(ctx, now, DAY_CYCLE_DURATION);
}
