import type { SplatShape, GibType, PlayerState } from '../types';
import type { GibDef } from '../stomp';
import type { BodyEllipseParams } from '../spriteShading';

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

/** Per-character leg shape and foot configuration.
 *  Used by the shared drawLegs() renderer in legRenderer.ts. */
export interface LegStyle {
  /** Base leg shape: rounded (soft), tapered (wider at hip), stick (thin bird legs), wide (chunky) */
  shape: 'rounded' | 'tapered' | 'stick' | 'wide';
  /** Foot type drawn at the bottom of each leg */
  footStyle: 'paw' | 'hoof' | 'webbed' | 'claw' | 'round' | 'none';
  /** Leg width in px (default 6) */
  legWidth?: number;
  /** Leg height in px (default 8) */
  legHeight?: number;
  /** Foot fill color (default: colors.lightColor) */
  footColor?: string;
  /** Foot width in px (default: legWidth + 2) */
  footWidth?: number;
  /** Foot height in px (default: 3) */
  footHeight?: number;
  /** Resting horizontal splay in px, e.g. frog=4 (default 0) */
  spreadAngle?: number;
}

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

  /** Returns body ellipse params for 3D shading overlays (highlight spot). */
  bodyEllipse: (cx: number, yOff: number, w: number, h: number) => BodyEllipseParams;
  /** Skip the white highlight spot overlay (for characters with their own light belly/face). */
  noHighlight?: boolean;

  translations?: Record<string, string>;

  /** Leg shape and foot style. If omitted, defaults to rounded legs with round feet. */
  legStyle?: LegStyle;
}
