// @ts-check
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { SourceMapConsumer } from 'source-map';

const V8_INTERNAL_NAMES = new Set([
  '(garbage collector)',
  '(idle)',
  '(program)',
  '(root)',
  '',
]);

export function flattenCpuProfile(profile) {
  const selfTimeByNodeId = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i];
    const delta = deltas[i] ?? 0;
    selfTimeByNodeId.set(id, (selfTimeByNodeId.get(id) ?? 0) + delta);
  }

  const out = [];
  for (const node of profile.nodes ?? []) {
    if (V8_INTERNAL_NAMES.has(node.callFrame.functionName)) continue;
    const selfUs = selfTimeByNodeId.get(node.id) ?? 0;
    if (selfUs === 0) continue;
    out.push({
      id: node.id,
      functionName: node.callFrame.functionName,
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber,
      columnNumber: node.callFrame.columnNumber,
      selfMs: selfUs / 1000,
      source: null,
      sourceLine: null,
    });
  }
  out.sort((a, b) => b.selfMs - a.selfMs);
  return out;
}

export function computeFrameStats(dts) {
  if (dts.length === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, long16ms: 0, long33ms: 0 };
  }
  const sorted = [...dts].sort((a, b) => a - b);
  const sum = sorted.reduce((s, x) => s + x, 0);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    count: dts.length,
    meanMs: sum / dts.length,
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
    maxMs: sorted[sorted.length - 1],
    long16ms: dts.filter((d) => d > 16.67).length,
    long33ms: dts.filter((d) => d > 33.33).length,
  };
}

