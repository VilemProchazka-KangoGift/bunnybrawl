// ------------------------------------------------------------
// Procedural music generator — unique track per arena theme
// ------------------------------------------------------------
// Each theme gets a ~30-40 second looping track with 3-4 layers
// (bass, lead, harmony, drums). All synthesis is done sample-by-
// sample into a Float32Array, then converted to a WAV data URI.
// ------------------------------------------------------------

import { floatBufferToWavDataUri } from './audio';

// ---- MIDI / frequency helpers ----

function midi(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// ---- Oscillator (phase-continuous via accumulated phase) ----

function osc(phase: number, wave: 'sin' | 'sq' | 'saw' | 'tri' | 'pulse'): number {
  const p = ((phase % 1) + 1) % 1; // normalise to 0..1
  switch (wave) {
    case 'sin':   return Math.sin(p * 2 * Math.PI);
    case 'sq':    return p < 0.5 ? 1 : -1;
    case 'saw':   return 2 * p - 1;
    case 'tri':   return 4 * Math.abs(p - 0.5) - 1;
    case 'pulse': return p < 0.25 ? 1 : -1;
  }
}

// ---- ADSR envelope ----

function adsr(t: number, dur: number, a: number, d: number, s: number, r: number): number {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * (t - a) / d;
  if (t < dur) return s;
  const rt = t - dur;
  return rt < r ? s * (1 - rt / r) : 0;
}

// ---- Synth types ----

interface SynthNote {
  startBeat: number;
  durBeats: number;
  freq: number;
  vel: number;
}

type Wave = 'sin' | 'sq' | 'saw' | 'tri' | 'pulse';

interface SynthTrack {
  wave: Wave;
  vol: number;
  a: number; d: number; s: number; r: number; // ADSR in seconds
  filterHz?: number;   // one-pole LP cutoff
  detune?: number;     // cents
  vibHz?: number;      // vibrato speed
  vibDepth?: number;   // vibrato depth in semitones
}

// ---- Render a synth track into a buffer (additive) ----

function renderTrack(
  out: Float32Array,
  sr: number,
  bpm: number,
  trk: SynthTrack,
  notes: SynthNote[],
): void {
  const beatSec = 60 / bpm;
  const tmp = new Float32Array(out.length);

  for (const note of notes) {
    const start = Math.floor(note.startBeat * beatSec * sr);
    const noteDur = note.durBeats * beatSec;
    const totalDur = noteDur + trk.r;
    const end = Math.min(start + Math.ceil(totalDur * sr), tmp.length);
    let phase = 0;
    for (let i = start; i < end; i++) {
      if (i < 0) continue;
      const t = (i - start) / sr;
      let freq = note.freq;
      if (trk.vibHz && trk.vibDepth) {
        freq *= Math.pow(2, trk.vibDepth / 12 * Math.sin(2 * Math.PI * trk.vibHz * t));
      }
      if (trk.detune) freq *= Math.pow(2, trk.detune / 1200);
      phase += freq / sr;
      const sample = osc(phase, trk.wave)
        * adsr(t, noteDur, trk.a, trk.d, trk.s, trk.r)
        * trk.vol * note.vel;
      tmp[i] += sample;
    }
  }

  // Optional LP filter
  if (trk.filterHz) {
    const alpha = 1 - Math.exp(-2 * Math.PI * trk.filterHz / sr);
    let st = 0;
    for (let i = 0; i < tmp.length; i++) { st += alpha * (tmp[i] - st); tmp[i] = st; }
  }

  for (let i = 0; i < out.length; i++) out[i] += tmp[i];
}

// ---- Drum synthesis ----

function renderKick(buf: Float32Array, sr: number, time: number, vol = 0.18): void {
  const dur = 0.18;
  const s = Math.floor(time * sr);
  const e = Math.min(s + Math.ceil(dur * sr), buf.length);
  let ph = 0;
  for (let i = s; i < e; i++) {
    if (i < 0) continue;
    const t = (i - s) / sr;
    const p = t / dur;
    const freq = 150 * Math.exp(-p * 10) + 40;
    ph += freq / sr;
    buf[i] += Math.sin(ph * 2 * Math.PI) * Math.max(0, 1 - p * 2.5) * vol;
  }
}

function renderSnare(buf: Float32Array, sr: number, time: number, vol = 0.10): void {
  const dur = 0.12;
  const s = Math.floor(time * sr);
  const e = Math.min(s + Math.ceil(dur * sr), buf.length);
  for (let i = s; i < e; i++) {
    if (i < 0) continue;
    const t = (i - s) / sr;
    const p = t / dur;
    const body = Math.sin(2 * Math.PI * 200 * t) * Math.max(0, 1 - p * 6);
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 4);
    buf[i] += (body * 0.35 + noise * 0.65) * vol;
  }
}

function renderHihat(buf: Float32Array, sr: number, time: number, open = false, vol = 0.04): void {
  const dur = open ? 0.15 : 0.035;
  const s = Math.floor(time * sr);
  const e = Math.min(s + Math.ceil(dur * sr), buf.length);
  for (let i = s; i < e; i++) {
    if (i < 0) continue;
    const p = (i - s) / (e - s);
    buf[i] += (Math.random() * 2 - 1) * Math.max(0, 1 - p * (open ? 3 : 10)) * vol;
  }
}

function renderClap(buf: Float32Array, sr: number, time: number, vol = 0.08): void {
  const dur = 0.08;
  const s = Math.floor(time * sr);
  const e = Math.min(s + Math.ceil(dur * sr), buf.length);
  for (let i = s; i < e; i++) {
    if (i < 0) continue;
    const t = (i - s) / sr;
    const p = t / dur;
    // Three micro-bursts layered
    const burst = Math.max(0, 1 - ((t * 80) % 1) * 3);
    buf[i] += (Math.random() * 2 - 1) * burst * Math.max(0, 1 - p * 3) * vol;
  }
}

function renderTom(buf: Float32Array, sr: number, time: number, pitch: number, vol = 0.10): void {
  const dur = 0.15;
  const s = Math.floor(time * sr);
  const e = Math.min(s + Math.ceil(dur * sr), buf.length);
  let ph = 0;
  for (let i = s; i < e; i++) {
    if (i < 0) continue;
    const t = (i - s) / sr;
    const p = t / dur;
    const freq = pitch * Math.exp(-p * 3);
    ph += freq / sr;
    buf[i] += Math.sin(ph * 2 * Math.PI) * Math.max(0, 1 - p * 3) * vol;
  }
}

function renderRim(buf: Float32Array, sr: number, time: number, vol = 0.06): void {
  const dur = 0.02;
  const s = Math.floor(time * sr);
  const e = Math.min(s + Math.ceil(dur * sr), buf.length);
  for (let i = s; i < e; i++) {
    if (i < 0) continue;
    const t = (i - s) / sr;
    buf[i] += Math.sin(2 * Math.PI * 1800 * t) * Math.max(0, 1 - t / dur * 8) * vol;
  }
}

// ---- Helpers for compact note definitions ----

