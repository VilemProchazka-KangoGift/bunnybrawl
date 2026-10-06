import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinCharacters } from '../builtin';
import { getCharacterPack, listCharacterPacks } from '../registry';
import { PLUSH_ANIMALS, PLUSH_POSE, registerPlayablePlushRoster, selectPlushPose } from './playableRoster';

beforeEach(() => {
  registerBuiltinCharacters();
});

describe('playable plush roster', () => {
  it('has an atlas for every built-in character and installs them as one complete roster', async () => {
    expect(new Set(PLUSH_ANIMALS)).toEqual(new Set(listCharacterPacks().map(pack => pack.name)));
    const fetchMock = vi.fn(async (url: string) => ({
      ok: !url.includes('cow.webp'), status: 404, blob: async () => new Blob(),
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({} as ImageBitmap)));

    await expect(registerPlayablePlushRoster()).rejects.toThrow('Cow Plush atlas failed');
    expect(PLUSH_ANIMALS.every(name => !getCharacterPack(name)?.resolvePose)).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob() })));
    await registerPlayablePlushRoster();
    expect(PLUSH_ANIMALS.every(name => getCharacterPack(name)?.resolvePose === selectPlushPose)).toBe(true);
    expect(PLUSH_ANIMALS.every(name => getCharacterPack(name)?.noOutline)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('uses authored sit, stomp, landing, and alternating gait poses', () => {
    expect(selectPlushPose('run', 0, false, -1, 0, 1)).toBe(PLUSH_POSE.walkA);
    expect(selectPlushPose('run', 1, false, -1, 0, 1)).toBe(PLUSH_POSE.walkB);
    expect(selectPlushPose('idle', 0, false, -1, 0, .6)).toBe(PLUSH_POSE.sit);
    expect(selectPlushPose('run', 1, false, -1, 0, .6)).toBe(PLUSH_POSE.sit);
    expect(selectPlushPose('airborne', 0, false, -1, 0, 1)).toBe(PLUSH_POSE.jump);
    expect(selectPlushPose('airborne', 0, true, -1, 0, 1)).toBe(PLUSH_POSE.stomp);
    expect(selectPlushPose('idle', 0, false, -1, 0, .8)).toBe(PLUSH_POSE.landing);
    expect(selectPlushPose('idle', 0, false, 0, .5, 1)).toBe(PLUSH_POSE.attentive);
  });
});