export function bucketByModule(flat) {
  const buckets = new Map();
  for (const node of flat) {
    let mod = 'other';
    if (node.source) {
      const m = node.source.match(/src\/engine\/([^/]+)\//);
      if (m) mod = m[1];
      else if (node.source.startsWith('src/engine/')) mod = 'engine-root';
      else if (node.source.startsWith('src/components/')) mod = 'components';
      else if (node.source.startsWith('src/store/')) mod = 'store';
    }
    buckets.set(mod, (buckets.get(mod) ?? 0) + node.selfMs);
  }
  return [...buckets.entries()]
    .map(([module, selfMs]) => ({ module, selfMs }))
    .sort((a, b) => b.selfMs - a.selfMs);
}

export async function buildSourceMapResolver(mapsDir) {
  const consumers = new Map();
  let mapFiles;
  try {
    mapFiles = readdirSync(mapsDir).filter((f) => f.endsWith('.js.map'));
  } catch {
    return null;
  }
  for (const fname of mapFiles) {
    const raw = JSON.parse(readFileSync(path.join(mapsDir, fname), 'utf8'));
    const consumer = await new SourceMapConsumer(raw);
    consumers.set(fname.slice(0, -4), consumer);
  }
  return {
    resolve(url, line, column) {
      if (!url) return null;
      let basename = url.split('/').pop() ?? '';
      const queryIdx = basename.indexOf('?');
      if (queryIdx >= 0) basename = basename.slice(0, queryIdx);
      const consumer = consumers.get(basename);
      if (!consumer) return null;
      const orig = consumer.originalPositionFor({
        line: Math.max(1, line + 1),
        column: Math.max(0, column),
      });
      if (!orig.source) return null;
      const cleaned = orig.source.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      return { source: cleaned, line: orig.line ?? null };
    },
    destroy() {
      for (const c of consumers.values()) c.destroy();
    },
  };
}

function correlateLongFrames(dts, lastSampleTime, longTasks) {
  // dts is newest-first. Reconstruct absolute (performance.now()-relative)
  // timestamps so they align with longTask.startTime in the same reference frame.
  // Each frame's timestamp is the END of the frame interval; this is what the
  // browser would treat as the rAF tick time.
  const timeline = [];
  let t = lastSampleTime;
  for (const dt of dts) {
    timeline.push({ tMs: t, dt });
    t -= dt;
  }
  timeline.reverse(); // oldest-first
  const long = timeline.filter((f) => f.dt > 25);
  return long.map((f) => {
    const window = 50; // ms window for matching a longTask to a frame
    const overlap = longTasks.find((lt) => {
      const ltEnd = lt.startTime + lt.duration;
      // longTask overlaps the frame if its window touches [f.tMs - dt, f.tMs]
      const frameStart = f.tMs - f.dt;
      return ltEnd >= frameStart - window && lt.startTime <= f.tMs + window;
    });
    return {
      tSec: (f.tMs / 1000).toFixed(2),
      frameMs: f.dt.toFixed(1),
      gcPauseMs: overlap ? overlap.duration.toFixed(1) : '—',
    };
  });
}

function summarizeHeapTimeline(timeline) {
  if (timeline.length === 0) return null;
  const start = timeline[0].usedMB;
  const end = timeline[timeline.length - 1].usedMB;
  const peak = Math.max(...timeline.map((p) => p.usedMB));
  const trough = Math.min(...timeline.map((p) => p.usedMB));
  let gcEvents = 0;
  let totalDrop = 0;
  for (let i = 1; i < timeline.length; i++) {
    const drop = timeline[i - 1].usedMB - timeline[i].usedMB;
    if (drop > 5) {
      gcEvents++;
      totalDrop += drop;
    }
  }
  return {
    startMB: start.toFixed(1),
    peakMB: peak.toFixed(1),
    endMB: end.toFixed(1),
    sawtoothMB: (peak - trough).toFixed(1),
    gcEvents,
    avgDropMB: gcEvents > 0 ? (totalDrop / gcEvents).toFixed(1) : '0',
    growthMB: (end - start).toFixed(1),
    leakSuspect: end - start > 30 && gcEvents < 3,
  };
}

function formatLoc(node) {
  return node.source && node.sourceLine
    ? `${node.source}:${node.sourceLine}`
    : `${(node.url || '').split('/').pop() ?? '?'}:${node.lineNumber + 1}`;
}

function flattenHeapProfile(heap, durationS) {
  const out = [];
  function walk(node) {
    if (!node) return;
    if (node.selfSize > 0 && !V8_INTERNAL_NAMES.has(node.callFrame.functionName)) {
      out.push({
        functionName: node.callFrame.functionName,
        url: node.callFrame.url,
        lineNumber: node.callFrame.lineNumber,
        columnNumber: node.callFrame.columnNumber,
        bytesPerSec: node.selfSize / durationS / (1024 * 1024),
        source: null,
        sourceLine: null,
      });
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(heap.head);
  out.sort((a, b) => b.bytesPerSec - a.bytesPerSec);
  return out;
}

/** Render the worker render-time + section + long-frame + compositor-pacing
 *  sections of the report. workerData is the parsed worker-stats.json. */
function appendWorkerReport(lines, workerData) {
  const { cpuThrottle, workerStats, compositorPacing } = workerData;
  if (!workerStats && (!compositorPacing || compositorPacing.length === 0)) {
    return;
  }
  lines.push('## Worker offload diagnostics');
  lines.push('');
  if (cpuThrottle && cpuThrottle > 1) {
    lines.push(`> CPU throttle ${cpuThrottle}× applied to main thread (workers run on a separate thread, unaffected).`);
    lines.push('');
  }
  if (workerStats) {
    lines.push('### Worker render time (per-frame distribution)');
    lines.push('');
    const histStats = computeHistogramStats(workerStats.histogram, workerStats.histogramBucketMs, workerStats.frames);
    if (workerStats.frames > 0) {
      lines.push(`- frames: ${workerStats.frames}`);
      lines.push(`- avg renderFrame: ${(workerStats.renderSumMs / workerStats.frames).toFixed(2)}ms`);
      lines.push(`- p50 ${histStats.p50.toFixed(2)} · p95 ${histStats.p95.toFixed(2)} · p99 ${histStats.p99.toFixed(2)} · max ${workerStats.renderMaxMs.toFixed(2)}`);
      lines.push(`- avg handler (incl cosmetic ticks): ${(workerStats.handlerSumMs / workerStats.frames).toFixed(2)}ms`);
      lines.push(`- long(>12ms): ${histStats.over12} · long(>16.67ms): ${histStats.over1667}`);
      if (workerStats.overflowFrames > 0) {
        lines.push(`- ⚠ ${workerStats.overflowFrames} frames exceeded the histogram upper bound`);
      }
    }
    lines.push('');
    if (workerStats.sections && Object.keys(workerStats.sections).length > 0) {
      lines.push('### Worker section timings (perfTrace inside the worker)');
      lines.push('');
      lines.push('| Section | Calls | Total ms | Avg ms | p95 ms |');
      lines.push('|---------|-------|----------|--------|--------|');
      const wSecRows = Object.entries(workerStats.sections).sort((a, b) => b[1].avgMs - a[1].avgMs);
      for (const [name, s] of wSecRows) {
        lines.push(`| ${name} | ${s.calls} | ${s.totalMs.toFixed(1)} | ${s.avgMs.toFixed(2)} | ${s.p95Ms.toFixed(2)} |`);
      }
      lines.push('');
    }
    if (workerStats.longFrames && workerStats.longFrames.length > 0) {
      lines.push(`### Worker long frames (>12ms — first ${Math.min(20, workerStats.longFrames.length)})`);
      lines.push('');
      lines.push('| frame ms | hot sections (this-frame totals) |');
      lines.push('|----------|----------------------------------|');
      for (const lf of workerStats.longFrames.slice(0, 20)) {
        const top = Object.entries(lf.sections)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([n, ms]) => `${n} ${ms.toFixed(2)}ms`)
          .join(', ');
        lines.push(`| ${lf.ms.toFixed(2)} | ${top || '_(no perfTrace data)_'} |`);
      }
      lines.push('');
    }
  }
  if (compositorPacing && compositorPacing.length > 0) {
    lines.push('### Compositor frame pacing (requestVideoFrameCallback deltas)');
    lines.push('');
    const sorted = [...compositorPacing].sort((a, b) => a - b);
    const sum = sorted.reduce((s, x) => s + x, 0);
    const avg = sum / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const max = sorted[sorted.length - 1];
    const drops = sorted.filter((x) => x > 16.67 + 4).length;  // > vsync + tolerance
    const heavyDrops = sorted.filter((x) => x > 33.33).length;
    lines.push(`- presentations: ${sorted.length}`);
    lines.push(`- avg ${avg.toFixed(2)}ms (${(1000 / avg).toFixed(0)} fps observed) · p50 ${p50.toFixed(2)} · p95 ${p95.toFixed(2)} · p99 ${p99.toFixed(2)} · max ${max.toFixed(2)}`);
    lines.push(`- frame drops (>20.67ms): ${drops}/${sorted.length} (${((drops / sorted.length) * 100).toFixed(1)}%)`);
    lines.push(`- heavy drops (>33.33ms): ${heavyDrops}/${sorted.length}`);
    lines.push('');
  }
}

function computeHistogramStats(histogram, bucketMs, totalFrames) {
  let cum = 0;
  let p50 = 0, p95 = 0, p99 = 0;
  let over12 = 0, over1667 = 0;
  if (!histogram || totalFrames === 0) return { p50, p95, p99, over12, over1667 };
  const targetP50 = totalFrames * 0.5;
  const targetP95 = totalFrames * 0.95;
  const targetP99 = totalFrames * 0.99;
  for (let i = 0; i < histogram.length; i++) {
    const upper = (i + 1) * bucketMs;
    cum += histogram[i];
    if (p50 === 0 && cum >= targetP50) p50 = upper;
    if (p95 === 0 && cum >= targetP95) p95 = upper;
    if (p99 === 0 && cum >= targetP99) p99 = upper;
    if (upper > 12) over12 += histogram[i];
    if (upper > 16.67) over1667 += histogram[i];
  }
  return { p50, p95, p99, over12, over1667 };
}

async function main() {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf('--in');
  const inDir = inIdx >= 0 ? args[inIdx + 1] : path.join(process.cwd(), 'test-results', 'perf');

  const cpu = JSON.parse(readFileSync(path.join(inDir, 'cpu.cpuprofile'), 'utf8'));
  const heap = JSON.parse(readFileSync(path.join(inDir, 'heap.heapprofile'), 'utf8'));
  const sections = JSON.parse(readFileSync(path.join(inDir, 'sections.json'), 'utf8'));
  const frames = JSON.parse(readFileSync(path.join(inDir, 'frame-samples.json'), 'utf8'));
  const longTasks = JSON.parse(readFileSync(path.join(inDir, 'long-tasks.json'), 'utf8'));
  const heapTimeline = JSON.parse(readFileSync(path.join(inDir, 'heap-timeline.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(path.join(inDir, 'metadata.json'), 'utf8'));
  // Worker stats are present iff the proxy is active. Tolerate the file
  // missing (no-worker baseline runs predate this analyzer change).
  let workerData = null;
  try {
    workerData = JSON.parse(readFileSync(path.join(inDir, 'worker-stats.json'), 'utf8'));
  } catch { /* legacy run — worker-stats.json absent */ }

  const cpuFlat = flattenCpuProfile(cpu);
  const heapFlat = flattenHeapProfile(heap, meta.scenario.durationS);

  const mapsDir = path.join(process.cwd(), meta.buildOutDir, 'assets');
  const resolver = await buildSourceMapResolver(mapsDir);
  let unresolvedCount = 0;
  if (resolver) {
    for (const node of cpuFlat) {
      const orig = resolver.resolve(node.url, node.lineNumber, node.columnNumber);
      if (orig) {
        node.source = orig.source;
        node.sourceLine = orig.line;
      } else if (node.url) {
        // Only count as "unresolved" if a URL was present but didn't match a sourcemap.
        // Empty URLs are V8 builtins (drawImage, fillRect, etc.) — not user code, not a sourcemap miss.
        unresolvedCount++;
      }
    }
    for (const node of heapFlat) {
      const orig = resolver.resolve(node.url, node.lineNumber, node.columnNumber);
      if (orig) {
        node.source = orig.source;
        node.sourceLine = orig.line;
      }
    }
    resolver.destroy();
  }

  const frameStats = computeFrameStats(frames.dts ?? []);
  const buckets = bucketByModule(cpuFlat);
  const totalCpuMs = cpuFlat.reduce((s, n) => s + n.selfMs, 0);
  const heapSummary = summarizeHeapTimeline(heapTimeline);
  const longFrames = correlateLongFrames(frames.dts ?? [], frames.lastSampleTime ?? 0, longTasks);

  const lines = [];
  lines.push(`# Perf Profile — ${meta.runStartedAt}`);
  lines.push('');
  lines.push(`**Scenario**: ${meta.scenario.arena} · ${meta.scenario.bots} bots ${meta.scenario.difficulty} · ${meta.scenario.durationS}s`);
  lines.push(`**Build**: ${meta.buildOutDir} (sourcemaps) · commit ${meta.commit}`);
  lines.push(`**User-Agent**: ${meta.userAgent}`);
  if (unresolvedCount > 0) {
    lines.push('');
    lines.push(`> ⚠ ${unresolvedCount} hotspot(s) could not be resolved via sourcemap. Confirm the perf build emitted .map files in \`${meta.buildOutDir}/assets/\`.`);
  }
  lines.push('');
  lines.push('## Frame stats (rAF samples)');
  lines.push('');
  if (frameStats.count > 0) {
    lines.push(`- avg ${frameStats.meanMs.toFixed(1)}ms (${(1000 / frameStats.meanMs).toFixed(0)} fps)`);
    lines.push(`- p50 ${frameStats.p50Ms.toFixed(1)} · p95 ${frameStats.p95Ms.toFixed(1)} · p99 ${frameStats.p99Ms.toFixed(1)} · max ${frameStats.maxMs.toFixed(1)}`);
    lines.push(`- long(>16.67ms): ${frameStats.long16ms}/${frameStats.count} (${((frameStats.long16ms / Math.max(1, frameStats.count)) * 100).toFixed(1)}%)`);
    lines.push(`- long(>33.33ms): ${frameStats.long33ms}/${frameStats.count}`);
  } else {
    lines.push('_(no frame samples — confirm ?debug=perffps in URL)_');
  }
  lines.push('');
  lines.push('## Heap timeline (1Hz)');
  lines.push('');
  if (heapSummary) {
    lines.push(`- start ${heapSummary.startMB}MB · peak ${heapSummary.peakMB}MB · end ${heapSummary.endMB}MB`);
    lines.push(`- growth ${heapSummary.growthMB}MB · sawtooth amplitude ~${heapSummary.sawtoothMB}MB`);
    lines.push(`- GC events: ${heapSummary.gcEvents} (avg drop ${heapSummary.avgDropMB}MB)`);
    if (heapSummary.leakSuspect) lines.push('- ⚠ Possible leak: heap grew >30MB with <3 GC events');
  } else {
    lines.push('_(no samples collected)_');
  }
  lines.push('');
  lines.push('## Section timings (mean ms/frame, ?debug=perf instrumentation)');
  lines.push('');
  const sectionRows = Object.entries(sections).sort((a, b) => b[1].avgMs - a[1].avgMs);
  if (sectionRows.length === 0) {
    lines.push('_(no section data — check ?debug=perf was set and __perfTrace was reachable)_');
  } else {
    lines.push('| Section | Calls | Total ms | Avg ms | p95 ms |');
    lines.push('|---------|-------|----------|--------|--------|');
    for (const [name, s] of sectionRows) {
      lines.push(`| ${name} | ${s.calls} | ${s.totalMs.toFixed(1)} | ${s.avgMs.toFixed(2)} | ${s.p95Ms.toFixed(2)} |`);
    }
  }
  lines.push('');
  lines.push(`## Top 20 CPU hotspots (self-time, total profile = ${totalCpuMs.toFixed(0)}ms)`);
  lines.push('');
  lines.push('| % | ms | File:line |');
  lines.push('|---|-----|-----------|');
  for (const node of cpuFlat.slice(0, 20)) {
    const pct = totalCpuMs > 0 ? ((node.selfMs / totalCpuMs) * 100).toFixed(1) : '0';
    const fn = node.functionName || '(anonymous)';
    lines.push(`| ${pct} | ${node.selfMs.toFixed(0)} | ${formatLoc(node)} (${fn}) |`);
  }
  lines.push('');
  lines.push('## Top 20 allocation sites (sampled MB/sec)');
  lines.push('');
  lines.push('| MB/s | File:line |');
  lines.push('|------|-----------|');
  for (const node of heapFlat.slice(0, 20)) {
    const fn = node.functionName || '(anonymous)';
    lines.push(`| ${node.bytesPerSec.toFixed(2)} | ${formatLoc(node)} (${fn}) |`);
  }
  lines.push('');
  lines.push('## Self-time by module');
  lines.push('');
  lines.push('| Module | % | ms |');
  lines.push('|--------|---|-----|');
  for (const b of buckets) {
    const pct = totalCpuMs > 0 ? ((b.selfMs / totalCpuMs) * 100).toFixed(1) : '0';
    lines.push(`| ${b.module} | ${pct} | ${b.selfMs.toFixed(0)} |`);
  }
  lines.push('');
  lines.push('## Long frames (with GC attribution)');
  lines.push('');
  if (longFrames.length === 0) {
    lines.push('_(no frames over 25ms)_');
  } else {
    lines.push('| t | frame ms | GC pause |');
    lines.push('|---|----------|----------|');
    for (const f of longFrames) {
      lines.push(`| ${f.tSec}s | ${f.frameMs} | ${f.gcPauseMs} |`);
    }
  }
  lines.push('');
  if (workerData) {
    appendWorkerReport(lines, workerData);
  }
  lines.push('## How to read this report');
  lines.push('');
  lines.push('The fastest path to fixes:');
  lines.push('1. **Section timings** — which subsystem dominates? That is the file scope to focus on.');
  lines.push('2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.');
  lines.push('3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).');
  lines.push('4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.');
  lines.push('');

  const reportPath = path.join(inDir, 'report.md');
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`Report: ${reportPath}`);
}

const isDirectInvoke = process.argv[1] && process.argv[1].endsWith('analyzePerfProfile.mjs');
if (isDirectInvoke) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
