import { describe, expect, it, vi } from 'vitest';
import type { Ctx2D } from '../../types';

const getCastleGuardianArt = vi.hoisted(() => vi.fn());
vi.mock('../illustratedBackdropAsset', () => ({ getCastleGuardianArt }));

import { drawCastleGuardianSpring } from './castleGuardianSpring';

describe('Castle Guardian spring', () => {
  const rest = { width: 198, height: 147 } as ImageBitmap;
  const compressed = { width: 198, height: 126 } as ImageBitmap;

  it('falls back to the existing Canvas spring until both poses decode', () => {
    const drawImage = vi.fn();
    getCastleGuardianArt.mockReturnValue({ rest, compressed: null });
    expect(drawCastleGuardianSpring({ drawImage } as unknown as Ctx2D, 100, 660, 0)).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('holds the authored crouch after contact and returns to the resting pose', () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as Ctx2D;
    getCastleGuardianArt.mockReturnValue({ rest, compressed });
    expect(drawCastleGuardianSpring(ctx, 100, 660, 0.3)).toBe(true);
    expect(drawImage).toHaveBeenLastCalledWith(compressed, expect.any(Number), 625, expect.any(Number), 35);
    expect(drawCastleGuardianSpring(ctx, 100, 660, 0.1)).toBe(true);
    expect(drawImage).toHaveBeenLastCalledWith(rest, expect.any(Number), 621, expect.any(Number), 39);
  });
});