/** Single note: n(beat, duration, midiNote, velocity?) */
function n(beat: number, dur: number, m: number, vel = 1): SynthNote {
  return { startBeat: beat, durBeats: dur, freq: midi(m), vel };
}

/** Sequential notes from a start beat: seq(startBeat, [[midi, dur, vel?], ...]) */
function seq(start: number, notes: (readonly [number, number] | readonly [number, number, number])[]): SynthNote[] {
  const result: SynthNote[] = [];
  let beat = start;
  for (const nd of notes) {
    const [m, dur] = nd;
    const vel: number = nd.length > 2 ? nd[2]! : 1;
    if (m > 0) result.push({ startBeat: beat, durBeats: dur * 0.9, freq: midi(m), vel });
    beat += dur;
  }
  return result;
}

/** Repeat drums: array of [beatOffset, renderFn] within a pattern */
type DrumEvent = (buf: Float32Array, sr: number, timeSec: number) => void;
function repeatDrums(
  buf: Float32Array, sr: number, bpm: number,
  pattern: [number, DrumEvent][],
  patternBeats: number, totalBeats: number,
): void {
  const beatSec = 60 / bpm;
  for (let off = 0; off < totalBeats; off += patternBeats) {
    for (const [beat, fn] of pattern) {
      fn(buf, sr, (off + beat) * beatSec);
    }
  }
}

// ---- Chord progression helper ----
// chords: [rootMidi, durationBeats][], patternFn creates notes relative to a root
function chordBass(
  chords: [number, number][],
  patternFn: (root: number, startBeat: number, dur: number) => SynthNote[],
): SynthNote[] {
  const result: SynthNote[] = [];
  let beat = 0;
  for (const [root, dur] of chords) {
    result.push(...patternFn(root, beat, dur));
    beat += dur;
  }
  return result;
}

// ================================================================
//  THEME COMPOSITIONS — 10 unique tracks
// ================================================================

const SR = 44100;
const TOTAL_BEATS = 64; // 16 bars of 4/4

function makeBuffer(bpm: number): Float32Array {
  return new Float32Array(Math.ceil(SR * (TOTAL_BEATS * 60 / bpm)));
}

