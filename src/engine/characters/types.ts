import type { AIPersonality } from '../ai/types';
import type { GibDef } from '../stomp';
import type { SplatShape, GibType } from '../types';

// ---- Renderer function signatures ----

/** Draws the character's body, ears, tail, and custom eyes (if any).
 *  Called inside a save/restore block with fast-fall transform already applied.
 *  Must be a PURE FUNCTION of its inputs — the result is cached to OffscreenCanvas.
 *  Do NOT use external mutable state; derive all animation from the provided parameters. */
export type CharacterRenderer = (
  ctx: CanvasRenderingContext2D,
  cx: number,           // center x of character
  yOff: number,         // y position (includes run bounce offset)
  w: number,            // character width
  h: number,            // character height
  state: string,        // 'idle' | 'run' | 'airborne' | 'splat' | 'respawning'
  animFrame: number,    // animation frame counter (integer)
  isIdleAnim: boolean,  // true when idle animation is active (idleT in 0..0.5)
  idleT: number,        // raw idle animation timer (0..0.5 during anim, -1 otherwise)
  colors: CharacterColors,
) => void;

/** Draws a single gib piece. Called with ctx already translated + rotated to gib position.
 *  The 'body' gibType is handled generically — this is only called for non-body gibs. */
export type GibRenderer = (
  ctx: CanvasRenderingContext2D,
  gibType: GibType,
  width: number,
  height: number,
  colors: CharacterColors,
) => void;

export interface CharacterColors {
  color: string;
  darkColor: string;
  lightColor: string;
}

// ---- Sound definitions ----

export interface SimpleSoundDef {
  type: 'simple';
  freq: number;
  duration: number;
  waveform: OscillatorType;
  genVol: number;
  freqEnd?: number;
  vol?: number;
}

export interface SegmentSoundDef {
  type: 'segment';
  segments: Array<{
    freq: number;
    freqEnd?: number;
    duration: number;
    type: OscillatorType;
  }>;
  genVol: number;
  vol?: number;
}

export interface CustomSoundDef {
  type: 'custom';
  // Custom sound generator — must return a Howl-compatible sound
  // (used for complex procedural sounds like frog ribbit)
}

export type SoundDef = SimpleSoundDef | SegmentSoundDef | CustomSoundDef;

// ---- Idle animation transform ----

/** Specifies how the character transforms during idle animation.
 *  Applied before the character renderer is called. */
export type IdleTransformType = 'none' | 'headTilt' | 'headFlip' | 'headBob';

// ---- Character Pack ----

/** Complete definition of a character, bundling all data and rendering functions.
 *  Built-in characters populate this from scattered sources; external packs provide it directly. */
export interface CharacterPack {
  // Identity
  name: string;                     // Primary key, must be unique
  emoji: string;                    // Display emoji (e.g. '\uD83D\uDC30' for bunny)

  // Colors
  color: string;                    // Main body color
  darkColor: string;                // Shadow/accent color
  lightColor: string;               // Highlight color

  // Rendering
  customEyes: boolean;              // true = renderer draws its own eyes; false = generic black dots
  idleTransform: IdleTransformType; // How the character moves during idle animation
  drawSprite: CharacterRenderer;    // Game + lobby rendering (same renderer used everywhere)
  drawGib: GibRenderer;             // Death gib piece rendering

  // Data
  splatShape: SplatShape;           // Splat mark shape on death
  gibs: GibDef[];                   // Death gib definitions
  personality: AIPersonality;       // Bot behavior weights

  // Audio
  sound: SoundDef;                  // Procedural sound parameters

  // Localization (optional — falls back to name if not provided)
  translations?: Record<string, string>;  // langCode → display name
}
