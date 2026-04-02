import type { SplatShape, GibType, PlayerState } from '../types';
import type { GibDef } from '../stomp';

// ---- Renderer function signatures ----

/** Draws the character's body, ears, tail, and custom eyes (if any).
 *  Called inside a save/restore block with fast-fall transform already applied.
 *  Must be a PURE FUNCTION of its inputs — the result is cached to OffscreenCanvas.
 *  Do NOT use external mutable state; derive all animation from the provided parameters. */
export type CharacterRenderer = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  yOff: number,
  w: number,
  h: number,
  state: PlayerState | string,
  animFrame: number,
  isIdleAnim: boolean,
  idleT: number,
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

/** How the character transforms during idle animation.
 *  Applied by the renderer before the character's drawSprite is called. */
export type IdleTransformType = 'none' | 'headTilt' | 'headFlip' | 'headBob';

/** Complete definition of a character, bundling all data and rendering functions.
 *  Built-in characters populate this from scattered sources; external packs provide it directly. */
export interface CharacterPack {
  name: string;
  emoji: string;

  color: string;
  darkColor: string;
  lightColor: string;

  customEyes: boolean;
  idleTransform: IdleTransformType;
  drawSprite: CharacterRenderer;
  drawGib: GibRenderer;

  splatShape: SplatShape;
  gibs: GibDef[];

  translations?: Record<string, string>;
}
