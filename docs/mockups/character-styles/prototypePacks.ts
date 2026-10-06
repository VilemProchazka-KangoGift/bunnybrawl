import type { CharacterPack, CharacterRenderer, CharacterColors } from '../../../src/engine/characters/types';
import { getCharacterPack, registerCharacter } from '../../../src/engine/characters/registry';
import type { Ctx2D } from '../../../src/engine/types';

export type PrototypeStyle = 'storybook' | 'plush' | 'cartoon';
type Animal = 'Bunny' | 'Fox' | 'Frog' | 'Bear' | 'Owl';
export const STUDY_CHARACTERS: readonly Animal[] = ['Bunny', 'Fox', 'Frog', 'Bear', 'Owl'];

function oval(c: Ctx2D, x: number, y: number, rx: number, ry: number, color: string): void {
  c.fillStyle = color;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}

function line(c: Ctx2D, color: string, width: number, points: readonly number[]): void {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.stroke();
}

function triangle(c: Ctx2D, color: string, a: readonly [number, number], b: readonly [number, number], d: readonly [number, number]): void {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...d); c.closePath(); c.fill();
}

function ink(c: Ctx2D, style: PrototypeStyle): void {
  if (style === 'plush') return;
  c.strokeStyle = style === 'storybook' ? '#35413c' : '#283342';
  c.lineWidth = style === 'storybook' ? 1.3 : 1.8;
  c.lineJoin = 'round'; c.stroke();
}

