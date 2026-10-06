import type { CharacterPack } from '../types';
import type { PlayerState } from '../../types';
import { SQUASH_ON_CROUCH } from '../../constants';
import { getCharacterPack, registerCharacter } from '../registry';
import { clearIdleActionCache } from '../../rendering/idleActions';
import { clearSpriteCache } from '../../rendering/players';

/** Eight authored beats: idle, two strides, jump, sit, stomp, landing, attention. */
export const PLUSH_POSE = {
  idle: 0, walkA: 1, walkB: 2, jump: 3,
  sit: 4, stomp: 5, landing: 6, attentive: 7,
} as const;

const CELL = 96;
const COLS = 4;
const noop = () => {};

// Static URLs let Vite fingerprint each atlas while the browser fetches them
// only when menu preloading or gameplay begins. Keep keys aligned with builtins.ts.
const atlasUrls = {
  Bunny: new URL('./assets/bunny.webp', import.meta.url).href,
  Fox: new URL('./assets/fox.webp', import.meta.url).href,
  Frog: new URL('./assets/frog.webp', import.meta.url).href,
  Bear: new URL('./assets/bear.webp', import.meta.url).href,
  Owl: new URL('./assets/owl.webp', import.meta.url).href,
  Cat: new URL('./assets/cat.webp', import.meta.url).href,
  Wolf: new URL('./assets/wolf.webp', import.meta.url).href,
  Panda: new URL('./assets/panda.webp', import.meta.url).href,
  Pig: new URL('./assets/pig.webp', import.meta.url).href,
  Cow: new URL('./assets/cow.webp', import.meta.url).href,
  Goat: new URL('./assets/goat.webp', import.meta.url).href,
  Horse: new URL('./assets/horse.webp', import.meta.url).href,
  Sheep: new URL('./assets/sheep.webp', import.meta.url).href,
  Monkey: new URL('./assets/monkey.webp', import.meta.url).href,
  Tiger: new URL('./assets/tiger.webp', import.meta.url).href,
  Rhino: new URL('./assets/rhino.webp', import.meta.url).href,
  Hedgehog: new URL('./assets/hedgehog.webp', import.meta.url).href,
  Chick: new URL('./assets/chick.webp', import.meta.url).href,
  Axolotl: new URL('./assets/axolotl.webp', import.meta.url).href,
} as const;

export type PlushAnimal = keyof typeof atlasUrls;
export const PLUSH_ANIMALS = Object.keys(atlasUrls) as PlushAnimal[];

const displaySize: Record<PlushAnimal, number> = {
  Bunny: 40, Fox: 43, Frog: 41, Bear: 42, Owl: 39,
  Cat: 42, Wolf: 44, Panda: 42, Pig: 40, Cow: 44,
  Goat: 43, Horse: 46, Sheep: 42, Monkey: 43, Tiger: 44,
  Rhino: 44, Hedgehog: 41, Chick: 37, Axolotl: 45,
};

/** Pose selection is shared by every animal; species acting lives in each sheet. */
export function selectPlushPose(
  state: PlayerState, animFrame: number, fastFalling: boolean,
  idleAction: number, idleT: number, squashScale: number,
): number {
  if (state === 'airborne') return fastFalling ? PLUSH_POSE.stomp : PLUSH_POSE.jump;
  if ((state === 'idle' || state === 'run') && squashScale <= SQUASH_ON_CROUCH + .05) return PLUSH_POSE.sit;
  if (squashScale < .87) return PLUSH_POSE.landing;
  if (state === 'run') {
    if (idleAction === 1 && idleT < .55) return PLUSH_POSE.sit;
    return animFrame & 1 ? PLUSH_POSE.walkB : PLUSH_POSE.walkA;
  }
  if (idleAction === 1) return PLUSH_POSE.sit;
  if (idleAction === 0 && idleT > .2 && idleT < .8) return PLUSH_POSE.attentive;
  return PLUSH_POSE.idle;
}

function plushPack(original: CharacterPack, atlas: ImageBitmap, size: number): CharacterPack {
  return {
    ...original,
    customEyes: true,
    noHighlight: true,
    noOutline: true,
    authoredAngryBrows: true,
    legStyle: { shape: 'rounded', footStyle: 'none', legWidth: 1, legHeight: 1, footHeight: 0 },
    idleActions: {
      weights: { headBob: 0, headTilt: 0, headShake: 0, littleHop: 0, stretch: 0, lookAround: 0 },
      custom: [
        { id: 'plushAttention', duration: 1.1, weight: 3, apply: noop },
        { id: 'plushSit', duration: 2.4, exitDuration: .24, weight: 1, apply: noop },
      ],
    },
    resolvePose: selectPlushPose,
    drawSprite: (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, _colors, poseIndex = 0) => {
      const pose = Math.max(0, Math.min(7, poseIndex));
      ctx.drawImage(
        atlas,
        pose % COLS * CELL, Math.floor(pose / COLS) * CELL, CELL, CELL,
        cx - size / 2, yOff + h - size, size, size,
      );
    },
  };
}

let pending: Promise<void> | undefined;

/** Register complete art for main-thread lobby, main-thread fallback, or worker. */
export function registerPlayablePlushRoster(signal?: AbortSignal): Promise<void> {
  if (!pending) {
    pending = Promise.all(PLUSH_ANIMALS.map(async animal => {
      const original = getCharacterPack(animal);
      if (!original) throw new Error(`Missing ${animal} pack`);
      const response = await fetch(atlasUrls[animal], { signal });
      if (!response.ok) throw new Error(`${animal} Plush atlas failed: HTTP ${response.status}`);
      const atlas = await createImageBitmap(await response.blob());
      return plushPack(original, atlas, displaySize[animal]);
    })).then(packs => {
      if (signal?.aborted) throw new DOMException('Plush preload canceled', 'AbortError');
      for (const pack of packs) registerCharacter(pack);
      clearIdleActionCache();
      clearSpriteCache();
    }).catch(error => {
      pending = undefined;
      throw error;
    });
  }
  // A real lobby or match can arrive while a speculative menu load is being
  // canceled. Join it, then retry without a cancelable signal if necessary.
  if (!signal) return pending.catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return registerPlayablePlushRoster();
    throw error;
  });
  return pending;
}
