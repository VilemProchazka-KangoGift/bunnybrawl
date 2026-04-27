import type { Particle, Player, Platform, ConfettiParticle } from '../../types';
import { BLOOD_COLOR, CARROT_SIZE, CONFETTI_COUNT, CONFETTI_GRAVITY, CONFETTI_FLUTTER, CONFETTI_LIFE_MIN, CONFETTI_LIFE_MAX, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { swapRemove } from '../../themes/utils';

export const CONFETTI_COLORS = ['#FFD700', '#FF69B4', '#00FFFF', '#7CFC00', '#FF6347', '#DA70D6', '#FFA500'];
const CONFETTI_SHAPES: Array<'star' | 'diamond' | 'circle' | 'ribbon'> = ['star', 'diamond', 'circle', 'ribbon'];

/** Soft cap on simultaneous live particles. Bulk emitters (gore splatter,
 *  fireworks) can produce hundreds per call and matchOver fireworks accrete
 *  across the celebration. Beyond this, GC pressure visibly stutters mobile. */
const MAX_LIVE_PARTICLES = 600;

/** Emit a particle, reusing a recycled object if available to reduce GC pressure. */
export function emitParticle(
  particles: Particle[], freeList: Particle[],
  x: number, y: number, vx: number, vy: number, life: number, size: number, color: string,
): void {
  if (particles.length >= MAX_LIVE_PARTICLES) return;
  const recycled = freeList.pop();
  if (recycled) {
    recycled.x = x; recycled.y = y; recycled.vx = vx; recycled.vy = vy;
    recycled.life = life; recycled.maxLife = life; recycled.size = size; recycled.color = color;
    particles.push(recycled);
  } else {
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }
}

export function spawnDustParticles(
  particles: Particle[], freeList: Particle[],
  player: Player, landVy: number,
): void {
  const cx = player.x + player.width / 2;
  const groundY = player.y + player.height;
  const intensity = Math.min(landVy / 300, 3);
  const count = Math.floor(8 + intensity * 6);
  for (let i = 0; i < count; i++) {
    const life = 0.3 + Math.random() * 0.4 * intensity;
    emitParticle(particles, freeList, cx + (Math.random() - 0.5) * player.width * 1.5, groundY - Math.random() * 4, (Math.random() - 0.5) * 150 * intensity, -Math.random() * 80 * intensity - 20, life, 2 + Math.random() * 4 * intensity, '#C8B896');
  }
}

export function spawnJumpDustParticles(
  particles: Particle[], freeList: Particle[],
  player: Player,
): void {
  const cx = player.x + player.width / 2;
  const groundY = player.y + player.height;
  const count = 5;
  for (let i = 0; i < count; i++) {
    const sx = cx + (Math.random() - 0.5) * player.width * 0.4;
    const sy = groundY - Math.random() * 2;
    const vx = (Math.random() - 0.5) * 160;
    const vy = -Math.random() * 70 - 30;
    const life = 0.35 * (0.7 + Math.random() * 0.3);
    const size = 1.5 + Math.random() * 1.5;
    emitParticle(particles, freeList, sx, sy, vx, vy, life, size, '#C8B896');
  }
}

export function spawnGoreParticles(
  particles: Particle[], freeList: Particle[],
  victim: Player, extremeGore: boolean,
): void {
  const cx = victim.x + victim.width / 2;
  const cy = victim.y + victim.height / 2;
  const baseCnt = 35 + Math.floor(Math.random() * 15);
  const count = extremeGore ? baseCnt * 3 : baseCnt;
  for (let i = 0; i < count; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const hSpeed = (120 + Math.random() * 220) * side;
    const vSpeed = -(40 + Math.random() * 180);
    const life = 0.6 + Math.random() * 0.8;
    emitParticle(particles, freeList, cx + (Math.random() - 0.5) * 14, cy + (Math.random() - 0.5) * 10, hSpeed + (Math.random() - 0.5) * 60, vSpeed, life, 2 + Math.random() * 5, BLOOD_COLOR);
  }
}

export function spawnConfetti(
  confetti: ConfettiParticle[],
  victim: Player,
): void {
  const cx = victim.x + victim.width / 2;
  const cy = victim.y + victim.height / 2;
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 190;
    const life = CONFETTI_LIFE_MIN + Math.random() * (CONFETTI_LIFE_MAX - CONFETTI_LIFE_MIN);
    confetti.push({
      x: cx + (Math.random() - 0.5) * 10,
      y: cy + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      life, maxLife: life,
      size: 3 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 10,
      flutter: Math.random() * Math.PI * 2,
    });
  }
}

export function spawnRingVFX(
  particles: Particle[], freeList: Particle[],
  cx: number, cy: number,
): void {
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const speed = 40 + Math.random() * 60;
    const life = 0.5 + Math.random() * 0.3;
    emitParticle(particles, freeList, cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 2 + Math.random() * 3, i % 2 === 0 ? '#FFD700' : '#FF8C00');
  }
}

export function spawnCarrotVFX(
  particles: Particle[], freeList: Particle[],
  x: number, y: number,
): void {
  spawnRingVFX(particles, freeList, x, y + CARROT_SIZE / 2);
}

export function spawnFirework(particles: Particle[], freeList: Particle[]): void {
  const fx = Math.random() * CANVAS_WIDTH;
  const fy = Math.random() * (CANVAS_HEIGHT * 0.5);
  const count = 20 + Math.floor(Math.random() * 11);
  const brightColors = ['#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF', '#FFD700', '#FF8C00', '#FF69B4'];
  const color = brightColors[Math.floor(Math.random() * brightColors.length)];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 140;
    const life = 0.6 + Math.random() * 0.6;
    emitParticle(particles, freeList, fx, fy, Math.cos(angle) * speed, Math.sin(angle) * speed - 50, life, 2 + Math.random() * 4, color);
  }
}

export function updateParticles(
  particles: Particle[], freeList: Particle[],
  platforms: readonly Platform[], gore: boolean,
  newBloodDrips: Array<{ x: number; y: number; radius: number; color: string }>,
  dt: number,
): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      swapRemove(particles, i);
      if (freeList.length < 300) freeList.push(p);
      continue;
    }
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 80 * dt;
    if (gore && p.color === BLOOD_COLOR && p.vy > 0) {
      for (let pi = 0; pi < platforms.length; pi++) {
        const plat = platforms[pi];
        if (prevY < plat.y && p.y >= plat.y && p.x >= plat.x && p.x <= plat.x + plat.width) {
          newBloodDrips.push({ x: p.x, y: plat.y, radius: 2 + Math.random() * 3, color: BLOOD_COLOR });
          p.life = 0;
          break;
        }
      }
    }
  }
}

export function updateConfetti(
  confetti: ConfettiParticle[],
  timeElapsed: number, dt: number,
): void {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= dt;
    if (c.life <= 0) {
      swapRemove(confetti, i);
      continue;
    }
    c.x += c.vx * dt + Math.sin(timeElapsed * 6 + c.flutter) * CONFETTI_FLUTTER * dt;
    c.y += c.vy * dt;
    c.vy += CONFETTI_GRAVITY * dt;
    c.rotation += c.rotationSpeed * dt;
  }
}
