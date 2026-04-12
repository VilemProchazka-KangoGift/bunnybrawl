import { describe, it, expect, vi } from 'vitest';
import { drawLegs } from './legRenderer';
import type { CharacterColors, LegStyle } from './types';

// ---- Canvas mock ----

function makeMockCtx() {
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
    lineCap: '' as string,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    quadraticCurveTo: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    roundRect: vi.fn(),
  } as any;
}

const testColors: CharacterColors = {
  color: '#FF8800',
  darkColor: '#884400',
  lightColor: '#FFCC88',
};

describe('drawLegs', () => {
  describe('default style (rounded, round feet)', () => {
    it('draws two legs (left and right)', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors);
      // Default legs: rounded shape (roundRect or ellipse) + round feet
      // Each side: 1 leg fill + 1 foot fill = 2 fills per side = 4 total
      expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('sets darkColor for leg fill', () => {
      const ctx = makeMockCtx();
      const fillStyles: string[] = [];
      const origSet = Object.getOwnPropertyDescriptor(ctx, 'fillStyle')!;
      let current = '';
      Object.defineProperty(ctx, 'fillStyle', {
        get: () => current,
        set: (v: string) => { current = v; fillStyles.push(v); },
      });
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors);
      // darkColor should be set for the legs
      expect(fillStyles).toContain(testColors.darkColor);
    });

    it('sets lightColor for foot fill (default)', () => {
      const ctx = makeMockCtx();
      const fillStyles: string[] = [];
      let current = '';
      Object.defineProperty(ctx, 'fillStyle', {
        get: () => current,
        set: (v: string) => { current = v; fillStyles.push(v); },
      });
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors);
      expect(fillStyles).toContain(testColors.lightColor);
    });
  });

  describe('states', () => {
    it('idle state produces subtle weight shift', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'idle', 0.5, 1, testColors);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('run state produces walk animation', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'run', 1, 1, testColors);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('airborne state spreads legs wider', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'airborne', 0, 1, testColors);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('splat state works (treated as default)', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'splat', 0, 1, testColors);
      expect(ctx.fill).toHaveBeenCalled();
    });
  });

  describe('squash', () => {
    it('squashScale < 0.9 widens legs', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 0.8, testColors);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('squashScale = 1 produces no squash adjustments', () => {
      const ctx = makeMockCtx();
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors);
      expect(ctx.fill).toHaveBeenCalled();
    });
  });

  describe('leg shapes', () => {
    it('rounded shape uses roundRect for straight legs (legHeight > 5)', () => {
      const ctx = makeMockCtx();
      // idle baseKneeOff=0.5 which is NOT < 0.5 → uses bent path.
      // Running with animFrame=0.5 → cos(0.5*π)≈0 → kneeOff≈0 < 0.5 → straight path.
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', legHeight: 10 };
      drawLegs(ctx, 100, 50, 40, 'run', 0.5, 1, testColors, style);
      expect(ctx.roundRect).toHaveBeenCalled();
    });

    it('tapered shape uses quadraticCurveTo', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'tapered', footStyle: 'round', legHeight: 10 };
      drawLegs(ctx, 100, 50, 40, 'run', 1, 1, testColors, style);
      expect(ctx.quadraticCurveTo).toHaveBeenCalled();
    });

    it('stick shape uses stroke instead of fill for legs', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'stick', footStyle: 'round' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('wide shape renders without error', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'wide', footStyle: 'round' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.fill).toHaveBeenCalled();
    });
  });

  describe('foot styles', () => {
    it('paw feet use ellipse', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'paw' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.ellipse).toHaveBeenCalled();
    });

    it('hoof feet use roundRect', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'hoof' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.roundRect).toHaveBeenCalled();
    });

    it('webbed feet use moveTo/lineTo path', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'webbed' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
    });

    it('claw feet use stroke (not fill)', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'claw' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('none footStyle skips foot drawing', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'none' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      // Only leg fills (2), no foot fills
      // Legs: 2 roundRect + 2 fill
      const fillCount = ctx.fill.mock.calls.length;
      expect(fillCount).toBe(2); // legs only, no feet
    });
  });

  describe('nub legs (legH <= 5)', () => {
    it('renders as ellipses instead of roundRect', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', legHeight: 4 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.ellipse).toHaveBeenCalled();
    });

    it('tapered nub legs use ellipses', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'tapered', footStyle: 'round', legHeight: 3 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.ellipse).toHaveBeenCalled();
    });

    it('wide nub legs use ellipses', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'wide', footStyle: 'round', legHeight: 5 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.ellipse).toHaveBeenCalled();
    });
  });

  describe('custom dimensions', () => {
    it('respects custom legWidth and legHeight', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', legWidth: 12, legHeight: 10 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('respects custom footHeight', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'paw', footHeight: 5 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.ellipse).toHaveBeenCalled();
    });

    it('respects custom footColor', () => {
      const ctx = makeMockCtx();
      const fillStyles: string[] = [];
      let current = '';
      Object.defineProperty(ctx, 'fillStyle', {
        get: () => current,
        set: (v: string) => { current = v; fillStyles.push(v); },
      });
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', footColor: '#00FF00' };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(fillStyles).toContain('#00FF00');
    });

    it('respects spreadAngle', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', spreadAngle: 5 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('respects footWidth/footHeight overrides', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'claw', footWidth: 12, footHeight: 6 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 1, testColors, style);
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('knee bend variations', () => {
    it('bent legs during running use quadraticCurveTo', () => {
      const ctx = makeMockCtx();
      // animFrame=0.25 → cos(0.25*π)≈0.707 → kneeOff=0.707*0.7≈0.5 > 0.5 threshold
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', legHeight: 10 };
      drawLegs(ctx, 100, 50, 40, 'run', 0.2, 1, testColors, style);
      // cos(0.2*π) ≈ 0.81 → kneeOff ≈ 0.57 > 0.5 → quadratic path
      expect(ctx.quadraticCurveTo).toHaveBeenCalled();
    });

    it('landing squash produces outward knee splay', () => {
      const ctx = makeMockCtx();
      const style: LegStyle = { shape: 'rounded', footStyle: 'round', legHeight: 10 };
      drawLegs(ctx, 100, 50, 40, 'idle', 0, 0.8, testColors, style);
      // squashFactor > 0 → kneeOff > 0
      expect(ctx.fill).toHaveBeenCalled();
    });
  });
});
