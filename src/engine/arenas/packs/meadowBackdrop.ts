import type { Ctx2D } from '../../types';
import { getIllustratedBackdrop } from '../illustratedBackdropAsset';

type Point = readonly [number, number];

const FAR_RIDGE: readonly Point[] = [
  [0, 539], [125, 518], [260, 538], [395, 495], [540, 531],
  [685, 508], [815, 526], [960, 487], [1110, 516], [1280, 496],
];
const MIDDLE_RIDGE: readonly Point[] = [
  [0, 591], [170, 552], [305, 579], [470, 541], [635, 576],
  [780, 536], [940, 562], [1100, 534], [1280, 573],
];
const DISTANT_TREES: readonly Point[] = [
  [50, 585], [135, 568], [210, 579], [315, 573], [390, 552],
  [510, 566], [600, 577], [735, 562], [825, 543], [905, 565],
  [1040, 549], [1145, 563], [1230, 570],
];
const NEAR_RIDGE: readonly Point[] = [
  [0, 653], [165, 613], [310, 633], [480, 592], [655, 624],
  [830, 599], [990, 630], [1160, 605], [1280, 630],
];

// The far landscape is baked into the background canvas. Its quiet blue-green
// layers distinguish moving characters from scenery at day and night.
function rollingBand(c: Ctx2D, color: string, points: readonly Point[], rise: number): void {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(points[0][0], points[0][1] - rise);
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    c.quadraticCurveTo(previous[0], previous[1] - rise,
      (previous[0] + next[0]) / 2, ((previous[1] - rise) + (next[1] - rise)) / 2);
  }
  const last = points[points.length - 1];
  c.lineTo(last[0], last[1] - rise);
  c.lineTo(1280, 720);
  c.lineTo(0, 720);
  c.closePath();
  c.fill();
}

function distantTree(c: Ctx2D, x: number, groundY: number, height: number): void {
  const w = height * .42;
  c.strokeStyle = '#678987';
  c.lineWidth = Math.max(1.5, height * .035);
  c.beginPath(); c.moveTo(x, groundY);
  c.quadraticCurveTo(x + height * .025, groundY - height * .28, x - height * .04, groundY - height * .58);
  c.stroke();
  c.fillStyle = '#789a9a';
  c.beginPath();
  c.moveTo(x - w * .68, groundY - height * .34);
  c.bezierCurveTo(x - w * 1.15, groundY - height * .51, x - w * .93, groundY - height * .69, x - w * .48, groundY - height * .73);
  c.bezierCurveTo(x - w * .43, groundY - height * .97, x - w * .04, groundY - height, x + w * .22, groundY - height * .85);
  c.bezierCurveTo(x + w * .77, groundY - height * .91, x + w * .95, groundY - height * .68, x + w * .72, groundY - height * .55);
  c.bezierCurveTo(x + w * 1.04, groundY - height * .41, x + w * .59, groundY - height * .28, x + w * .17, groundY - height * .34);
  c.quadraticCurveTo(x - w * .18, groundY - height * .24, x - w * .68, groundY - height * .34);
  c.closePath(); c.fill();
}

/** Approved tall valley. `hillRise` also supports the saved comparison study. */
export function drawMeadowValley(c: Ctx2D, hillRise = 70): void {
  const middleRise = hillRise * .72;
  rollingBand(c, '#a0b9bb', FAR_RIDGE, hillRise);
  rollingBand(c, '#8ca9ac', MIDDLE_RIDGE, middleRise);
  for (const [x, groundY] of DISTANT_TREES) {
    const height = 29 + (Math.floor(x * .13) % 5) * 7;
    distantTree(c, x, groundY - middleRise, height);
  }
  rollingBand(c, '#71928f', NEAR_RIDGE, hillRise * .38);
}

/** Pale illustrated hills; the procedural valley remains a safe load fallback. */
export function drawPaintedMeadowValley(c: Ctx2D): void {
  const image = getIllustratedBackdrop('meadow');
  if (!image) {
    drawMeadowValley(c);
    return;
  }
  c.save();
  c.globalAlpha = 0.65;
  c.drawImage(image, 0, 0, 1280, 720);
  c.restore();
}

export const MEADOW_CLOUDS = [
  { x: -27, y: 46, size: 130, height: 46, speed: 8 },
  { x: 304, y: 65, size: 141, height: 56, speed: 7 },
  { x: 585, y: 42, size: 113, height: 43, speed: 9 },
  { x: 866, y: 48, size: 129, height: 52, speed: 6 },
  { x: 1090, y: 81, size: 122, height: 44, speed: 8 },
] as const;

/** Elongated storybook cloud silhouette; renderer supplies the moving x. */
export function drawMeadowCloud(c: Ctx2D, x: number, y: number, width: number, height: number): void {
  c.fillStyle = 'rgba(255, 252, 236, 0.79)';
  c.beginPath(); c.moveTo(x, y + height * .45);
  c.bezierCurveTo(x - width * .08, y + height * .14, x + width * .1, y - height * .06, x + width * .28, y + height * .06);
  c.bezierCurveTo(x + width * .37, y - height * .25, x + width * .61, y - height * .19, x + width * .68, y + height * .04);
  c.bezierCurveTo(x + width * .94, y - height * .04, x + width * 1.05, y + height * .23, x + width, y + height * .45);
  c.bezierCurveTo(x + width * .88, y + height * .74, x + width * .68, y + height * .55, x + width * .52, y + height * .63);
  c.bezierCurveTo(x + width * .3, y + height * .69, x + width * .1, y + height * .72, x, y + height * .45);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(179, 206, 211, 0.45)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x + width * .13, y + height * .57);
  c.quadraticCurveTo(x + width * .34, y + height * .65, x + width * .54, y + height * .6);
  c.quadraticCurveTo(x + width * .75, y + height * .53, x + width * .87, y + height * .55);
  c.stroke();
}
