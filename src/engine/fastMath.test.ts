import { describe, it, expect } from 'vitest';
import { fastSin, fastCos, hexToRGB, hexToHSL } from './fastMath';

describe('fastSin', () => {
  it('sin(0) ≈ 0', () => {
    expect(fastSin(0)).toBeCloseTo(0, 1);
  });

  it('sin(π/2) ≈ 1', () => {
    expect(fastSin(Math.PI / 2)).toBeCloseTo(1, 1);
  });

  it('sin(π) ≈ 0', () => {
    expect(fastSin(Math.PI)).toBeCloseTo(0, 1);
  });

  it('sin(3π/2) ≈ -1', () => {
    expect(fastSin(3 * Math.PI / 2)).toBeCloseTo(-1, 1);
  });

  it('handles negative angles', () => {
    expect(fastSin(-Math.PI / 2)).toBeCloseTo(-1, 1);
  });

  it('handles angles > 2π (wraps)', () => {
    expect(fastSin(Math.PI / 2 + 2 * Math.PI)).toBeCloseTo(1, 1);
  });

  it('precision is within 1 degree (~0.02 max error)', () => {
    // Check multiple angles and ensure error < 0.03
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = deg * Math.PI / 180;
      const fast = fastSin(rad);
      const precise = Math.sin(rad);
      expect(Math.abs(fast - precise)).toBeLessThan(0.03);
    }
  });
});

describe('fastCos', () => {
  it('cos(0) ≈ 1', () => {
    expect(fastCos(0)).toBeCloseTo(1, 1);
  });

  it('cos(π/2) ≈ 0', () => {
    expect(fastCos(Math.PI / 2)).toBeCloseTo(0, 1);
  });

  it('cos(π) ≈ -1', () => {
    expect(fastCos(Math.PI)).toBeCloseTo(-1, 1);
  });

  it('handles negative angles', () => {
    expect(fastCos(-Math.PI)).toBeCloseTo(-1, 1);
  });

  it('precision is within 1 degree (~0.02 max error)', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = deg * Math.PI / 180;
      const fast = fastCos(rad);
      const precise = Math.cos(rad);
      expect(Math.abs(fast - precise)).toBeLessThan(0.03);
    }
  });
});

describe('hexToRGB', () => {
  it('parses black #000000', () => {
    expect(hexToRGB('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parses white #ffffff', () => {
    expect(hexToRGB('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses red #ff0000', () => {
    expect(hexToRGB('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('parses green #00ff00', () => {
    expect(hexToRGB('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('parses blue #0000ff', () => {
    expect(hexToRGB('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('parses mixed color #4a8c2f', () => {
    expect(hexToRGB('#4a8c2f')).toEqual({ r: 74, g: 140, b: 47 });
  });

  it('parses uppercase hex #FF8800', () => {
    expect(hexToRGB('#FF8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses gray #808080', () => {
    expect(hexToRGB('#808080')).toEqual({ r: 128, g: 128, b: 128 });
  });
});

describe('hexToHSL', () => {
  it('red #FF0000 → h≈0, s=1, l=0.5', () => {
    const { h, s, l } = hexToHSL('#FF0000');
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(1, 5);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('blue #0000FF → h≈240, s=1, l=0.5', () => {
    const { h, s, l } = hexToHSL('#0000FF');
    expect(h).toBeCloseTo(240, 0);
    expect(s).toBeCloseTo(1, 5);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('gray #808080 → s=0 (achromatic)', () => {
    const { s } = hexToHSL('#808080');
    expect(s).toBe(0);
  });

  it('white #FFFFFF → l=1, s=0', () => {
    const { s, l } = hexToHSL('#FFFFFF');
    expect(s).toBe(0);
    expect(l).toBeCloseTo(1, 5);
  });

  it('black #000000 → l=0, s=0', () => {
    const { s, l } = hexToHSL('#000000');
    expect(s).toBe(0);
    expect(l).toBeCloseTo(0, 5);
  });
});

describe('fastSin/fastCos identity', () => {
  it('sin² + cos² ≈ 1 for all angles', () => {
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = deg * Math.PI / 180;
      const s = fastSin(rad);
      const c = fastCos(rad);
      expect(s * s + c * c).toBeCloseTo(1, 1);
    }
  });

  it('cos(x) ≈ sin(x + π/2)', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = deg * Math.PI / 180;
      expect(fastCos(rad)).toBeCloseTo(fastSin(rad + Math.PI / 2), 1);
    }
  });

  it('sin(-x) ≈ -sin(x)', () => {
    for (let deg = 10; deg < 360; deg += 30) {
      const rad = deg * Math.PI / 180;
      expect(fastSin(-rad)).toBeCloseTo(-fastSin(rad), 1);
    }
  });

  it('cos(-x) ≈ cos(x)', () => {
    for (let deg = 10; deg < 360; deg += 30) {
      const rad = deg * Math.PI / 180;
      expect(fastCos(-rad)).toBeCloseTo(fastCos(rad), 1);
    }
  });
});
