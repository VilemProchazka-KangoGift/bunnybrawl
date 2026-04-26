/// <reference types="node" />
// src/engine/headless/recording.ts
//
// Match recording for ML training data collection. The user explicitly wanted
// this from day 1 ("we will definitely need to have optional match recording
// feature from the start to gather data for the AI to learn from").
//
// Three pieces:
//   Sample, MatchHeader      — wire format (one sample per slot per tick)
//   MatchRecorder            — sink interface (in-memory, file, network, etc.)
//   InMemoryRecorder         — keeps everything in arrays; useful for tests
//                              and small-scale sweeps
//   NDJSONFileRecorder       — streams one JSON line per call to a file via
//                              node:fs; suitable for multi-million-sample runs
//
// HeadlessRunner accepts an optional RecordingConfig and writes a sample for
// each recorded slot each tick (observation + action + reward + done).
//
// The triple-slash reference above pulls @types/node into this file only —
// the rest of the engine stays browser-pure (tsconfig.app.json doesn't list
// "node" in its types). The headless directory is intentionally Node-side.

import { writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import type { InputState, PlayerSlot } from '../types';
import type { MatchResult } from './types';

/** Per-(tick, slot) training sample. */
export interface Sample {
  /** 0-indexed tick number within the episode. */
  tick: number;
  /** Slot this sample belongs to. */
  slot: PlayerSlot;
  /**
   * Pre-tick observation as a JS array (length = OBSERVATION_SIZE). Plain array
   * for JSON serialization — convert from Float32Array via Array.from.
   */
  obs: number[];
  /** Action that the policy produced for this slot this tick. */
  action: InputState;
  /** Reward attributed to the just-completed tick. */
  reward: number;
  /** True on the LAST tick of the episode (matchOver fired or max_ticks). */
  done: boolean;
}

/** Episode-level metadata, written once at begin(). */
export interface MatchHeader {
  arenaId: string;
  seed?: number;
  activePlayers: PlayerSlot[];
  /** Unix-ms timestamp at episode start (for ordering). */
  startedAt: number;
  /** Free-form tags for downstream filtering (curriculum stage, opponent id, etc.). */
  tags?: Record<string, string | number | boolean>;
}

/**
 * Sink interface — implementations decide where samples go.
 *
 * Lifecycle:
 *   recorder.begin(header)
 *   for each tick: recorder.record(sample) (potentially many per tick)
 *   recorder.end(result)
 *   await recorder.flush()  (no-op for in-memory; closes file for NDJSON)
 */
export interface MatchRecorder {
  begin(header: MatchHeader): void;
  record(sample: Sample): void;
  end(result: MatchResult): void;
  /** Returns when all buffered writes are durable. Must be safe to call even after errors. */
  flush(): Promise<void>;
}

/**
 * Stores samples in arrays in memory. For tests and small-scale sweeps.
 * For production training data, use NDJSONFileRecorder — millions of samples
 * exhaust heap quickly.
 */
export class InMemoryRecorder implements MatchRecorder {
  private _header: MatchHeader | null = null;
  private _samples: Sample[] = [];
  private _result: MatchResult | null = null;
  private _ended = false;

  begin(header: MatchHeader): void {
    this._header = header;
    this._samples = [];
    this._result = null;
    this._ended = false;
  }

  record(sample: Sample): void {
    this._samples.push(sample);
  }

  end(result: MatchResult): void {
    this._result = result;
    this._ended = true;
  }

  async flush(): Promise<void> {
    // No-op; all samples already in memory.
  }

  getHeader(): MatchHeader | null { return this._header; }
  getSamples(): ReadonlyArray<Sample> { return this._samples; }
  getResult(): MatchResult | null { return this._result; }
  isEnded(): boolean { return this._ended; }

  /** Reset to begin a new episode. */
  reset(): void {
    this._header = null;
    this._samples = [];
    this._result = null;
    this._ended = false;
  }
}

/**
 * Streams samples to a file as line-delimited JSON. Each begin/record/end call
 * writes one JSON line. The file format is:
 *   {"type":"header","header":{...}}
 *   {"type":"sample","sample":{...}}
 *   {"type":"sample","sample":{...}}
 *   ...
 *   {"type":"end","result":{...}}
 *
 * The file descriptor stays open between calls. flush() closes it.
 *
 * MatchResult.finalState is NOT serialized in the end record — it can contain
 * Maps and circular refs that don't survive JSON. A summary subset (winner,
 * ticks, reason) is written instead.
 */
export class NDJSONFileRecorder implements MatchRecorder {
  private readonly _path: string;
  private _fd: number | null = null;

  constructor(path: string) {
    this._path = path;
  }

  begin(header: MatchHeader): void {
    if (this._fd === null) {
      // Truncate / create on first begin.
      writeFileSync(this._path, '');
      this._fd = openSync(this._path, 'a');
    }
    writeSync(this._fd, JSON.stringify({ type: 'header', header }) + '\n');
  }

  record(sample: Sample): void {
    if (this._fd === null) {
      throw new Error('NDJSONFileRecorder.record called before begin()');
    }
    writeSync(this._fd, JSON.stringify({ type: 'sample', sample }) + '\n');
  }

  end(result: MatchResult): void {
    if (this._fd === null) {
      throw new Error('NDJSONFileRecorder.end called before begin()');
    }
    const summary = {
      winner: result.winner,
      ticks: result.ticks,
      reason: result.reason,
    };
    writeSync(this._fd, JSON.stringify({ type: 'end', result: summary }) + '\n');
  }

  async flush(): Promise<void> {
    if (this._fd !== null) {
      closeSync(this._fd);
      this._fd = null;
    }
  }

  getPath(): string { return this._path; }
}
