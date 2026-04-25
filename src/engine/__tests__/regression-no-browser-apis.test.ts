// src/engine/__tests__/regression-no-browser-apis.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Files / directories that MUST stay free of browser APIs. Paths are relative to repo root.
 * If a path doesn't exist yet (e.g., simulator/ before Phase 3), it's silently skipped —
 * the test re-activates as soon as the directory is created.
 */
const PURE_PATHS = [
  'src/engine/simulator',
  'src/engine/headless',
  'src/engine/physics.ts',
  'src/engine/stomp.ts',
  'src/engine/hazardCollision.ts',
  'src/engine/constants.ts',
  'src/engine/fastMath.ts',
  'src/engine/gameLoop/initialState.ts',
  'src/engine/gameLoop/gameplay',
  'src/engine/ai',
];

/** Forbidden patterns. Each match is reported with file:line for diagnosis. */
const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bwindow\./, reason: 'window.* — browser global' },
  { pattern: /\bdocument\./, reason: 'document.* — browser global' },
  { pattern: /\bnavigator\./, reason: 'navigator.* — browser global' },
  { pattern: /\blocalStorage\b/, reason: 'localStorage — browser-only' },
  { pattern: /\bsessionStorage\b/, reason: 'sessionStorage — browser-only' },
  { pattern: /\brequestAnimationFrame\b/, reason: 'rAF — scheduler concern, belongs in adapter' },
  { pattern: /\bcancelAnimationFrame\b/, reason: 'cAF — scheduler concern, belongs in adapter' },
  { pattern: /\bnew\s+Audio\s*\(/, reason: 'new Audio() — browser-only' },
  { pattern: /\bnew\s+Image\s*\(/, reason: 'new Image() — browser-only' },
  { pattern: /\bHTMLCanvasElement\b/, reason: 'HTMLCanvasElement — DOM type, belongs in adapter' },
  { pattern: /\bHTMLElement\b/, reason: 'HTMLElement — DOM type, belongs in adapter' },
  { pattern: /\bCanvasRenderingContext2D\b/, reason: 'Canvas API — belongs in renderer/adapter' },
  { pattern: /\bOffscreenCanvas\b/, reason: 'OffscreenCanvas — belongs in renderer/adapter' },
  { pattern: /\.getContext\s*\(\s*['"]2d['"]/, reason: 'canvas.getContext — DOM API' },
  { pattern: /from\s+['"]howler['"]/, reason: 'Howler import — audio belongs behind playSound callback' },
  { pattern: /from\s+['"](?:\.{1,2}\/)+audio(?:['"\/]|\.\w+['"])/, reason: 'audio module import — gameplay must route through SimulatorEvents (onSfxRequest etc.)' },
];

function* walkTs(path: string): Generator<string> {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (stat.isFile()) {
    if (path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('__tests__')) yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    yield* walkTs(join(path, entry));
  }
}

interface Violation {
  file: string;
  line: number;
  match: string;
  reason: string;
}

function scanFile(path: string): Violation[] {
  const violations: Violation[] = [];
  const text = readFileSync(path, 'utf-8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip pure-comment lines so /** … window … */ docs don't trigger
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    // Strip inline trailing comment so `code; // window stuff` doesn't trigger
    const code = line.split('//')[0];
    for (const { pattern, reason } of FORBIDDEN) {
      const m = code.match(pattern);
      if (m) violations.push({ file: relative(process.cwd(), path).split(sep).join('/'), line: i + 1, match: m[0], reason });
    }
  }
  return violations;
}

describe('regression: no browser APIs in pure modules', () => {
  for (const target of PURE_PATHS) {
    it(`${target} — clean`, () => {
      if (!existsSync(target)) {
        // Path doesn't exist yet — test re-activates once it's created.
        return;
      }
      const all: Violation[] = [];
      for (const file of walkTs(target)) {
        all.push(...scanFile(file));
      }
      if (all.length > 0) {
        const msg = all.map((v) => `  ${v.file}:${v.line} — ${v.match} (${v.reason})`).join('\n');
        throw new Error(`Found ${all.length} forbidden browser-API references in ${target}:\n${msg}\n\nPure modules must not reference browser globals. Move the side-effect to an adapter (BrowserGameLoop, HeadlessRunner, etc.) or inject it as a callback.`);
      }
      expect(all).toHaveLength(0);
    });
  }
});
