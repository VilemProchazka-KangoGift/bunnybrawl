// Dev-only section timing instrumentation. Gated on debugFlags.perfEnabled.
// When disabled: begin returns 0 in O(1), end is a single boolean check.
// Captured at module init from the URL flag.

import { debugFlags } from './debugFlags';

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
const sections = new Map<string, SectionBuffer>();

function getOrCreateBuffer(name: string): SectionBuffer {
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

  begin(_name: string): number {
    if (!perfTrace.enabled) return 0;
    return performance.now();
  },

  end(name: string, start: number): void {
    if (!perfTrace.enabled || start === 0) return;
    const elapsed = performance.now() - start;
    const buf = getOrCreateBuffer(name);
    buf.samples[buf.writeIdx % MAX_SAMPLES_PER_SECTION] = elapsed;
    buf.writeIdx++;
    if (buf.count < MAX_SAMPLES_PER_SECTION) buf.count++;
    buf.totalMs += elapsed;
  },

  snapshot(): Record<string, SectionStats> {
    const out: Record<string, SectionStats> = {};
    const work = new Float32Array(MAX_SAMPLES_PER_SECTION);
    for (const [name, buf] of sections) {
      if (buf.count === 0 || buf.writeIdx === 0) continue;
      for (let i = 0; i < buf.count; i++) work[i] = buf.samples[i];
      const slice = work.subarray(0, buf.count);
      slice.sort();
      const p95Idx = Math.min(buf.count - 1, Math.floor(buf.count * 0.95));
      out[name] = {
        calls: buf.writeIdx,
        totalMs: buf.totalMs,
        avgMs: buf.totalMs / buf.writeIdx,
        p95Ms: slice[p95Idx],
      };
    }
    return out;
  },

  reset(): void {
    sections.clear();
  },
};
