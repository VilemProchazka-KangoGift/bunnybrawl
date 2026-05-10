/** SAB-backed particles wire for renderer-only worker mode — Step 4
 *  (first pass) of the SAB exploration roadmap.
 *
 *  Particles are the biggest sub-payload of `host:renderFrame` — up to
 *  PARTICLE_POOL_CAP (600) per frame, each a small object with a string
 *  `color`. Structured clone of that array is the #2 CPU hotspot on
 *  worker-on (`RendererProxy.post` at ~12% of profile CPU on castle).
 *
 *  Wire layout (single SAB, two views):
 *
 *    Uint32 view (header + per-particle metadata):
 *      [0]                = generation — bumped on each write
 *      [1]                = count — number of live particles
 *      [2 .. 2+MAX-1]     = packed color+shape per particle
 *                           bit  0..7  = blue
 *                           bit  8..15 = green
 *                           bit 16..23 = red
 *                           bit 24     = shape (0=circle, 1=spike)
 *
 *    Float32 view (per-particle data), starts after the Uint32 region:
 *      For each particle i: [x, y, vx, vy, life, maxLife, size]
 *
 *  Color strings: re-derived on the worker side with a small cache so
 *  `'rgb(r,g,b)'` allocations don't happen per-frame. Particles share
 *  colors heavily across a match (~10-30 unique colors typical), so the
 *  cache stays tiny.
 *
 *  Fallback: when `crossOriginIsolated` is false (GitHub Pages prod),
 *  main keeps shipping the full `particles: Particle[]` field in
 *  `host:renderFrame` and the worker reads it directly. */

import type { Particle, ParticleShape } from '../types';

export const SAB_PARTICLE_MAX = 600;
const HEADER_INTS = 2;
const FLOAT_FIELDS_PER_PARTICLE = 7;

export const SAB_PARTICLES_BYTES =
  (HEADER_INTS + SAB_PARTICLE_MAX) * 4
  + SAB_PARTICLE_MAX * FLOAT_FIELDS_PER_PARTICLE * 4;

export interface ParticleSabViews {
  meta: Uint32Array;
  data: Float32Array;
}

export function isSabSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
    && typeof crossOriginIsolated !== 'undefined'
    && crossOriginIsolated === true;
}

export function createParticlesSab(): SharedArrayBuffer | null {
  if (!isSabSupported()) return null;
  return new SharedArrayBuffer(SAB_PARTICLES_BYTES);
}

export function makeViews(sab: SharedArrayBuffer | ArrayBuffer): ParticleSabViews {
  const metaLen = HEADER_INTS + SAB_PARTICLE_MAX;
  const meta = new Uint32Array(sab, 0, metaLen);
  const data = new Float32Array(sab, metaLen * 4, SAB_PARTICLE_MAX * FLOAT_FIELDS_PER_PARTICLE);
  return { meta, data };
}

/** Pack a `#rrggbb` hex into 0x00RRGGBB. Defensive: returns magenta
 *  (0xff00ff) for anything not starting with `#` so a stray `rgb(...)`
 *  callsite is obvious in dev rather than producing silent garbage. */
function packColor(hex: string): number {
  if (hex.charCodeAt(0) !== 0x23 /* '#' */) return 0xff00ff;
  const v = parseInt(hex.slice(1), 16);
  return v & 0x00ffffff;
}

function packMeta(color: string, shape: ParticleShape | undefined): number {
  const c = packColor(color);
  const shapeBit = shape === 'spike' ? 1 : 0;
  return (shapeBit << 24) | c;
}

/** Worker-side color cache: int → 'rgb(r,g,b)' string. Bounded by the
 *  set of distinct colors in a match (typical: < 50 entries). */
export class ColorCache {
  private map = new Map<number, string>();

  get(packed: number): string {
    const colorOnly = packed & 0x00ffffff;
    const cached = this.map.get(colorOnly);
    if (cached !== undefined) return cached;
    const r = (colorOnly >> 16) & 0xff;
    const g = (colorOnly >> 8) & 0xff;
    const b = colorOnly & 0xff;
    const s = `rgb(${r},${g},${b})`;
    this.map.set(colorOnly, s);
    return s;
  }
}

/** Encode `particles` into the SAB views. Bumps `generation`.
 *
 *  Torn-read note: main writes `count` last (after data), worker reads
 *  `count` first. So a worker read can see N-1 particles fully written
 *  + the Nth being mid-write — but that's the OLD Nth particle since
 *  count is bumped to N only after particle N's slots are filled.
 *  Visual cost is one frame of slightly-stale particles in the worst
 *  case; acceptable at 60Hz. */
export function writeParticles(views: ParticleSabViews, particles: ReadonlyArray<Particle>): void {
  const n = Math.min(particles.length, SAB_PARTICLE_MAX);
  const { meta, data } = views;
  for (let i = 0; i < n; i++) {
    const p = particles[i];
    meta[HEADER_INTS + i] = packMeta(p.color, p.shape);
    const off = i * FLOAT_FIELDS_PER_PARTICLE;
    data[off + 0] = p.x;
    data[off + 1] = p.y;
    data[off + 2] = p.vx;
    data[off + 3] = p.vy;
    data[off + 4] = p.life;
    data[off + 5] = p.maxLife;
    data[off + 6] = p.size;
  }
  Atomics.store(meta, 0, (meta[0] | 0) + 1); // generation
  Atomics.store(meta, 1, n);                  // count — published last
}

/** Read up to `SAB_PARTICLE_MAX` particles into a pre-allocated pool.
 *  Returns the live count. Grows `pool` lazily up to SAB_PARTICLE_MAX. */
export function readParticles(
  views: ParticleSabViews,
  pool: Particle[],
  colors: ColorCache,
): number {
  const { meta, data } = views;
  const n = Atomics.load(meta, 1);
  // Lazy growth — fresh Particle objects are tiny.
  while (pool.length < n) {
    pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '', shape: undefined });
  }
  for (let i = 0; i < n; i++) {
    const packed = meta[HEADER_INTS + i];
    const p = pool[i];
    p.color = colors.get(packed);
    p.shape = (packed & (1 << 24)) !== 0 ? 'spike' : 'circle';
    const off = i * FLOAT_FIELDS_PER_PARTICLE;
    p.x = data[off + 0];
    p.y = data[off + 1];
    p.vx = data[off + 2];
    p.vy = data[off + 3];
    p.life = data[off + 4];
    p.maxLife = data[off + 5];
    p.size = data[off + 6];
  }
  return n;
}