// ----------------------------------------------------------------
//  1. MEADOW — Cheerful bouncy chiptune (130bpm, C major)
// ----------------------------------------------------------------
function generateMeadow(): string {
  const bpm = 130;
  const buf = makeBuffer(bpm);

  // Chord progression: C Am F G (8 beats each, repeat 2x)
  const chords: [number, number][] = [[48, 8], [45, 8], [41, 8], [43, 8], [48, 8], [45, 8], [41, 8], [43, 8]];

  // Bass — bouncy 8th notes root + fifth
  const bass: SynthTrack = { wave: 'sq', vol: 0.07, a: 0.005, d: 0.08, s: 0.3, r: 0.03, filterHz: 800 };
  const bassNotes = chordBass(chords, (root, start, dur) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < dur; b += 1) {
      notes.push(n(start + b, 0.4, root + (b % 2 === 0 ? 0 : 7)));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Lead melody — triangle wave, catchy phrase
  const lead: SynthTrack = { wave: 'tri', vol: 0.06, a: 0.01, d: 0.05, s: 0.7, r: 0.08 };
  // Section A (bars 1-8)
  const melA = [
    ...seq(0,  [[76,0.5],[79,0.5],[84,1.5],[83,0.5]]),   // E5 G5 C6~ B5
    ...seq(3,  [[79,0.5],[81,0.5],[79,1]]),               // G5 A5 G5~
    ...seq(5,  [[76,0.5],[79,0.5],[81,0.5],[84,0.5]]),    // E5 G5 A5 C6
    ...seq(7,  [[83,0.5],[81,0.5],[79,1]]),               // B5 A5 G5~
    ...seq(9,  [[76,0.5],[72,0.5],[74,1]]),               // E5 C5 D5~
    ...seq(11, [[76,1],[79,0.5],[81,0.5]]),               // E5~ G5 A5
    ...seq(13, [[84,1],[83,0.5],[81,0.5]]),               // C6~ B5 A5
    ...seq(15, [[79,0.5],[76,0.5],[72,1]]),               // G5 E5 C5~
  ];
  // Section B (bars 9-16) — variation, higher energy
  const melB = [
    ...seq(32, [[84,0.5],[86,0.5],[84,0.5],[81,0.5]]),   // C6 D6 C6 A5
    ...seq(34, [[79,0.5],[81,0.5],[84,1]]),               // G5 A5 C6~
    ...seq(36, [[86,0.5],[84,0.5],[81,0.5],[79,0.5]]),    // D6 C6 A5 G5
    ...seq(38, [[76,1],[74,0.5],[76,0.5]]),               // E5~ D5 E5
    ...seq(40, [[79,1],[81,0.5],[84,0.5]]),               // G5~ A5 C6
    ...seq(42, [[86,1.5],[84,0.5]]),                      // D6~~ C6
    ...seq(44, [[81,0.5],[79,0.5],[76,0.5],[74,0.5]]),    // A5 G5 E5 D5
    ...seq(46, [[72,2]]),                                 // C5~~
    ...seq(48, [[76,0.5],[79,0.5],[84,1]]),               // E5 G5 C6~
    ...seq(50, [[83,0.5],[84,0.5],[86,1]]),               // B5 C6 D6~
    ...seq(52, [[84,0.5],[81,0.5],[79,0.5],[76,0.5]]),    // C6 A5 G5 E5
    ...seq(54, [[74,0.5],[76,0.5],[79,1]]),               // D5 E5 G5~
    ...seq(56, [[81,1],[84,0.5],[83,0.5]]),               // A5~ C6 B5
    ...seq(58, [[81,0.5],[79,0.5],[76,1]]),               // A5 G5 E5~
    ...seq(60, [[74,0.5],[72,0.5],[74,0.5],[76,0.5]]),    // D5 C5 D5 E5
    ...seq(62, [[72,2]]),                                 // C5~~
  ];
  renderTrack(buf, SR, bpm, lead, [...melA, ...melB]);

  // Chord stabs — filtered square, offbeat
  const chordStab: SynthTrack = { wave: 'sq', vol: 0.03, a: 0.005, d: 0.06, s: 0.2, r: 0.04, filterHz: 1500 };
  const stabs = chordBass(chords, (root, start, dur) => {
    const third = root + 16; // major third an octave up
    const fifth = root + 19;
    const notes: SynthNote[] = [];
    for (let b = 0.5; b < dur; b += 2) {
      notes.push(n(start + b, 0.3, third), n(start + b, 0.3, fifth));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, chordStab, stabs);

  // Drums — kick 1&3, snare 2&4, hihat 8ths
  const drumPat: [number, DrumEvent][] = [
    [0, (b,s,t) => renderKick(b,s,t,0.16)],
    [2, (b,s,t) => renderKick(b,s,t,0.14)],
    [1, (b,s,t) => renderSnare(b,s,t,0.09)],
    [3, (b,s,t) => renderSnare(b,s,t,0.08)],
  ];
  for (let i = 0; i < 4; i += 0.5) drumPat.push([i, (b,s,t) => renderHihat(b,s,t,false,0.03)]);
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  2. WINTER LAKE — Gentle twinkling music box (95bpm, D major)
// ----------------------------------------------------------------
function generateWinterLake(): string {
  const bpm = 95;
  const buf = makeBuffer(bpm);

  // D Bm G A
  const chords: [number, number][] = [[50, 8], [47, 8], [43, 8], [45, 8], [50, 8], [47, 8], [43, 8], [45, 8]];

  // Bass — gentle sine, long tones
  const bass: SynthTrack = { wave: 'sin', vol: 0.08, a: 0.1, d: 0.3, s: 0.6, r: 0.3 };
  const bassNotes = chordBass(chords, (root, start) => [n(start, 7, root, 0.9)]);
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Twinkling arpeggios — high sine, music-box feel
  const twinkle: SynthTrack = { wave: 'sin', vol: 0.045, a: 0.005, d: 0.15, s: 0.1, r: 0.2 };
  const twinkNotes = chordBass(chords, (root, start) => {
    const notes: SynthNote[] = [];
    const arp = [root + 24, root + 28, root + 31, root + 36]; // root-3rd-5th-oct two octaves up
    for (let b = 0; b < 8; b += 0.5) {
      notes.push(n(start + b, 0.4, arp[Math.floor(b) % arp.length], 0.6 + Math.sin(b * 0.8) * 0.3));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, twinkle, twinkNotes);

  // Melody — gentle triangle, simple and sweet
  const lead: SynthTrack = { wave: 'tri', vol: 0.04, a: 0.05, d: 0.1, s: 0.5, r: 0.15 };
  const melody = [
    ...seq(0,  [[74,2],[78,2],[81,2],[78,1],[74,1]]),      // D5 F#5 A5 F#5 D5
    ...seq(8,  [[71,2],[74,1],[78,1],[76,2],[74,2]]),      // B4 D5 F#5 E5 D5
    ...seq(16, [[67,2],[71,2],[74,2],[71,1],[67,1]]),      // G4 B4 D5 B4 G4
    ...seq(24, [[69,2],[73,2],[76,2],[74,2]]),             // A4 C#5 E5 D5
    ...seq(32, [[78,1],[81,1],[86,2],[85,1],[81,1],[78,2]]), // F#5 A5 D6 C#6 A5 F#5
    ...seq(40, [[74,1],[71,1],[74,2],[76,2],[74,2]]),      // D5 B4 D5 E5 D5
    ...seq(48, [[67,1],[71,1],[74,1],[78,1],[81,2],[78,2]]), // G4 B4 D5 F#5 A5 F#5
    ...seq(56, [[76,1],[74,1],[71,2],[74,4]]),             // E5 D5 B4 D5
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Soft percussion — gentle shaker
  const beatSec = 60 / bpm;
  for (let b = 0; b < TOTAL_BEATS; b += 0.5) {
    renderHihat(buf, SR, b * beatSec, false, 0.015);
  }
  // Soft kick on 1
  for (let b = 0; b < TOTAL_BEATS; b += 4) {
    renderKick(buf, SR, b * beatSec, 0.06);
  }

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  3. VOLCANO — Aggressive driving metal (155bpm, E minor)
// ----------------------------------------------------------------
function generateVolcano(): string {
  const bpm = 155;
  const buf = makeBuffer(bpm);

  // Em C D Em (8 beats each, 2x)
  const chords: [number, number][] = [[40, 8], [36, 8], [38, 8], [40, 8], [40, 8], [36, 8], [38, 8], [40, 8]];

  // Heavy bass — sawtooth, aggressive 8ths
  const bass: SynthTrack = { wave: 'saw', vol: 0.08, a: 0.003, d: 0.04, s: 0.5, r: 0.02, filterHz: 600 };
  const bassNotes = chordBass(chords, (root, start, dur) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < dur; b += 0.5) {
      notes.push(n(start + b, 0.35, root, b % 2 === 0 ? 1 : 0.7));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Power riff — distorted square, staccato
  const riff: SynthTrack = { wave: 'sq', vol: 0.05, a: 0.003, d: 0.03, s: 0.6, r: 0.02, filterHz: 2000 };
  const riffNotes = [
    // Section A — aggressive riff
    ...seq(0,  [[64,0.5],[64,0.25],[0,0.25],[67,0.5],[64,0.5],[60,0.5],[62,0.75],[0,0.25]]),
    ...seq(3.5,[[64,0.5],[67,0.5],[71,0.5],[67,0.5],[64,0.5],[62,0.5],[60,0.5],[0,0.5]]),
    ...seq(8,  [[60,0.5],[60,0.25],[0,0.25],[64,0.5],[67,0.5],[64,0.5],[62,0.75],[0,0.25]]),
    ...seq(11.5,[[60,0.5],[64,0.5],[67,0.5],[71,1],[67,0.5],[64,1]]),
    ...seq(16, [[62,0.5],[62,0.25],[0,0.25],[66,0.5],[69,0.5],[66,0.5],[64,0.75],[0,0.25]]),
    ...seq(19.5,[[62,0.5],[66,0.5],[69,0.5],[66,0.5],[62,0.5],[64,0.5],[62,0.5],[0,0.5]]),
    ...seq(24, [[64,0.5],[64,0.25],[0,0.25],[67,0.5],[71,0.5],[67,0.5],[64,0.5],[62,0.5],[64,1]]),
    // Section B — higher intensity
    ...seq(32, [[76,0.5],[76,0.25],[0,0.25],[79,0.5],[76,0.5],[72,0.5],[74,0.75],[0,0.25]]),
    ...seq(35.5,[[76,0.5],[79,0.5],[83,0.5],[79,0.5],[76,0.5],[74,0.5],[72,0.5],[0,0.5]]),
    ...seq(40, [[72,0.5],[72,0.25],[0,0.25],[76,0.5],[79,0.5],[76,0.5],[74,0.75],[0,0.25]]),
    ...seq(43.5,[[72,0.5],[76,0.5],[79,1],[83,0.5],[79,0.5],[76,1]]),
    ...seq(48, [[74,0.5],[74,0.25],[0,0.25],[78,0.5],[81,0.5],[78,0.5],[76,0.75],[0,0.25]]),
    ...seq(51.5,[[74,0.5],[78,0.5],[81,0.5],[78,0.5],[74,0.5],[76,0.5],[74,0.5],[0,0.5]]),
    ...seq(56, [[76,0.5],[79,0.5],[83,1],[79,0.5],[76,0.5],[74,0.5],[72,0.5]]),
    ...seq(60, [[76,1],[74,0.5],[72,0.5],[71,1]]),
  ];
  renderTrack(buf, SR, bpm, riff, riffNotes);

  // Drums — double kick, heavy snare
  const beatSec = 60 / bpm;
  const drumPat: [number, DrumEvent][] = [
    [0,   (b,s,t) => renderKick(b,s,t,0.20)],
    [0.5, (b,s,t) => renderKick(b,s,t,0.15)],
    [1,   (b,s,t) => renderSnare(b,s,t,0.14)],
    [2,   (b,s,t) => renderKick(b,s,t,0.20)],
    [2.5, (b,s,t) => renderKick(b,s,t,0.15)],
    [3,   (b,s,t) => renderSnare(b,s,t,0.14)],
    [3.5, (b,s,t) => renderKick(b,s,t,0.12)],
  ];
  for (let i = 0; i < 4; i += 0.5) drumPat.push([i, (b,s,t) => renderHihat(b,s,t, i%1===0, 0.04)]);
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);
  // Crash accents on section changes
  for (const b of [0, 16, 32, 48]) renderHihat(buf, SR, b * beatSec, true, 0.08);

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  4. CASTLE — Stately medieval march (118bpm, G minor)
// ----------------------------------------------------------------
function generateCastle(): string {
  const bpm = 118;
  const buf = makeBuffer(bpm);

  // Gm Cm D Gm (8 beats each, 2x)
  const chords: [number, number][] = [[43, 8], [48, 8], [50, 8], [43, 8], [43, 8], [48, 8], [50, 8], [43, 8]];

  // Bass — marching triangle wave
  const bass: SynthTrack = { wave: 'tri', vol: 0.08, a: 0.01, d: 0.1, s: 0.5, r: 0.05 };
  const bassNotes = chordBass(chords, (root, start, dur) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < dur; b += 1) {
      // Dotted pattern: long-short-long-short
      notes.push(n(start + b, b % 2 === 0 ? 0.8 : 0.4, root));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Fanfare lead — bright square, brass-like
  const lead: SynthTrack = { wave: 'sq', vol: 0.045, a: 0.02, d: 0.08, s: 0.6, r: 0.06, filterHz: 2500 };
  const melody = [
    ...seq(0,  [[67,1],[70,0.5],[74,0.5],[79,2],[77,1],[74,1]]),    // G4 Bb4 D5 G5~ F5 D5
    ...seq(6,  [[72,1],[70,1]]),                                     // C5 Bb4
    ...seq(8,  [[72,1],[75,0.5],[79,0.5],[84,2],[82,1],[79,1]]),    // C5 Eb5 G5 C6~ Bb5 G5
    ...seq(14, [[77,1],[75,1]]),                                     // F5 Eb5
    ...seq(16, [[74,1],[78,0.5],[81,0.5],[86,2],[85,0.5],[86,0.5],[81,1]]), // D5 F#5 A5 D6~ C#6 D6 A5
    ...seq(22, [[78,1],[74,1]]),                                     // F#5 D5
    ...seq(24, [[67,1],[70,0.5],[74,0.5],[79,2],[82,1],[79,1]]),    // G4 Bb4 D5 G5~ Bb5 G5
    ...seq(30, [[74,1],[70,1]]),                                     // D5 Bb4
    // B section — higher, more heroic
    ...seq(32, [[79,0.5],[82,0.5],[86,1],[84,1],[82,0.5],[79,0.5],[82,1],[79,1]]), // G5 Bb5 D6~ C6 Bb5 G5 Bb5~ G5
    ...seq(38, [[77,1],[74,1]]),                                     // F5 D5
    ...seq(40, [[72,0.5],[75,0.5],[79,1],[82,1],[84,0.5],[82,0.5],[79,1],[75,1]]), // C5 Eb5 G5~ Bb5~ C6 Bb5 G5~ Eb5
    ...seq(47, [[72,1]]),                                            // C5
    ...seq(48, [[74,0.5],[78,0.5],[81,1],[86,2],[85,0.5],[81,0.5]]), // D5 F#5 A5~ D6~~ C#6 A5
    ...seq(53, [[78,1],[74,1],[70,1]]),                              // F#5 D5 Bb4
    ...seq(56, [[67,1],[70,0.5],[74,0.5],[79,2],[74,1],[67,1]]),    // G4 Bb4 D5 G5~~ D5 G4
    ...seq(62, [[70,1],[67,1]]),                                     // Bb4 G4
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Harpsichord arpeggios — pulse wave, fast decay
  const harpsi: SynthTrack = { wave: 'pulse', vol: 0.025, a: 0.002, d: 0.05, s: 0.15, r: 0.03, filterHz: 3000 };
  const harpNotes = chordBass(chords, (root, start) => {
    const notes: SynthNote[] = [];
    const arp = [root + 12, root + 15, root + 19, root + 24];
    for (let b = 0; b < 8; b += 0.5) {
      notes.push(n(start + b, 0.3, arp[Math.floor(b * 2) % arp.length], 0.7));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, harpsi, harpNotes);

  // Military drums — snare rolls, strong kick
  const drumPat: [number, DrumEvent][] = [
    [0,    (b,s,t) => renderKick(b,s,t,0.18)],
    [0.5,  (b,s,t) => renderRim(b,s,t,0.04)],
    [1,    (b,s,t) => renderSnare(b,s,t,0.10)],
    [1.5,  (b,s,t) => renderSnare(b,s,t,0.06)],
    [2,    (b,s,t) => renderKick(b,s,t,0.16)],
    [2.75, (b,s,t) => renderSnare(b,s,t,0.05)],
    [3,    (b,s,t) => renderSnare(b,s,t,0.10)],
    [3.5,  (b,s,t) => renderSnare(b,s,t,0.06)],
  ];
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  5. CANDY LAND — Sweet bubbly playful (140bpm, F major)
// ----------------------------------------------------------------
function generateCandyLand(): string {
  const bpm = 140;
  const buf = makeBuffer(bpm);

  // F Dm Bb C (8 beats each, 2x)
  const chords: [number, number][] = [[41, 8], [38, 8], [46, 8], [48, 8], [41, 8], [38, 8], [46, 8], [48, 8]];

  // Bouncy bass — sine, octave jumps
  const bass: SynthTrack = { wave: 'sin', vol: 0.09, a: 0.005, d: 0.08, s: 0.4, r: 0.03 };
  const bassNotes = chordBass(chords, (root, start, dur) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < dur; b += 1) {
      notes.push(n(start + b, 0.4, root + (b % 2 === 0 ? 0 : 12)));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Sweet melody — triangle, playful
  const lead: SynthTrack = { wave: 'tri', vol: 0.05, a: 0.01, d: 0.06, s: 0.6, r: 0.08 };
  const melody = [
    ...seq(0,  [[77,0.5],[81,0.5],[84,1],[81,0.5],[77,0.5],[76,1]]),    // F5 A5 C6~ A5 F5 E5~
    ...seq(4,  [[77,0.5],[81,0.5],[84,0.5],[86,0.5],[84,1]]),           // F5 A5 C6 D6 C6~
    ...seq(7,  [[81,1]]),                                                // A5~
    ...seq(8,  [[74,0.5],[77,0.5],[81,1],[77,0.5],[74,0.5],[72,1]]),    // D5 F5 A5~ F5 D5 C5~
    ...seq(12, [[74,0.5],[77,0.5],[81,0.5],[84,0.5],[81,1]]),           // D5 F5 A5 C6 A5~
    ...seq(15, [[77,1]]),                                                // F5~
    ...seq(16, [[70,0.5],[74,0.5],[77,1],[82,1],[81,0.5],[77,0.5]]),    // Bb4 D5 F5~ Bb5~ A5 F5
    ...seq(20, [[74,0.5],[70,0.5],[74,1],[77,1]]),                      // D5 Bb4 D5~ F5~
    ...seq(23, [[72,1]]),                                                // C5~
    ...seq(24, [[72,0.5],[76,0.5],[79,1],[84,1],[81,0.5],[79,0.5]]),    // C5 E5 G5~ C6~ A5 G5
    ...seq(28, [[77,0.5],[76,0.5],[72,1],[77,1]]),                      // F5 E5 C5~ F5~
    ...seq(31, [[81,1]]),                                                // A5~
    // B section
    ...seq(32, [[84,0.5],[86,0.5],[88,1],[86,0.5],[84,0.5],[81,1]]),    // C6 D6 E6~ D6 C6 A5~
    ...seq(36, [[84,0.5],[86,0.5],[88,0.5],[89,0.5],[88,1]]),           // C6 D6 E6 F6 E6~
    ...seq(39, [[86,1]]),                                                // D6~
    ...seq(40, [[81,0.5],[84,0.5],[86,1],[84,0.5],[81,0.5],[77,1]]),    // A5 C6 D6~ C6 A5 F5~
    ...seq(44, [[74,0.5],[77,0.5],[81,0.5],[84,0.5],[86,1]]),           // D5 F5 A5 C6 D6~
    ...seq(47, [[84,1]]),                                                // C6~
    ...seq(48, [[82,0.5],[77,0.5],[74,1],[70,1],[74,1],[77,1]]),        // Bb5 F5 D5~ Bb4~ D5~ F5~
    ...seq(54, [[74,1],[72,1]]),                                         // D5~ C5~
    ...seq(56, [[72,0.5],[76,0.5],[79,0.5],[84,0.5],[81,0.5],[77,0.5]]),// C5 E5 G5 C6 A5 F5
    ...seq(59, [[77,0.5],[81,0.5],[84,0.5],[81,0.5],[77,2]]),           // F5 A5 C6 A5 F5~~
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Sparkle — high sine pings
  const sparkle: SynthTrack = { wave: 'sin', vol: 0.025, a: 0.001, d: 0.03, s: 0.05, r: 0.1 };
  const sparkleNotes: SynthNote[] = [];
  for (let b = 0; b < TOTAL_BEATS; b += 2) {
    sparkleNotes.push(n(b + 0.75, 0.15, 96 + (b * 7 % 12), 0.6)); // random-ish high pings
  }
  renderTrack(buf, SR, bpm, sparkle, sparkleNotes);

  // Drums — bouncy, with toms
  const drumPat: [number, DrumEvent][] = [
    [0,   (b,s,t) => renderKick(b,s,t,0.14)],
    [1.5, (b,s,t) => renderKick(b,s,t,0.12)],
    [1,   (b,s,t) => renderSnare(b,s,t,0.07)],
    [3,   (b,s,t) => renderSnare(b,s,t,0.07)],
    [2.5, (b,s,t) => renderTom(b,s,t,300,0.05)],
    [3.5, (b,s,t) => renderTom(b,s,t,400,0.04)],
  ];
  for (let i = 0; i < 4; i += 0.5) drumPat.push([i, (b,s,t) => renderHihat(b,s,t,false,0.025)]);
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  6. TREETOPS — Jungle tribal grooves (110bpm, A minor pentatonic)
// ----------------------------------------------------------------
function generateTreetops(): string {
  const bpm = 110;
  const buf = makeBuffer(bpm);

  // Am G F Em (8 beats each, 2x)
  const chords: [number, number][] = [[45, 8], [43, 8], [41, 8], [40, 8], [45, 8], [43, 8], [41, 8], [40, 8]];

  // Deep bass — sine + triangle layered
  const bass: SynthTrack = { wave: 'sin', vol: 0.09, a: 0.02, d: 0.15, s: 0.5, r: 0.08 };
  const bassNotes = chordBass(chords, (root, start, dur) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < dur; b += 2) {
      notes.push(n(start + b, 1.5, root));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Marimba — sine, quick attacks, pentatonic patterns
  const marimba: SynthTrack = { wave: 'sin', vol: 0.04, a: 0.003, d: 0.08, s: 0.15, r: 0.05 };
  const marimbaNotes = chordBass(chords, (root, start) => {
    const penta = [root + 12, root + 15, root + 17, root + 19, root + 22]; // minor pentatonic
    const notes: SynthNote[] = [];
    for (let b = 0; b < 8; b += 0.5) {
      const idx = Math.floor(b * 3) % penta.length;
      notes.push(n(start + b, 0.3, penta[idx], 0.5 + (b % 2 === 0 ? 0.3 : 0)));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, marimba, marimbaNotes);

  // Melody — breathy triangle, pentatonic
  const lead: SynthTrack = { wave: 'tri', vol: 0.04, a: 0.03, d: 0.1, s: 0.4, r: 0.1 };
  const melody = [
    ...seq(0,  [[69,1],[72,1],[76,2],[72,1],[69,1],[67,2]]),          // A4 C5 E5~~ C5 A4 G4~~
    ...seq(8,  [[67,1],[69,1],[72,2],[69,1],[67,1],[64,2]]),          // G4 A4 C5~~ A4 G4 E4~~
    ...seq(16, [[65,1],[69,1],[72,1],[76,1],[72,2],[69,2]]),          // F4 A4 C5 E5 C5~~ A4~~
    ...seq(24, [[64,1],[67,1],[69,2],[67,1],[64,1],[60,2]]),          // E4 G4 A4~~ G4 E4 C4~~
    // B section
    ...seq(32, [[76,1],[79,1],[81,2],[79,0.5],[76,0.5],[72,2]]),      // E5 G5 A5~~ G5 E5 C5~~
    ...seq(38, [[69,1],[72,1]]),                                       // A4 C5
    ...seq(40, [[72,1],[76,1],[79,2],[76,0.5],[72,0.5],[69,2]]),      // C5 E5 G5~~ E5 C5 A4~~
    ...seq(46, [[67,1],[69,1]]),                                       // G4 A4
    ...seq(48, [[69,1],[72,1],[76,1],[79,1],[81,2],[79,2]]),          // A4 C5 E5 G5 A5~~ G5~~
    ...seq(56, [[76,1],[72,1],[69,1],[67,1],[69,4]]),                 // E5 C5 A4 G4 A4~~~~
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Tribal drums — toms, no snare
  const drumPat: [number, DrumEvent][] = [
    [0,    (b,s,t) => renderTom(b,s,t,100,0.14)],  // deep tom
    [1,    (b,s,t) => renderTom(b,s,t,200,0.08)],  // mid tom
    [1.5,  (b,s,t) => renderTom(b,s,t,250,0.06)],
    [2,    (b,s,t) => renderTom(b,s,t,100,0.12)],
    [2.75, (b,s,t) => renderTom(b,s,t,300,0.05)],
    [3,    (b,s,t) => renderTom(b,s,t,200,0.10)],
    [3.5,  (b,s,t) => renderTom(b,s,t,150,0.07)],
  ];
  // Shaker instead of hihat
  for (let i = 0; i < 4; i += 0.25) drumPat.push([i, (b,s,t) => renderHihat(b,s,t,false,0.012)]);
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  7. UNDERWATER — Dreamy floating ambient (85bpm, Eb major)
// ----------------------------------------------------------------
function generateUnderwater(): string {
  const bpm = 85;
  const buf = makeBuffer(bpm);

  // Eb Cm Ab Bb (8 beats each, 2x)
  const chords: [number, number][] = [[39, 8], [36, 8], [44, 8], [46, 8], [39, 8], [36, 8], [44, 8], [46, 8]];

  // Deep bass — slow sine
  const bass: SynthTrack = { wave: 'sin', vol: 0.09, a: 0.15, d: 0.3, s: 0.6, r: 0.4 };
  const bassNotes = chordBass(chords, (root, start) => [n(start, 7.5, root, 0.8)]);
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Pad — detuned sines, wide and dreamy
  const pad1: SynthTrack = { wave: 'sin', vol: 0.025, a: 0.3, d: 0.5, s: 0.4, r: 0.5, detune: 8 };
  const pad2: SynthTrack = { wave: 'sin', vol: 0.025, a: 0.3, d: 0.5, s: 0.4, r: 0.5, detune: -8 };
  const padNotes = chordBass(chords, (root, start) => [
    n(start, 7, root + 12),
    n(start, 7, root + 15), // minor third
    n(start, 7, root + 19), // fifth
  ]);
  renderTrack(buf, SR, bpm, pad1, padNotes);
  renderTrack(buf, SR, bpm, pad2, padNotes);

  // Melody — slow vibrato sine, floating
  const lead: SynthTrack = { wave: 'sin', vol: 0.04, a: 0.08, d: 0.15, s: 0.5, r: 0.2, vibHz: 4, vibDepth: 0.15 };
  const melody = [
    ...seq(0,  [[75,2],[79,2],[82,3],[0,1]]),                // Eb5 G5 Bb5~~~ rest
    ...seq(8,  [[72,2],[75,2],[79,3],[0,1]]),                // C5 Eb5 G5~~~ rest
    ...seq(16, [[80,2],[84,2],[87,3],[0,1]]),                // Ab5 C6 Eb6~~~ rest
    ...seq(24, [[82,2],[86,1],[82,1],[79,3],[0,1]]),         // Bb5 D6 Bb5 G5~~~ rest
    ...seq(32, [[87,2],[84,2],[82,2],[79,2]]),               // Eb6 C6 Bb5 G5
    ...seq(40, [[75,2],[79,1],[82,1],[84,3],[0,1]]),         // Eb5 G5 Bb5 C6~~~ rest
    ...seq(48, [[80,2],[84,1],[87,1],[91,3],[0,1]]),         // Ab5 C6 Eb6 G6~~~ rest
    ...seq(56, [[86,2],[82,2],[79,2],[75,2]]),               // D6 Bb5 G5 Eb5
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Bubble percussion — pitched noise bursts
  const beatSec = 60 / bpm;
  for (let b = 0; b < TOTAL_BEATS; b += 1.5) {
    const time = b * beatSec;
    const dur = 0.06;
    const s = Math.floor(time * SR);
    const e = Math.min(s + Math.ceil(dur * SR), buf.length);
    const bubbleFreq = 800 + (b * 137) % 600;
    let ph = 0;
    for (let i = s; i < e; i++) {
      if (i < 0) continue;
      const t = (i - s) / SR;
      const p = t / dur;
      ph += bubbleFreq / SR;
      buf[i] += Math.sin(ph * 2 * Math.PI) * Math.max(0, 1 - p * 6) * 0.02;
    }
  }
  // Soft kick every 4 beats
  for (let b = 0; b < TOTAL_BEATS; b += 4) {
    renderKick(buf, SR, b * beatSec, 0.05);
  }

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  8. HAUNTED GRAVEYARD — Spooky organ (100bpm, C minor)
// ----------------------------------------------------------------
function generateHauntedGraveyard(): string {
  const bpm = 100;
  const buf = makeBuffer(bpm);

  // Cm Ab Eb G (8 beats each, 2x)
  const chords: [number, number][] = [[48, 8], [44, 8], [39, 8], [43, 8], [48, 8], [44, 8], [39, 8], [43, 8]];

  // Organ pedal bass — square harmonics for organ feel
  const organ1: SynthTrack = { wave: 'sq', vol: 0.05, a: 0.02, d: 0.2, s: 0.5, r: 0.1, filterHz: 500 };
  const organ2: SynthTrack = { wave: 'sin', vol: 0.06, a: 0.02, d: 0.2, s: 0.5, r: 0.1 };
  const pedalNotes = chordBass(chords, (root, start) => [n(start, 7, root - 12, 0.8)]);
  renderTrack(buf, SR, bpm, organ1, pedalNotes);
  renderTrack(buf, SR, bpm, organ2, pedalNotes);

  // Minor chord stabs — organ pipes
  const organChord: SynthTrack = { wave: 'sq', vol: 0.025, a: 0.05, d: 0.2, s: 0.3, r: 0.15, filterHz: 1200 };
  const chordNotes = chordBass(chords, (root, start) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < 8; b += 4) {
      notes.push(
        n(start + b, 3, root + 12),
        n(start + b, 3, root + 15), // minor third
        n(start + b, 3, root + 19), // fifth
      );
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, organChord, chordNotes);

  // Theremin lead — vibrato sine, spooky
  const theremin: SynthTrack = { wave: 'sin', vol: 0.035, a: 0.1, d: 0.15, s: 0.6, r: 0.15, vibHz: 5.5, vibDepth: 0.25 };
  const melody = [
    ...seq(0,  [[72,1.5],[75,1],[72,1.5],[70,1],[67,1.5],[0,1.5]]),  // C5 Eb5 C5 Bb4 G4 rest
    ...seq(8,  [[68,1.5],[72,1],[75,1.5],[72,1],[68,1.5],[0,1]]),    // Ab4 C5 Eb5 C5 Ab4 rest
    ...seq(16, [[63,1.5],[67,1],[70,1.5],[75,1],[72,1.5],[0,1]]),    // Eb4 G4 Bb4 Eb5 C5 rest
    ...seq(24, [[67,1.5],[71,1],[74,1.5],[71,1],[67,1.5],[0,1]]),    // G4 B4 D5 B4 G4 rest
    // B section — higher, more unsettling
    ...seq(32, [[84,1.5],[87,1],[84,1.5],[82,1],[79,1.5],[0,1.5]]),  // C6 Eb6 C6 Bb5 G5
    ...seq(40, [[80,1.5],[84,1],[87,1.5],[84,1],[80,1.5],[0,1]]),    // Ab5 C6 Eb6 C6 Ab5
    ...seq(48, [[75,1.5],[79,1],[82,1],[84,0.5],[82,0.5],[79,1.5],[75,1.5]]), // Eb5 G5 Bb5 C6 Bb5 G5 Eb5
    ...seq(56, [[79,1.5],[83,1],[79,1.5],[75,1],[72,2.5]]),          // G5 B5 G5 Eb5 C5
  ];
  renderTrack(buf, SR, bpm, theremin, melody);

  // Drums — sparse, heavy, ghostly
  const beatSec = 60 / bpm;
  const drumPat: [number, DrumEvent][] = [
    [0,   (b,s,t) => renderKick(b,s,t,0.18)],
    [3,   (b,s,t) => renderKick(b,s,t,0.12)],
    [2,   (b,s,t) => renderSnare(b,s,t,0.06)],
  ];
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);
  // Eerie noise hits every 8 beats
  for (let b = 4; b < TOTAL_BEATS; b += 8) {
    const time = b * beatSec;
    const dur = 0.4;
    const s = Math.floor(time * SR);
    const e = Math.min(s + Math.ceil(dur * SR), buf.length);
    for (let i = s; i < e; i++) {
      if (i < 0) continue;
      const p = (i - s) / (e - s);
      buf[i] += (Math.random() * 2 - 1) * Math.max(0, 1 - p * 2) * 0.03 * Math.sin(p * Math.PI);
    }
  }

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
//  9. ROOFTOPS — Urban funky groove (145bpm, E minor)
// ----------------------------------------------------------------
function generateRooftops(): string {
  const bpm = 145;
  const buf = makeBuffer(bpm);

  // Em C G D (8 beats each, 2x)
  const chords: [number, number][] = [[40, 8], [48, 8], [43, 8], [50, 8], [40, 8], [48, 8], [43, 8], [50, 8]];

  // Funky bass — sawtooth, syncopated pattern
  const bass: SynthTrack = { wave: 'saw', vol: 0.07, a: 0.005, d: 0.06, s: 0.4, r: 0.03, filterHz: 700 };
  const bassNotes = chordBass(chords, (root, start) => [
    n(start,     0.5, root), n(start+0.5, 0.25, root+12),
    n(start+1.5, 0.5, root), n(start+2,   0.75, root+7),
    n(start+3,   0.5, root), n(start+3.5, 0.25, root+12),
    n(start+4,   0.5, root+5), n(start+4.5, 0.25, root+12),
    n(start+5.5, 0.5, root), n(start+6,   0.75, root+7),
    n(start+7,   0.5, root), n(start+7.5, 0.25, root+5),
  ]);
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Lo-fi chord stabs — filtered square
  const chordStab: SynthTrack = { wave: 'sq', vol: 0.03, a: 0.01, d: 0.1, s: 0.2, r: 0.05, filterHz: 1800 };
  const stabNotes = chordBass(chords, (root, start) => [
    n(start+0.5, 0.4, root+16), n(start+0.5, 0.4, root+19),
    n(start+2.5, 0.4, root+16), n(start+2.5, 0.4, root+19),
    n(start+4.5, 0.4, root+16), n(start+4.5, 0.4, root+19),
    n(start+6,   0.8, root+16), n(start+6,   0.8, root+19),
  ]);
  renderTrack(buf, SR, bpm, chordStab, stabNotes);

  // Lead riff — cool pentatonic, square wave
  const lead: SynthTrack = { wave: 'sq', vol: 0.04, a: 0.005, d: 0.05, s: 0.5, r: 0.05, filterHz: 3000 };
  const melody = [
    ...seq(0,  [[64,0.5],[67,0.5],[71,1],[67,0.5],[64,0.5],[62,1]]),    // E4 G4 B4~ G4 E4 D4~
    ...seq(4,  [[64,0.5],[67,0.5],[69,0.5],[71,0.5],[72,1],[71,1]]),    // E4 G4 A4 B4 C5~ B4~
    ...seq(8,  [[72,0.5],[76,0.5],[79,1],[76,0.5],[72,0.5],[71,1]]),    // C5 E5 G5~ E5 C5 B4~
    ...seq(12, [[72,0.5],[76,0.5],[79,0.5],[76,0.5],[72,0.5],[69,0.5],[67,1]]), // C5 E5 G5 E5 C5 A4 G4~
    ...seq(16, [[67,0.5],[71,0.5],[74,1],[71,0.5],[67,0.5],[64,1]]),    // G4 B4 D5~ B4 G4 E4~
    ...seq(20, [[67,0.5],[71,0.5],[74,0.5],[76,0.5],[78,1],[76,1]]),    // G4 B4 D5 E5 F#5~ E5~
    ...seq(24, [[74,0.5],[78,0.5],[81,1],[78,0.5],[74,0.5],[71,1]]),    // D5 F#5 A5~ F#5 D5 B4~
    ...seq(28, [[74,0.5],[76,0.5],[78,0.5],[76,0.5],[74,0.5],[71,0.5],[69,1]]), // D5 E5 F#5 E5 D5 B4 A4~
    // B section
    ...seq(32, [[76,0.5],[79,0.5],[83,1],[79,0.5],[76,0.5],[74,1]]),    // E5 G5 B5~ G5 E5 D5~
    ...seq(36, [[76,0.5],[79,0.5],[81,0.5],[83,0.5],[84,1],[83,1]]),    // E5 G5 A5 B5 C6~ B5~
    ...seq(40, [[84,0.5],[88,0.5],[91,1],[88,0.5],[84,0.5],[83,1]]),    // C6 E6 G6~ E6 C6 B5~
    ...seq(44, [[84,0.5],[86,0.5],[88,0.5],[86,0.5],[84,0.5],[81,0.5],[79,1]]),
    ...seq(48, [[79,0.5],[83,0.5],[86,1],[83,0.5],[79,0.5],[76,1]]),
    ...seq(52, [[79,0.5],[81,0.5],[83,0.5],[81,0.5],[79,0.5],[76,0.5],[74,1]]),
    ...seq(56, [[71,0.5],[74,0.5],[76,1],[79,1],[76,0.5],[74,0.5]]),
    ...seq(60, [[71,0.5],[69,0.5],[67,0.5],[64,0.5],[67,2]]),
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Drums — tight groove, swung hats
  const drumPat: [number, DrumEvent][] = [
    [0,    (b,s,t) => renderKick(b,s,t,0.16)],
    [1.5,  (b,s,t) => renderKick(b,s,t,0.12)],
    [2.75, (b,s,t) => renderKick(b,s,t,0.10)],
    [1,    (b,s,t) => renderClap(b,s,t,0.09)],
    [3,    (b,s,t) => renderClap(b,s,t,0.09)],
  ];
  // Swung hi-hats: slightly pushed 8th notes
  for (let i = 0; i < 4; i += 0.5) {
    const swing = i % 1 === 0.5 ? 0.08 : 0;
    drumPat.push([i + swing, (b,s,t) => renderHihat(b,s,t, i%2===1.5, 0.035)]);
  }
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);

  return floatBufferToWavDataUri(buf, SR);
}

// ----------------------------------------------------------------
// 10. SPACE STATION — Synthwave electronic (132bpm, F# minor)
// ----------------------------------------------------------------
function generateSpaceStation(): string {
  const bpm = 132;
  const buf = makeBuffer(bpm);

  // F#m D A E (8 beats each, 2x)
  const chords: [number, number][] = [[42, 8], [38, 8], [45, 8], [40, 8], [42, 8], [38, 8], [45, 8], [40, 8]];

  // Pulsing sub bass — sine, sidechain-style pump
  const bass: SynthTrack = { wave: 'sin', vol: 0.10, a: 0.08, d: 0.2, s: 0.4, r: 0.05 };
  const bassNotes = chordBass(chords, (root, start, dur) => {
    const notes: SynthNote[] = [];
    for (let b = 0; b < dur; b += 1) {
      notes.push(n(start + b, 0.7, root, b % 4 === 0 ? 0.5 : 0.8)); // ducked on kick
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, bass, bassNotes);

  // Synth arp — sawtooth, 16th note arpeggios
  const arp: SynthTrack = { wave: 'saw', vol: 0.03, a: 0.003, d: 0.04, s: 0.25, r: 0.03, filterHz: 2500 };
  const arpNotes = chordBass(chords, (root, start) => {
    const notes: SynthNote[] = [];
    const pattern = [root + 12, root + 16, root + 19, root + 24, root + 19, root + 16];
    for (let b = 0; b < 8; b += 0.25) {
      const idx = Math.floor(b * 4) % pattern.length;
      notes.push(n(start + b, 0.2, pattern[idx], 0.5 + (b % 1 === 0 ? 0.3 : 0)));
    }
    return notes;
  });
  renderTrack(buf, SR, bpm, arp, arpNotes);

  // Atmospheric pad — wide detuned sines
  const pad1: SynthTrack = { wave: 'sin', vol: 0.02, a: 0.5, d: 0.5, s: 0.3, r: 0.4, detune: 12 };
  const pad2: SynthTrack = { wave: 'tri', vol: 0.015, a: 0.5, d: 0.5, s: 0.3, r: 0.4, detune: -12 };
  const padNotes = chordBass(chords, (root, start) => [
    n(start, 7, root + 24), n(start, 7, root + 28), n(start, 7, root + 31),
  ]);
  renderTrack(buf, SR, bpm, pad1, padNotes);
  renderTrack(buf, SR, bpm, pad2, padNotes);

  // Lead melody — bright square, sci-fi
  const lead: SynthTrack = { wave: 'sq', vol: 0.035, a: 0.01, d: 0.06, s: 0.5, r: 0.06, filterHz: 4000 };
  const melody = [
    ...seq(0,  [[66,0.5],[69,0.5],[73,1.5],[69,0.5]]),               // F#4 A4 C#5~~ A4
    ...seq(3,  [[66,0.5],[69,0.5],[73,0.5],[78,0.5],[73,1]]),        // F#4 A4 C#5 F#5 C#5~
    ...seq(6,  [[69,1],[66,1]]),                                      // A4~ F#4~
    ...seq(8,  [[62,0.5],[66,0.5],[69,1.5],[66,0.5]]),               // D4 F#4 A4~~ F#4
    ...seq(11, [[62,0.5],[66,0.5],[69,0.5],[74,0.5],[69,1]]),        // D4 F#4 A4 D5 A4~
    ...seq(14, [[66,1],[62,1]]),                                      // F#4~ D4~
    ...seq(16, [[69,0.5],[73,0.5],[76,1.5],[73,0.5]]),               // A4 C#5 E5~~ C#5
    ...seq(19, [[69,0.5],[73,0.5],[76,0.5],[81,0.5],[76,1]]),        // A4 C#5 E5 A5 E5~
    ...seq(22, [[73,1],[69,1]]),                                      // C#5~ A4~
    ...seq(24, [[64,0.5],[67,0.5],[71,1.5],[67,0.5]]),               // E4 G#4 B4~~ G#4
    ...seq(27, [[64,0.5],[67,0.5],[71,0.5],[76,0.5],[71,1]]),        // E4 G#4 B4 E5 B4~
    ...seq(30, [[67,1],[64,1]]),                                      // G#4~ E4~
    // B section — higher octave
    ...seq(32, [[78,0.5],[81,0.5],[85,1.5],[81,0.5]]),               // F#5 A5 C#6~~ A5
    ...seq(35, [[78,0.5],[81,0.5],[85,0.5],[90,0.5],[85,1]]),        // F#5 A5 C#6 F#6 C#6~
    ...seq(38, [[81,1],[78,1]]),                                      // A5~ F#5~
    ...seq(40, [[74,0.5],[78,0.5],[81,1.5],[78,0.5]]),               // D5 F#5 A5~~ F#5
    ...seq(43, [[74,0.5],[78,0.5],[81,0.5],[86,0.5],[81,1]]),
    ...seq(46, [[78,1],[74,1]]),
    ...seq(48, [[81,0.5],[85,0.5],[88,1.5],[85,0.5]]),
    ...seq(51, [[81,0.5],[85,0.5],[88,0.5],[93,0.5],[88,1]]),
    ...seq(54, [[85,1],[81,1]]),
    ...seq(56, [[76,0.5],[79,0.5],[83,1.5],[79,0.5]]),
    ...seq(59, [[76,0.5],[79,0.5],[83,0.5],[88,0.5],[83,1]]),
    ...seq(62, [[79,1],[76,1]]),
  ];
  renderTrack(buf, SR, bpm, lead, melody);

  // Electronic drums — 808-style
  const drumPat: [number, DrumEvent][] = [
    [0,    (b,s,t) => renderKick(b,s,t,0.20)],
    [2,    (b,s,t) => renderKick(b,s,t,0.16)],
    [3.5,  (b,s,t) => renderKick(b,s,t,0.12)],
    [1,    (b,s,t) => renderClap(b,s,t,0.10)],
    [3,    (b,s,t) => renderClap(b,s,t,0.10)],
  ];
  // 16th note hats with accents
  for (let i = 0; i < 4; i += 0.25) {
    const vol = i % 1 === 0 ? 0.04 : i % 0.5 === 0 ? 0.025 : 0.015;
    drumPat.push([i, (b,s,t) => renderHihat(b,s,t, i === 2, vol)]);
  }
  repeatDrums(buf, SR, bpm, drumPat, 4, TOTAL_BEATS);

  return floatBufferToWavDataUri(buf, SR);
}

// ================================================================
//  Public API — generate music by theme ID
// ================================================================

const generators: Record<string, () => string> = {
  meadow: generateMeadow,
  winter_lake: generateWinterLake,
  volcano: generateVolcano,
  castle: generateCastle,
  candy_land: generateCandyLand,
  treetops: generateTreetops,
  underwater: generateUnderwater,
  haunted_graveyard: generateHauntedGraveyard,
  rooftops: generateRooftops,
  space_station: generateSpaceStation,
};

/** Generate a WAV data URI for the given theme's music. Falls back to meadow. */
export function generateThemeMusic(themeId: string): string {
  const gen = generators[themeId] ?? generators.meadow;
  return gen();
}