function body(c: Ctx2D, animal: Animal, style: PrototypeStyle, colors: CharacterColors, state: string): void {
  const rx = animal === 'Frog' ? 13.3 : animal === 'Bear' ? 13 : animal === 'Owl' ? 11 : 11.5;
  const ry = animal === 'Frog' ? 9.5 : animal === 'Owl' ? 13 : 11.5;
  const cy = animal === 'Frog' ? 20 : 17;
  c.save();
  c.translate(0, cy);
  if (style === 'cartoon') c.scale(state === 'airborne' ? .88 : state === 'run' ? 1.13 : 1, state === 'airborne' ? 1.15 : state === 'run' ? .87 : 1);
  c.fillStyle = colors.color;
  c.beginPath();
  if (style === 'storybook') {
    c.moveTo(0, -ry - 1);
    c.bezierCurveTo(rx * .65, -ry - 1.5, rx + 1, -ry * .42, rx - .3, 1);
    c.bezierCurveTo(rx + 1, ry * .53, rx * .58, ry + .8, -.8, ry);
    c.bezierCurveTo(-rx * .6, ry + 1, -rx - 1.1, ry * .46, -rx, -.5);
    c.bezierCurveTo(-rx - .5, -ry * .61, -rx * .55, -ry + .3, 0, -ry - 1);
  } else {
    c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  }
  c.fill(); ink(c, style);
  // Broad color blocks survive at 32 px; tiny texture is reserved for the close-up.
  if (animal !== 'Frog') oval(c, 0, 5, rx * .54, ry * .4, colors.lightColor);
  if (style === 'storybook') {
    c.fillStyle = 'rgba(37, 57, 56, .16)';
    c.beginPath(); c.ellipse(-rx * .55, 3, rx * .24, ry * .55, -.18, 0, Math.PI * 2); c.fill();
    line(c, 'rgba(255,255,245,.65)', .9, [-rx * .5, -ry * .35, -rx * .29, -ry * .62, 0, -ry * .7]);
  } else if (style === 'plush') {
    c.fillStyle = colors.darkColor; c.globalAlpha = .44;
    c.beginPath(); c.ellipse(-rx * .64, .8, 2.7, 4.4, -.3, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = colors.darkColor; c.lineWidth = 1.2;
    c.setLineDash([2, 1.7]); c.beginPath(); c.ellipse(0, 5, rx * .56, ry * .42, 0, .15, Math.PI - .15); c.stroke();
    c.setLineDash([]);
    oval(c, rx * .55, ry * .52, 2.1, 1.5, colors.lightColor);
  } else {
    oval(c, -rx * .48, -ry * .38, 2.7, 1.3, 'rgba(255,255,255,.44)');
  }
  c.restore();
}

function earsAndTail(c: Ctx2D, animal: Animal, style: PrototypeStyle, colors: CharacterColors, state: string): void {
  const run = state === 'run';
  const air = state === 'airborne';
  if (animal === 'Bunny') {
    for (const side of [-1, 1]) {
      c.save(); c.translate(side * 6, 7); c.rotate((run ? -.24 : air ? .12 : .03) * side);
      c.fillStyle = colors.color; c.beginPath();
      c.moveTo(-3.5, 5); c.bezierCurveTo(-5, -8, -3, -15, 0, -16);
      c.bezierCurveTo(4, -15, 5, -3, 3.3, 5); c.closePath(); c.fill(); ink(c, style);
      oval(c, 0, -5.2, 1.5, 6.7, style === 'plush' ? '#e7a8b0' : '#e88b9c');
      c.restore();
    }
    oval(c, -11, 25, 3.8, 4, colors.lightColor);
  } else if (animal === 'Fox') {
    c.fillStyle = colors.color; c.beginPath();
    c.moveTo(-9, 22); c.bezierCurveTo(-23, 11, -26, 27, -18, 30);
    c.bezierCurveTo(-14, 31, -12, 25, -9, 22); c.fill(); ink(c, style);
    oval(c, -20, 27.3, 4.5, 2.7, colors.lightColor);
    for (const side of [-1, 1]) {
      triangle(c, colors.darkColor, [side * 4, 12], [side * 11, run ? 1 : -3], [side * 13, 13]);
      triangle(c, colors.color, [side * 5, 10], [side * 10, 1], [side * 11, 12]);
      triangle(c, '#e99580', [side * 7, 9], [side * 10, 4], [side * 10, 10]);
    }
  } else if (animal === 'Frog') {
    oval(c, -8, 10, 6, 6, colors.color); oval(c, 8, 10, 6, 6, colors.color);
    if (air) { oval(c, -14, 27, 6, 3.3, colors.darkColor); oval(c, 14, 27, 6, 3.3, colors.darkColor); }
  } else if (animal === 'Bear') {
    oval(c, -9, 8, 5.4, 5.4, colors.darkColor); oval(c, 9, 8, 5.4, 5.4, colors.darkColor);
    oval(c, -9, 8, 3.2, 3.2, colors.color); oval(c, 9, 8, 3.2, 3.2, colors.color);
  } else {
    for (const side of [-1, 1]) {
      triangle(c, colors.darkColor, [side * 4, 8], [side * 10, 1], [side * 12, 12]);
      c.save(); c.translate(side * 11, 19); c.rotate(side * (air ? -.75 : run ? -.25 : .15));
      oval(c, side * 2, 1, 4, air ? 9 : 7, colors.darkColor); c.restore();
    }
  }
}

function eyes(c: Ctx2D, style: PrototypeStyle, x: number, y: number, size: number): void {
  for (const side of [-1, 1]) {
    const ex = side * x;
    if (style === 'cartoon') {
      oval(c, ex, y, size + 1.7, size + 1.8, '#fffdf2');
      oval(c, ex + .55, y + .4, size * .72, size * .9, '#202b32');
      oval(c, ex + .95, y - .7, .85, .85, '#fff');
    } else if (style === 'plush') {
      oval(c, ex, y, size + .4, size + .4, '#263039');
      oval(c, ex - .55, y - .7, .65, .65, '#f5f2ed');
    } else {
      oval(c, ex, y, size, size * 1.16, '#25333a');
      oval(c, ex - .45, y - .6, .7, .7, '#fff9e6');
      line(c, '#35413c', .8, [ex - size - .7, y - size - 1.5, ex, y - size - 2]);
    }
  }
}

function face(c: Ctx2D, animal: Animal, style: PrototypeStyle, colors: CharacterColors, state: string): void {
  if (animal === 'Owl') {
    oval(c, -5.3, 14, 5.4, 6.5, colors.lightColor); oval(c, 5.3, 14, 5.4, 6.5, colors.lightColor);
    eyes(c, style, 5.2, 13.8, style === 'cartoon' ? 1.8 : 2.1);
    triangle(c, '#e6aa42', [-2.2, 18], [2.2, 18], [0, 22]);
  } else if (animal === 'Frog') {
    eyes(c, style, 8, 9.2, style === 'cartoon' ? 2 : 2.35);
    c.strokeStyle = colors.darkColor; c.lineWidth = style === 'cartoon' ? 1.5 : 1;
    c.beginPath(); c.moveTo(-6, 22); c.quadraticCurveTo(0, state === 'airborne' ? 27 : 25, 6, 22); c.stroke();
    oval(c, -8, 19, 1.7, 1, 'rgba(231,136,139,.55)'); oval(c, 8, 19, 1.7, 1, 'rgba(231,136,139,.55)');
  } else {
    if (animal === 'Fox') {
      c.fillStyle = colors.lightColor; c.beginPath();
      c.moveTo(-9, 17); c.quadraticCurveTo(-7, 25, 0, 24);
      c.quadraticCurveTo(7, 25, 9, 17); c.quadraticCurveTo(0, 21, -9, 17); c.fill();
    } else if (animal === 'Bear') {
      oval(c, 0, 21, 6.5, 4.5, colors.lightColor);
    } else {
      oval(c, -4, 21, 3.7, 2.7, colors.lightColor); oval(c, 4, 21, 3.7, 2.7, colors.lightColor);
    }
    eyes(c, style, animal === 'Bear' ? 5 : 4.7, 15, style === 'cartoon' ? 1.8 : 1.6);
    oval(c, 0, animal === 'Bear' ? 19.5 : 21, animal === 'Fox' ? 2 : 1.7, 1.2,
      animal === 'Bunny' ? '#db7888' : '#313039');
    if (style === 'cartoon') {
      c.strokeStyle = '#33313a'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-2.3, 23); c.quadraticCurveTo(0, state === 'airborne' ? 27 : 25, 2.3, 23); c.stroke();
    }
  }
  if (style === 'storybook') {
    line(c, 'rgba(52,61,57,.52)', .65, [-9, 19, -11, 20]);
    line(c, 'rgba(52,61,57,.52)', .65, [9, 19, 11, 20]);
  }
  if (style === 'plush') {
    // Small paired stitches are only a close-up reward, never needed for recognition.
    line(c, colors.darkColor, .7, [-8, 24, -6.5, 25]);
    line(c, colors.darkColor, .7, [6.5, 25, 8, 24]);
  }
}

function createSprite(animal: Animal, style: PrototypeStyle): CharacterRenderer {
  return (c, cx, yOff, _w, _h, state, _animFrame, _isIdleAnim, _idleT, colors) => {
    c.save(); c.translate(cx, yOff);
    if (style === 'cartoon') {
      c.translate(0, 17);
      if (state === 'run') c.rotate(-.11);
      if (state === 'airborne') c.scale(.85, 1.14);
      c.translate(0, -17);
    }
    earsAndTail(c, animal, style, colors, state);
    body(c, animal, style, colors, state);
    face(c, animal, style, colors, state);
    c.restore();
  };
}

/** Replace only the five study packs in this isolated mockup page. */
export function registerPrototypePacks(style: PrototypeStyle): void {
  for (const animal of STUDY_CHARACTERS) {
    const original = getCharacterPack(animal);
    if (!original) throw new Error(`Missing character pack: ${animal}`);
    const prototype: CharacterPack = {
      ...original,
      drawSprite: createSprite(animal, style),
      customEyes: true,
      noHighlight: true,
      legStyle: { ...original.legStyle, footColor: original.darkColor },
    };
    registerCharacter(prototype);
  }
}
