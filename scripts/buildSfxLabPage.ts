/**
 * Builds an SFX-lab HTML page in the brainstorming companion's content dir.
 * Two modes:
 *   --page movement  — broad first-pass exploration (procedural variants + samples)
 *   --page refine    — narrow exploration: only kept selections + close perturbations
 *
 * Usage:
 *   npx vite-node scripts/buildSfxLabPage.ts -- --page refine
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateJumpSound, generateLandSound, generateFootstepGrass,
  generateFootstepWood, generateCrouchSound, generateFastfallSound,
  generateSelectSound, generateVictorySound,
} from '../src/engine/audio/synthesis/sfx';
import { floatBufferToWavDataUri } from '../src/engine/audio/synthesis/wav';
import { generateToneBuffer, generateMultiSegmentTone } from '../src/engine/audio/synthesis/core';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSET_LIB = process.env.SFX_LIB_PATH || 'P:\\projects\\asssets\\sfx';
const SESSION_ROOT = path.join(PROJECT_ROOT, '.superpowers', 'brainstorm');

interface Candidate {
  id: string;
  label: string;
  src: string;
  source?: string;
  tag: string;
}

interface SoundEntry {
  name: string;
  description: string;
  candidates: Candidate[];
}

interface PageDef {
  title: string;
  subtitle: string;
  sounds: SoundEntry[];
}

// ---------------------------------------------------------------------------
// Sample loading

function fileToDataUri(rel: string): string {
  const src = path.join(ASSET_LIB, rel.replace(/\//g, path.sep));
  const ext = path.extname(rel).toLowerCase();
  const mime = ext === '.ogg' ? 'audio/ogg'
    : ext === '.wav' ? 'audio/wav'
    : ext === '.mp3' ? 'audio/mpeg'
    : 'application/octet-stream';
  const bytes = fs.readFileSync(src);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function sample(soundName: string, shortId: string, rel: string, pack: string): Candidate {
  return {
    id: `${soundName}:${shortId}`,
    label: path.basename(rel, path.extname(rel)),
    src: fileToDataUri(rel),
    source: rel,
    tag: pack,
  };
}

function proc(soundName: string, shortId: string, dataUri: string, label: string, tag = 'procedural'): Candidate {
  return {
    id: `${soundName}:proc-${shortId}`,
    label,
    src: dataUri,
    tag,
  };
}

// ---------------------------------------------------------------------------
// Synth helpers

const SR = 44100;

function buildBuffer(durationSec: number, fn: (t: number, i: number) => number): string {
  const n = Math.floor(SR * durationSec);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = fn(i / SR, i);
  return floatBufferToWavDataUri(buf, SR);
}

// ---------------------------------------------------------------------------
// Parameterized procedural recipes (used to generate refinement variations)

interface JumpSweepParams {
  startF: number;
  endF: number;
  duration: number;
  type: 'sine' | 'square' | 'triangle' | 'sawtooth';
  amplitude: number;
}

function jumpSweep({ startF, endF, duration, type, amplitude }: JumpSweepParams): string {
  // Mirrors the structure of generateToneBuffer but with explicit waveform support
  return generateToneBuffer(startF, duration, type === 'sine' || type === 'square' ? type : 'square', amplitude, endF);
}

// generateToneBuffer only supports sine/square. Roll our own for tri/saw with sweep.
function jumpSweepCustom({ startF, endF, duration, type, amplitude }: JumpSweepParams): string {
  return buildBuffer(duration, (t) => {
    const p = t / duration;
    const f = startF + (endF - startF) * p;
    const phase = (t * f) % 1;
    let s = 0;
    if (type === 'sine') s = Math.sin(2 * Math.PI * phase);
    else if (type === 'square') s = phase < 0.5 ? 1 : -1;
    else if (type === 'triangle') s = 4 * Math.abs(phase - 0.5) - 1;
    else if (type === 'sawtooth') s = 2 * phase - 1;
    // Gentle envelope so it doesn't end on a pop
    const env = Math.min(1, p * 12) * Math.max(0, 1 - Math.max(0, p - 0.85) * 7);
    return s * amplitude * env;
  });
}

interface LandLowThudParams {
  bassF: number;       // sub-bass frequency (default 90)
  duration: number;    // overall duration (default 0.25)
  bassDecay: number;   // exp-style decay rate (default 4)
  bassAmp: number;     // bass amplitude (default 0.55)
  clickDecay: number;  // click decay rate (default 30)
  clickAmp: number;    // click amplitude (default 0.3)
}

function landLowThud(p: Partial<LandLowThudParams> = {}): string {
  const { bassF = 90, duration = 0.25, bassDecay = 4, bassAmp = 0.55,
          clickDecay = 30, clickAmp = 0.3 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const sub = Math.sin(2 * Math.PI * bassF * t) * Math.max(0, 1 - prog * bassDecay) * bassAmp;
    const click = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * clickDecay) * clickAmp;
    return sub + click;
  });
}

interface LandCrunchParams {
  thudF: number;
  duration: number;
  noiseLp: number;     // 0-1; one-pole cutoff coefficient (higher = brighter)
  noiseDecay: number;
  thudAmp: number;
  noiseAmp: number;
}

function landCrunch(p: Partial<LandCrunchParams> = {}): string {
  const { thudF = 110, duration = 0.28, noiseLp = 0.15, noiseDecay = 5,
          thudAmp = 0.45, noiseAmp = 0.35 } = p;
  let lp = 0;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const thud = Math.sin(2 * Math.PI * thudF * t) * Math.max(0, 1 - prog * 3) * thudAmp;
    const noise = Math.random() * 2 - 1;
    lp += noiseLp * (noise - lp);
    return thud + lp * Math.max(0, 1 - prog * noiseDecay) * noiseAmp;
  });
}

interface FootstepNoiseParams {
  duration: number;
  envDecay: number;
  amplitude: number;
}

function footstepRaw(p: Partial<FootstepNoiseParams> = {}): string {
  const { duration = 0.05, envDecay = 3, amplitude = 0.15 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const envelope = Math.max(0, 1 - prog * envDecay) * amplitude;
    return (Math.random() * 2 - 1) * envelope;
  });
}

interface FootstepBrightParams {
  duration: number;
  cutoff: number;     // higher = brighter
  envDecay: number;
  amplitude: number;
}

function footstepBright(p: Partial<FootstepBrightParams> = {}): string {
  const { duration = 0.07, cutoff = 0.5, envDecay = 8, amplitude = 0.4 } = p;
  let lp = 0;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const noise = Math.random() * 2 - 1;
    lp += cutoff * (noise - lp);
    return (noise - lp) * Math.exp(-prog * envDecay) * amplitude;
  });
}

interface FootstepWoodCrispParams {
  toneF: number;
  duration: number;
  toneDecay: number;
  toneAmp: number;
  noiseDecay: number;
  noiseAmp: number;
}

function footstepWoodCrisp(p: Partial<FootstepWoodCrispParams> = {}): string {
  const { toneF = 220, duration = 0.07, toneDecay = 30, toneAmp = 0.3,
          noiseDecay = 18, noiseAmp = 0.25 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const tone = Math.sin(2 * Math.PI * toneF * t) * Math.exp(-prog * toneDecay) * toneAmp;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * noiseDecay) * noiseAmp;
    return tone + noise;
  });
}

interface FastfallParams {
  startF: number;
  endF: number;
  duration: number;
  envDecay: number;
  toneAmp: number;
  noiseAmp: number;
}

function fastfallRaw(p: Partial<FastfallParams> = {}): string {
  const { startF = 800, endF = 150, duration = 0.25, envDecay = 1.2,
          toneAmp = 0.5, noiseAmp = 0.5 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const f = startF + (endF - startF) * prog;
    const envelope = Math.max(0, 1 - prog * envDecay) * 0.5;
    const tone = Math.sin(2 * Math.PI * f * t) * toneAmp;
    const noiseAmt = Math.sin(prog * Math.PI) * noiseAmp;
    const noise = (Math.random() * 2 - 1) * noiseAmt;
    return (tone + noise) * envelope;
  });
}

// ---------------------------------------------------------------------------
// Combat & impact — first-pass exploration

interface StompVariantParams {
  duration: number;
  crackF: number;       // initial crack freq
  crackAmp: number;
  thudF: number;        // thud start freq
  thudFalloff: number;  // multiplier on freq (1 - progress * f)
  thudAmp: number;
  noiseAmp: number;
}

function stompVariant(p: Partial<StompVariantParams> = {}): string {
  const { duration = 0.3, crackF = 800, crackAmp = 0.4, thudF = 120,
          thudFalloff = 0.6, thudAmp = 0.5, noiseAmp = 0.35 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const crack = Math.sin(2 * Math.PI * crackF * t) * Math.max(0, 1 - prog * 12) * crackAmp;
    const thudFreq = thudF * (1 - prog * thudFalloff);
    const thud = Math.sin(2 * Math.PI * thudFreq * t) * Math.max(0, 1 - prog * 2) * thudAmp;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 5) * noiseAmp;
    return crack + thud + noise;
  });
}

interface HeadbonkVariantParams {
  duration: number;
  knockF: number;
  knockAmp: number;
  bodyStartF: number;
  bodyEndF: number;
  bodyType: 'sine' | 'triangle' | 'square';
  bodyAmp: number;
  noiseAmp: number;
}

function headbonkVariant(p: Partial<HeadbonkVariantParams> = {}): string {
  const { duration = 0.15, knockF = 1000, knockAmp = 0.7, bodyStartF = 350,
          bodyEndF = 180, bodyType = 'triangle', bodyAmp = 0.6, noiseAmp = 0.25 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const knock = prog < 0.1 ? Math.sin(2 * Math.PI * knockF * t) * knockAmp : 0;
    const f = bodyStartF + (bodyEndF - bodyStartF) * prog;
    const phase = (t * f) % 1;
    let body = 0;
    if (bodyType === 'sine') body = Math.sin(2 * Math.PI * phase);
    else if (bodyType === 'triangle') body = 4 * Math.abs(phase - 0.5) - 1;
    else if (bodyType === 'square') body = phase < 0.5 ? 1 : -1;
    const env = Math.max(0, 1 - prog * 1.8) * bodyAmp;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 6) * noiseAmp;
    return body * env + knock + noise;
  });
}

interface BumpVariantParams {
  duration: number;
  thudF: number;
  thudAmp: number;
  noiseAmp: number;
  envDecay: number;
}

function bumpVariant(p: Partial<BumpVariantParams> = {}): string {
  const { duration = 0.08, thudF = 160, thudAmp = 0.3, noiseAmp = 0.4,
          envDecay = 3 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const env = Math.max(0, 1 - prog * envDecay) * 0.4;
    const noise = (Math.random() * 2 - 1) * noiseAmp;
    const tone = Math.sin(2 * Math.PI * thudF * t) * thudAmp;
    return (noise + tone) * env;
  });
}

interface OofVariantParams {
  duration: number;
  startF: number;
  endF: number;
  toneAmp: number;
  noiseAmp: number;
  type: 'sine' | 'square' | 'triangle';
}

function oofVariant(p: Partial<OofVariantParams> = {}): string {
  const { duration = 0.15, startF = 150, endF = 100, toneAmp = 1, noiseAmp = 0.2,
          type = 'sine' } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const f = startF + (endF - startF) * prog;
    const phase = (t * f) % 1;
    let tone = 0;
    if (type === 'sine') tone = Math.sin(2 * Math.PI * phase);
    else if (type === 'square') tone = phase < 0.5 ? 1 : -1;
    else if (type === 'triangle') tone = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.max(0, 1 - prog * 2) * 0.3;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 5) * noiseAmp;
    return (tone * toneAmp + noise) * env;
  });
}

function oofUgh(): string {
  // Down-up-down freq curve (more vocal-like)
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    // freq path: 180 → 110 → 140 → 90
    const f = 180 - 90 * Math.sin(p * Math.PI * 1.5);
    const tone = Math.sin(2 * Math.PI * f * t);
    const env = Math.min(1, p * 8) * Math.max(0, 1 - p * 1.5) * 0.32;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 6) * 0.18;
    return (tone + noise) * env;
  });
}

interface ThornHitVariantParams {
  duration: number;
  stabF: number;
  stabAmp: number;
  painStartF: number;
  painEndF: number;
  painAmp: number;
  noiseAmp: number;
}

function thornHitVariant(p: Partial<ThornHitVariantParams> = {}): string {
  const { duration = 0.3, stabF = 1200, stabAmp = 0.35, painStartF = 600,
          painEndF = 200, painAmp = 0.2, noiseAmp = 0.15 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const stab = Math.sin(2 * Math.PI * stabF * t) * Math.max(0, 1 - prog * 8) * stabAmp;
    const painFreq = painStartF + (painEndF - painStartF) * prog;
    const pain = Math.sin(2 * Math.PI * painFreq * t) * Math.max(0, 1 - prog * 3) * painAmp;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 5) * noiseAmp;
    return stab + pain + noise;
  });
}

interface CrunchVariantParams {
  duration: number;
  attackProportion: number;
  noiseAmp: number;
  harm1F: number;
  harm1Amp: number;
  harm2F: number;
  harm2Amp: number;
}

function crunchVariant(p: Partial<CrunchVariantParams> = {}): string {
  const { duration = 0.15, attackProportion = 0.08, noiseAmp = 0.7,
          harm1F = 400, harm1Amp = 0.3, harm2F = 900, harm2Amp = 0.15 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const env = prog < attackProportion
      ? prog / attackProportion
      : Math.max(0, 1 - (prog - attackProportion) * 1.2);
    const noise = (Math.random() * 2 - 1) * noiseAmp;
    const h1 = Math.sin(2 * Math.PI * harm1F * t) * harm1Amp;
    const h2 = Math.sin(2 * Math.PI * harm2F * t) * harm2Amp * Math.max(0, 1 - prog * 3);
    return (noise + h1 + h2) * env * 0.45;
  });
}

interface SplashVariantParams {
  duration: number;
  envDecay: number;
  amplitude: number;
}

function splashVariant(p: Partial<SplashVariantParams> = {}): string {
  const { duration = 0.1, envDecay = 4, amplitude = 0.2 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const env = Math.max(0, 1 - prog * envDecay) * amplitude;
    return (Math.random() * 2 - 1) * env;
  });
}

function splashWatery(): string {
  // Three-stage water burst: initial slap + body + droplets
  let lp = 0;
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const slap = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 25) * 0.45;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const body = lp * Math.max(0, 1 - Math.abs(p - 0.3) * 6) * 0.3;
    const droplets = (Math.random() * 2 - 1) * Math.max(0, p - 0.5) * Math.max(0, 1 - p) * 0.15;
    return slap + body + droplets;
  });
}

function splashDeep(): string {
  // Splash with low rumble underneath
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 6) * 0.25;
    const rumble = Math.sin(2 * Math.PI * 80 * t) * Math.max(0, 1 - p * 4) * 0.3;
    return noise + rumble;
  });
}

interface SpringVariantParams {
  duration: number;
  centerF: number;
  wobbleF: number;
  wobbleDepth: number;
  envDecay: number;
}

function springVariant(p: Partial<SpringVariantParams> = {}): string {
  const { duration = 0.2, centerF = 400, wobbleF = 25, wobbleDepth = 200,
          envDecay = 1.5 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const env = Math.max(0, 1 - prog * envDecay) * 0.5;
    const wobble = Math.sin(2 * Math.PI * wobbleF * t) * wobbleDepth;
    const f = centerF + wobble;
    return Math.sin(2 * Math.PI * f * t) * env;
  });
}

function springRising(): string {
  // Pitch-rising boing instead of wobbling
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const f = 250 + 350 * (1 - Math.exp(-p * 6));
    const env = Math.min(1, p * 8) * Math.max(0, 1 - p * 1.5) * 0.4;
    return Math.sin(2 * Math.PI * f * t) * env;
  });
}

// ---------------------------------------------------------------------------
// Combat page

function buildCombatPage(): PageDef {
  return {
    title: 'Combat & Impact Sounds',
    subtitle: 'Stomps, hurts, hits, eating, splashes, springs. Multi-select winners per sound.',
    sounds: [
      {
        name: 'stomp',
        description: 'Plays on every kill (lands on opponent\'s head). Very prominent. Pick 2–3.',
        candidates: [
          proc('stomp', 'current', stompVariant({}), 'Procedural — current (800Hz crack + 120Hz thud + noise)'),
          proc('stomp', 'heavier', stompVariant({ thudF: 80, crackAmp: 0.3, noiseAmp: 0.4 }), 'Procedural — heavier (80Hz thud, less crack)'),
          proc('stomp', 'punchier', stompVariant({ noiseAmp: 0.55, crackAmp: 0.25 }), 'Procedural — punchier (more noise, less crack)'),
          proc('stomp', 'snappier', stompVariant({ duration: 0.2 }), 'Procedural — snappier (200ms)'),
          proc('stomp', 'lower-crack', stompVariant({ crackF: 500 }), 'Procedural — lower crack (500Hz)'),
          sample('stomp', 'k_impactSoft_heavy_000', 'kenney_impact-sounds/Audio/impactSoft_heavy_000.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactSoft_heavy_001', 'kenney_impact-sounds/Audio/impactSoft_heavy_001.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactSoft_heavy_002', 'kenney_impact-sounds/Audio/impactSoft_heavy_002.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactPunch_heavy_000', 'kenney_impact-sounds/Audio/impactPunch_heavy_000.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactPunch_heavy_001', 'kenney_impact-sounds/Audio/impactPunch_heavy_001.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactPunch_heavy_002', 'kenney_impact-sounds/Audio/impactPunch_heavy_002.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactWood_heavy_000', 'kenney_impact-sounds/Audio/impactWood_heavy_000.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactWood_heavy_002', 'kenney_impact-sounds/Audio/impactWood_heavy_002.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactMining_000', 'kenney_impact-sounds/Audio/impactMining_000.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactMining_002', 'kenney_impact-sounds/Audio/impactMining_002.ogg', 'kenney_impact'),
          sample('stomp', 'k_impactPlate_heavy_000', 'kenney_impact-sounds/Audio/impactPlate_heavy_000.ogg', 'kenney_impact'),
        ],
      },
      {
        name: 'headbonk',
        description: 'Plays when player hits a ceiling mid-jump. Rare. Pick 1–2.',
        candidates: [
          proc('headbonk', 'current', headbonkVariant({}), 'Procedural — current (1000Hz knock + 350→180Hz triangle)'),
          proc('headbonk', 'higher', headbonkVariant({ bodyStartF: 450, bodyEndF: 250 }), 'Procedural — higher body (450→250Hz)'),
          proc('headbonk', 'lower', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2 }), 'Procedural — heavier (280→130Hz, 200ms)'),
          proc('headbonk', 'metallic', headbonkVariant({ bodyType: 'sine', knockF: 1500 }), 'Procedural — metallic (sine body + higher knock)'),
          proc('headbonk', 'wood', headbonkVariant({ bodyType: 'square', bodyAmp: 0.4 }), 'Procedural — wooden (square body)'),
          sample('headbonk', 'k_impactBell_heavy_000', 'kenney_impact-sounds/Audio/impactBell_heavy_000.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactBell_heavy_001', 'kenney_impact-sounds/Audio/impactBell_heavy_001.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactBell_heavy_002', 'kenney_impact-sounds/Audio/impactBell_heavy_002.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactMetal_heavy_000', 'kenney_impact-sounds/Audio/impactMetal_heavy_000.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactMetal_heavy_001', 'kenney_impact-sounds/Audio/impactMetal_heavy_001.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactPlate_heavy_001', 'kenney_impact-sounds/Audio/impactPlate_heavy_001.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactWood_medium_000', 'kenney_impact-sounds/Audio/impactWood_medium_000.ogg', 'kenney_impact'),
          sample('headbonk', 'k_impactWood_medium_002', 'kenney_impact-sounds/Audio/impactWood_medium_002.ogg', 'kenney_impact'),
        ],
      },
      {
        name: 'bump',
        description: 'Plays on player-vs-player push. Can fire repeatedly. Pick 2–3.',
        candidates: [
          proc('bump', 'current', bumpVariant({}), 'Procedural — current (160Hz tone + noise, 80ms)'),
          proc('bump', 'thuddier', bumpVariant({ thudF: 100, thudAmp: 0.45 }), 'Procedural — thuddier (100Hz, more tone)'),
          proc('bump', 'softer', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2 }), 'Procedural — softer (less aggressive)'),
          proc('bump', 'punchier', bumpVariant({ noiseAmp: 0.55, envDecay: 4 }), 'Procedural — punchier (more noise, faster decay)'),
          sample('bump', 'k_impactGeneric_light_000', 'kenney_impact-sounds/Audio/impactGeneric_light_000.ogg', 'kenney_impact'),
          sample('bump', 'k_impactGeneric_light_001', 'kenney_impact-sounds/Audio/impactGeneric_light_001.ogg', 'kenney_impact'),
          sample('bump', 'k_impactGeneric_light_002', 'kenney_impact-sounds/Audio/impactGeneric_light_002.ogg', 'kenney_impact'),
          sample('bump', 'k_impactGeneric_light_003', 'kenney_impact-sounds/Audio/impactGeneric_light_003.ogg', 'kenney_impact'),
          sample('bump', 'k_impactWood_light_001', 'kenney_impact-sounds/Audio/impactWood_light_001.ogg', 'kenney_impact'),
          sample('bump', 'k_impactWood_light_003', 'kenney_impact-sounds/Audio/impactWood_light_003.ogg', 'kenney_impact'),
          sample('bump', 'k_impactPunch_med_000', 'kenney_impact-sounds/Audio/impactPunch_medium_000.ogg', 'kenney_impact'),
          sample('bump', 'k_impactPunch_med_001', 'kenney_impact-sounds/Audio/impactPunch_medium_001.ogg', 'kenney_impact'),
          sample('bump', 'k_impactSoft_med_000', 'kenney_impact-sounds/Audio/impactSoft_medium_000.ogg', 'kenney_impact'),
        ],
      },
      {
        name: 'oof',
        description: 'Plays when player takes hazard damage. Repetitive in chaotic matches — variety helps. Pick 3–5.',
        candidates: [
          proc('oof', 'current', oofVariant({}), 'Procedural — current (150→100Hz, 150ms)'),
          proc('oof', 'higher', oofVariant({ startF: 200, endF: 150 }), 'Procedural — higher (200→150Hz, lighter)'),
          proc('oof', 'lower', oofVariant({ startF: 100, endF: 70 }), 'Procedural — lower (100→70Hz, heavier)'),
          proc('oof', 'longer', oofVariant({ duration: 0.25 }), 'Procedural — longer (250ms, more drawn-out)'),
          proc('oof', 'cartoony', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1 }), 'Procedural — cartoony (square wave)'),
          proc('oof', 'gritty', oofVariant({ noiseAmp: 0.45 }), 'Procedural — gritty (more noise)'),
          proc('oof', 'ugh', oofUgh(), 'Procedural — "ugh" (vocal-like freq curve)'),
          sample('oof', 'k_impactPunch_med_002', 'kenney_impact-sounds/Audio/impactPunch_medium_002.ogg', 'kenney_impact'),
          sample('oof', 'k_impactPunch_med_003', 'kenney_impact-sounds/Audio/impactPunch_medium_003.ogg', 'kenney_impact'),
          sample('oof', 'k_impactPunch_med_004', 'kenney_impact-sounds/Audio/impactPunch_medium_004.ogg', 'kenney_impact'),
          sample('oof', 'k_impactPunch_heavy_003', 'kenney_impact-sounds/Audio/impactPunch_heavy_003.ogg', 'kenney_impact'),
          sample('oof', 'k_impactPunch_heavy_004', 'kenney_impact-sounds/Audio/impactPunch_heavy_004.ogg', 'kenney_impact'),
          sample('oof', 'k_impactSoft_med_003', 'kenney_impact-sounds/Audio/impactSoft_medium_003.ogg', 'kenney_impact'),
          sample('oof', 'k_impactSoft_heavy_003', 'kenney_impact-sounds/Audio/impactSoft_heavy_003.ogg', 'kenney_impact'),
          sample('oof', 'k_impactSoft_heavy_004', 'kenney_impact-sounds/Audio/impactSoft_heavy_004.ogg', 'kenney_impact'),
        ],
      },
      {
        name: 'thornhit',
        description: 'Plays when player runs into thorns. Should feel sharp and painful. Pick 2.',
        candidates: [
          proc('thornhit', 'current', thornHitVariant({}), 'Procedural — current (1200Hz stab + 600→200Hz pain)'),
          proc('thornhit', 'sharper', thornHitVariant({ stabF: 1500, stabAmp: 0.42 }), 'Procedural — sharper (1500Hz stab)'),
          proc('thornhit', 'softer-pain', thornHitVariant({ stabAmp: 0.22, painAmp: 0.3 }), 'Procedural — softer stab, more pain'),
          proc('thornhit', 'snappier', thornHitVariant({ duration: 0.2 }), 'Procedural — snappier (200ms)'),
          proc('thornhit', 'longer-pain', thornHitVariant({ duration: 0.4, painEndF: 150 }), 'Procedural — longer pain decay'),
          sample('thornhit', 'k_impactGlass_light_000', 'kenney_impact-sounds/Audio/impactGlass_light_000.ogg', 'kenney_impact'),
          sample('thornhit', 'k_impactGlass_light_001', 'kenney_impact-sounds/Audio/impactGlass_light_001.ogg', 'kenney_impact'),
          sample('thornhit', 'k_impactGlass_light_002', 'kenney_impact-sounds/Audio/impactGlass_light_002.ogg', 'kenney_impact'),
          sample('thornhit', 'k_impactGlass_med_000', 'kenney_impact-sounds/Audio/impactGlass_medium_000.ogg', 'kenney_impact'),
          sample('thornhit', 'k_impactGlass_med_001', 'kenney_impact-sounds/Audio/impactGlass_medium_001.ogg', 'kenney_impact'),
          sample('thornhit', 'k_impactMetal_light_000', 'kenney_impact-sounds/Audio/impactMetal_light_000.ogg', 'kenney_impact'),
          sample('thornhit', 'k_impactMetal_light_002', 'kenney_impact-sounds/Audio/impactMetal_light_002.ogg', 'kenney_impact'),
        ],
      },
      {
        name: 'crunch',
        description: 'Plays on carrot pickup. Should feel snappy/satisfying. Pick 2–3.',
        candidates: [
          proc('crunch', 'current', crunchVariant({}), 'Procedural — current (150ms, 400Hz + 900Hz harmonics)'),
          proc('crunch', 'shorter', crunchVariant({ duration: 0.1 }), 'Procedural — shorter (100ms, snappier)'),
          proc('crunch', 'bigger', crunchVariant({ duration: 0.22, harm1Amp: 0.4 }), 'Procedural — bigger (220ms, more body)'),
          proc('crunch', 'brighter', crunchVariant({ harm2F: 1200, harm2Amp: 0.25 }), 'Procedural — brighter (boosted high harmonic)'),
          proc('crunch', 'darker', crunchVariant({ harm1F: 280, harm2Amp: 0.05 }), 'Procedural — darker (lower fundamental)'),
          sample('crunch', 'k_impactWood_light_001', 'kenney_impact-sounds/Audio/impactWood_light_001.ogg', 'kenney_impact'),
          sample('crunch', 'k_impactPlank_med_001', 'kenney_impact-sounds/Audio/impactPlank_medium_001.ogg', 'kenney_impact'),
          sample('crunch', 'k_impactPlank_med_003', 'kenney_impact-sounds/Audio/impactPlank_medium_003.ogg', 'kenney_impact'),
          sample('crunch', 'k_impactGeneric_light_002', 'kenney_impact-sounds/Audio/impactGeneric_light_002.ogg', 'kenney_impact'),
          sample('crunch', 'k_impactSoft_med_004', 'kenney_impact-sounds/Audio/impactSoft_medium_004.ogg', 'kenney_impact'),
          sample('crunch', 'rpg_chop', 'kenney_rpg-audio/Audio/chop.ogg', 'kenney_rpg'),
        ],
      },
      {
        name: 'splash',
        description: 'Plays when player falls into water. Currently a plain noise burst. Pick 1–2.',
        candidates: [
          proc('splash', 'current', splashVariant({}), 'Procedural — current (100ms noise burst)'),
          proc('splash', 'longer', splashVariant({ duration: 0.18, envDecay: 3 }), 'Procedural — longer (180ms)'),
          proc('splash', 'louder', splashVariant({ amplitude: 0.32 }), 'Procedural — louder'),
          proc('splash', 'watery', splashWatery(), 'Procedural — watery (slap + body + droplets)'),
          proc('splash', 'deep', splashDeep(), 'Procedural — deep (noise + 80Hz rumble)'),
        ],
      },
      {
        name: 'spring',
        description: 'Plays when player bounces on a spring pad. Pick 1–2.',
        candidates: [
          proc('spring', 'current', springVariant({}), 'Procedural — current (400Hz wobbling boing)'),
          proc('spring', 'springier', springVariant({ wobbleF: 35, wobbleDepth: 280 }), 'Procedural — springier (faster, deeper wobble)'),
          proc('spring', 'higher', springVariant({ centerF: 550 }), 'Procedural — higher (550Hz center)'),
          proc('spring', 'lower', springVariant({ centerF: 280 }), 'Procedural — lower (280Hz center)'),
          proc('spring', 'quicker', springVariant({ duration: 0.12 }), 'Procedural — quicker (120ms)'),
          proc('spring', 'rising', springRising(), 'Procedural — rising (pitch sweeps up instead of wobbling)'),
          sample('spring', 'k_phaserUp1', 'kenney_digital-audio/Audio/phaserUp1.ogg', 'kenney_digital'),
          sample('spring', 'k_phaserUp2', 'kenney_digital-audio/Audio/phaserUp2.ogg', 'kenney_digital'),
          sample('spring', 'k_phaserUp3', 'kenney_digital-audio/Audio/phaserUp3.ogg', 'kenney_digital'),
          sample('spring', 'k_phaseJump1', 'kenney_digital-audio/Audio/phaseJump1.ogg', 'kenney_digital'),
          sample('spring', 'k_phaseJump3', 'kenney_digital-audio/Audio/phaseJump3.ogg', 'kenney_digital'),
          sample('spring', 'k_threeTone1', 'kenney_digital-audio/Audio/threeTone1.ogg', 'kenney_digital'),
          sample('spring', 'k_pepSound1', 'kenney_digital-audio/Audio/pepSound1.ogg', 'kenney_digital'),
          sample('spring', 'k_pepSound4', 'kenney_digital-audio/Audio/pepSound4.ogg', 'kenney_digital'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Parameterized recipes used in round-3 page

interface PowParams {
  startF: number;
  endF: number;
  duration: number;
  decayRate: number;
  noiseAmp: number;
  wave: 'square' | 'triangle' | 'sine';
}

function proceduralPow(p: Partial<PowParams> = {}): string {
  const { startF = 280, endF = 80, duration = 0.18, decayRate = 4, noiseAmp = 0.25,
          wave = 'square' } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const f = startF + (endF - startF) * prog;
    const phase = (t * f) % 1;
    let body = 0;
    if (wave === 'square') body = phase < 0.5 ? 1 : -1;
    else if (wave === 'triangle') body = 4 * Math.abs(phase - 0.5) - 1;
    else body = Math.sin(2 * Math.PI * phase);
    const env = Math.exp(-prog * decayRate) * 0.32;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 15) * noiseAmp;
    return body * env + noise;
  });
}

interface WateryParams {
  duration: number;
  slapAmp: number;
  bodyAmp: number;
  dropletAmp: number;
  amplitude: number; // overall multiplier
}

function splashWateryParam(p: Partial<WateryParams> = {}): string {
  const { duration = 0.22, slapAmp = 0.45, bodyAmp = 0.3, dropletAmp = 0.15,
          amplitude = 1.0 } = p;
  let lp = 0;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const slap = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 25) * slapAmp;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const body = lp * Math.max(0, 1 - Math.abs(prog - 0.3) * 6) * bodyAmp;
    const droplets = (Math.random() * 2 - 1) * Math.max(0, prog - 0.5) * Math.max(0, 1 - prog) * dropletAmp;
    return (slap + body + droplets) * amplitude;
  });
}

// ---------------------------------------------------------------------------
// Stomp — explosion + splat redesign (loud, distinct: kill-event sound)

interface ExploSplatParams {
  duration: number;
  boomF: number;       // sub-bass frequency
  boomDecay: number;
  boomAmp: number;
  crackAmp: number;
  splatStart: number;  // when splat layer kicks in (0..1)
  splatLp: number;     // low-pass cutoff for splat noise
  splatAmp: number;
  splatMidF: number;   // mid-tonal layer in splat
}

function stompExploSplat(p: Partial<ExploSplatParams> = {}): string {
  const { duration = 0.32, boomF = 60, boomDecay = 2.5, boomAmp = 0.6,
          crackAmp = 0.45, splatStart = 0.1, splatLp = 0.18, splatAmp = 0.5,
          splatMidF = 220 } = p;
  let lp = 0;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    // Explosion layer: sub-bass boom + initial crack
    const boom = Math.sin(2 * Math.PI * boomF * t) * Math.max(0, 1 - prog * boomDecay) * boomAmp;
    const crack = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 18) * crackAmp;
    // Splat layer (delayed start, filtered noise + mid-tonal squish)
    const noise = Math.random() * 2 - 1;
    lp += splatLp * (noise - lp);
    const splatActive = Math.max(0, prog - splatStart) * Math.max(0, 1 - prog * 1.8);
    const mid = Math.sin(2 * Math.PI * splatMidF * t) * 0.18 * splatActive;
    const splat = (lp * 0.85 + mid) * splatActive * splatAmp;
    return boom + crack + splat;
  });
}

// ---------------------------------------------------------------------------
// Crunch — chomp-chomp / crunch-crunch redesign (loud, distinct: score event)

interface ChompChompParams {
  duration: number;
  bites: number;        // number of discrete chomps
  biteSharpness: number; // higher = snappier each bite
  noiseAmp: number;
  toneF: number;        // tonal layer freq
  toneAmp: number;
  amplitude: number;
}

function crunchChompChomp(p: Partial<ChompChompParams> = {}): string {
  const { duration = 0.25, bites = 2, biteSharpness = 18, noiseAmp = 0.75,
          toneF = 450, toneAmp = 0.28, amplitude = 0.7 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    // Each bite is a triangular envelope around its center
    let env = 0;
    for (let i = 0; i < bites; i++) {
      const center = (i + 0.5) / bites; // evenly spaced
      const width = 0.6 / bites;
      const dist = Math.abs(prog - center);
      if (dist < width / 2) {
        const local = 1 - (dist / (width / 2));
        env = Math.max(env, local ** 1.4);
      }
    }
    const noise = (Math.random() * 2 - 1) * noiseAmp;
    const tone = Math.sin(2 * Math.PI * toneF * t) * toneAmp;
    // Bite sharpness adds a transient spike at each bite center
    let transient = 0;
    for (let i = 0; i < bites; i++) {
      const center = (i + 0.5) / bites;
      const distFromCenter = prog - center;
      if (distFromCenter > 0 && distFromCenter < 0.04) {
        transient += (Math.random() * 2 - 1) * Math.exp(-distFromCenter * biteSharpness * 30) * 0.4;
      }
    }
    return ((noise + tone) * env + transient) * amplitude;
  });
}

function crunchTwoCrunches(): string {
  // Distinct CRUNCH-CRUNCH pattern (slower, more emphasis per bite than chompChomp)
  return buildBuffer(0.32, (t) => {
    const p = t / 0.32;
    let env = 0;
    let transient = 0;
    // Two emphatic crunches at 0% and 50%
    if (p < 0.18) {
      const localP = p / 0.18;
      env = localP < 0.1 ? localP / 0.1 : Math.max(0, 1 - (localP - 0.1) * 1.3);
      if (localP < 0.05) transient = (Math.random() * 2 - 1) * (1 - localP / 0.05) * 0.55;
    } else if (p > 0.5 && p < 0.78) {
      const localP = (p - 0.5) / 0.28;
      env = localP < 0.1 ? localP / 0.1 : Math.max(0, 1 - (localP - 0.1) * 1.3);
      if (localP < 0.05) transient = (Math.random() * 2 - 1) * (1 - localP / 0.05) * 0.5;
    }
    const noise = (Math.random() * 2 - 1) * 0.7;
    const harmonic1 = Math.sin(2 * Math.PI * 380 * t) * 0.3;
    const harmonic2 = Math.sin(2 * Math.PI * 850 * t) * 0.15;
    return ((noise + harmonic1 + harmonic2) * env + transient) * 0.7;
  });
}

// ---------------------------------------------------------------------------
// Spring — procedural attempts at the phaseJump1 character (Kenney digital
// pack: bright ascending chiptune-style sweep, ~100-150ms)

function springPhaseJumpA(): string {
  // Square wave ascending sweep
  return buildBuffer(0.15, (t) => {
    const p = t / 0.15;
    const f = 200 + 600 * p; // 200 → 800 Hz
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.min(1, p * 30) * Math.max(0, 1 - p) ** 0.8 * 0.32;
    return sq * env;
  });
}

function springPhaseJumpB(): string {
  // Pulse wave (50% → 30% duty) ascending — a little brighter than square
  return buildBuffer(0.13, (t) => {
    const p = t / 0.13;
    const f = 250 + 700 * p; // 250 → 950 Hz
    const duty = 0.5 - 0.2 * p;
    const phase = (t * f) % 1;
    const pulse = phase < duty ? 1 : -1;
    const env = Math.min(1, p * 25) * Math.max(0, 1 - p) ** 0.9 * 0.3;
    return pulse * env;
  });
}

function springPhaseJumpC(): string {
  // Stepped arpeggio — three discrete pitch jumps (most chiptune-like)
  return generateMultiSegmentTone([
    { freq: 330, duration: 0.04, type: 'square', amplitude: 0.32 },
    { freq: 494, duration: 0.04, type: 'square', amplitude: 0.32 },
    { freq: 740, duration: 0.06, type: 'square', amplitude: 0.32 },
  ]);
}

function springPhaseJumpD(): string {
  // Square sweep with slight wobble — adds character
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const baseF = 220 + 580 * p;
    const wobble = Math.sin(2 * Math.PI * 35 * t) * 30;
    const f = baseF + wobble;
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.min(1, p * 22) * Math.max(0, 1 - p) ** 0.85 * 0.3;
    return sq * env;
  });
}

function springPhaseJumpE(): string {
  // Triangle ascending — softer character, less harsh than square
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const f = 240 + 620 * p;
    const phase = (t * f) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.min(1, p * 25) * Math.max(0, 1 - p) ** 0.85 * 0.42;
    return tri * env;
  });
}

// ---------------------------------------------------------------------------
// Bump / thornhit "different take" helpers — extracted from inline IIFEs

function bumpSoftPat(): string {
  let lp = 0;
  return buildBuffer(0.07, (t) => {
    const p = t / 0.07;
    const noise = Math.random() * 2 - 1;
    lp += 0.06 * (noise - lp);
    return lp * Math.exp(-p * 7) * 0.7;
  });
}

function bumpTonalTap(): string {
  return buildBuffer(0.05, (t) => {
    const p = t / 0.05;
    return Math.sin(2 * Math.PI * 280 * t) * Math.exp(-p * 25) * 0.35;
  });
}

function thornhitElectricZap(): string {
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const f = 1800 - 1400 * p;
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.exp(-p * 5) * 0.28;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 6) * 0.18;
    return sq * env + noise;
  });
}

// ---------------------------------------------------------------------------
// Crunch — very different takes. User flagged crunch as needing distinctive
// options; these are categorically different recipes (not just param tweaks).

function crunchWetJuicy(): string {
  // Mid-freq tone + low-pass noise burst, with a "squish" trail
  let lp = 0;
  return buildBuffer(0.16, (t) => {
    const p = t / 0.16;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const tone = Math.sin(2 * Math.PI * 350 * t) * Math.max(0, 1 - p * 4) * 0.18;
    const squish = lp * Math.max(0, 1 - p) ** 1.2 * 0.6;
    return tone + squish;
  });
}

function crunchDryCrispy(): string {
  // Sharp high-freq noise burst, very short, like a potato chip
  let hp = 0;
  return buildBuffer(0.08, (t) => {
    const p = t / 0.08;
    const noise = Math.random() * 2 - 1;
    hp = noise - hp * 0.3; // crude high-pass via lp inversion
    const env = Math.exp(-p * 18);
    return hp * env * 0.5;
  });
}

function crunchMultiBite(): string {
  // Three quick crunches in succession (chomp-chomp-chomp)
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    // Three bursts at 0%, 35%, 70%
    let env = 0;
    if (p < 0.08) env = (p / 0.08) * (1 - p / 0.08);
    else if (p > 0.30 && p < 0.42) env = ((p - 0.30) / 0.06) * (1 - (p - 0.30) / 0.12);
    else if (p > 0.62 && p < 0.74) env = ((p - 0.62) / 0.06) * (1 - (p - 0.62) / 0.12);
    const noise = Math.random() * 2 - 1;
    const tone = Math.sin(2 * Math.PI * 500 * t) * 0.3;
    return (noise * 0.7 + tone) * env * 0.85;
  });
}

function crunchBoneSnap(): string {
  // Sharp high-freq click + brief tonal "crack"
  return buildBuffer(0.1, (t) => {
    const p = t / 0.1;
    const click = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 35) * 0.7;
    const crack = Math.sin(2 * Math.PI * 1500 * t) * Math.max(0, 1 - p * 25) * 0.35;
    const tail = Math.sin(2 * Math.PI * 600 * t) * Math.max(0, 1 - p * 8) * 0.15;
    return click + crack + tail;
  });
}

function crunchCarrotSpecific(): string {
  // Bright initial snap + sustained crunch body — what carrots actually sound like
  let lp = 0;
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const snap = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 30) * 0.6;
    const noise = Math.random() * 2 - 1;
    lp += 0.4 * (noise - lp); // brighter low-pass than wet/juicy
    const body = (noise - lp) * 0.5; // high-passed → crisp body
    const env = Math.min(1, p * 25) * Math.max(0, 1 - p) ** 1.3;
    return snap + body * env;
  });
}

function crunchAppleBite(): string {
  // Mid-band burst with mild sustain — tooth into apple
  let lp = 0;
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const noise = Math.random() * 2 - 1;
    lp += 0.25 * (noise - lp);
    const env = Math.exp(-p * 5);
    const harmonic = Math.sin(2 * Math.PI * 700 * t) * 0.12 * env;
    return (lp * 0.7 + harmonic) * env * 0.8;
  });
}

function crunchCerealMunch(): string {
  // Rapid clusters of micro-crunches — like cereal milling between teeth
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    // Amplitude modulation creates discrete grain "pops"
    const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 60 * t);
    const noise = Math.random() * 2 - 1;
    const env = Math.min(1, p * 8) * Math.max(0, 1 - p) ** 1.2;
    return noise * am * env * 0.55;
  });
}

function crunchPaperCrinkle(): string {
  // High-freq noise with rapid amplitude variation — paper texture
  let hp = 0;
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const noise = Math.random() * 2 - 1;
    hp = noise - hp * 0.2; // bright filter
    const am = 1 + 0.5 * Math.sin(2 * Math.PI * 90 * t);
    const env = Math.min(1, p * 6) * Math.max(0, 1 - p) ** 1.5;
    return hp * am * env * 0.4;
  });
}

function crunchTwigSnap(): string {
  // Very fast sharp transient + brief tonal echo — like snapping a dry stick
  return buildBuffer(0.08, (t) => {
    const p = t / 0.08;
    const transient = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 40) * 0.65;
    const echo = Math.sin(2 * Math.PI * 950 * t) * Math.max(0, 1 - p * 10) * 0.22;
    return transient + echo;
  });
}

function crunchHeavyChomp(): string {
  // Big single chomp with body — wet, heavy, monster-like
  let lp = 0;
  return buildBuffer(0.2, (t) => {
    const p = t / 0.2;
    const noise = Math.random() * 2 - 1;
    lp += 0.13 * (noise - lp);
    const sub = Math.sin(2 * Math.PI * 110 * t) * Math.max(0, 1 - p * 4) * 0.3;
    const env = Math.min(1, p * 18) * Math.max(0, 1 - p * 2) ** 1.4;
    return (lp * 0.9 + sub) * env * 0.6;
  });
}

// ---------------------------------------------------------------------------
// Oof — different takes (cartoony picked)

function oofCartoonPow(): string {
  // Sharp attack, descending tonal body — like a comic-book POW
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const f = 280 - 200 * p;
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.exp(-p * 4) * 0.32;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 15) * 0.25;
    return sq * env + noise;
  });
}

function oofDoh(): string {
  // Descending wood-like "doh" — single tone with gentle decay
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const f = 200 - 80 * p;
    const phase = (t * f) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.min(1, p * 8) * Math.max(0, 1 - p * 1.5) * 0.32;
    return tri * env;
  });
}

function oofVibrato(): string {
  // Descending sine with vibrato — fake "vocal" character
  return buildBuffer(0.2, (t) => {
    const p = t / 0.2;
    const baseF = 180 - 80 * p;
    const vib = Math.sin(2 * Math.PI * 12 * t) * 8;
    const f = baseF + vib;
    const env = Math.min(1, p * 8) * Math.max(0, 1 - p * 1.8) * 0.32;
    return Math.sin(2 * Math.PI * f * t) * env;
  });
}

function oofWha(): string {
  // Short rising-then-falling pitch — surprised yelp
  return buildBuffer(0.12, (t) => {
    const p = t / 0.12;
    const f = 130 + 80 * Math.sin(p * Math.PI);
    const env = Math.min(1, p * 12) * Math.max(0, 1 - p) ** 1.3 * 0.32;
    return Math.sin(2 * Math.PI * f * t) * env;
  });
}

function oofUhf(): string {
  // Short low descending — defeated grunt
  return buildBuffer(0.11, (t) => {
    const p = t / 0.11;
    const f = 110 - 40 * p;
    const env = Math.exp(-p * 5) * 0.36;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 8) * 0.2;
    return Math.sin(2 * Math.PI * f * t) * env + noise * env;
  });
}

// ---------------------------------------------------------------------------
// Stomp — different takes (punchier picked)

function stompBoom(): string {
  // Cinematic deep boom — sub + slow tonal body, no crack
  return buildBuffer(0.4, (t) => {
    const p = t / 0.4;
    const sub = Math.sin(2 * Math.PI * 55 * t) * Math.max(0, 1 - p * 1.5) * 0.55;
    const body = Math.sin(2 * Math.PI * 110 * t) * Math.max(0, 1 - p * 3) * 0.3;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 8) * 0.2;
    return sub + body + noise;
  });
}

function stompSplat(): string {
  // Wet/squishy — low thud + filtered noise (sloppy texture)
  let lp = 0;
  return buildBuffer(0.25, (t) => {
    const p = t / 0.25;
    const sub = Math.sin(2 * Math.PI * 90 * t) * Math.max(0, 1 - p * 3.5) * 0.4;
    const noise = Math.random() * 2 - 1;
    lp += 0.1 * (noise - lp);
    const splat = lp * Math.max(0, 1 - p * 2.5) * 0.5;
    return sub + splat;
  });
}

function stompKrunch(): string {
  // Bone-cracking with fast transient + brief tonal crack
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const transient = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 30) * 0.55;
    const crack = Math.sin(2 * Math.PI * 1100 * t) * Math.max(0, 1 - p * 18) * 0.3;
    const thud = Math.sin(2 * Math.PI * 100 * t) * Math.max(0, 1 - p * 4) * 0.4;
    return transient + crack + thud;
  });
}

function stompKick(): string {
  // Like a kick drum — pitched-down sine with click
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const f = 130 - 70 * Math.exp(-p * 18);
    const click = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 60) * 0.35;
    const env = Math.min(1, p * 30) * Math.exp(-p * 5);
    return Math.sin(2 * Math.PI * f * t) * env * 0.6 + click;
  });
}

// ---------------------------------------------------------------------------
// Splash — different takes (watery picked)

function splashCannonball(): string {
  // Big initial smack + long bubbly tail
  let lp = 0;
  return buildBuffer(0.32, (t) => {
    const p = t / 0.32;
    const smack = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 20) * 0.55;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const tail = lp * Math.max(0, 1 - p * 2) * 0.35;
    const sub = Math.sin(2 * Math.PI * 90 * t) * Math.max(0, 1 - p * 5) * 0.25;
    return smack + tail + sub;
  });
}

function splashPlop(): string {
  // Small/cute splash — short with a single rebound
  let lp = 0;
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const noise = Math.random() * 2 - 1;
    lp += 0.2 * (noise - lp);
    const env = Math.max(0, 1 - p * 5);
    const drop = Math.sin(2 * Math.PI * (300 - 200 * p) * t) * Math.max(0, 1 - p * 6) * 0.18;
    return lp * env * 0.5 + drop;
  });
}

// ---------------------------------------------------------------------------
// Spring — different takes (lower-center picked + 2 Kenney winners)

function springSproing(): string {
  // Classic cartoon SPROING — fast wobble with descending pitch
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const baseF = 380 - 200 * p;
    const wobble = Math.sin(2 * Math.PI * 35 * t) * 250 * (1 - p * 0.5);
    const f = baseF + wobble;
    const env = Math.max(0, 1 - p * 1.8) * 0.45;
    return Math.sin(2 * Math.PI * f * t) * env;
  });
}

function springTwang(): string {
  // Rubber-band twang — pitched-up with quick decay
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const f = 200 + 280 * (1 - Math.exp(-p * 12));
    const phase = (t * f) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.min(1, p * 20) * Math.max(0, 1 - p) ** 1.2 * 0.4;
    return tri * env;
  });
}

// ---------------------------------------------------------------------------
// Combat refinement page — kept selections + many perturbations + different takes

function buildCombatRefinePage(): PageDef {
  return {
    title: 'Combat — Refinement Round',
    subtitle: 'Kept selections + many close perturbations and categorically different takes. Crunch gets the biggest expansion (user-flagged for distinctiveness).',
    sounds: [
      // ---- stomp ----
      {
        name: 'stomp',
        description: 'Kept: Procedural punchier (more noise, less crack). Variations + 4 different takes.',
        candidates: [
          proc('stomp', 'kept-punchier', stompVariant({ noiseAmp: 0.55, crackAmp: 0.25 }),
               'KEPT — punchier (more noise, less crack)'),
          proc('stomp', 'punchier-more', stompVariant({ noiseAmp: 0.7, crackAmp: 0.15 }),
               'Punchier — even more noise / less crack'),
          proc('stomp', 'punchier-less', stompVariant({ noiseAmp: 0.45, crackAmp: 0.3 }),
               'Punchier — milder version'),
          proc('stomp', 'punchier-deeper', stompVariant({ noiseAmp: 0.55, crackAmp: 0.25, thudF: 90 }),
               'Punchier — deeper thud (90Hz)'),
          proc('stomp', 'punchier-shorter', stompVariant({ noiseAmp: 0.55, crackAmp: 0.25, duration: 0.22 }),
               'Punchier — shorter (220ms)'),
          proc('stomp', 'punchier-longer', stompVariant({ noiseAmp: 0.55, crackAmp: 0.25, duration: 0.4 }),
               'Punchier — longer (400ms)'),
          proc('stomp', 'punchier-fast-falloff', stompVariant({ noiseAmp: 0.55, crackAmp: 0.25, thudFalloff: 0.9 }),
               'Punchier — fast freq falloff (more "bend")'),
          // Different takes
          proc('stomp', 'take-boom', stompBoom(),
               '* Different take — cinematic boom (sub-bass, no crack)'),
          proc('stomp', 'take-splat', stompSplat(),
               '* Different take — wet splat (low + filtered noise)'),
          proc('stomp', 'take-krunch', stompKrunch(),
               '* Different take — bone krunch (transient + crack + thud)'),
          proc('stomp', 'take-kick', stompKick(),
               '* Different take — kick drum'),
        ],
      },
      // ---- headbonk ----
      {
        name: 'headbonk',
        description: 'Kept: Procedural lower (280→130Hz, 200ms heavier). Variations.',
        candidates: [
          proc('headbonk', 'kept-lower', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2 }),
               'KEPT — heavier (280→130Hz, 200ms)'),
          proc('headbonk', 'lower-deeper', headbonkVariant({ bodyStartF: 230, bodyEndF: 100, duration: 0.22 }),
               'Even heavier (230→100Hz)'),
          proc('headbonk', 'lower-higher', headbonkVariant({ bodyStartF: 320, bodyEndF: 160, duration: 0.2 }),
               'Slightly higher (320→160Hz)'),
          proc('headbonk', 'lower-shorter', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.15 }),
               'Shorter (150ms)'),
          proc('headbonk', 'lower-longer', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.28 }),
               'Longer (280ms — drawn-out)'),
          proc('headbonk', 'lower-sine', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, bodyType: 'sine' }),
               'Lower + sine wave (smoother)'),
          proc('headbonk', 'lower-square', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, bodyType: 'square' }),
               'Lower + square wave (harder)'),
          proc('headbonk', 'lower-no-knock', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0.3 }),
               'Lower + softer knock'),
          proc('headbonk', 'lower-big-knock', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 1.0, knockF: 1300 }),
               'Lower + big sharp knock'),
          // Different takes
          proc('headbonk', 'take-coconut', headbonkVariant({ bodyStartF: 320, bodyEndF: 240, duration: 0.18, bodyType: 'sine', knockF: 1800, knockAmp: 0.45 }),
               '* Different take — coconut (high knock + tight body)'),
          proc('headbonk', 'take-wood-knock', headbonkVariant({ bodyStartF: 250, bodyEndF: 180, duration: 0.16, bodyType: 'square', knockF: 800, knockAmp: 0.55 }),
               '* Different take — wooden knock (mid square)'),
        ],
      },
      // ---- bump ----
      {
        name: 'bump',
        description: 'Kept: Procedural softer (less aggressive). Variations.',
        candidates: [
          proc('bump', 'kept-softer', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2 }),
               'KEPT — softer (less aggressive)'),
          proc('bump', 'softer-quieter', bumpVariant({ noiseAmp: 0.18, thudAmp: 0.15 }),
               'Softer — even quieter'),
          proc('bump', 'softer-thuddier', bumpVariant({ noiseAmp: 0.2, thudAmp: 0.3, thudF: 110 }),
               'Softer — more thud (110Hz)'),
          proc('bump', 'softer-shorter', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, duration: 0.06 }),
               'Softer — shorter (60ms)'),
          proc('bump', 'softer-longer', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, duration: 0.11, envDecay: 2.5 }),
               'Softer — longer (110ms)'),
          proc('bump', 'softer-fast-decay', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, envDecay: 5 }),
               'Softer — faster decay (snappier)'),
          // Different takes
          proc('bump', 'take-pat', bumpSoftPat(), '* Different take — soft pat (muffled mid-band)'),
          proc('bump', 'take-tap', bumpTonalTap(), '* Different take — tonal tap (clean tone, no noise)'),
        ],
      },
      // ---- oof ----
      {
        name: 'oof',
        description: 'Kept: Procedural cartoony (square wave). Variations + 5 different takes.',
        candidates: [
          proc('oof', 'kept-cartoony', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1 }),
               'KEPT — cartoony (square wave)'),
          proc('oof', 'cartoony-higher', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1, startF: 200, endF: 140 }),
               'Cartoony — higher (200→140Hz)'),
          proc('oof', 'cartoony-lower', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1, startF: 110, endF: 75 }),
               'Cartoony — lower (110→75Hz)'),
          proc('oof', 'cartoony-shorter', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1, duration: 0.1 }),
               'Cartoony — shorter (100ms)'),
          proc('oof', 'cartoony-longer', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1, duration: 0.22 }),
               'Cartoony — longer (220ms)'),
          proc('oof', 'cartoony-triangle', oofVariant({ type: 'triangle', toneAmp: 0.6, noiseAmp: 0.1 }),
               'Cartoony — triangle wave (smoother)'),
          proc('oof', 'cartoony-noisy', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.35 }),
               'Cartoony — with more noise'),
          proc('oof', 'cartoony-wide-sweep', oofVariant({ type: 'square', toneAmp: 0.6, noiseAmp: 0.1, startF: 220, endF: 60 }),
               'Cartoony — wide sweep (220→60Hz)'),
          // Different takes
          proc('oof', 'take-pow', oofCartoonPow(),
               '* Different take — comic-book POW'),
          proc('oof', 'take-doh', oofDoh(),
               '* Different take — wood-like "doh"'),
          proc('oof', 'take-vibrato', oofVibrato(),
               '* Different take — vibrato (fake-vocal)'),
          proc('oof', 'take-wha', oofWha(),
               '* Different take — surprised "wha" (rising-falling)'),
          proc('oof', 'take-uhf', oofUhf(),
               '* Different take — defeated "uhf" (short low)'),
        ],
      },
      // ---- thornhit ----
      {
        name: 'thornhit',
        description: 'Kept: Procedural longer-pain (extended pain decay). Variations.',
        candidates: [
          proc('thornhit', 'kept-longer-pain', thornHitVariant({ duration: 0.4, painEndF: 150 }),
               'KEPT — longer pain decay (400ms, 600→150Hz)'),
          proc('thornhit', 'lp-shorter', thornHitVariant({ duration: 0.32, painEndF: 150 }),
               'Slightly shorter (320ms)'),
          proc('thornhit', 'lp-even-longer', thornHitVariant({ duration: 0.5, painEndF: 130 }),
               'Even longer (500ms)'),
          proc('thornhit', 'lp-sharper-stab', thornHitVariant({ duration: 0.4, painEndF: 150, stabF: 1500, stabAmp: 0.45 }),
               'Sharper stab (1500Hz)'),
          proc('thornhit', 'lp-softer-stab', thornHitVariant({ duration: 0.4, painEndF: 150, stabAmp: 0.2 }),
               'Softer stab'),
          proc('thornhit', 'lp-deep-end', thornHitVariant({ duration: 0.4, painEndF: 100, painStartF: 700 }),
               'Deeper pain end (100Hz)'),
          proc('thornhit', 'lp-more-noise', thornHitVariant({ duration: 0.4, painEndF: 150, noiseAmp: 0.3 }),
               'More noise (gritty)'),
          proc('thornhit', 'lp-loud-pain', thornHitVariant({ duration: 0.4, painEndF: 150, painAmp: 0.32 }),
               'Louder pain tone'),
          // Different takes
          proc('thornhit', 'take-needle', thornHitVariant({ duration: 0.18, stabF: 2000, stabAmp: 0.5, painStartF: 800, painEndF: 400, painAmp: 0.15, noiseAmp: 0.08 }),
               '* Different take — needle (very high stab, brief)'),
          proc('thornhit', 'take-zap', thornhitElectricZap(), '* Different take — electric zap (square sweep)'),
        ],
      },
      // ---- crunch — distinctive expansion ----
      {
        name: 'crunch',
        description: 'Kept: Procedural current — but you flagged it as not distinctive enough. Many fresh takes.',
        candidates: [
          proc('crunch', 'kept-current', crunchVariant({}),
               'KEPT — current (150ms, 400Hz + 900Hz harmonics)'),
          // Close perturbations
          proc('crunch', 'current-shorter', crunchVariant({ duration: 0.1 }),
               'Current — shorter (100ms)'),
          proc('crunch', 'current-bigger', crunchVariant({ duration: 0.22, harm1Amp: 0.4 }),
               'Current — bigger (220ms, more body)'),
          // Categorically different
          proc('crunch', 'take-wet', crunchWetJuicy(),
               '* Wet/juicy — squishy with mid-tone (160ms)'),
          proc('crunch', 'take-dry', crunchDryCrispy(),
               '* Dry crispy — sharp high noise (potato chip, 80ms)'),
          proc('crunch', 'take-multibite', crunchMultiBite(),
               '* Multi-bite — three quick crunches (220ms)'),
          proc('crunch', 'take-bone', crunchBoneSnap(),
               '* Bone snap — sharp click + crack + tail (100ms)'),
          proc('crunch', 'take-carrot', crunchCarrotSpecific(),
               '* Carrot-specific — bright snap + crisp body (180ms)'),
          proc('crunch', 'take-apple', crunchAppleBite(),
               '* Apple bite — mid-band burst with mild sustain (140ms)'),
          proc('crunch', 'take-cereal', crunchCerealMunch(),
               '* Cereal munch — rapid amplitude-modulated grain (180ms)'),
          proc('crunch', 'take-paper', crunchPaperCrinkle(),
               '* Paper crinkle — bright noise with rapid AM (140ms)'),
          proc('crunch', 'take-twig', crunchTwigSnap(),
               '* Twig snap — fast transient + tonal echo (80ms)'),
          proc('crunch', 'take-heavy', crunchHeavyChomp(),
               '* Heavy chomp — wet, monster-like (200ms)'),
        ],
      },
      // ---- splash ----
      {
        name: 'splash',
        description: 'Kept: Procedural watery (slap + body + droplets). Variations + 2 different takes.',
        candidates: [
          proc('splash', 'kept-watery', splashWatery(),
               'KEPT — watery (slap + body + droplets, 220ms)'),
          // Different takes
          proc('splash', 'take-cannonball', splashCannonball(),
               '* Different take — cannonball (big smack + bubbly tail, 320ms)'),
          proc('splash', 'take-plop', splashPlop(),
               '* Different take — small plop (cute, 140ms)'),
          proc('splash', 'take-deep', splashDeep(),
               '* Different take — deep (noise + 80Hz rumble, 180ms)'),
        ],
      },
      // ---- spring (multi-winner) ----
      {
        name: 'spring',
        description: 'Kept 3: Procedural lower (280Hz) + Kenney phaserUp1 + phaseJump1. Use as runtime variants OR pick one. Variations of the procedural follow.',
        candidates: [
          proc('spring', 'kept-lower', springVariant({ centerF: 280 }),
               'KEPT — Procedural lower (280Hz wobbling boing)'),
          sample('spring', 'k_phaserUp1', 'kenney_digital-audio/Audio/phaserUp1.ogg', 'KEPT — kenney_digital'),
          sample('spring', 'k_phaseJump1', 'kenney_digital-audio/Audio/phaseJump1.ogg', 'KEPT — kenney_digital'),
          // Procedural perturbations
          proc('spring', 'lower-springier', springVariant({ centerF: 280, wobbleF: 35, wobbleDepth: 280 }),
               'Lower — springier (faster, deeper wobble)'),
          proc('spring', 'lower-quicker', springVariant({ centerF: 280, duration: 0.14 }),
               'Lower — quicker (140ms)'),
          proc('spring', 'lower-longer', springVariant({ centerF: 280, duration: 0.3, envDecay: 1.1 }),
               'Lower — longer (300ms)'),
          proc('spring', 'lower-deeper-wobble', springVariant({ centerF: 280, wobbleDepth: 320 }),
               'Lower — deeper wobble'),
          // Different takes
          proc('spring', 'take-sproing', springSproing(),
               '* Different take — classic SPROING (descending wobble)'),
          proc('spring', 'take-rising', springRising(),
               '* Different take — pitch-rising boing'),
          proc('spring', 'take-twang', springTwang(),
               '* Different take — rubber-band twang (rises with triangle)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Celebratory layer helpers — return per-sample contribution at time t.
// Each layer starts at startT and self-gates at its own duration.

function fanfareBrass(t: number, startT: number, scale = 1.0, voicing: 'major' | 'fifth' | 'fanfare' = 'major'): number {
  if (t < startT) return 0;
  const localT = t - startT;
  // Three-note rising chord, each note 70ms, total 210ms
  const noteDur = 0.07;
  const idx = Math.floor(localT / noteDur);
  if (idx >= 3) return 0;
  const noteT = localT - idx * noteDur;
  const noteP = noteT / noteDur;
  const voicings = {
    major: [392, 523, 659],   // G4 C5 E5
    fifth: [392, 587, 784],   // G4 D5 G5 (open fifth)
    fanfare: [523, 659, 880], // C5 E5 A5 (heroic)
  };
  const f = voicings[voicing][idx];
  const phase = (t * f) % 1;
  const sq = phase < 0.5 ? 1 : -1;
  const env = Math.min(1, noteP * 30) * Math.max(0, 1 - noteP * 0.6);
  return sq * env * 0.18 * scale;
}

function gong(t: number, startT: number, fundamental = 90, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 1.2) return 0;
  const env = Math.exp(-localT * 2.5);
  let sample = 0;
  sample += Math.sin(2 * Math.PI * fundamental * localT) * 0.32;
  sample += Math.sin(2 * Math.PI * fundamental * 2 * localT) * 0.22;
  sample += Math.sin(2 * Math.PI * fundamental * 3 * localT) * 0.13;
  sample += Math.sin(2 * Math.PI * fundamental * 1.72 * localT) * 0.16;  // inharmonic
  sample += Math.sin(2 * Math.PI * fundamental * 2.55 * localT) * 0.1;   // inharmonic
  return sample * env * scale;
}

function victoryBell(t: number, startT: number, fundamental = 700, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.6) return 0;
  // Bell partials use inharmonic ratios (real bells, not pure harmonics)
  const env = Math.min(1, localT * 200) * Math.exp(-localT * 4);
  let sample = 0;
  sample += Math.sin(2 * Math.PI * fundamental * localT) * 0.3;
  sample += Math.sin(2 * Math.PI * fundamental * 2.42 * localT) * 0.18;
  sample += Math.sin(2 * Math.PI * fundamental * 1.51 * localT) * 0.13;
  sample += Math.sin(2 * Math.PI * fundamental * 3.61 * localT) * 0.08;
  return sample * env * scale;
}

function chimeCluster(t: number, startT: number, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.5) return 0;
  // 4 chimes at C5, E5, G5, C6 — each staggered by 18ms with their own envelope
  const notes = [
    { f: 523, off: 0 },
    { f: 659, off: 0.018 },
    { f: 784, off: 0.036 },
    { f: 1047, off: 0.054 },
  ];
  let sample = 0;
  for (const n of notes) {
    const lt = localT - n.off;
    if (lt < 0) continue;
    const env = Math.min(1, lt * 250) * Math.exp(-lt * 6);
    sample += Math.sin(2 * Math.PI * n.f * lt) * env;
  }
  return sample * 0.13 * scale;
}

function sparkleArp(t: number, startT: number, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  // 5 fast high notes — A5 C6 E6 A6 C7
  const noteDur = 0.025;
  const idx = Math.floor(localT / noteDur);
  if (idx >= 5) return 0;
  const noteT = localT - idx * noteDur;
  const noteP = noteT / noteDur;
  const freqs = [880, 1047, 1319, 1760, 2093];
  const f = freqs[idx];
  const env = Math.min(1, noteP * 30) * Math.exp(-noteP * 4);
  return Math.sin(2 * Math.PI * f * t) * env * 0.2 * scale;
}

function coinDing(t: number, startT: number, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.18) return 0;
  // Two-tone coin sparkle: G5 then D6 (perfect 5th up)
  const noteDur = 0.04;
  let f = 0;
  if (localT < noteDur) f = 784;
  else if (localT < noteDur + 0.1) f = 1175;
  else return 0;
  const localP = localT / 0.18;
  const env = Math.min(1, (localT % noteDur) * 200) * Math.exp(-(localT - 0) * 6) * (1 - localP * 0.3);
  return Math.sin(2 * Math.PI * f * t) * env * 0.25 * scale;
}

function bellDing(t: number, startT: number, fundamental = 880, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.25) return 0;
  const env = Math.min(1, localT * 300) * Math.exp(-localT * 8);
  let sample = 0;
  sample += Math.sin(2 * Math.PI * fundamental * localT) * 0.35;
  sample += Math.sin(2 * Math.PI * fundamental * 2.42 * localT) * 0.15;
  return sample * env * scale;
}

function arpeggioFlourish(t: number, startT: number, scale = 1.0): number {
  if (t < startT) return 0;
  const localT = t - startT;
  // 4-note ascending major arpeggio: C5 E5 G5 C6, square wave (chiptune feel)
  const noteDur = 0.045;
  const idx = Math.floor(localT / noteDur);
  if (idx >= 4) return 0;
  const noteT = localT - idx * noteDur;
  const noteP = noteT / noteDur;
  const freqs = [523, 659, 784, 1047];
  const f = freqs[idx];
  const phase = (t * f) % 1;
  const sq = phase < 0.5 ? 1 : -1;
  const env = Math.min(1, noteP * 40) * Math.max(0, 1 - noteP * 0.7);
  return sq * env * 0.16 * scale;
}

// ---------------------------------------------------------------------------
// Additional creative celebratory layers

function cymbalCrash(t: number, startT: number, scale = 1.0): number {
  // Bright noise with very slow decay
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 1.0) return 0;
  // Pre-render is impractical; approximate bright character with rapidly modulated noise
  const noise = Math.random() * 2 - 1;
  // Fake high-pass: noise minus its (cheap moving avg estimate via local sin density)
  const env = Math.min(1, localT * 200) * Math.exp(-localT * 1.4);
  return noise * env * 0.35 * scale;
}

function reverseSwell(t: number, startT: number, duration: number, scale = 1.0): number {
  // Noise that builds up then cuts off — like a cinematic riser
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > duration) return 0;
  const noise = Math.random() * 2 - 1;
  // Linear build to peak at end
  const env = Math.min(1, (localT / duration) ** 0.7);
  return noise * env * 0.32 * scale;
}

function cinematicRiser(t: number, startT: number, scale = 1.0): number {
  // Pitch sweep up + noise swell — pre-impact tension
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.3) return 0;
  const sweepP = localT / 0.3;
  const f = 200 + 800 * sweepP;
  const tone = Math.sin(2 * Math.PI * f * t) * sweepP * 0.25;
  const noise = (Math.random() * 2 - 1) * sweepP * 0.25;
  return (tone + noise) * scale;
}

function trumpetFanfare(t: number, startT: number, scale = 1.0): number {
  // Sustained pulse wave with vibrato — single triumphant note
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.35) return 0;
  const vib = Math.sin(2 * Math.PI * 6 * t) * 8;
  const f = 392 + vib; // G4
  const phase = (t * f) % 1;
  const pulse = phase < 0.3 ? 1 : -1; // 30% duty pulse (more nasal)
  const env = Math.min(1, localT * 18) * Math.max(0, 1 - localT * 0.8);
  return pulse * env * 0.18 * scale;
}

function trumpetOctaveJump(t: number, startT: number, scale = 1.0): number {
  // 2-note octave jump (G4 → G5) — heroic
  if (t < startT) return 0;
  const localT = t - startT;
  const noteDur = 0.12;
  const idx = Math.floor(localT / noteDur);
  if (idx >= 2) return 0;
  const noteT = localT - idx * noteDur;
  const noteP = noteT / noteDur;
  const f = idx === 0 ? 392 : 784;
  const phase = (t * f) % 1;
  const pulse = phase < 0.3 ? 1 : -1;
  const env = Math.min(1, noteP * 15) * Math.max(0, 1 - noteP * 0.5);
  return pulse * env * 0.2 * scale;
}

function powerUpJingle(t: number, startT: number, scale = 1.0): number {
  // Mario-star-pickup style: 6 fast notes ascending
  if (t < startT) return 0;
  const localT = t - startT;
  const noteDur = 0.04;
  const idx = Math.floor(localT / noteDur);
  if (idx >= 6) return 0;
  const noteT = localT - idx * noteDur;
  const noteP = noteT / noteDur;
  const freqs = [523, 659, 784, 1047, 1319, 1568]; // C5 E5 G5 C6 E6 G6
  const f = freqs[idx];
  const phase = (t * f) % 1;
  const sq = phase < 0.5 ? 1 : -1;
  const env = Math.min(1, noteP * 35) * Math.max(0, 1 - noteP);
  return sq * env * 0.16 * scale;
}

function gameshowTripleDing(t: number, startT: number, scale = 1.0): number {
  // 3 rapid bell hits, same pitch
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.45) return 0;
  let sample = 0;
  for (let i = 0; i < 3; i++) {
    const hitT = i * 0.13;
    const lt = localT - hitT;
    if (lt > 0 && lt < 0.18) {
      const env = Math.min(1, lt * 200) * Math.exp(-lt * 8);
      sample += Math.sin(2 * Math.PI * 1047 * lt) * 0.3 * env;
      sample += Math.sin(2 * Math.PI * 1047 * 2.42 * lt) * 0.15 * env;
    }
  }
  return sample * scale;
}

function airHorn(t: number, startT: number, scale = 1.0): number {
  // Sustained square with slight pitch wobble
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.35) return 0;
  const wobble = Math.sin(2 * Math.PI * 4 * t) * 6;
  const f = 220 + wobble;
  const phase = (t * f) % 1;
  const sq = phase < 0.5 ? 1 : -1;
  const env = Math.min(1, localT * 30) * Math.max(0, 1 - localT * 1.2);
  return sq * env * 0.16 * scale;
}

function tubularBells(t: number, startT: number, fundamental = 880, scale = 1.0): number {
  // High-pitch with strong inharmonic partials
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.7) return 0;
  const env = Math.min(1, localT * 250) * Math.exp(-localT * 3);
  let sample = 0;
  sample += Math.sin(2 * Math.PI * fundamental * localT) * 0.25;
  sample += Math.sin(2 * Math.PI * fundamental * 2.42 * localT) * 0.18;
  sample += Math.sin(2 * Math.PI * fundamental * 4.7 * localT) * 0.1;
  sample += Math.sin(2 * Math.PI * fundamental * 6.5 * localT) * 0.07;
  return sample * env * scale;
}

function pianoChord(t: number, startT: number, scale = 1.0): number {
  // 4-note major chord with piano-like envelope (fast attack, exp decay)
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.5) return 0;
  const env = Math.min(1, localT * 200) * Math.exp(-localT * 4);
  let sample = 0;
  // C major chord: C4 E4 G4 C5
  const freqs = [261, 329, 392, 523];
  for (const f of freqs) {
    sample += Math.sin(2 * Math.PI * f * localT) * 0.18;
  }
  return sample * env * scale;
}

interface TaDaParams {
  note1F: number;
  note1Dur: number;
  note2F: number;
  note2Dur: number;
  wave: 'square' | 'triangle' | 'sine';
  amp: number;
  chord: 'none' | 'fifth' | 'fifth-octave' | 'triad'; // overtones on note 2
}

function choralTaDa(t: number, startT: number, scaleOrParams: number | Partial<TaDaParams> = 1.0): number {
  const scale = typeof scaleOrParams === 'number' ? scaleOrParams : 1.0;
  const p: TaDaParams = {
    note1F: 392, note1Dur: 0.08, note2F: 523, note2Dur: 0.22,
    wave: 'square', amp: 0.18, chord: 'fifth',
    ...(typeof scaleOrParams === 'object' ? scaleOrParams : {}),
  };
  if (t < startT) return 0;
  const localT = t - startT;
  let f: number;
  let inNote2 = false;
  if (localT < p.note1Dur) f = p.note1F;
  else if (localT < p.note1Dur + p.note2Dur) { f = p.note2F; inNote2 = true; }
  else return 0;
  const noteT = inNote2 ? localT - p.note1Dur : localT;
  const noteDur = inNote2 ? p.note2Dur : p.note1Dur;
  const noteP = noteT / noteDur;
  function osc(freq: number): number {
    const phase = (t * freq) % 1;
    if (p.wave === 'sine') return Math.sin(2 * Math.PI * phase);
    if (p.wave === 'triangle') return 4 * Math.abs(phase - 0.5) - 1;
    return phase < 0.5 ? 1 : -1;
  }
  const env = Math.min(1, noteP * 25) * Math.max(0, 1 - noteP * 0.5);
  let sample = osc(f) * env * p.amp;
  if (inNote2 && p.chord !== 'none') {
    sample += osc(f * 1.5) * env * p.amp * 0.7;          // perfect 5th
    if (p.chord === 'fifth-octave' || p.chord === 'triad') {
      sample += osc(f * 2.0) * env * p.amp * 0.5;        // octave
    }
    if (p.chord === 'triad') {
      sample += osc(f * 1.25) * env * p.amp * 0.55;       // major 3rd
    }
  }
  return sample * scale;
}

function coinShower(t: number, startT: number, scale = 1.0): number {
  // 6-8 random pitched dings within ~0.4s — coins falling
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.5) return 0;
  // Use deterministic positions/pitches via simple hash
  let sample = 0;
  const positions = [0.0, 0.06, 0.11, 0.17, 0.23, 0.30, 0.38];
  const pitches  = [880, 1175, 988, 1318, 1047, 1480, 1175];
  for (let i = 0; i < positions.length; i++) {
    const lt = localT - positions[i];
    if (lt > 0 && lt < 0.12) {
      const env = Math.min(1, lt * 250) * Math.exp(-lt * 12);
      sample += Math.sin(2 * Math.PI * pitches[i] * lt) * env * 0.18;
    }
  }
  return sample * scale;
}

function crowdCheer(t: number, startT: number, scale = 1.0): number {
  // Filtered noise with low-frequency amplitude modulation — stadium roar
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.6) return 0;
  // Cheap LP via running average; deterministic seed for AM
  const noise = Math.random() * 2 - 1;
  // AM at 3-4 Hz mimics crowd dynamics
  const am = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3.2 * t);
  const env = Math.min(1, localT * 5) * Math.max(0, 1 - localT * 1.5);
  // Crude bandpass: bias mid-band (cheap mid emphasis)
  return noise * am * env * 0.3 * scale;
}

function metalClang(t: number, startT: number, scale = 1.0): number {
  // Many high-frequency inharmonic partials + bright noise
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > 0.4) return 0;
  const env = Math.min(1, localT * 300) * Math.exp(-localT * 5);
  let sample = 0;
  const partials = [800, 1340, 1850, 2300, 2890]; // inharmonic spaced
  for (const f of partials) {
    sample += Math.sin(2 * Math.PI * f * localT) * 0.08;
  }
  sample += (Math.random() * 2 - 1) * 0.18 * Math.exp(-localT * 12);
  return sample * env * scale;
}

interface OhYeahParams {
  duration: number;
  riseStartF: number;
  risePeakF: number;
  riseDuration: number; // length of "oh" portion (s)
  fallEndF: number;
  wave: 'square' | 'triangle' | 'sine';
  amp: number;
}

function ohYeah(t: number, startT: number, scaleOrParams: number | Partial<OhYeahParams> = 1.0): number {
  // Backwards compat: number → scale; object → full params
  const scale = typeof scaleOrParams === 'number' ? scaleOrParams : 1.0;
  const p: OhYeahParams = {
    duration: 0.32, riseStartF: 280, risePeakF: 380, riseDuration: 0.1,
    fallEndF: 220, wave: 'square', amp: 0.18,
    ...(typeof scaleOrParams === 'object' ? scaleOrParams : {}),
  };
  if (t < startT) return 0;
  const localT = t - startT;
  if (localT > p.duration) return 0;
  let f: number;
  if (localT < p.riseDuration) {
    f = p.riseStartF + (p.risePeakF - p.riseStartF) * (localT / p.riseDuration);
  } else {
    f = p.risePeakF + (p.fallEndF - p.risePeakF) * ((localT - p.riseDuration) / (p.duration - p.riseDuration));
  }
  const phase = (t * f) % 1;
  let sample = 0;
  if (p.wave === 'sine') sample = Math.sin(2 * Math.PI * phase);
  else if (p.wave === 'triangle') sample = 4 * Math.abs(phase - 0.5) - 1;
  else sample = phase < 0.5 ? 1 : -1;
  const env = Math.min(1, localT * 20) * Math.max(0, 1 - localT * 1.5);
  return sample * env * p.amp * scale;
}

// ---------------------------------------------------------------------------
// Layered stomp recipes — kept cartoon-splat (longer 450ms) + celebratory layer

const STOMP_KEPT_PARAMS: Partial<CartoonSplatParams> = { duration: 0.45 };

// Generic layer wrapper — runs the kept splat (450ms) and adds a layer fn
function stompWithLayer(
  totalDuration: number,
  layerFn: (t: number) => number,
): string {
  let lp = 0;
  return buildBuffer(totalDuration, (t) => {
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      const drips = (Math.random() * 2 - 1) * Math.max(0, prog - 0.55) * Math.max(0, 1 - prog) * 0.25;
      splat = burst + sweep + body + drips;
    }
    return splat + layerFn(t);
  });
}

function stompCartoonSplatPlusBrass(voicing: 'major' | 'fifth' | 'fanfare' = 'major'): string {
  // Same engine as the kept splat, but rendered in a 0.55s buffer so the
  // brass tail (3×70ms starting at 0.10s) has room to play out.
  let lp = 0;
  return buildBuffer(0.55, (t) => {
    const splatActive = t < 0.45;
    let splat = 0;
    if (splatActive) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      const drips = (Math.random() * 2 - 1) * Math.max(0, prog - 0.55) * Math.max(0, 1 - prog) * 0.25;
      splat = burst + sweep + body + drips;
    }
    const brass = fanfareBrass(t, 0.1, 1.0, voicing);
    return splat + brass;
  });
}

function stompPlusGong(fundamental = 90): string {
  let lp = 0;
  return buildBuffer(0.95, (t) => {
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      splat = burst + sweep + body;
    }
    return splat + gong(t, 0.05, fundamental, 0.85);
  });
}

function stompPlusVictoryBell(): string {
  let lp = 0;
  return buildBuffer(0.6, (t) => {
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      splat = burst + sweep + body;
    }
    return splat + victoryBell(t, 0.08, 700, 0.95);
  });
}

function stompPlusChimes(): string {
  let lp = 0;
  return buildBuffer(0.6, (t) => {
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      splat = burst + sweep + body;
    }
    return splat + chimeCluster(t, 0.06, 1.0);
  });
}

function stompPlusFlourish(): string {
  let lp = 0;
  return buildBuffer(0.5, (t) => {
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      splat = burst + sweep + body;
    }
    return splat + arpeggioFlourish(t, 0.08, 1.0);
  });
}

function stompPlusCombo(): string {
  // Splat + small gong + sparkle arp on top — full celebration
  let lp = 0;
  return buildBuffer(0.85, (t) => {
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      splat = burst + sweep + body;
    }
    return splat + gong(t, 0.06, 110, 0.55) + sparkleArp(t, 0.18, 0.85);
  });
}

// ---------------------------------------------------------------------------
// Layered crunch recipes — kept td-2-bites + smaller celebratory layer

const TRIPLE_TWO_BITE_CENTERS = [0.18, 0.62];

function crunchTwoBitesPlusCoin(): string {
  return buildBuffer(0.4, (t) => {
    const prog = t / 0.4;
    let env = 0;
    let transient = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      for (const c of TRIPLE_TWO_BITE_CENTERS) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
    }
    const noise = (Math.random() * 2 - 1) * 0.85;
    const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
    const chomp = ((noise + harm) * env + transient) * 0.95 * (t < 0.28 ? 1 : 0);
    return chomp + coinDing(t, 0.18, 1.0);
  });
}

function crunchTwoBitesPlusBell(): string {
  return buildBuffer(0.45, (t) => {
    let env = 0;
    let transient = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      for (const c of TRIPLE_TWO_BITE_CENTERS) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
    }
    const noise = (Math.random() * 2 - 1) * 0.85;
    const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
    const chomp = ((noise + harm) * env + transient) * 0.95 * (t < 0.28 ? 1 : 0);
    return chomp + bellDing(t, 0.2, 880, 1.0);
  });
}

function crunchTwoBitesPlusSparkle(): string {
  return buildBuffer(0.45, (t) => {
    let env = 0;
    let transient = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      for (const c of TRIPLE_TWO_BITE_CENTERS) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
    }
    const noise = (Math.random() * 2 - 1) * 0.85;
    const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
    const chomp = ((noise + harm) * env + transient) * 0.95 * (t < 0.28 ? 1 : 0);
    return chomp + sparkleArp(t, 0.18, 0.7);
  });
}

function crunchTwoBitesPlusJingle(): string {
  // Jingle: 3-note happy descending major (G C E backwards = E C G)
  return buildBuffer(0.5, (t) => {
    let env = 0;
    let transient = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      for (const c of TRIPLE_TWO_BITE_CENTERS) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
    }
    const noise = (Math.random() * 2 - 1) * 0.85;
    const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
    const chomp = ((noise + harm) * env + transient) * 0.95 * (t < 0.28 ? 1 : 0);
    // Jingle: G5(784) → C6(1047) — rising 4th, 2 notes for cuteness
    let jingle = 0;
    const startT = 0.18;
    if (t >= startT) {
      const localT = t - startT;
      const noteDur = 0.06;
      const idx = Math.floor(localT / noteDur);
      if (idx < 2) {
        const noteT = localT - idx * noteDur;
        const noteP = noteT / noteDur;
        const f = idx === 0 ? 784 : 1047;
        const phase = (t * f) % 1;
        const sq = phase < 0.5 ? 1 : -1;
        const env2 = Math.min(1, noteP * 30) * Math.max(0, 1 - noteP * 0.5);
        jingle = sq * env2 * 0.18;
      }
    }
    return chomp + jingle;
  });
}

function crunchTwoBitesPlusBoth(): string {
  // Coin + sparkle layered — full celebration
  return buildBuffer(0.5, (t) => {
    let env = 0;
    let transient = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      for (const c of TRIPLE_TWO_BITE_CENTERS) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
    }
    const noise = (Math.random() * 2 - 1) * 0.85;
    const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
    const chomp = ((noise + harm) * env + transient) * 0.95 * (t < 0.28 ? 1 : 0);
    return chomp + bellDing(t, 0.18, 1175, 0.7) + sparkleArp(t, 0.22, 0.55);
  });
}

// ---------------------------------------------------------------------------
// Crunch jingle layer helper — parameterized 2/3-note jingle

interface JingleParams {
  startT: number;       // when the jingle starts (s)
  freqs: number[];      // note pitches (Hz)
  noteDur: number;      // duration per note (s)
  wave: 'square' | 'triangle' | 'sine';
  amp: number;
}

function jingleLayer(t: number, p: JingleParams): number {
  const { startT, freqs, noteDur, wave, amp } = p;
  if (t < startT) return 0;
  const localT = t - startT;
  const idx = Math.floor(localT / noteDur);
  if (idx >= freqs.length) return 0;
  const noteT = localT - idx * noteDur;
  const noteP = noteT / noteDur;
  const f = freqs[idx];
  const phase = (t * f) % 1;
  let sample = 0;
  if (wave === 'sine') sample = Math.sin(2 * Math.PI * phase);
  else if (wave === 'triangle') sample = 4 * Math.abs(phase - 0.5) - 1;
  else sample = phase < 0.5 ? 1 : -1;
  const env = Math.min(1, noteP * 30) * Math.max(0, 1 - noteP * 0.5);
  return sample * env * amp;
}

function crunchTwoBitesPlusJingleParam(jingle: JingleParams): string {
  return buildBuffer(0.5, (t) => {
    let env = 0;
    let transient = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      for (const c of TRIPLE_TWO_BITE_CENTERS) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
    }
    const noise = (Math.random() * 2 - 1) * 0.85;
    const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
    const chomp = ((noise + harm) * env + transient) * 0.95 * (t < 0.28 ? 1 : 0);
    return chomp + jingleLayer(t, jingle);
  });
}

// ---------------------------------------------------------------------------
// UI helper recipes

interface UISweepParams {
  startF: number;
  endF: number;
  duration: number;
  wave: 'square' | 'triangle' | 'sine';
  amp: number;
}

function uiSweep(p: Partial<UISweepParams> = {}): string {
  const { startF = 440, endF = 880, duration = 0.08, wave = 'square', amp = 0.2 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const f = startF + (endF - startF) * prog;
    const phase = (t * f) % 1;
    let s = 0;
    if (wave === 'sine') s = Math.sin(2 * Math.PI * phase);
    else if (wave === 'triangle') s = 4 * Math.abs(phase - 0.5) - 1;
    else s = phase < 0.5 ? 1 : -1;
    const env = Math.max(0, 1 - prog) * amp;
    return s * env;
  });
}

function selectPluck(): string {
  // Plucked-string-like — sharp attack + exponential decay
  return buildBuffer(0.1, (t) => {
    const p = t / 0.1;
    const f = 660;
    const phase = (t * f) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.exp(-p * 8);
    return tri * env * 0.32;
  });
}

function selectChime(): string {
  // Brief bell-like with bell partials
  return buildBuffer(0.15, (t) => {
    const p = t / 0.15;
    const env = Math.min(1, p * 200) * Math.exp(-p * 8);
    let sample = 0;
    sample += Math.sin(2 * Math.PI * 880 * t) * 0.3;
    sample += Math.sin(2 * Math.PI * 880 * 2.42 * t) * 0.15;
    return sample * env * 0.7;
  });
}

function selectClick(): string {
  // Very brief mid-band click
  let lp = 0;
  return buildBuffer(0.04, (t) => {
    const p = t / 0.04;
    const noise = Math.random() * 2 - 1;
    lp += 0.2 * (noise - lp);
    return lp * Math.exp(-p * 12) * 0.8;
  });
}

interface VictoryArpParams {
  notes: number[];
  noteDur: number;
  wave: 'square' | 'triangle' | 'sine';
  amp: number;
  sustainLast: boolean;       // sustain final note longer
  chordOnLast: boolean;       // add 5th + octave on final note
}

function victoryArp(p: Partial<VictoryArpParams> = {}): string {
  const { notes = [523, 659, 784, 1047], noteDur = 0.15, wave = 'sine',
          amp = 0.3, sustainLast = false, chordOnLast = false } = p;
  const lastBonus = sustainLast ? 0.3 : 0;
  const totalDur = notes.length * noteDur + lastBonus;
  return buildBuffer(totalDur, (t) => {
    let sample = 0;
    const idx = Math.floor(t / noteDur);
    if (idx >= notes.length + (sustainLast ? 1 : 0)) return 0;
    const noteIdx = Math.min(idx, notes.length - 1);
    const isLast = noteIdx === notes.length - 1;
    const noteT = isLast && idx > noteIdx ? t - noteIdx * noteDur : t - idx * noteDur;
    const localDur = isLast && sustainLast ? noteDur + lastBonus : noteDur;
    const noteP = noteT / localDur;
    const f = notes[noteIdx];
    function osc(freq: number): number {
      const phase = (t * freq) % 1;
      if (wave === 'sine') return Math.sin(2 * Math.PI * phase);
      if (wave === 'triangle') return 4 * Math.abs(phase - 0.5) - 1;
      return phase < 0.5 ? 1 : -1;
    }
    const env = Math.min(1, noteP * 25) * Math.max(0, 1 - noteP);
    sample = osc(f) * env * amp;
    if (isLast && chordOnLast) {
      sample += osc(f * 1.5) * env * amp * 0.55;  // 5th
      sample += osc(f * 0.5) * env * amp * 0.5;   // octave below for fullness
    }
    return sample;
  });
}

function victoryFanfare(): string {
  // Brass fanfare (G4-C5-E5) + sustained chord with bell on top
  return buildBuffer(0.85, (t) => {
    return fanfareBrass(t, 0.0, 1.2, 'fanfare') +
           pianoChord(t, 0.18, 1.0) +
           bellDing(t, 0.22, 1175, 0.7);
  });
}

function victoryOrchestraHit(): string {
  // Big chord stab + cymbal crash + 5-note ascending tail
  return buildBuffer(0.95, (t) => {
    let sample = 0;
    // Stab: simultaneous notes C5, E5, G5, C6 with short attack and slow decay
    if (t < 0.35) {
      const env = Math.min(1, t * 300) * Math.exp(-t * 5);
      const freqs = [523, 659, 784, 1047];
      for (const f of freqs) {
        sample += Math.sin(2 * Math.PI * f * t) * env * 0.15;
      }
    }
    // Cymbal
    sample += cymbalCrash(t, 0.0, 0.7);
    // Ascending tail
    sample += powerUpJingle(t, 0.3, 0.85);
    return sample;
  });
}

interface BeepParams {
  freq: number;
  duration: number;
  wave: 'square' | 'triangle' | 'sine';
  amp: number;
  click: boolean;       // add a brief noise click at the start
}

function countdownBeepProc(p: Partial<BeepParams> = {}): string {
  const { freq = 440, duration = 0.15, wave = 'sine', amp = 0.4, click = false } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const phase = (t * freq) % 1;
    let s = 0;
    if (wave === 'sine') s = Math.sin(2 * Math.PI * phase);
    else if (wave === 'triangle') s = 4 * Math.abs(phase - 0.5) - 1;
    else s = phase < 0.5 ? 1 : -1;
    const env = Math.min(1, prog * 25) * Math.max(0, 1 - prog * 1.2) * amp;
    let sample = s * env;
    if (click && prog < 0.02) {
      sample += (Math.random() * 2 - 1) * (1 - prog / 0.02) * 0.4;
    }
    return sample;
  });
}

function countdownTwoTone(): string {
  // Two-tone beep: low-high pip
  return buildBuffer(0.2, (t) => {
    const p = t / 0.2;
    const f = p < 0.5 ? 392 : 587; // G4 then D5
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const noteP = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5;
    const env = Math.min(1, noteP * 20) * Math.max(0, 1 - noteP * 0.5) * 0.4;
    return sq * env;
  });
}

function goAscending(): string {
  // 3-note rapid ascending arpeggio — feels like "go!"
  return generateMultiSegmentTone([
    { freq: 523, duration: 0.05, type: 'square', amplitude: 0.3 },
    { freq: 784, duration: 0.05, type: 'square', amplitude: 0.3 },
    { freq: 1047, duration: 0.12, type: 'square', amplitude: 0.3 },
  ]);
}

function goExclamation(): string {
  // Sharp attack + sustained pitch + brief noise click
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const click = p < 0.02 ? (Math.random() * 2 - 1) * (1 - p / 0.02) * 0.35 : 0;
    const phase = (t * 1047) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.min(1, p * 50) * Math.max(0, 1 - p * 1.4) * 0.32;
    return sq * env + click;
  });
}

function goBellChord(): string {
  // Bell-like chord (C5+E5+G5) with attack click
  return buildBuffer(0.4, (t) => {
    const env = Math.min(1, t * 300) * Math.exp(-t * 4);
    let sample = 0;
    sample += Math.sin(2 * Math.PI * 523 * t) * 0.18;
    sample += Math.sin(2 * Math.PI * 659 * t) * 0.18;
    sample += Math.sin(2 * Math.PI * 784 * t) * 0.18;
    sample += Math.sin(2 * Math.PI * 523 * 2.42 * t) * 0.06; // bell partial
    return sample * env;
  });
}

// ---------------------------------------------------------------------------
// Select — wide creative take. Fires dozens of times per session in menus,
// so brevity matters more than character. Each candidate ≤100ms.

function selectBlip(freq: number, duration: number, wave: 'sine' | 'square' | 'triangle' = 'sine', amp = 0.32): string {
  return buildBuffer(duration, (t) => {
    const p = t / duration;
    const phase = (t * freq) % 1;
    let s = 0;
    if (wave === 'sine') s = Math.sin(2 * Math.PI * phase);
    else if (wave === 'triangle') s = 4 * Math.abs(phase - 0.5) - 1;
    else s = phase < 0.5 ? 1 : -1;
    const env = Math.min(1, p * 30) * Math.exp(-p * 6);
    return s * env * amp;
  });
}

function selectWoodTap(): string {
  // Mid-band noise + brief 250Hz tonal hint
  let lp = 0;
  return buildBuffer(0.05, (t) => {
    const p = t / 0.05;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const tone = Math.sin(2 * Math.PI * 250 * t) * Math.exp(-p * 30) * 0.18;
    return (lp * 0.6 + tone) * Math.exp(-p * 8);
  });
}

function selectGlassTap(): string {
  // High partials with brief sustain
  return buildBuffer(0.1, (t) => {
    const p = t / 0.1;
    const env = Math.min(1, p * 200) * Math.exp(-p * 8);
    let sample = 0;
    sample += Math.sin(2 * Math.PI * 1200 * t) * 0.22;
    sample += Math.sin(2 * Math.PI * 1800 * t) * 0.12;
    sample += Math.sin(2 * Math.PI * 2400 * t) * 0.06;
    return sample * env;
  });
}

function selectDrop(): string {
  // Descending pitch quickly — water-droplet style
  return buildBuffer(0.07, (t) => {
    const p = t / 0.07;
    const f = 900 - 500 * p;
    const env = Math.min(1, p * 25) * Math.exp(-p * 7);
    return Math.sin(2 * Math.PI * f * t) * env * 0.32;
  });
}

function selectShortPip(startF: number, endF: number, duration = 0.04): string {
  // Very brief two-tone pip
  return buildBuffer(duration, (t) => {
    const p = t / duration;
    const f = startF + (endF - startF) * p;
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.min(1, p * 30) * Math.max(0, 1 - p) * 0.28;
    return sq * env;
  });
}

function selectPlasticClick(): string {
  // Very sharp transient + brief mid-band ring
  return buildBuffer(0.04, (t) => {
    const p = t / 0.04;
    const transient = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 50) * 0.5;
    const ring = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-p * 30) * 0.15;
    return transient + ring;
  });
}

function selectBubble(): string {
  // Low pitch with brief AM — like a soft "bloop"
  return buildBuffer(0.08, (t) => {
    const p = t / 0.08;
    const am = 1 + 0.4 * Math.sin(2 * Math.PI * 60 * t);
    const f = 380 - 80 * p;
    const env = Math.min(1, p * 20) * Math.exp(-p * 9);
    return Math.sin(2 * Math.PI * f * t) * am * env * 0.3;
  });
}

function selectMutedClick(): string {
  // Low-pass noise burst (no tone) — "felt button" feel
  let lp = 0;
  return buildBuffer(0.03, (t) => {
    const p = t / 0.03;
    const noise = Math.random() * 2 - 1;
    lp += 0.08 * (noise - lp);
    return lp * Math.exp(-p * 15) * 0.85;
  });
}

function selectSnap(): string {
  // High-pass noise — like fingersnap
  let hp = 0;
  return buildBuffer(0.04, (t) => {
    const p = t / 0.04;
    const noise = Math.random() * 2 - 1;
    hp = noise - hp * 0.2;
    return hp * Math.exp(-p * 18) * 0.45;
  });
}

function selectMidClick(): string {
  // Band-pass noise burst
  let lp = 0;
  let hp = 0;
  return buildBuffer(0.04, (t) => {
    const p = t / 0.04;
    const noise = Math.random() * 2 - 1;
    lp += 0.35 * (noise - lp);
    hp = lp - hp * 0.3;
    return hp * Math.exp(-p * 14) * 0.65;
  });
}

// ---------------------------------------------------------------------------
// Select-only refinement page

function buildSelectPage(): PageDef {
  return {
    title: 'Select — Wide Take 2',
    subtitle: 'Menu button click — fires dozens of times per session, must stay unobtrusive. All candidates ≤100ms. 24 fresh procedurals + 14 samples from across Kenney packs.',
    sounds: [
      {
        name: 'select',
        description: 'Pick 1. Brevity wins.',
        candidates: [
          // === Tonal blips ===
          proc('select', 'blip-c5-sine', selectBlip(523, 0.05, 'sine'),
               'Sine blip — C5 (523Hz), 50ms'),
          proc('select', 'blip-e5-sine', selectBlip(659, 0.05, 'sine'),
               'Sine blip — E5 (659Hz), 50ms'),
          proc('select', 'blip-a5-sine', selectBlip(880, 0.04, 'sine'),
               'Sine blip — A5 (880Hz), 40ms'),
          proc('select', 'blip-c6-sine', selectBlip(1047, 0.035, 'sine'),
               'Sine blip — C6 (1047Hz), 35ms'),
          proc('select', 'blip-a4-tri', selectBlip(440, 0.06, 'triangle'),
               'Triangle blip — A4 (440Hz), 60ms (warmer)'),
          proc('select', 'blip-e5-tri', selectBlip(659, 0.05, 'triangle'),
               'Triangle blip — E5 (659Hz), 50ms'),
          proc('select', 'blip-c5-sq', selectBlip(523, 0.05, 'square', 0.25),
               'Square blip — C5 (523Hz), 50ms (more retro)'),
          proc('select', 'blip-660-sq', selectBlip(660, 0.04, 'square', 0.22),
               'Square blip — 660Hz, 40ms'),
          // === Two-tone pips (very brief) ===
          proc('select', 'pip-up-low', selectShortPip(440, 660, 0.035),
               'Two-tone up — 440→660Hz, 35ms'),
          proc('select', 'pip-up-mid', selectShortPip(660, 880, 0.035),
               'Two-tone up — 660→880Hz, 35ms'),
          proc('select', 'pip-up-high', selectShortPip(880, 1320, 0.03),
               'Two-tone up — 880→1320Hz, 30ms'),
          proc('select', 'pip-down', selectShortPip(880, 660, 0.035),
               'Two-tone down — 880→660Hz, 35ms (back-press feel)'),
          // === Bell / chime brief ===
          proc('select', 'chime-880', selectChime(),
               'Brief chime — 880Hz with bell partial (150ms)'),
          proc('select', 'glass-tap', selectGlassTap(),
               'Glass tap — 1200/1800/2400Hz partials (100ms)'),
          // === Pluck / pop ===
          proc('select', 'pluck-660', selectPluck(),
               'Triangle pluck — 660Hz exp decay (100ms)'),
          proc('select', 'pluck-low', selectBlip(350, 0.05, 'triangle', 0.36),
               'Low pluck — 350Hz triangle (50ms, warmer)'),
          // === Wood / organic ===
          proc('select', 'wood-tap', selectWoodTap(),
               'Wood tap — mid noise + 250Hz tonal hint (50ms)'),
          proc('select', 'bubble', selectBubble(),
               'Soft bubble — 380→300Hz with AM (80ms)'),
          // === Drop ===
          proc('select', 'water-drop', selectDrop(),
               'Water drop — 900→400Hz descending (70ms)'),
          // === Pure clicks (no pitch) ===
          proc('select', 'click-mid', selectMidClick(),
               'Band-passed click (40ms)'),
          proc('select', 'click-muted', selectMutedClick(),
               'Muted low-pass click — felt button (30ms)'),
          proc('select', 'click-snap', selectSnap(),
               'High-pass snap — fingersnap-like (40ms)'),
          proc('select', 'click-plastic', selectPlasticClick(),
               'Plastic click — transient + 1400Hz ring (40ms)'),
          // === Sample candidates from Kenney ===
          sample('select', 'k_select_001', 'kenney_interface-sounds/Audio/select_001.ogg', 'kenney_interface'),
          sample('select', 'k_select_003', 'kenney_interface-sounds/Audio/select_003.ogg', 'kenney_interface'),
          sample('select', 'k_select_005', 'kenney_interface-sounds/Audio/select_005.ogg', 'kenney_interface'),
          sample('select', 'k_select_008', 'kenney_interface-sounds/Audio/select_008.ogg', 'kenney_interface'),
          sample('select', 'k_pluck_001', 'kenney_interface-sounds/Audio/pluck_001.ogg', 'kenney_interface'),
          sample('select', 'k_pluck_002', 'kenney_interface-sounds/Audio/pluck_002.ogg', 'kenney_interface'),
          sample('select', 'k_glass_002', 'kenney_interface-sounds/Audio/glass_002.ogg', 'kenney_interface'),
          sample('select', 'k_glass_004', 'kenney_interface-sounds/Audio/glass_004.ogg', 'kenney_interface'),
          sample('select', 'k_tick_002', 'kenney_interface-sounds/Audio/tick_002.ogg', 'kenney_interface'),
          sample('select', 'k_tick_004', 'kenney_interface-sounds/Audio/tick_004.ogg', 'kenney_interface'),
          sample('select', 'k_drop_003', 'kenney_interface-sounds/Audio/drop_003.ogg', 'kenney_interface'),
          sample('select', 'k_switch_004', 'kenney_interface-sounds/Audio/switch_004.ogg', 'kenney_interface'),
          sample('select', 'k_minimize_003', 'kenney_interface-sounds/Audio/minimize_003.ogg', 'kenney_interface'),
          sample('select', 'k_maximize_005', 'kenney_interface-sounds/Audio/maximize_005.ogg', 'kenney_interface'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// UI / match-flow page

function buildUiPage(): PageDef {
  return {
    title: 'UI / Match-flow Sounds',
    subtitle: 'Menu select, victory fanfare, countdown beeps, GO. Low-replay; 1 winner per sound is fine.',
    sounds: [
      // ---- select (menu navigation) ----
      {
        name: 'select',
        description: 'Plays on lobby/menu navigation. Should be very short (under 100ms), light, satisfying. Pick 1.',
        candidates: [
          proc('select', 'current', generateSelectSound(), 'Procedural — current (440→880Hz square sweep)'),
          proc('select', 'descending', uiSweep({ startF: 880, endF: 440 }),
               'Descending sweep (880→440Hz, square)'),
          proc('select', 'sine-sweep', uiSweep({ wave: 'sine', amp: 0.3 }),
               'Sine sweep 440→880Hz (cleaner)'),
          proc('select', 'triangle-sweep', uiSweep({ wave: 'triangle', amp: 0.28 }),
               'Triangle sweep 440→880Hz (softer)'),
          proc('select', 'higher', uiSweep({ startF: 600, endF: 1200, amp: 0.18 }),
               'Higher sweep 600→1200Hz (brighter)'),
          proc('select', 'pluck', selectPluck(),
               'Pluck — 660Hz triangle with sharp exp decay'),
          proc('select', 'chime', selectChime(),
               'Brief chime — 880Hz with bell partial'),
          proc('select', 'click', selectClick(),
               'Mid-band click (40ms, very brief)'),
          // Samples
          sample('select', 'k_select_001', 'kenney_interface-sounds/Audio/select_001.ogg', 'kenney_interface'),
          sample('select', 'k_select_002', 'kenney_interface-sounds/Audio/select_002.ogg', 'kenney_interface'),
          sample('select', 'k_select_004', 'kenney_interface-sounds/Audio/select_004.ogg', 'kenney_interface'),
          sample('select', 'k_select_007', 'kenney_interface-sounds/Audio/select_007.ogg', 'kenney_interface'),
          sample('select', 'k_pluck_001', 'kenney_interface-sounds/Audio/pluck_001.ogg', 'kenney_interface'),
          sample('select', 'k_glass_001', 'kenney_interface-sounds/Audio/glass_001.ogg', 'kenney_interface'),
          sample('select', 'k_bong_001', 'kenney_interface-sounds/Audio/bong_001.ogg', 'kenney_interface'),
          sample('select', 'ui_click1', 'kenney_ui-audio/Audio/click1.ogg', 'kenney_ui'),
          sample('select', 'ui_rollover1', 'kenney_ui-audio/Audio/rollover1.ogg', 'kenney_ui'),
          sample('select', 'ui_switch1', 'kenney_ui-audio/Audio/switch1.ogg', 'kenney_ui'),
        ],
      },
      // ---- victory (match end fanfare) ----
      {
        name: 'victory',
        description: 'Plays on the match-end victory screen. Should feel triumphant. Pick 1.',
        candidates: [
          proc('victory', 'current', generateVictorySound(),
               'Procedural — current (4-note sine arpeggio C5-E5-G5-C6)'),
          proc('victory', 'square-arp', victoryArp({ wave: 'square', amp: 0.22 }),
               'Same arpeggio but square wave (chiptune)'),
          proc('victory', 'triangle-arp', victoryArp({ wave: 'triangle', amp: 0.32 }),
               'Same arpeggio but triangle wave'),
          proc('victory', 'sustain-last', victoryArp({ sustainLast: true }),
               'Sine arpeggio with last note sustained (300ms extra)'),
          proc('victory', 'sustain-chord', victoryArp({ sustainLast: true, chordOnLast: true }),
               'Sine arpeggio + sustained chord on last note (5th + octave)'),
          proc('victory', 'square-sustain-chord', victoryArp({ wave: 'square', sustainLast: true, chordOnLast: true, amp: 0.22 }),
               'Square chiptune arpeggio + sustained chord (heroic)'),
          proc('victory', 'longer-arp', victoryArp({ notes: [523, 659, 784, 1047, 1319, 1568], noteDur: 0.1, sustainLast: true, chordOnLast: true, amp: 0.28 }),
               '6-note ascending C5-E5-G5-C6-E6-G6 + sustained chord'),
          proc('victory', 'fanfare', victoryFanfare(),
               'Brass fanfare + piano chord + bell ding (full 850ms)'),
          proc('victory', 'orchestra-hit', victoryOrchestraHit(),
               'Orchestra hit — chord stab + cymbal + ascending tail (950ms)'),
        ],
      },
      // ---- countdown_beep (3, 2, 1) ----
      {
        name: 'countdown_beep',
        description: 'Plays for the 3-2-1 countdown ticks. Short, clear, attention-grabbing. Pick 1.',
        candidates: [
          proc('countdown_beep', 'current', countdownBeepProc({}),
               'Procedural — current (440Hz sine, 150ms)'),
          proc('countdown_beep', 'square', countdownBeepProc({ wave: 'square', amp: 0.3 }),
               '440Hz square (more urgent, retro)'),
          proc('countdown_beep', 'triangle', countdownBeepProc({ wave: 'triangle' }),
               '440Hz triangle'),
          proc('countdown_beep', 'higher', countdownBeepProc({ freq: 660, wave: 'square', amp: 0.3 }),
               '660Hz square (higher pitched)'),
          proc('countdown_beep', 'shorter', countdownBeepProc({ duration: 0.1, wave: 'square', amp: 0.3 }),
               '440Hz square 100ms (snappier)'),
          proc('countdown_beep', 'with-click', countdownBeepProc({ wave: 'square', click: true, amp: 0.3 }),
               '440Hz square + brief noise click attack'),
          proc('countdown_beep', 'two-tone', countdownTwoTone(),
               'Two-tone (G4 → D5 quick pip)'),
          // Samples
          sample('countdown_beep', 'k_tick_001', 'kenney_interface-sounds/Audio/tick_001.ogg', 'kenney_interface'),
          sample('countdown_beep', 'k_tick_004', 'kenney_interface-sounds/Audio/tick_004.ogg', 'kenney_interface'),
          sample('countdown_beep', 'k_pluck_002', 'kenney_interface-sounds/Audio/pluck_002.ogg', 'kenney_interface'),
          sample('countdown_beep', 'k_drop_002', 'kenney_interface-sounds/Audio/drop_002.ogg', 'kenney_interface'),
        ],
      },
      // ---- countdown_go (GO!) ----
      {
        name: 'countdown_go',
        description: 'Plays at "GO!" when the match starts. Should feel energetic and decisive. Pick 1.',
        candidates: [
          proc('countdown_go', 'current', countdownBeepProc({ freq: 880, duration: 0.2, amp: 0.5 }),
               'Procedural — current (880Hz sine, 200ms)'),
          proc('countdown_go', 'square', countdownBeepProc({ freq: 880, duration: 0.2, wave: 'square', amp: 0.4 }),
               '880Hz square (more urgent)'),
          proc('countdown_go', 'longer', countdownBeepProc({ freq: 880, duration: 0.32, wave: 'square', amp: 0.4 }),
               '880Hz square 320ms (more sustained)'),
          proc('countdown_go', 'with-click', countdownBeepProc({ freq: 880, duration: 0.22, wave: 'square', click: true, amp: 0.4 }),
               '880Hz square + click attack (sharper)'),
          proc('countdown_go', 'ascending', goAscending(),
               'C5-G5-C6 ascending arpeggio (220ms total)'),
          proc('countdown_go', 'exclamation', goExclamation(),
               '1047Hz square with sharp click + sustain (220ms)'),
          proc('countdown_go', 'bell-chord', goBellChord(),
               'Bell chord — C5+E5+G5 with bell partial (400ms)'),
          // Samples
          sample('countdown_go', 'k_confirm_001', 'kenney_interface-sounds/Audio/confirmation_001.ogg', 'kenney_interface'),
          sample('countdown_go', 'k_confirm_003', 'kenney_interface-sounds/Audio/confirmation_003.ogg', 'kenney_interface'),
          sample('countdown_go', 'k_threeTone1', 'kenney_digital-audio/Audio/threeTone1.ogg', 'kenney_digital'),
          sample('countdown_go', 'k_phaseJump1', 'kenney_digital-audio/Audio/phaseJump1.ogg', 'kenney_digital'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Combat round 8 — close perturbations of stomp:oh-yeah, stomp:choral-tada, crunch:jingle-higher

function buildCombatR8Page(): PageDef {
  return {
    title: 'Combat R8 — Refining the picks',
    subtitle: 'Two stomp picks (oh-yeah + choral-tada) get separate variation groups; jingle-higher gets close variants.',
    sounds: [
      {
        name: 'stomp',
        description: 'Two winners — pick from BOTH groups; multi-winners become runtime variants.',
        candidates: [
          // === OH YEAH family ===
          proc('stomp', 'oy-base', stompWithLayer(0.55, t => ohYeah(t, 0.1, 1.0)),
               'OH YEAH — KEPT (280→380→220Hz, 320ms, square)'),
          proc('stomp', 'oy-bigger-rise', stompWithLayer(0.55, t => ohYeah(t, 0.1, { riseStartF: 250, risePeakF: 430 })),
               'OH YEAH — bigger rise (250→430Hz)'),
          proc('stomp', 'oy-smaller-rise', stompWithLayer(0.55, t => ohYeah(t, 0.1, { riseStartF: 300, risePeakF: 350 })),
               'OH YEAH — smaller rise (300→350Hz)'),
          proc('stomp', 'oy-bigger-fall', stompWithLayer(0.55, t => ohYeah(t, 0.1, { fallEndF: 160 })),
               'OH YEAH — bigger fall (ends at 160Hz)'),
          proc('stomp', 'oy-smaller-fall', stompWithLayer(0.55, t => ohYeah(t, 0.1, { fallEndF: 280 })),
               'OH YEAH — smaller fall (ends at 280Hz)'),
          proc('stomp', 'oy-shorter', stompWithLayer(0.5, t => ohYeah(t, 0.1, { duration: 0.22, riseDuration: 0.07 })),
               'OH YEAH — shorter (220ms)'),
          proc('stomp', 'oy-longer', stompWithLayer(0.65, t => ohYeah(t, 0.1, { duration: 0.45, riseDuration: 0.13 })),
               'OH YEAH — longer (450ms, more drawn-out)'),
          proc('stomp', 'oy-quick-rise', stompWithLayer(0.55, t => ohYeah(t, 0.1, { riseDuration: 0.05 })),
               'OH YEAH — quick rise (50ms "oh", longer "yeah")'),
          proc('stomp', 'oy-slow-rise', stompWithLayer(0.55, t => ohYeah(t, 0.1, { riseDuration: 0.16 })),
               'OH YEAH — slow rise (160ms "oh", shorter "yeah")'),
          proc('stomp', 'oy-triangle', stompWithLayer(0.55, t => ohYeah(t, 0.1, { wave: 'triangle', amp: 0.24 })),
               'OH YEAH — triangle wave (less harsh)'),
          proc('stomp', 'oy-higher', stompWithLayer(0.55, t => ohYeah(t, 0.1, { riseStartF: 360, risePeakF: 480, fallEndF: 280 })),
               'OH YEAH — higher pitch range (360→480→280Hz)'),
          proc('stomp', 'oy-lower', stompWithLayer(0.55, t => ohYeah(t, 0.1, { riseStartF: 220, risePeakF: 300, fallEndF: 170 })),
               'OH YEAH — lower pitch range (220→300→170Hz)'),
          proc('stomp', 'oy-louder', stompWithLayer(0.55, t => ohYeah(t, 0.1, { amp: 0.26 })),
               'OH YEAH — louder layer'),
          // === TA-DA family ===
          proc('stomp', 'td-base', stompWithLayer(0.5, t => choralTaDa(t, 0.1, 1.0)),
               'TA-DA — KEPT (G4 → C5 with 5th, square)'),
          proc('stomp', 'td-shorter-1st', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { note1Dur: 0.05 })),
               'TA-DA — shorter "TA" (50ms)'),
          proc('stomp', 'td-longer-1st', stompWithLayer(0.55, t => choralTaDa(t, 0.1, { note1Dur: 0.12 })),
               'TA-DA — longer "TA" (120ms)'),
          proc('stomp', 'td-shorter-2nd', stompWithLayer(0.45, t => choralTaDa(t, 0.1, { note2Dur: 0.15 })),
               'TA-DA — shorter "DA" (150ms)'),
          proc('stomp', 'td-longer-2nd', stompWithLayer(0.6, t => choralTaDa(t, 0.1, { note2Dur: 0.32 })),
               'TA-DA — longer "DA" (320ms, more triumphant)'),
          proc('stomp', 'td-octave-jump', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { note1F: 392, note2F: 784 })),
               'TA-DA — octave jump (G4 → G5)'),
          proc('stomp', 'td-fourth-jump', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { note1F: 392, note2F: 698 })),
               'TA-DA — perfect 4th (G4 → F5, plagal)'),
          proc('stomp', 'td-higher-key', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { note1F: 523, note2F: 698 })),
               'TA-DA — higher key (C5 → F5)'),
          proc('stomp', 'td-lower-key', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { note1F: 294, note2F: 392 })),
               'TA-DA — lower key (D4 → G4)'),
          proc('stomp', 'td-no-chord', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { chord: 'none' })),
               'TA-DA — no chord on "DA" (single note, simpler)'),
          proc('stomp', 'td-octave-chord', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { chord: 'fifth-octave' })),
               'TA-DA — chord with octave (root + 5th + octave)'),
          proc('stomp', 'td-triad', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { chord: 'triad' })),
               'TA-DA — full major triad on "DA" (root + 3rd + 5th)'),
          proc('stomp', 'td-triangle', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { wave: 'triangle', amp: 0.24 })),
               'TA-DA — triangle wave (less harsh, organ-like)'),
          proc('stomp', 'td-sine', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { wave: 'sine', amp: 0.32 })),
               'TA-DA — sine wave (purest, choir-like)'),
          proc('stomp', 'td-louder', stompWithLayer(0.5, t => choralTaDa(t, 0.1, { amp: 0.26 })),
               'TA-DA — louder layer'),
        ],
      },
      {
        name: 'crunch',
        description: 'Kept: jingle-higher (C6 → F6 perfect 4th). Variations.',
        candidates: [
          proc('crunch', 'jh-base', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397], noteDur: 0.06, wave: 'square', amp: 0.16,
          }), 'KEPT — C6 → F6 (rising 4th, square, 60ms each)'),
          // Different intervals from C6
          proc('crunch', 'jh-octave', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 2093], noteDur: 0.06, wave: 'square', amp: 0.14,
          }), 'C6 → C7 (octave, much higher)'),
          proc('crunch', 'jh-fifth', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1568], noteDur: 0.06, wave: 'square', amp: 0.16,
          }), 'C6 → G6 (rising 5th)'),
          proc('crunch', 'jh-major-3rd', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1319], noteDur: 0.06, wave: 'square', amp: 0.16,
          }), 'C6 → E6 (major 3rd, smaller leap)'),
          // Different starting points
          proc('crunch', 'jh-from-d6', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1175, 1568], noteDur: 0.06, wave: 'square', amp: 0.16,
          }), 'D6 → G6 (start higher than C6)'),
          proc('crunch', 'jh-from-e6', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1319, 1760], noteDur: 0.06, wave: 'square', amp: 0.14,
          }), 'E6 → A6 (start even higher)'),
          // 3-note ascending
          proc('crunch', 'jh-3note-c-major', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1319, 1568], noteDur: 0.05, wave: 'square', amp: 0.14,
          }), '3-note C major triad (C6-E6-G6, 50ms each)'),
          proc('crunch', 'jh-3note-fast', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397, 1760], noteDur: 0.04, wave: 'square', amp: 0.14,
          }), '3-note fast (C6-F6-A6, 40ms each)'),
          // Timing
          proc('crunch', 'jh-faster', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397], noteDur: 0.04, wave: 'square', amp: 0.16,
          }), 'C6 → F6 faster (40ms each)'),
          proc('crunch', 'jh-slower', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397], noteDur: 0.09, wave: 'square', amp: 0.16,
          }), 'C6 → F6 slower (90ms each)'),
          proc('crunch', 'jh-late', crunchTwoBitesPlusJingleParam({
            startT: 0.26, freqs: [1047, 1397], noteDur: 0.06, wave: 'square', amp: 0.16,
          }), 'C6 → F6 starts later (after 2nd chomp)'),
          // Waveform
          proc('crunch', 'jh-triangle', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397], noteDur: 0.06, wave: 'triangle', amp: 0.22,
          }), 'C6 → F6 triangle (smoother, flute-like)'),
          proc('crunch', 'jh-sine', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397], noteDur: 0.06, wave: 'sine', amp: 0.28,
          }), 'C6 → F6 sine (cleanest)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Combat round 7 — many creative stomp celebrations + crunch jingle variations

function buildCombatR7Page(): PageDef {
  return {
    title: 'Combat R7 — Creative Layers',
    subtitle: 'Stomp gets a lot more options exploring different celebration categories. Crunch jingle gets close perturbations.',
    sounds: [
      // ---- stomp — big creative expansion ----
      {
        name: 'stomp',
        description: 'cartoon-splat (450ms) + many different celebratory layers. 18 variants spanning brass, bells, vocal, percussion, riser, voice. Pick 1–3.',
        candidates: [
          // Reference
          proc('stomp', 'no-layer-ref', stompCartoonSplat({ duration: 0.45 }),
               'reference — no layer'),
          // ---- Bells / chimes ----
          proc('stomp', 'tubular-bells', stompWithLayer(0.85, t => tubularBells(t, 0.08, 880, 0.9)),
               '+ tubular bells (880Hz with strong inharmonic partials)'),
          proc('stomp', 'tubular-low', stompWithLayer(1.0, t => tubularBells(t, 0.08, 523, 1.0)),
               '+ tubular bells low (523Hz, deeper)'),
          proc('stomp', 'gameshow-triple', stompWithLayer(0.85, t => gameshowTripleDing(t, 0.05, 1.0)),
               '+ gameshow triple ding (3 rapid bell hits, same pitch)'),
          // ---- Brass / horns ----
          proc('stomp', 'trumpet-fanfare', stompWithLayer(0.6, t => trumpetFanfare(t, 0.08, 1.0)),
               '+ sustained trumpet (G4 with vibrato, 350ms)'),
          proc('stomp', 'trumpet-octave', stompWithLayer(0.55, t => trumpetOctaveJump(t, 0.1, 1.0)),
               '+ trumpet octave jump (G4 → G5)'),
          proc('stomp', 'air-horn', stompWithLayer(0.55, t => airHorn(t, 0.1, 1.0)),
               '+ air horn (sustained square 220Hz with wobble)'),
          proc('stomp', 'choral-tada', stompWithLayer(0.55, t => choralTaDa(t, 0.1, 1.0)),
               '+ choral TA-DA (G4 → C5 major chord stinger)'),
          // ---- Arpeggios / jingles ----
          proc('stomp', 'powerup-jingle', stompWithLayer(0.7, t => powerUpJingle(t, 0.08, 1.0)),
               '+ Mario-star powerup jingle (6 fast notes ascending)'),
          proc('stomp', 'piano-chord', stompWithLayer(0.7, t => pianoChord(t, 0.1, 1.0)),
               '+ piano major chord (C4-E4-G4-C5, fast attack + decay)'),
          proc('stomp', 'coin-shower', stompWithLayer(0.75, t => coinShower(t, 0.06, 1.0)),
               '+ coin shower (7 random pitched dings)'),
          // ---- Percussion / impact ----
          proc('stomp', 'cymbal-crash', stompWithLayer(1.1, t => cymbalCrash(t, 0.04, 1.0)),
               '+ cymbal crash (bright noise, slow 1.0s decay)'),
          proc('stomp', 'metal-clang', stompWithLayer(0.7, t => metalClang(t, 0.06, 1.0)),
               '+ metal clang (5 inharmonic high partials + noise)'),
          // ---- Cinematic / risers ----
          proc('stomp', 'reverse-swell', stompWithLayer(0.55, t => reverseSwell(t, 0.0, 0.3, 1.0)),
               '+ reverse swell (noise build-up that cuts at impact)'),
          proc('stomp', 'cinematic-riser', stompWithLayer(0.6, t => cinematicRiser(t, 0.05, 1.0)),
               '+ cinematic riser (200→1000Hz pitch sweep + noise swell)'),
          // ---- Vocal / cartoon ----
          proc('stomp', 'crowd-cheer', stompWithLayer(0.95, t => crowdCheer(t, 0.06, 1.0)),
               '+ crowd cheer (noise with 3.2Hz amplitude modulation, 600ms)'),
          proc('stomp', 'oh-yeah', stompWithLayer(0.55, t => ohYeah(t, 0.1, 1.0)),
               '+ "OH YEAH!" voice-like (2-formant pitch curve)'),
          // ---- Combos ----
          proc('stomp', 'gong-cymbal-combo', stompWithLayer(1.2, t => gong(t, 0.05, 80, 0.65) + cymbalCrash(t, 0.03, 0.6)),
               '+ COMBO gong + cymbal (ceremonial)'),
          proc('stomp', 'fanfare-coins-combo', stompWithLayer(0.85, t => fanfareBrass(t, 0.1, 0.7) + coinShower(t, 0.32, 0.85)),
               '+ COMBO brass fanfare + coin shower (jackpot)'),
          proc('stomp', 'powerup-cymbal-combo', stompWithLayer(1.0, t => powerUpJingle(t, 0.08, 0.85) + cymbalCrash(t, 0.04, 0.6)),
               '+ COMBO powerup + cymbal (arcade)'),
        ],
      },
      // ---- crunch — jingle variations ----
      {
        name: 'crunch',
        description: 'td-2-bites + jingle layer (G5 → C6 was picked). 12 jingle variants — different intervals, voicings, durations, waveforms.',
        candidates: [
          proc('crunch', 'jingle-base', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1047], noteDur: 0.06, wave: 'square', amp: 0.18,
          }), 'KEPT — G5 → C6 (rising 4th, square, 60ms each)'),
          // Different intervals
          proc('crunch', 'jingle-octave', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [523, 1047], noteDur: 0.06, wave: 'square', amp: 0.18,
          }), 'C5 → C6 (octave jump)'),
          proc('crunch', 'jingle-fifth', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1175], noteDur: 0.06, wave: 'square', amp: 0.18,
          }), 'G5 → D6 (rising 5th)'),
          proc('crunch', 'jingle-major-3rd', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 988], noteDur: 0.06, wave: 'square', amp: 0.18,
          }), 'G5 → B5 (rising major 3rd, smaller leap)'),
          // 3-note variants
          proc('crunch', 'jingle-3note-major', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [523, 659, 784], noteDur: 0.05, wave: 'square', amp: 0.16,
          }), '3-note ascending major triad (C5-E5-G5, 50ms each)'),
          proc('crunch', 'jingle-3note-fast', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1047, 1319], noteDur: 0.04, wave: 'square', amp: 0.16,
          }), '3-note fast ascending (G5-C6-E6, 40ms each)'),
          proc('crunch', 'jingle-descending', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 784], noteDur: 0.06, wave: 'square', amp: 0.18,
          }), 'C6 → G5 (descending 4th — gentle fall)'),
          // Different timings
          proc('crunch', 'jingle-faster', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1047], noteDur: 0.04, wave: 'square', amp: 0.18,
          }), 'G5 → C6 faster (40ms each, snappier)'),
          proc('crunch', 'jingle-slower', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1047], noteDur: 0.09, wave: 'square', amp: 0.18,
          }), 'G5 → C6 slower (90ms each, more legato)'),
          proc('crunch', 'jingle-late', crunchTwoBitesPlusJingleParam({
            startT: 0.26, freqs: [784, 1047], noteDur: 0.06, wave: 'square', amp: 0.18,
          }), 'G5 → C6 starts later (after 2nd chomp)'),
          // Different waveforms
          proc('crunch', 'jingle-triangle', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1047], noteDur: 0.06, wave: 'triangle', amp: 0.22,
          }), 'G5 → C6 triangle wave (smoother)'),
          proc('crunch', 'jingle-sine', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [784, 1047], noteDur: 0.06, wave: 'sine', amp: 0.28,
          }), 'G5 → C6 sine (cleanest, flute-like)'),
          // Higher pitch range
          proc('crunch', 'jingle-higher', crunchTwoBitesPlusJingleParam({
            startT: 0.18, freqs: [1047, 1397], noteDur: 0.06, wave: 'square', amp: 0.16,
          }), 'C6 → F6 (higher pitch range)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Combat round 6 — layered (chomp/splat + celebratory sound) variants

function buildCombatLayeredPage(): PageDef {
  return {
    title: 'Combat R6 — Layered with Celebratory Layers',
    subtitle: 'Score events get a celebratory sub-layer (gong / chime / fanfare / bell). Layer fires shortly after impact peak so the splat reads first.',
    sounds: [
      {
        name: 'stomp',
        description: 'cartoon-splat (longer 450ms) + celebratory sub-layer. 7 different celebration types.',
        candidates: [
          proc('stomp', 'kept-no-layer', stompCartoonSplat({ duration: 0.45 }),
               'KEPT — no layer (reference)'),
          proc('stomp', 'plus-brass-major', stompCartoonSplatPlusBrass('major'),
               '+ brass major chord (G4-C5-E5 ascending, 210ms total)'),
          proc('stomp', 'plus-brass-fanfare', stompCartoonSplatPlusBrass('fanfare'),
               '+ brass fanfare (C5-E5-A5 — heroic voicing)'),
          proc('stomp', 'plus-brass-fifth', stompCartoonSplatPlusBrass('fifth'),
               '+ brass open-fifth (G4-D5-G5)'),
          proc('stomp', 'plus-gong-low', stompPlusGong(70),
               '+ low gong (70Hz fundamental + harmonics + inharmonic)'),
          proc('stomp', 'plus-gong-mid', stompPlusGong(110),
               '+ mid gong (110Hz fundamental)'),
          proc('stomp', 'plus-victory-bell', stompPlusVictoryBell(),
               '+ victory bell (700Hz with bell partials, inharmonic)'),
          proc('stomp', 'plus-chimes', stompPlusChimes(),
               '+ chime cluster (4 staggered chimes: C5-E5-G5-C6)'),
          proc('stomp', 'plus-arpeggio', stompPlusFlourish(),
               '+ arpeggio flourish (C5-E5-G5-C6 chiptune square)'),
          proc('stomp', 'plus-combo', stompPlusCombo(),
               '+ COMBO: small gong + sparkle arpeggio (full celebration)'),
        ],
      },
      {
        name: 'crunch',
        description: 'td-2-bites (2 chomps at 18%, 62%) + small celebratory tinkle. 5 different celebration types.',
        candidates: [
          proc('crunch', 'kept-no-layer', crunchTripleDramatic({ centers: TRIPLE_TWO_BITE_CENTERS }),
               'KEPT — no layer (reference)'),
          proc('crunch', 'plus-coin', crunchTwoBitesPlusCoin(),
               '+ coin ding (G5 → D6 perfect-5th sparkle)'),
          proc('crunch', 'plus-bell', crunchTwoBitesPlusBell(),
               '+ bell ding (880Hz with bell partials)'),
          proc('crunch', 'plus-sparkle', crunchTwoBitesPlusSparkle(),
               '+ sparkle arpeggio (5 fast high notes A5-C7)'),
          proc('crunch', 'plus-jingle', crunchTwoBitesPlusJingle(),
               '+ rising jingle (G5 → C6, 2-note happy)'),
          proc('crunch', 'plus-combo', crunchTwoBitesPlusBoth(),
               '+ COMBO: bell ding (1175Hz) + sparkle arpeggio'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// BIG variants — stomp and crunch as score events (must outstanding)

function stompMegaExploSplat(): string {
  // Bigger explosplat — louder, deeper boom, longer tail
  let lp = 0;
  return buildBuffer(0.42, (t) => {
    const p = t / 0.42;
    const boom = Math.sin(2 * Math.PI * 50 * t) * Math.max(0, 1 - p * 1.8) * 0.85;
    const subBoom = Math.sin(2 * Math.PI * 35 * t) * Math.max(0, 1 - p * 2) * 0.4;
    const crack = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 14) * 0.6;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const splatActive = Math.max(0, p - 0.08) * Math.max(0, 1 - p * 1.5);
    const mid = Math.sin(2 * Math.PI * 200 * t) * 0.22 * splatActive;
    const splat = (lp * 0.95 + mid) * splatActive * 0.7;
    return boom + subBoom + crack + splat;
  });
}

function stompCinematicBoom(): string {
  // 5-layer cinematic: sub boom + body + descending swoosh + impact noise + tail
  let lp = 0;
  return buildBuffer(0.5, (t) => {
    const p = t / 0.5;
    const sub = Math.sin(2 * Math.PI * 45 * t) * Math.max(0, 1 - p * 1.5) * 0.7;
    const body = Math.sin(2 * Math.PI * 110 * t) * Math.max(0, 1 - p * 2.5) * 0.4;
    const swooshF = 280 - 230 * Math.min(1, p * 2.5);
    const swoosh = Math.sin(2 * Math.PI * swooshF * t) * Math.max(0, 1 - p * 4) * 0.3;
    const impact = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 25) * 0.55;
    const tailNoise = Math.random() * 2 - 1;
    lp += 0.08 * (tailNoise - lp);
    const tail = lp * Math.max(0, p - 0.15) * Math.max(0, 1 - p * 1.2) * 0.4;
    return sub + body + swoosh + impact + tail;
  });
}

interface CartoonSplatParams {
  duration: number;
  burstAmp: number;
  burstDecay: number;
  sweepStartF: number;
  sweepEndF: number;
  sweepAmp: number;
  bodyLp: number;
  bodyAmp: number;
  dripsAmp: number;
  dripsStart: number;
}

function stompCartoonSplat(p: Partial<CartoonSplatParams> = {}): string {
  const { duration = 0.36, burstAmp = 0.7, burstDecay = 8,
          sweepStartF = 350, sweepEndF = 70, sweepAmp = 0.4,
          bodyLp = 0.16, bodyAmp = 0.5,
          dripsAmp = 0.25, dripsStart = 0.55 } = p;
  let lp = 0;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * burstDecay) * burstAmp;
    const sweepF = sweepStartF + (sweepEndF - sweepStartF) * Math.min(1, prog * 2.5);
    const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * sweepAmp;
    const noise = Math.random() * 2 - 1;
    lp += bodyLp * (noise - lp);
    const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * bodyAmp;
    const drips = (Math.random() * 2 - 1) * Math.max(0, prog - dripsStart) * Math.max(0, 1 - prog) * dripsAmp;
    return burst + sweep + body + drips;
  });
}

function stompSlamBang(): string {
  // Massive transient + crack + body + reverb decay
  let reverb = 0;
  return buildBuffer(0.4, (t) => {
    const p = t / 0.4;
    const transient = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 35) * 0.85;
    const crack = Math.sin(2 * Math.PI * 700 * t) * Math.max(0, 1 - p * 16) * 0.5;
    const body = Math.sin(2 * Math.PI * 95 * t) * Math.max(0, 1 - p * 2.2) * 0.55;
    // Crude reverb: decay-feedback on early signal
    const inSig = transient + crack + body;
    reverb += 0.12 * (inSig - reverb);
    const rev = reverb * Math.max(0, p - 0.08) * Math.max(0, 1 - p) ** 0.8 * 0.4;
    return inSig + rev;
  });
}

function stompShockwave(): string {
  // Impact + descending shockwave + secondary impact
  return buildBuffer(0.45, (t) => {
    const p = t / 0.45;
    const impact1 = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 30) * 0.6;
    const impact1Body = Math.sin(2 * Math.PI * 90 * t) * Math.max(0, 1 - p * 3.5) * 0.5;
    const shockF = 450 - 420 * Math.min(1, p * 2);
    const shock = Math.sin(2 * Math.PI * shockF * t) * Math.max(0, 1 - p * 3) * 0.35;
    // Secondary impact at p=0.45
    const localP2 = (p - 0.45) / 0.1;
    const impact2 = localP2 > 0 && localP2 < 1
      ? (Math.random() * 2 - 1) * (1 - localP2) * 0.45
      : 0;
    const impact2Body = localP2 > 0 && localP2 < 1.5
      ? Math.sin(2 * Math.PI * 70 * t) * (1 - Math.min(1, localP2)) * 0.35
      : 0;
    return impact1 + impact1Body + shock + impact2 + impact2Body;
  });
}

function stompSquishExplode(): string {
  // Wet squish first, then big explosion
  let lp = 0;
  return buildBuffer(0.45, (t) => {
    const p = t / 0.45;
    // Squish phase: 0–35%
    const squishActive = Math.max(0, 1 - p * 3);
    const noise = Math.random() * 2 - 1;
    lp += 0.14 * (noise - lp);
    const squish = lp * squishActive * 0.5;
    const squishTone = Math.sin(2 * Math.PI * 200 * t) * squishActive * 0.2;
    // Explosion phase: 30–100%
    const explodeP = Math.max(0, p - 0.3) / 0.7;
    const boomEnv = explodeP > 0 ? Math.min(1, explodeP * 8) * Math.max(0, 1 - explodeP * 1.5) : 0;
    const boom = Math.sin(2 * Math.PI * 55 * t) * boomEnv * 0.85;
    const crack = explodeP > 0 ? (Math.random() * 2 - 1) * Math.exp(-explodeP * 20) * 0.55 : 0;
    return squish + squishTone + boom + crack;
  });
}

interface MegaCrunchParams {
  duration: number;
  transientAmp: number;
  transientDecay: number;
  crackF: number;
  crackAmp: number;
  noiseAmp: number;
  harmF: number;
  harmAmp: number;
}

function crunchMegaCrunch(p: Partial<MegaCrunchParams> = {}): string {
  const { duration = 0.22, transientAmp = 0.9, transientDecay = 30,
          crackF = 1100, crackAmp = 0.4, noiseAmp = 0.85,
          harmF = 480, harmAmp = 0.32 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const transient = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * transientDecay) * transientAmp;
    const crack = Math.sin(2 * Math.PI * crackF * t) * Math.max(0, 1 - prog * 14) * crackAmp;
    const noiseBody = (Math.random() * 2 - 1) * noiseAmp;
    const env = Math.min(1, prog * 25) * Math.max(0, 1 - prog * 1.6);
    const harmonic = Math.sin(2 * Math.PI * harmF * t) * harmAmp;
    return transient + crack + (noiseBody + harmonic) * env * 0.85;
  });
}

interface TripleDramaticParams {
  duration: number;
  centers: number[];     // bite center positions (0..1)
  biteWidth: number;
  transientAmp: number;
  noiseAmp: number;
  harmF: number;
  harmAmp: number;
  amplitude: number;
}

function crunchTripleDramatic(p: Partial<TripleDramaticParams> = {}): string {
  const { duration = 0.28, centers = [0.13, 0.45, 0.78], biteWidth = 0.07,
          transientAmp = 0.55, noiseAmp = 0.85, harmF = 600, harmAmp = 0.3,
          amplitude = 0.95 } = p;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    let env = 0;
    let transient = 0;
    for (const c of centers) {
      const dist = Math.abs(prog - c);
      if (dist < biteWidth) {
        const local = 1 - dist / biteWidth;
        env = Math.max(env, local ** 1.2);
      }
      const distTransient = prog - c;
      if (distTransient > 0 && distTransient < 0.025) {
        transient += (Math.random() * 2 - 1) * Math.exp(-distTransient * 80) * transientAmp;
      }
    }
    const noise = (Math.random() * 2 - 1) * noiseAmp;
    const harm = Math.sin(2 * Math.PI * harmF * t) * harmAmp;
    return ((noise + harm) * env + transient) * amplitude;
  });
}

function crunchLongMunch(): string {
  // Long satisfying single MMMUNCH — sustained body with crunchy texture
  let lp = 0;
  return buildBuffer(0.35, (t) => {
    const p = t / 0.35;
    const noise = Math.random() * 2 - 1;
    lp += 0.32 * (noise - lp); // brighter than usual = crispy
    const am = 0.7 + 0.3 * Math.sin(2 * Math.PI * 24 * t); // chewing motion
    const body = (noise - lp) * 0.6 * am; // high-passed crispy body
    const subTone = Math.sin(2 * Math.PI * 320 * t) * 0.22;
    const env = Math.min(1, p * 8) * Math.max(0, 1 - p) ** 1.1;
    return (body + subTone) * env * 0.95;
  });
}

function crunchLayered(): string {
  // High-freq snap + mid noise + low body (3 frequency layers)
  let hp = 0;
  let lpMid = 0;
  let lpLow = 0;
  return buildBuffer(0.24, (t) => {
    const p = t / 0.24;
    const noise = Math.random() * 2 - 1;
    // High layer (snappy)
    hp = noise - hp * 0.2;
    const high = hp * Math.max(0, 1 - p * 8) * 0.45;
    // Mid layer (noise body)
    lpMid += 0.3 * (noise - lpMid);
    const mid = lpMid * Math.max(0, 1 - p * 4) * 0.5;
    // Low layer (sub thud)
    lpLow += 0.05 * (noise - lpLow);
    const low = lpLow * Math.max(0, 1 - p * 3) * 0.4;
    const env = Math.min(1, p * 18) * Math.max(0, 1 - p * 1.3);
    return (high + mid + low) * env;
  });
}

function crunchSnapCrunchPop(): string {
  // 3 distinct phases: initial snap (very brief) → main crunch body → tail pop
  let lp = 0;
  return buildBuffer(0.3, (t) => {
    const p = t / 0.3;
    // Snap (0-10%)
    const snap = p < 0.1
      ? (Math.random() * 2 - 1) * Math.max(0, 1 - p * 25) * 0.7
      : 0;
    // Body (10-70%)
    const noise = Math.random() * 2 - 1;
    lp += 0.22 * (noise - lp);
    const bodyEnv = p > 0.08 ? Math.min(1, (p - 0.08) * 12) * Math.max(0, 1 - (p - 0.08) * 2) : 0;
    const body = lp * bodyEnv * 0.65;
    const harm = Math.sin(2 * Math.PI * 520 * t) * bodyEnv * 0.25;
    // Pop (70-100%)
    const localPop = (p - 0.7) / 0.3;
    const pop = localPop > 0 && localPop < 1
      ? (Math.random() * 2 - 1) * (1 - localPop) ** 2 * 0.35
      : 0;
    return snap + body + harm + pop;
  });
}

function crunchCarrotMega(): string {
  // Bright snap + meaty body + crispy tail (carrot-specific big version)
  let lp = 0;
  let hp = 0;
  return buildBuffer(0.26, (t) => {
    const p = t / 0.26;
    // Bright snap (very brief)
    const snap = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 28) * 0.75;
    // Body: low-passed for body
    const noise = Math.random() * 2 - 1;
    lp += 0.16 * (noise - lp);
    const body = lp * Math.max(0, 1 - p * 3) * 0.5;
    // Crispy tail: high-passed in second half
    hp = noise - hp * 0.25;
    const tail = p > 0.5 ? hp * Math.max(0, p - 0.5) * Math.max(0, 1 - p) * 0.55 : 0;
    // Tonal hint
    const tone = Math.sin(2 * Math.PI * 640 * t) * Math.max(0, 1 - p * 5) * 0.18;
    return (snap + body + tail + tone) * 0.95;
  });
}

// ---------------------------------------------------------------------------
// Combat round 5 — perturbations of stomp:cartoon-splat, crunch:mega-crunch, crunch:triple-dramatic

function buildCombatR5Page(): PageDef {
  return {
    title: 'Combat R5 — Stomp & Crunch refinement',
    subtitle: 'Close perturbations of last round\'s 3 winners. Multi-pick within crunch — both winners can survive as runtime variants.',
    sounds: [
      {
        name: 'stomp',
        description: 'Kept: cartoon-splat (burst + descending pitch + wet body + drips). Variations.',
        candidates: [
          proc('stomp', 'cs-base', stompCartoonSplat({}),
               'KEPT — cartoon-splat (360ms)'),
          // Duration
          proc('stomp', 'cs-shorter', stompCartoonSplat({ duration: 0.28 }),
               'Shorter (280ms)'),
          proc('stomp', 'cs-longer', stompCartoonSplat({ duration: 0.45 }),
               'Longer (450ms)'),
          // Burst
          proc('stomp', 'cs-bigger-burst', stompCartoonSplat({ burstAmp: 1.0 }),
               'Bigger burst (1.0 amp)'),
          proc('stomp', 'cs-smaller-burst', stompCartoonSplat({ burstAmp: 0.5 }),
               'Smaller burst (0.5 amp)'),
          proc('stomp', 'cs-fast-burst', stompCartoonSplat({ burstDecay: 14 }),
               'Faster burst decay (snappier)'),
          // Sweep
          proc('stomp', 'cs-deeper-sweep', stompCartoonSplat({ sweepStartF: 250, sweepEndF: 30 }),
               'Deeper sweep (250→30Hz)'),
          proc('stomp', 'cs-higher-sweep', stompCartoonSplat({ sweepStartF: 450, sweepEndF: 100 }),
               'Higher sweep (450→100Hz)'),
          proc('stomp', 'cs-louder-sweep', stompCartoonSplat({ sweepAmp: 0.6 }),
               'Louder sweep tone'),
          // Body
          proc('stomp', 'cs-wetter', stompCartoonSplat({ bodyLp: 0.22, bodyAmp: 0.7 }),
               'Wetter body (brighter LP + louder)'),
          proc('stomp', 'cs-dryer', stompCartoonSplat({ bodyLp: 0.1, bodyAmp: 0.3 }),
               'Drier body (darker LP + quieter)'),
          // Drips
          proc('stomp', 'cs-more-drips', stompCartoonSplat({ dripsAmp: 0.4 }),
               'More drips'),
          proc('stomp', 'cs-no-drips', stompCartoonSplat({ dripsAmp: 0 }),
               'No drips (cleaner)'),
          proc('stomp', 'cs-early-drips', stompCartoonSplat({ dripsStart: 0.4 }),
               'Earlier drips (start at 40%)'),
        ],
      },
      {
        name: 'crunch',
        description: 'Kept TWO: mega-crunch (single big bite) AND triple-dramatic (3 bites). Variations of each — pick from both groups; multi-winners become runtime variants.',
        candidates: [
          // === Mega-crunch family ===
          proc('crunch', 'mc-base', crunchMegaCrunch({}),
               'KEPT — mega-crunch (220ms, 1100Hz crack, 480Hz harmonic)'),
          proc('crunch', 'mc-shorter', crunchMegaCrunch({ duration: 0.16 }),
               'mega — shorter (160ms)'),
          proc('crunch', 'mc-longer', crunchMegaCrunch({ duration: 0.3 }),
               'mega — longer (300ms)'),
          proc('crunch', 'mc-deeper-crack', crunchMegaCrunch({ crackF: 700 }),
               'mega — deeper crack (700Hz)'),
          proc('crunch', 'mc-higher-crack', crunchMegaCrunch({ crackF: 1500 }),
               'mega — higher crack (1500Hz)'),
          proc('crunch', 'mc-no-crack', crunchMegaCrunch({ crackAmp: 0 }),
               'mega — no crack (transient + body only)'),
          proc('crunch', 'mc-bigger-transient', crunchMegaCrunch({ transientAmp: 1.1 }),
               'mega — bigger transient (1.1)'),
          proc('crunch', 'mc-soft-transient', crunchMegaCrunch({ transientAmp: 0.5 }),
               'mega — softer transient (0.5)'),
          proc('crunch', 'mc-louder-harm', crunchMegaCrunch({ harmAmp: 0.5 }),
               'mega — louder harmonic'),
          proc('crunch', 'mc-no-harm', crunchMegaCrunch({ harmAmp: 0 }),
               'mega — no harmonic (cleaner)'),
          proc('crunch', 'mc-deeper-harm', crunchMegaCrunch({ harmF: 280 }),
               'mega — deeper harmonic (280Hz)'),
          proc('crunch', 'mc-bright-body', crunchMegaCrunch({ noiseAmp: 1.0 }),
               'mega — louder noise body'),
          // === Triple-dramatic family ===
          proc('crunch', 'td-base', crunchTripleDramatic({}),
               'KEPT — triple-dramatic (3 bites @ 13/45/78%, 280ms)'),
          proc('crunch', 'td-2-bites', crunchTripleDramatic({ centers: [0.18, 0.62] }),
               'triple → 2 bites (18%, 62%)'),
          proc('crunch', 'td-4-bites', crunchTripleDramatic({ centers: [0.1, 0.36, 0.62, 0.88], biteWidth: 0.06 }),
               'triple → 4 bites (rapid)'),
          proc('crunch', 'td-tighter', crunchTripleDramatic({ centers: [0.15, 0.4, 0.65], duration: 0.22, biteWidth: 0.06 }),
               'triple — tighter spacing, shorter (220ms)'),
          proc('crunch', 'td-wider', crunchTripleDramatic({ centers: [0.1, 0.5, 0.9], duration: 0.36 }),
               'triple — wider spacing, longer (360ms)'),
          proc('crunch', 'td-bigger-transient', crunchTripleDramatic({ transientAmp: 0.75 }),
               'triple — bigger transient per bite'),
          proc('crunch', 'td-soft-transient', crunchTripleDramatic({ transientAmp: 0.3 }),
               'triple — softer transient'),
          proc('crunch', 'td-higher-harm', crunchTripleDramatic({ harmF: 900 }),
               'triple — higher harmonic (900Hz)'),
          proc('crunch', 'td-deeper-harm', crunchTripleDramatic({ harmF: 350 }),
               'triple — deeper harmonic (350Hz)'),
          proc('crunch', 'td-no-harm', crunchTripleDramatic({ harmAmp: 0 }),
               'triple — no harmonic (cleaner)'),
          proc('crunch', 'td-louder', crunchTripleDramatic({ amplitude: 1.1 }),
               'triple — louder (×1.1)'),
          proc('crunch', 'td-quieter', crunchTripleDramatic({ amplitude: 0.7 }),
               'triple — quieter (×0.7)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Combat round 4 — BIG redesigns for stomp + crunch only

function buildCombatBigPage(): PageDef {
  return {
    title: 'Combat — Stomp & Crunch BIG redesign',
    subtitle: 'Score events need to be loud and outstanding. Fresh higher-amplitude, more-layered designs. The other 6 sounds are committed; not shown.',
    sounds: [
      {
        name: 'stomp',
        description: 'Score event — kill stomp. Should be punchy and dramatic. 6 fresh "BIG" recipes. Pick 1–3.',
        candidates: [
          proc('stomp', 'mega-explosplat', stompMegaExploSplat(),
               'Mega Explosplat — louder boom (50Hz + 35Hz sub) + bigger crack + splat (420ms)'),
          proc('stomp', 'cinematic-boom', stompCinematicBoom(),
               'Cinematic — 5-layer (sub + body + swoosh + impact + tail, 500ms)'),
          proc('stomp', 'cartoon-splat', stompCartoonSplat(),
               'Cartoon SPLAT — burst + descending pitch + wet body + drips (360ms)'),
          proc('stomp', 'slam-bang', stompSlamBang(),
               'Slam-bang — massive transient + 700Hz crack + 95Hz body + crude reverb (400ms)'),
          proc('stomp', 'shockwave', stompShockwave(),
               'Shockwave — impact + descending shockwave + secondary impact at 45% (450ms)'),
          proc('stomp', 'squish-explode', stompSquishExplode(),
               'Squish→Explode — 2-phase: squish first, then 55Hz boom (450ms)'),
        ],
      },
      {
        name: 'crunch',
        description: 'Score event — carrot pickup. Should be louder and more satisfying. 6 fresh "BIG" recipes. Pick 1–3.',
        candidates: [
          proc('crunch', 'mega-crunch', crunchMegaCrunch(),
               'Mega CRUNCH — huge transient + 1100Hz crack + noise body + 480Hz harmonic (220ms)'),
          proc('crunch', 'triple-dramatic', crunchTripleDramatic(),
               'Triple dramatic — 3 sharp chomps with strong transient per bite (280ms)'),
          proc('crunch', 'long-munch', crunchLongMunch(),
               'Long MMMUNCH — sustained crispy body with chewing AM (350ms)'),
          proc('crunch', 'layered', crunchLayered(),
               'Layered — high snap + mid noise + low thud (3 freq layers, 240ms)'),
          proc('crunch', 'snap-crunch-pop', crunchSnapCrunchPop(),
               'Snap-crunch-pop — 3 phases: brief snap → body → tail pop (300ms)'),
          proc('crunch', 'carrot-mega', crunchCarrotMega(),
               'Carrot MEGA — bright snap + meaty body + crispy tail + tonal hint (260ms)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Combat round 3 — close perturbations of winners + redesigns for stomp/crunch + spring procedural

function buildCombatR3Page(): PageDef {
  return {
    title: 'Combat — Round 3',
    subtitle: 'Close perturbations of last round\'s winners; stomp/crunch redesigned for "loud + distinct" score-event feel; spring tries to recreate phaseJump1 procedurally.',
    sounds: [
      // ---- stomp — explosion + splat redesign ----
      {
        name: 'stomp',
        description: 'Score event — must be LOUD and DISTINCT. Fresh "explosion + splat" recipes.',
        candidates: [
          proc('stomp', 'es-base', stompExploSplat({}),
               'Explosplat — base (60Hz boom + crack + splat at 10%, 320ms)'),
          proc('stomp', 'es-deeper-boom', stompExploSplat({ boomF: 45 }),
               'Explosplat — deeper boom (45Hz)'),
          proc('stomp', 'es-bigger-boom', stompExploSplat({ boomAmp: 0.8, boomDecay: 2 }),
               'Explosplat — louder/longer boom'),
          proc('stomp', 'es-more-splat', stompExploSplat({ splatAmp: 0.7, splatLp: 0.22 }),
               'Explosplat — more splat (louder + brighter noise)'),
          proc('stomp', 'es-late-splat', stompExploSplat({ splatStart: 0.18, duration: 0.36 }),
               'Explosplat — late splat (delayed wet hit)'),
          proc('stomp', 'es-early-splat', stompExploSplat({ splatStart: 0.04 }),
               'Explosplat — early splat (more simultaneous)'),
          proc('stomp', 'es-shorter', stompExploSplat({ duration: 0.24 }),
               'Explosplat — shorter (240ms, snappier)'),
          proc('stomp', 'es-cinematic', stompExploSplat({ duration: 0.42, boomDecay: 1.8, boomAmp: 0.7, splatStart: 0.15 }),
               'Explosplat — cinematic (420ms, big lingering boom)'),
          proc('stomp', 'es-wet-mid', stompExploSplat({ splatMidF: 160, splatAmp: 0.55 }),
               'Explosplat — wetter mid layer (160Hz)'),
          proc('stomp', 'es-bright-splat', stompExploSplat({ splatLp: 0.35 }),
               'Explosplat — brighter splat (more crackly)'),
        ],
      },
      // ---- crunch — chomp-chomp / crunch-crunch redesign ----
      {
        name: 'crunch',
        description: 'Score event — must be LOUD and DISTINCT. Multi-bite "chomp-chomp" / "crunch-crunch" recipes.',
        candidates: [
          proc('crunch', 'cc-2chomps', crunchChompChomp({ bites: 2 }),
               'Chomp-chomp — 2 bites (250ms)'),
          proc('crunch', 'cc-3chomps', crunchChompChomp({ bites: 3 }),
               'Chomp-chomp-chomp — 3 bites'),
          proc('crunch', 'cc-4chomps', crunchChompChomp({ bites: 4, duration: 0.3 }),
               'Chomp ×4 — rapid (300ms)'),
          proc('crunch', 'cc-2-loud', crunchChompChomp({ bites: 2, amplitude: 0.95 }),
               '2 bites — louder (amplitude 0.95)'),
          proc('crunch', 'cc-2-bright', crunchChompChomp({ bites: 2, biteSharpness: 28, toneF: 600 }),
               '2 bites — brighter (sharper transients, higher tone)'),
          proc('crunch', 'cc-2-juicy', crunchChompChomp({ bites: 2, toneF: 280, toneAmp: 0.4, noiseAmp: 0.85 }),
               '2 bites — juicier (lower tone, more noise body)'),
          proc('crunch', 'cc-3-bone', crunchChompChomp({ bites: 3, biteSharpness: 32, toneF: 800, toneAmp: 0.18 }),
               '3 bites — bone-snap character (sharp transients)'),
          proc('crunch', 'cc-3-fast', crunchChompChomp({ bites: 3, duration: 0.2, biteSharpness: 22 }),
               '3 bites — fast (200ms total)'),
          proc('crunch', 'crunch-crunch', crunchTwoCrunches(),
               'CRUNCH-CRUNCH — 2 emphatic crunches (320ms, more body)'),
        ],
      },
      // ---- spring — recreate phaseJump1 procedurally ----
      {
        name: 'spring',
        description: 'Reconstructing the phaseJump1 character procedurally — bright ascending chiptune sweep.',
        candidates: [
          // The original Kenney sample for reference
          sample('spring', 'k_phaseJump1_ref', 'kenney_digital-audio/Audio/phaseJump1.ogg', 'reference'),
          // Procedural attempts
          proc('spring', 'pj-A-square-sweep', springPhaseJumpA(),
               'A — square wave 200→800Hz sweep, 150ms'),
          proc('spring', 'pj-B-pulse-sweep', springPhaseJumpB(),
               'B — pulse wave (50%→30% duty) 250→950Hz, 130ms'),
          proc('spring', 'pj-C-arpeggio', springPhaseJumpC(),
               'C — stepped arpeggio (E4-B4-F#5)'),
          proc('spring', 'pj-D-wobble-sweep', springPhaseJumpD(),
               'D — square sweep with wobble, 220→800Hz'),
          proc('spring', 'pj-E-triangle', springPhaseJumpE(),
               'E — triangle sweep 240→860Hz (softer)'),
        ],
      },
      // ---- headbonk — close perturbations of lower-no-knock ----
      {
        name: 'headbonk',
        description: 'Kept: Lower + softer knock. Close perturbations.',
        candidates: [
          proc('headbonk', 'lnk-base', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0.3 }),
               'KEPT — lower + softer knock'),
          proc('headbonk', 'lnk-very-soft-knock', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0.15 }),
               'Even softer knock'),
          proc('headbonk', 'lnk-no-knock', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0 }),
               'No knock at all (pure body)'),
          proc('headbonk', 'lnk-deeper', headbonkVariant({ bodyStartF: 250, bodyEndF: 110, duration: 0.22, knockAmp: 0.3 }),
               'Deeper body (250→110Hz)'),
          proc('headbonk', 'lnk-shorter', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.16, knockAmp: 0.3 }),
               'Shorter (160ms)'),
          proc('headbonk', 'lnk-longer', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.26, knockAmp: 0.3 }),
               'Longer (260ms)'),
          proc('headbonk', 'lnk-sine', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0.3, bodyType: 'sine' }),
               'Sine body (smoother)'),
          proc('headbonk', 'lnk-louder-body', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0.3, bodyAmp: 0.8 }),
               'Louder body'),
          proc('headbonk', 'lnk-no-noise', headbonkVariant({ bodyStartF: 280, bodyEndF: 130, duration: 0.2, knockAmp: 0.3, noiseAmp: 0.05 }),
               'Less noise (cleaner)'),
        ],
      },
      // ---- bump — close perturbations of softer ----
      {
        name: 'bump',
        description: 'Kept: Softer (less aggressive). Close perturbations.',
        candidates: [
          proc('bump', 'soft-base', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2 }),
               'KEPT — softer'),
          proc('bump', 'soft-more-thud', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.32 }),
               'More tone (less noise dominant)'),
          proc('bump', 'soft-less-thud', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.12 }),
               'Less tone (more noise dominant)'),
          proc('bump', 'soft-low-thud', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, thudF: 110 }),
               'Lower thud (110Hz)'),
          proc('bump', 'soft-high-thud', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, thudF: 220 }),
               'Higher thud (220Hz)'),
          proc('bump', 'soft-shorter', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, duration: 0.06 }),
               'Shorter (60ms)'),
          proc('bump', 'soft-longer', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, duration: 0.11, envDecay: 2.5 }),
               'Longer (110ms)'),
          proc('bump', 'soft-fast-decay', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, envDecay: 5 }),
               'Faster decay (snappier)'),
          proc('bump', 'soft-slow-decay', bumpVariant({ noiseAmp: 0.25, thudAmp: 0.2, envDecay: 2 }),
               'Slower decay (lingers)'),
        ],
      },
      // ---- oof — close perturbations of comic-book POW ----
      {
        name: 'oof',
        description: 'Kept: comic-book POW (sharp attack, descending square body). Close perturbations.',
        candidates: [
          proc('oof', 'pow-base', proceduralPow({}),
               'KEPT — comic-book POW (280→80Hz, square, 180ms)'),
          proc('oof', 'pow-higher', proceduralPow({ startF: 340, endF: 100 }),
               'POW — higher (340→100Hz)'),
          proc('oof', 'pow-lower', proceduralPow({ startF: 220, endF: 60 }),
               'POW — lower (220→60Hz)'),
          proc('oof', 'pow-shorter', proceduralPow({ duration: 0.13 }),
               'POW — shorter (130ms)'),
          proc('oof', 'pow-longer', proceduralPow({ duration: 0.24 }),
               'POW — longer (240ms)'),
          proc('oof', 'pow-fast-decay', proceduralPow({ decayRate: 6 }),
               'POW — faster decay (snappier)'),
          proc('oof', 'pow-slow-decay', proceduralPow({ decayRate: 2.5 }),
               'POW — slower decay (lingers)'),
          proc('oof', 'pow-noisier', proceduralPow({ noiseAmp: 0.45 }),
               'POW — more noise'),
          proc('oof', 'pow-cleaner', proceduralPow({ noiseAmp: 0.1 }),
               'POW — cleaner (less noise)'),
          proc('oof', 'pow-triangle', proceduralPow({ wave: 'triangle' }),
               'POW — triangle wave (less harsh)'),
        ],
      },
      // ---- thornhit — close perturbations of even-longer ----
      {
        name: 'thornhit',
        description: 'Kept: Even longer (500ms, 130Hz end). Close perturbations.',
        candidates: [
          proc('thornhit', 'el-base', thornHitVariant({ duration: 0.5, painEndF: 130 }),
               'KEPT — even longer (500ms, 130Hz end)'),
          proc('thornhit', 'el-shorter', thornHitVariant({ duration: 0.4, painEndF: 130 }),
               'Slightly shorter (400ms)'),
          proc('thornhit', 'el-longer', thornHitVariant({ duration: 0.6, painEndF: 110 }),
               'Even longer (600ms)'),
          proc('thornhit', 'el-deeper-end', thornHitVariant({ duration: 0.5, painEndF: 90 }),
               'Deeper end (90Hz)'),
          proc('thornhit', 'el-higher-end', thornHitVariant({ duration: 0.5, painEndF: 180 }),
               'Higher end (180Hz)'),
          proc('thornhit', 'el-sharper-stab', thornHitVariant({ duration: 0.5, painEndF: 130, stabF: 1500, stabAmp: 0.45 }),
               'Sharper stab (1500Hz)'),
          proc('thornhit', 'el-softer-stab', thornHitVariant({ duration: 0.5, painEndF: 130, stabAmp: 0.2 }),
               'Softer stab'),
          proc('thornhit', 'el-loud-pain', thornHitVariant({ duration: 0.5, painEndF: 130, painAmp: 0.32 }),
               'Louder pain tone'),
          proc('thornhit', 'el-quiet-pain', thornHitVariant({ duration: 0.5, painEndF: 130, painAmp: 0.12 }),
               'Quieter pain tone'),
          proc('thornhit', 'el-more-noise', thornHitVariant({ duration: 0.5, painEndF: 130, noiseAmp: 0.28 }),
               'More noise'),
        ],
      },
      // ---- splash — close perturbations of watery ----
      {
        name: 'splash',
        description: 'Kept: Watery (slap + body + droplets). Close perturbations.',
        candidates: [
          proc('splash', 'wat-base', splashWatery(),
               'KEPT — watery'),
          proc('splash', 'wat-bigger-slap', splashWateryParam({ slapAmp: 0.6 }),
               'Bigger slap'),
          proc('splash', 'wat-smaller-slap', splashWateryParam({ slapAmp: 0.3 }),
               'Smaller slap'),
          proc('splash', 'wat-more-body', splashWateryParam({ bodyAmp: 0.42 }),
               'More body (wetter middle)'),
          proc('splash', 'wat-less-body', splashWateryParam({ bodyAmp: 0.18 }),
               'Less body (sharper)'),
          proc('splash', 'wat-more-droplets', splashWateryParam({ dropletAmp: 0.25 }),
               'More droplets'),
          proc('splash', 'wat-shorter', splashWateryParam({ duration: 0.16 }),
               'Shorter (160ms)'),
          proc('splash', 'wat-longer', splashWateryParam({ duration: 0.32 }),
               'Longer (320ms)'),
          proc('splash', 'wat-louder', splashWateryParam({ amplitude: 1.3 }),
               'Louder (×1.3)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Crouch — category exploration. Crouch is a brief (~80–150ms) soft sound;
// these variations come from different synthesis families to cover stylistic
// territory rather than parameter-perturbing one recipe.

interface ClothRuffleParams {
  duration: number;
  cutoff: number;      // one-pole LP coefficient: higher = brighter
  jitterFreq: number;  // jitter modulation rate (Hz)
  jitterDepth: number; // 0..1 — how much amplitude jitter
  attack: number;      // env attack rate (higher = faster)
  releaseShape: number; // exponent on (1-p): higher = sharper release
  amplitude: number;
}

function crouchClothRuffle(p: Partial<ClothRuffleParams> = {}): string {
  const { duration = 0.12, cutoff = 0.25, jitterFreq = 80, jitterDepth = 0.4,
          attack = 8, releaseShape = 1.5, amplitude = 0.4 } = p;
  let lp = 0;
  return buildBuffer(duration, (t) => {
    const prog = t / duration;
    const noise = Math.random() * 2 - 1;
    lp += cutoff * (noise - lp);
    const jitter = 1 + jitterDepth * Math.sin(2 * Math.PI * jitterFreq * t);
    const env = Math.min(1, prog * attack) * Math.max(0, 1 - prog) ** releaseShape;
    return lp * jitter * env * amplitude;
  });
}

function crouchSqueak(): string {
  // Low-freq triangle with vibrato, like an old hinge
  return buildBuffer(0.16, (t) => {
    const p = t / 0.16;
    const baseF = 220 - 80 * p;
    const vib = Math.sin(2 * Math.PI * 22 * t) * 18;
    const f = baseF + vib;
    const phase = (t * f) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.min(1, p * 10) * Math.max(0, 1 - p) ** 1.2;
    return tri * env * 0.22;
  });
}

function crouchJointPop(): string {
  // Very brief click + low thud — like a knee crack
  return buildBuffer(0.08, (t) => {
    const p = t / 0.08;
    const click = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-p * 60) * 0.35;
    const thud = Math.sin(2 * Math.PI * 90 * t) * Math.exp(-p * 8) * 0.4;
    return click + thud;
  });
}

function crouchAirPuff(): string {
  // Descending filtered noise — like a soft exhale / hydraulic release
  let lp = 0;
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const noise = Math.random() * 2 - 1;
    const cutoff = 0.4 - 0.3 * p; // bright → dark
    lp += cutoff * (noise - lp);
    const env = Math.min(1, p * 4) * Math.max(0, 1 - p) ** 1.4;
    return lp * env * 0.55;
  });
}

function crouchSpringCompress(): string {
  // Fast pitch-down sine — like a spring compressing (inverse of jump's boing)
  return buildBuffer(0.1, (t) => {
    const p = t / 0.1;
    const f = 380 - 250 * p;
    const env = Math.min(1, p * 12) * Math.exp(-p * 5);
    return Math.sin(2 * Math.PI * f * t) * env * 0.32;
  });
}

function crouchRubberSquish(): string {
  // Pitched-down sine + low-pass noise (squishy)
  let lp = 0;
  return buildBuffer(0.12, (t) => {
    const p = t / 0.12;
    const f = 200 - 80 * Math.exp(-p * 4); // 200 → ~120 Hz
    const tone = Math.sin(2 * Math.PI * f * t);
    const noise = Math.random() * 2 - 1;
    lp += 0.1 * (noise - lp);
    const env = Math.min(1, p * 15) * Math.max(0, 1 - p) ** 1.6;
    return (tone * 0.35 + lp * 0.4) * env;
  });
}

function crouchBodySettle(): string {
  // Sub-bass thud, very gentle — feels like weight transfer
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const sub = Math.sin(2 * Math.PI * 70 * t) * Math.max(0, 1 - p * 4) * 0.55;
    const click = (Math.random() * 2 - 1) * Math.max(0, 1 - p * 50) * 0.12;
    return sub + click;
  });
}

function crouchFrictionRub(): string {
  // Sustained noise with amplitude modulation — friction / sliding
  let lp = 0;
  return buildBuffer(0.18, (t) => {
    const p = t / 0.18;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const am = 0.6 + 0.4 * Math.sin(2 * Math.PI * 30 * t);
    const env = Math.min(1, p * 6) * Math.max(0, 1 - p) ** 1.2;
    return lp * am * env * 0.45;
  });
}

function crouchWoodCreak(): string {
  // Slow pitch-shifting triangle — like a wooden floorboard
  return buildBuffer(0.22, (t) => {
    const p = t / 0.22;
    const f = 140 + 30 * Math.sin(2 * Math.PI * 4 * t);
    const phase = (t * f) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.min(1, p * 5) * Math.max(0, 1 - p) ** 1.3;
    return tri * env * 0.2;
  });
}

function crouchHydraulic(): string {
  // Descending square + filtered noise (mech-like)
  let lp = 0;
  return buildBuffer(0.14, (t) => {
    const p = t / 0.14;
    const f = 280 - 180 * p;
    const phase = (t * f) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const noise = Math.random() * 2 - 1;
    lp += 0.2 * (noise - lp);
    const env = Math.min(1, p * 12) * Math.max(0, 1 - p) ** 1.4;
    return (sq * 0.18 + lp * 0.35) * env;
  });
}

function crouchSoftPat(): string {
  // Muffled mid-band noise burst — like a pillow tap
  let lp = 0;
  return buildBuffer(0.07, (t) => {
    const p = t / 0.07;
    const noise = Math.random() * 2 - 1;
    lp += 0.05 * (noise - lp);
    const env = Math.exp(-p * 7);
    return lp * env * 0.85;
  });
}

function crouchSubKick(): string {
  // Pitched-down sub-bass kick (very short)
  return buildBuffer(0.1, (t) => {
    const p = t / 0.1;
    const f = 130 - 70 * Math.exp(-p * 25); // pitches down very fast
    const env = Math.min(1, p * 30) * Math.exp(-p * 6);
    return Math.sin(2 * Math.PI * f * t) * env * 0.55;
  });
}

function buildCrouchPage(): PageDef {
  return {
    title: 'Crouch — Category Exploration',
    subtitle: 'Different synthesis families to cover stylistic territory. Pick the closest few; we can perturb the winners next.',
    sounds: [
      {
        name: 'crouch',
        description: 'Brief soft sound when the player squats. Should feel weighty but not loud — players hold-down often. Pick 1–3.',
        candidates: [
          // Family: cloth / fabric
          proc('crouch', 'cloth-ruffle', crouchClothRuffle({}),
               'Cloth ruffle — noise burst with fabric jitter'),
          // Family: hinge / squeak
          proc('crouch', 'squeak', crouchSqueak(),
               'Squeak — low triangle with vibrato (old hinge)'),
          // Family: bone / joint
          proc('crouch', 'joint-pop', crouchJointPop(),
               'Joint pop — brief click + low thud (knee crack)'),
          // Family: air / breath
          proc('crouch', 'air-puff', crouchAirPuff(),
               'Air puff — descending filtered noise (soft exhale)'),
          // Family: mechanical
          proc('crouch', 'spring-compress', crouchSpringCompress(),
               'Spring compress — fast pitch-down sine'),
          proc('crouch', 'hydraulic', crouchHydraulic(),
               'Hydraulic — descending square + filtered noise'),
          // Family: rubber / squish
          proc('crouch', 'rubber-squish', crouchRubberSquish(),
               'Rubber squish — pitched sine + low-pass noise'),
          // Family: weight / body
          proc('crouch', 'body-settle', crouchBodySettle(),
               'Body settle — gentle 70Hz sub-thud'),
          proc('crouch', 'sub-kick', crouchSubKick(),
               'Sub kick — short pitched-down sub-bass'),
          // Family: friction
          proc('crouch', 'friction-rub', crouchFrictionRub(),
               'Friction rub — modulated noise (sliding)'),
          // Family: wood
          proc('crouch', 'wood-creak', crouchWoodCreak(),
               'Wood creak — slow pitch-shifting triangle (floorboard)'),
          // Family: pillow / soft
          proc('crouch', 'soft-pat', crouchSoftPat(),
               'Soft pat — muffled mid-band noise burst'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Refinement page — only kept selections + close perturbations of each kept procedural

function buildCrouchRefinePage(): PageDef {
  return {
    title: 'Crouch — Cloth Ruffle Refinement',
    subtitle: 'Picked: Cloth ruffle. 11 perturbations across duration, brightness, jitter rate/depth, envelope shape, and amplitude.',
    sounds: [
      {
        name: 'crouch',
        description: 'Cloth-ruffle perturbations. Pick the closest 1–3.',
        candidates: [
          proc('crouch', 'cloth-current', crouchClothRuffle({}),
               'KEPT — current (120ms, cutoff 0.25, 80Hz jitter @ 0.4 depth)'),
          // Duration
          proc('crouch', 'cloth-shorter-80ms', crouchClothRuffle({ duration: 0.08 }),
               '80ms (snappier)'),
          proc('crouch', 'cloth-longer-160ms', crouchClothRuffle({ duration: 0.16 }),
               '160ms (more body)'),
          proc('crouch', 'cloth-longer-200ms', crouchClothRuffle({ duration: 0.2 }),
               '200ms (lingers)'),
          // Brightness (low-pass cutoff)
          proc('crouch', 'cloth-darker', crouchClothRuffle({ cutoff: 0.12 }),
               'Darker — heavier muffle (cutoff 0.12)'),
          proc('crouch', 'cloth-brighter', crouchClothRuffle({ cutoff: 0.45 }),
               'Brighter — more crinkle (cutoff 0.45)'),
          // Jitter rate (fabric "texture")
          proc('crouch', 'cloth-jitter-slow', crouchClothRuffle({ jitterFreq: 40 }),
               'Slow jitter — 40Hz (rougher fabric)'),
          proc('crouch', 'cloth-jitter-fast', crouchClothRuffle({ jitterFreq: 140 }),
               'Fast jitter — 140Hz (finer fabric)'),
          proc('crouch', 'cloth-jitter-200', crouchClothRuffle({ jitterFreq: 200 }),
               'Very fast jitter — 200Hz (silk-like)'),
          // Jitter depth
          proc('crouch', 'cloth-jitter-shallow', crouchClothRuffle({ jitterDepth: 0.2 }),
               'Shallow jitter — depth 0.2 (smoother)'),
          proc('crouch', 'cloth-jitter-deep', crouchClothRuffle({ jitterDepth: 0.6 }),
               'Deep jitter — depth 0.6 (more rustly)'),
          // Envelope shape
          proc('crouch', 'cloth-soft-attack', crouchClothRuffle({ attack: 4 }),
               'Soft attack — slower fade-in'),
          proc('crouch', 'cloth-hard-release', crouchClothRuffle({ releaseShape: 2.5 }),
               'Hard release — sharper tail cutoff'),
          // Amplitude
          proc('crouch', 'cloth-quieter', crouchClothRuffle({ amplitude: 0.28 }),
               'Quieter (amplitude 0.28)'),
          proc('crouch', 'cloth-louder', crouchClothRuffle({ amplitude: 0.55 }),
               'Louder (amplitude 0.55)'),
        ],
      },
    ],
  };
}

function buildCrouchFinalPage(): PageDef {
  const PICK_DARKER = { cutoff: 0.12 };
  const PICK_SHORTER = { duration: 0.08 };
  const PICK_SHALLOW = { jitterDepth: 0.2 };
  return {
    title: 'Crouch — Final Pick',
    subtitle: 'Your three picks individually + 3 pair combinations + the all-three combined version. Pick the single best.',
    sounds: [
      {
        name: 'crouch',
        description: 'Pick exactly 1 — this becomes the new generateCrouchSound.',
        candidates: [
          // Individuals (recap)
          proc('crouch', 'cloth-darker', crouchClothRuffle(PICK_DARKER),
               'A — Darker only (cutoff 0.12)'),
          proc('crouch', 'cloth-shorter', crouchClothRuffle(PICK_SHORTER),
               'B — Shorter only (80ms)'),
          proc('crouch', 'cloth-shallow', crouchClothRuffle(PICK_SHALLOW),
               'C — Shallow jitter only (depth 0.2)'),
          // Pairs
          proc('crouch', 'cloth-darker-shorter', crouchClothRuffle({ ...PICK_DARKER, ...PICK_SHORTER }),
               'A+B — Darker + shorter'),
          proc('crouch', 'cloth-darker-shallow', crouchClothRuffle({ ...PICK_DARKER, ...PICK_SHALLOW }),
               'A+C — Darker + shallow jitter'),
          proc('crouch', 'cloth-shorter-shallow', crouchClothRuffle({ ...PICK_SHORTER, ...PICK_SHALLOW }),
               'B+C — Shorter + shallow jitter'),
          // All three
          proc('crouch', 'cloth-all-three', crouchClothRuffle({ ...PICK_DARKER, ...PICK_SHORTER, ...PICK_SHALLOW }),
               'A+B+C — Darker + shorter + shallow (all three)'),
        ],
      },
    ],
  };
}

function buildRefinePage(): PageDef {
  return {
    title: 'Movement — Refinement Round',
    subtitle: 'Only your previous picks remain, plus close variations of each procedural to dial in. Multi-select winners; remaining clicks toggle parity (odd = selected).',
    sounds: [
      // ---- jump ----
      {
        name: 'jump',
        description: 'Kept: Procedural — current (square sweep 300→600Hz, 120ms). Variations explore duration, freq range, and waveform.',
        candidates: [
          // Original kept
          proc('jump', 'current', generateJumpSound(),
               'KEPT — Procedural current (300→600Hz, 120ms, square)'),
          // Duration variations
          proc('jump', 'shorter-90ms', jumpSweep({ startF: 300, endF: 600, duration: 0.09, type: 'square', amplitude: 0.25 }),
               '300→600Hz, 90ms (snappier)'),
          proc('jump', 'longer-160ms', jumpSweep({ startF: 300, endF: 600, duration: 0.16, type: 'square', amplitude: 0.25 }),
               '300→600Hz, 160ms (longer)'),
          // Pitch variations (same shape, different range)
          proc('jump', 'lower-250-500', jumpSweep({ startF: 250, endF: 500, duration: 0.12, type: 'square', amplitude: 0.25 }),
               '250→500Hz, 120ms (lower / heavier)'),
          proc('jump', 'higher-360-720', jumpSweep({ startF: 360, endF: 720, duration: 0.12, type: 'square', amplitude: 0.25 }),
               '360→720Hz, 120ms (higher / brighter)'),
          // Sweep amount variations (same center)
          proc('jump', 'wider-260-680', jumpSweep({ startF: 260, endF: 680, duration: 0.12, type: 'square', amplitude: 0.25 }),
               '260→680Hz, 120ms (wider sweep)'),
          proc('jump', 'narrower-320-520', jumpSweep({ startF: 320, endF: 520, duration: 0.12, type: 'square', amplitude: 0.25 }),
               '320→520Hz, 120ms (narrower sweep)'),
          // Waveform variations (custom — can't use generateToneBuffer for tri/saw)
          proc('jump', 'triangle', jumpSweepCustom({ startF: 300, endF: 600, duration: 0.12, type: 'triangle', amplitude: 0.3 }),
               '300→600Hz, 120ms, triangle (softer)'),
          proc('jump', 'sawtooth', jumpSweepCustom({ startF: 300, endF: 600, duration: 0.12, type: 'sawtooth', amplitude: 0.22 }),
               '300→600Hz, 120ms, sawtooth (gritty)'),
        ],
      },
      // ---- land ----
      {
        name: 'land',
        description: 'Kept: 2 procedurals (low-thud, crunch) and 2 Kenney plank samples. Variations of each procedural follow.',
        candidates: [
          // Originals kept
          proc('land', 'low-thud-current', landLowThud(),
               'KEPT — Procedural low-thud (90Hz sub + click, 250ms)'),
          // Low-thud variations
          proc('land', 'low-thud-bass-70', landLowThud({ bassF: 70 }),
               'Low-thud — 70Hz sub (deeper)'),
          proc('land', 'low-thud-bass-110', landLowThud({ bassF: 110 }),
               'Low-thud — 110Hz sub (less bassy)'),
          proc('land', 'low-thud-bass-140', landLowThud({ bassF: 140 }),
               'Low-thud — 140Hz sub (mid-low thud)'),
          proc('land', 'low-thud-less-click', landLowThud({ clickAmp: 0.15 }),
               'Low-thud — less click (softer attack)'),
          proc('land', 'low-thud-more-click', landLowThud({ clickAmp: 0.45 }),
               'Low-thud — more click (snappier attack)'),
          proc('land', 'low-thud-shorter', landLowThud({ duration: 0.18 }),
               'Low-thud — 180ms (shorter)'),
          proc('land', 'low-thud-longer', landLowThud({ duration: 0.32, bassDecay: 3 }),
               'Low-thud — 320ms (longer tail)'),

          proc('land', 'crunch-current', landCrunch(),
               'KEPT — Procedural crunch (110Hz thud + filtered noise, 280ms)'),
          // Crunch variations
          proc('land', 'crunch-thud-85', landCrunch({ thudF: 85 }),
               'Crunch — 85Hz thud (deeper)'),
          proc('land', 'crunch-thud-145', landCrunch({ thudF: 145 }),
               'Crunch — 145Hz thud (higher)'),
          proc('land', 'crunch-brighter', landCrunch({ noiseLp: 0.30 }),
               'Crunch — brighter noise (more grit)'),
          proc('land', 'crunch-darker', landCrunch({ noiseLp: 0.08 }),
               'Crunch — darker noise (more rumble)'),
          proc('land', 'crunch-shorter', landCrunch({ duration: 0.22, noiseDecay: 7 }),
               'Crunch — 220ms (shorter)'),
          proc('land', 'crunch-longer', landCrunch({ duration: 0.36, noiseDecay: 4 }),
               'Crunch — 360ms (longer)'),

          // Samples kept (no variations possible — shipped as-is)
          sample('land', 'k_impactPlank_med_000', 'kenney_impact-sounds/Audio/impactPlank_medium_000.ogg', 'kenney_impact'),
          sample('land', 'k_impactPlank_med_002', 'kenney_impact-sounds/Audio/impactPlank_medium_002.ogg', 'kenney_impact'),
        ],
      },
      // ---- footstep_grass ----
      {
        name: 'footstep_grass',
        description: 'Kept: Procedural current (white noise burst) + Procedural bright (high-passed noise). Variations of each.',
        candidates: [
          proc('footstep_grass', 'current', generateFootstepGrass(),
               'KEPT — Procedural current (50ms white noise burst)'),
          proc('footstep_grass', 'shorter', footstepRaw({ duration: 0.035 }),
               'Current — 35ms (snappier)'),
          proc('footstep_grass', 'longer', footstepRaw({ duration: 0.07 }),
               'Current — 70ms (longer)'),
          proc('footstep_grass', 'quieter', footstepRaw({ amplitude: 0.10 }),
               'Current — quieter (0.10)'),
          proc('footstep_grass', 'fast-decay', footstepRaw({ envDecay: 5 }),
               'Current — faster decay (sharper)'),
          proc('footstep_grass', 'slow-decay', footstepRaw({ envDecay: 2 }),
               'Current — slower decay (lingers)'),

          proc('footstep_grass', 'bright-current', footstepBright(),
               'KEPT — Procedural bright (high-passed noise, 70ms)'),
          proc('footstep_grass', 'bright-brighter', footstepBright({ cutoff: 0.7 }),
               'Bright — even brighter (cutoff 0.7)'),
          proc('footstep_grass', 'bright-darker', footstepBright({ cutoff: 0.35 }),
               'Bright — darker (cutoff 0.35)'),
          proc('footstep_grass', 'bright-shorter', footstepBright({ duration: 0.05 }),
               'Bright — 50ms (snappier)'),
          proc('footstep_grass', 'bright-longer', footstepBright({ duration: 0.10 }),
               'Bright — 100ms (longer)'),
          proc('footstep_grass', 'bright-louder', footstepBright({ amplitude: 0.55 }),
               'Bright — louder (0.55)'),
        ],
      },
      // ---- footstep_wood ----
      {
        name: 'footstep_wood',
        description: 'Kept: Procedural crisp (220Hz tone + noise click). Variations of tone freq and noise mix.',
        candidates: [
          proc('footstep_wood', 'crisp-current', footstepWoodCrisp(),
               'KEPT — Procedural crisp (220Hz tone + noise, 70ms)'),
          proc('footstep_wood', 'crisp-160', footstepWoodCrisp({ toneF: 160 }),
               'Crisp — 160Hz tone (warmer)'),
          proc('footstep_wood', 'crisp-180', footstepWoodCrisp({ toneF: 180 }),
               'Crisp — 180Hz tone'),
          proc('footstep_wood', 'crisp-260', footstepWoodCrisp({ toneF: 260 }),
               'Crisp — 260Hz tone (brighter)'),
          proc('footstep_wood', 'crisp-300', footstepWoodCrisp({ toneF: 300 }),
               'Crisp — 300Hz tone (cutting)'),
          proc('footstep_wood', 'crisp-pure-tone', footstepWoodCrisp({ noiseAmp: 0.05 }),
               'Crisp — minimal noise (purer click)'),
          proc('footstep_wood', 'crisp-more-noise', footstepWoodCrisp({ noiseAmp: 0.45 }),
               'Crisp — more noise (rougher)'),
          proc('footstep_wood', 'crisp-shorter', footstepWoodCrisp({ duration: 0.05 }),
               'Crisp — 50ms (snappier)'),
          proc('footstep_wood', 'crisp-longer', footstepWoodCrisp({ duration: 0.10 }),
               'Crisp — 100ms (more body)'),
        ],
      },
      // ---- crouch ----
      {
        name: 'crouch',
        description: 'Kept: Kenney RPG cloth3. No procedural to perturb — sample shipped as-is.',
        candidates: [
          sample('crouch', 'rpg_cloth3', 'kenney_rpg-audio/Audio/cloth3.ogg', 'kenney_rpg'),
        ],
      },
      // ---- fastfall ----
      {
        name: 'fastfall',
        description: 'Kept: Procedural current (long descending swoosh, 800→150Hz, 250ms with rushing-air noise). Variations of pitch range, length, and noise mix.',
        candidates: [
          proc('fastfall', 'current', generateFastfallSound(),
               'KEPT — Procedural current (800→150Hz, 250ms)'),
          proc('fastfall', 'shorter', fastfallRaw({ duration: 0.18 }),
               'Current — 180ms (snappier)'),
          proc('fastfall', 'longer', fastfallRaw({ duration: 0.35, envDecay: 1 }),
               'Current — 350ms (longer drop)'),
          proc('fastfall', 'higher-start', fastfallRaw({ startF: 1000 }),
               'Current — 1000→150Hz (higher start)'),
          proc('fastfall', 'lower-start', fastfallRaw({ startF: 600 }),
               'Current — 600→150Hz (lower start)'),
          proc('fastfall', 'lower-end', fastfallRaw({ endF: 80 }),
               'Current — 800→80Hz (deeper end)'),
          proc('fastfall', 'less-noise', fastfallRaw({ noiseAmp: 0.25 }),
               'Current — less air noise'),
          proc('fastfall', 'more-noise', fastfallRaw({ noiseAmp: 0.75 }),
               'Current — more air noise'),
          proc('fastfall', 'pure-tone', fastfallRaw({ noiseAmp: 0.05 }),
               'Current — almost no noise (pure swoosh)'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// HTML rendering

function renderSoundBlock(sound: SoundEntry): string {
  const opts = sound.candidates.map(c => `
    <div class="option" data-choice="${c.id}" onclick="toggleSelect(this)">
      <div class="letter">▶</div>
      <div class="content">
        <h3>${escapeHtml(c.label)}</h3>
        <p><span class="label">${escapeHtml(c.tag)}</span></p>
        <audio controls preload="none" src="${c.src}" onclick="event.stopPropagation()"></audio>
      </div>
    </div>`).join('\n');

  return `
<section class="section" id="sound-${sound.name}">
  <h3 style="font-size:1.5rem;margin-bottom:0.25rem"><code>${sound.name}</code>
    <span class="label" style="font-weight:normal;color:#888">— ${sound.candidates.length} candidates</span>
  </h3>
  <p class="subtitle">${escapeHtml(sound.description)}</p>
  <div class="options" data-multiselect>
${opts}
  </div>
</section>
<hr style="margin:2rem 0;border:none;border-top:1px solid #333" />`;
}

function renderPage(page: PageDef): string {
  const blocks = page.sounds.map(renderSoundBlock).join('\n');
  return `
<h2>${escapeHtml(page.title)}</h2>
<p class="subtitle">${escapeHtml(page.subtitle)}</p>

<p style="background:#1a1a1a;padding:0.75rem 1rem;border-radius:4px;color:#aaa;font-size:0.9rem">
  <strong style="color:#fff">How to use:</strong>
  Click ▶ on each card to play. Click anywhere else on a card to toggle it as a winner (highlights green).
  Multi-select within each sound — picked variants will be played in random rotation in-game.
  When you're done, just tell me in chat. (No save buttons — every click is logged; I read the latest selection state.)
</p>

${blocks}
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]!));
}

// ---------------------------------------------------------------------------
// Main

function parseArgs(): { page: string; session: string } {
  const args = process.argv.slice(2);
  let page = 'movement';
  let session = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page') page = args[i + 1];
    if (args[i] === '--session') session = args[i + 1];
  }
  if (!session) {
    const dirs = fs.readdirSync(SESSION_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, mtime: fs.statSync(path.join(SESSION_ROOT, d.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (dirs.length === 0) throw new Error('No session dirs in ' + SESSION_ROOT);
    session = dirs[0].name;
  }
  return { page, session };
}

function main(): void {
  const { page, session } = parseArgs();
  const sessionDir = path.join(SESSION_ROOT, session);
  const contentDir = path.join(sessionDir, 'content');
  if (!fs.existsSync(contentDir)) {
    throw new Error('Content dir not found: ' + contentDir);
  }

  let pageDef: PageDef;
  if (page === 'refine') {
    pageDef = buildRefinePage();
  } else if (page === 'crouch') {
    pageDef = buildCrouchPage();
  } else if (page === 'crouch-refine') {
    pageDef = buildCrouchRefinePage();
  } else if (page === 'crouch-final') {
    pageDef = buildCrouchFinalPage();
  } else if (page === 'combat') {
    pageDef = buildCombatPage();
  } else if (page === 'combat-refine') {
    pageDef = buildCombatRefinePage();
  } else if (page === 'combat-r3') {
    pageDef = buildCombatR3Page();
  } else if (page === 'combat-big') {
    pageDef = buildCombatBigPage();
  } else if (page === 'combat-r5') {
    pageDef = buildCombatR5Page();
  } else if (page === 'combat-layered') {
    pageDef = buildCombatLayeredPage();
  } else if (page === 'combat-r7') {
    pageDef = buildCombatR7Page();
  } else if (page === 'combat-r8') {
    pageDef = buildCombatR8Page();
  } else if (page === 'ui') {
    pageDef = buildUiPage();
  } else if (page === 'select') {
    pageDef = buildSelectPage();
  } else {
    throw new Error('Unknown page: ' + page);
  }

  const html = renderPage(pageDef);
  const filename = `${page}-${Date.now()}.html`;
  const outPath = path.join(contentDir, filename);
  fs.writeFileSync(outPath, html, 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`Session: ${session}`);
  console.log(`Sounds:  ${pageDef.sounds.map(s => `${s.name}(${s.candidates.length})`).join(', ')}`);
  const totalCandidates = pageDef.sounds.reduce((sum, s) => sum + s.candidates.length, 0);
  console.log(`Candidates: ${totalCandidates} across ${pageDef.sounds.length} sounds`);
}

main();
