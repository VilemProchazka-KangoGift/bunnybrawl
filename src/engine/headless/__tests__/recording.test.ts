// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryRecorder, NDJSONFileRecorder } from '../recording';
import type { Sample, MatchHeader } from '../recording';
import type { MatchResult } from '../types';

const SAMPLE: Sample = {
  tick: 7,
  slot: 'P1',
  obs: [0.1, 0.2, 0.3],
  action: { left: true, right: false, jump: false, down: false },
  reward: 0.5,
  done: false,
};

const HEADER: MatchHeader = {
  arenaId: 'meadow',
  seed: 42,
  activePlayers: ['P1', 'P2'],
  startedAt: 1234567890,
  tags: { stage: 'self-play', opponent: 'rule-based' },
};

const RESULT: MatchResult = {
  winner: 'P1',
  ticks: 100,
  reason: 'match_over',
  finalState: { players: [], matchOver: true, winner: 'P1' } as unknown as Readonly<unknown> as never,
};

describe('InMemoryRecorder', () => {
  it('begin sets header and resets samples', () => {
    const r = new InMemoryRecorder();
    r.begin(HEADER);
    expect(r.getHeader()).toEqual(HEADER);
    expect(r.getSamples()).toEqual([]);
    expect(r.isEnded()).toBe(false);
  });

  it('record appends samples in order', () => {
    const r = new InMemoryRecorder();
    r.begin(HEADER);
    r.record({ ...SAMPLE, tick: 0 });
    r.record({ ...SAMPLE, tick: 1 });
    r.record({ ...SAMPLE, tick: 2 });
    const samples = r.getSamples();
    expect(samples.map(s => s.tick)).toEqual([0, 1, 2]);
  });

  it('end stores result and flips isEnded', () => {
    const r = new InMemoryRecorder();
    r.begin(HEADER);
    r.end(RESULT);
    expect(r.getResult()).toEqual(RESULT);
    expect(r.isEnded()).toBe(true);
  });

  it('flush is a no-op promise', async () => {
    const r = new InMemoryRecorder();
    r.begin(HEADER);
    await expect(r.flush()).resolves.toBeUndefined();
  });

  it('reset clears state', () => {
    const r = new InMemoryRecorder();
    r.begin(HEADER);
    r.record(SAMPLE);
    r.end(RESULT);
    r.reset();
    expect(r.getHeader()).toBeNull();
    expect(r.getSamples()).toEqual([]);
    expect(r.getResult()).toBeNull();
    expect(r.isEnded()).toBe(false);
  });

  it('begin again starts a new episode (clears samples + result)', () => {
    const r = new InMemoryRecorder();
    r.begin(HEADER);
    r.record(SAMPLE);
    r.end(RESULT);
    r.begin({ ...HEADER, seed: 99 });
    expect(r.getHeader()?.seed).toBe(99);
    expect(r.getSamples()).toEqual([]);
    expect(r.getResult()).toBeNull();
    expect(r.isEnded()).toBe(false);
  });
});

describe('NDJSONFileRecorder', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'recorder-test-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes header, samples, and end as line-delimited JSON', async () => {
    const path = join(tmpDir, 'episode-1.ndjson');
    const r = new NDJSONFileRecorder(path);

    r.begin(HEADER);
    r.record({ ...SAMPLE, tick: 0 });
    r.record({ ...SAMPLE, tick: 1, reward: 1.0 });
    r.end(RESULT);
    await r.flush();

    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
    expect(lines.length).toBe(4); // header + 2 samples + end

    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0]).toEqual({ type: 'header', header: HEADER });
    expect(parsed[1]).toEqual({ type: 'sample', sample: { ...SAMPLE, tick: 0 } });
    expect(parsed[2]).toEqual({ type: 'sample', sample: { ...SAMPLE, tick: 1, reward: 1.0 } });
    // end record contains a summary subset (winner, ticks, reason) — not the
    // finalState (which has Maps and other JSON-incompatible shapes).
    expect(parsed[3]).toEqual({
      type: 'end',
      result: { winner: 'P1', ticks: 100, reason: 'match_over' },
    });
  });

  it('record before begin throws', () => {
    const path = join(tmpDir, 'no-begin.ndjson');
    const r = new NDJSONFileRecorder(path);
    expect(() => r.record(SAMPLE)).toThrow(/before begin/);
  });

  it('end before begin throws', () => {
    const path = join(tmpDir, 'no-begin-end.ndjson');
    const r = new NDJSONFileRecorder(path);
    expect(() => r.end(RESULT)).toThrow(/before begin/);
  });

  it('flush closes the file descriptor and is idempotent', async () => {
    const path = join(tmpDir, 'flush-twice.ndjson');
    const r = new NDJSONFileRecorder(path);
    r.begin(HEADER);
    r.record(SAMPLE);
    r.end(RESULT);
    await r.flush();
    await r.flush(); // second call is a no-op
    expect(r.getPath()).toBe(path);
  });

  it('begin after first call writes a new header line (does not truncate the file)', async () => {
    // Note: the current implementation truncates on the FIRST begin only — once
    // the fd is open, subsequent begins append. This means a recorder reused
    // across episodes captures multiple episodes in one file (intentional —
    // simplifies multi-episode runs).
    const path = join(tmpDir, 'multi-episode.ndjson');
    const r = new NDJSONFileRecorder(path);

    r.begin(HEADER);
    r.record({ ...SAMPLE, tick: 0 });
    r.end(RESULT);

    r.begin({ ...HEADER, seed: 99 });
    r.record({ ...SAMPLE, tick: 0 });
    r.end(RESULT);

    await r.flush();

    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
    // Two episodes: header + sample + end + header + sample + end = 6 lines
    expect(lines.length).toBe(6);
    expect(JSON.parse(lines[0]).header.seed).toBe(42);
    expect(JSON.parse(lines[3]).header.seed).toBe(99);
  });
});
