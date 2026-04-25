// Dev-only section timing instrumentation. Gated on debugFlags.perfEnabled.
// When disabled: begin/end each early-return after a single boolean check.
// Captured at module init from the URL flag.

import { debugFlags } from './debugFlags';

/** Allowed section names. Restricted to a literal union to prevent dynamic-string
 *  callers from accidentally allocating a 40KB ring per unique value. Add new
 *  sections here as the surface grows. */
export type PerfSection =
  | 'fixedUpdate'
  | 'tickCosmetic'
  | 'cosmeticStep'
  | 'renderFrame'
  | 'awareness'
  | 'particles';

interface SectionStats {
  calls: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
}

interface SectionBuffer {
  samples: Float32Array;
  writeIdx: number;
  count: number;
  totalMs: number;
}

const MAX_SAMPLES_PER_SECTION = 10_000;
const WORK = new Float32Array(MAX_SAMPLES_PER_SECTION);
const sections = new Map<PerfSection, SectionBuffer>();

function getOrCreateBuffer(name: PerfSection): SectionBuffer {
  let buf = sections.get(name);
  if (!buf) {
    buf = {
      samples: new Float32Array(MAX_SAMPLES_PER_SECTION),
      writeIdx: 0,
      count: 0,
      totalMs: 0,
    };
    sections.set(name, buf);
  }
  return buf;
}

export const perfTrace = {
  enabled: debugFlags.perfEnabled,

  begin(_name: PerfSection): number {
    if (!perfTrace.enabled) return 0;
    return performance.now();
  },

  end(name: PerfSection, start: number): void {
    if (!perfTrace.enabled || start === 0) return;
    const elapsed = performance.now() - start;
    const buf = getOrCreateBuffer(name);
    const idx = buf.writeIdx % MAX_SAMPLES_PER_SECTION;
    if (buf.count >= MAX_SAMPLES_PER_SECTION) {
      // Ring is full — subtract the sample we're about to overwrite so totalMs stays in sync with the ring
      buf.totalMs -= buf.samples[idx];
    }
    buf.samples[idx] = elapsed;
    buf.writeIdx++;
    if (buf.count < MAX_SAMPLES_PER_SECTION) buf.count++;
    buf.totalMs += elapsed;
  },

  snapshot(): Record<string, SectionStats> {
    const out: Record<string, SectionStats> = {};
    for (const [name, buf] of sections) {
      if (buf.count === 0) continue;
      for (let i = 0; i < buf.count; i++) WORK[i] = buf.samples[i];
      const slice = WORK.subarray(0, buf.count);
      slice.sort();
      const p95Idx = Math.min(buf.count - 1, Math.floor(buf.count * 0.95));
      out[name] = {
        calls: buf.writeIdx,
        totalMs: buf.totalMs,
        avgMs: buf.totalMs / buf.count,
        p95Ms: slice[p95Idx],
      };
    }
    return out;
  },

  reset(): void {
    sections.clear();
  },
};
