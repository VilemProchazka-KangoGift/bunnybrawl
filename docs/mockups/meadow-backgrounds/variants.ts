import type { Ctx2D } from '../../../src/engine/types';

type Point = readonly [number, number];

// All variants keep Meadow's production sky, clouds, sun, platforms, props,
// characters, and night treatment. Only the hills and far scenery are replaced.
function rollingBand(c: Ctx2D, color: string, points: readonly Point[]): void {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    c.quadraticCurveTo(previous[0], previous[1], (previous[0] + next[0]) / 2, (previous[1] + next[1]) / 2);
  }
  const last = points[points.length - 1];
  c.lineTo(last[0], last[1]);
  c.lineTo(1280, 720);
  c.lineTo(0, 720);
  c.closePath();
  c.fill();
}

function tree(c: Ctx2D, x: number, groundY: number, height: number, color: string, trunk: string): void {
  const w = height * .42;
  c.strokeStyle = trunk;
  c.lineWidth = Math.max(1.5, height * .035);
  c.beginPath(); c.moveTo(x, groundY); c.quadraticCurveTo(x + height * .025, groundY - height * .28, x - height * .04, groundY - height * .58); c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x - w * .68, groundY - height * .34);
  c.bezierCurveTo(x - w * 1.15, groundY - height * .51, x - w * .93, groundY - height * .69, x - w * .48, groundY - height * .73);
  c.bezierCurveTo(x - w * .43, groundY - height * .97, x - w * .04, groundY - height, x + w * .22, groundY - height * .85);
  c.bezierCurveTo(x + w * .77, groundY - height * .91, x + w * .95, groundY - height * .68, x + w * .72, groundY - height * .55);
  c.bezierCurveTo(x + w * 1.04, groundY - height * .41, x + w * .59, groundY - height * .28, x + w * .17, groundY - height * .34);
  c.quadraticCurveTo(x - w * .18, groundY - height * .24, x - w * .68, groundY - height * .34);
  c.closePath(); c.fill();
}

function grove(c: Ctx2D, positions: readonly Point[], color: string, trunk: string): void {
  for (const [x, groundY] of positions) {
    const height = 29 + (Math.floor(x * .13) % 5) * 7;
    tree(c, x, groundY, height, color, trunk);
  }
}

function woodedValley(c: Ctx2D): void {
  // The nearby canopy follows rolling ground instead of drawing sawteeth.
  rollingBand(c, '#a0b9bb', [[0, 539], [125, 518], [260, 538], [395, 495], [540, 531], [685, 508], [815, 526], [960, 487], [1110, 516], [1280, 496]]);
  rollingBand(c, '#8ca9ac', [[0, 591], [170, 552], [305, 579], [470, 541], [635, 576], [780, 536], [940, 562], [1100, 534], [1280, 573]]);
  grove(c, [[50, 585], [135, 568], [210, 579], [315, 573], [390, 552], [510, 566], [600, 577], [735, 562], [825, 543], [905, 565], [1040, 549], [1145, 563], [1230, 570]], '#789a9a', '#678987');
  rollingBand(c, '#71928f', [[0, 653], [165, 613], [310, 633], [480, 592], [655, 624], [830, 599], [990, 630], [1160, 605], [1280, 630]]);
}

function cottage(c: Ctx2D, x: number, groundY: number): void {
  // A tiny quiet landmark, behind the playable platforms.
  c.fillStyle = '#b7bfad'; c.fillRect(x - 24, groundY - 30, 48, 30);
  c.fillStyle = '#718b89'; c.beginPath(); c.moveTo(x - 31, groundY - 29);
  c.lineTo(x, groundY - 51); c.lineTo(x + 31, groundY - 29); c.closePath(); c.fill();
  c.fillStyle = '#7b999b'; c.fillRect(x - 4, groundY - 18, 8, 18);
  c.fillStyle = '#d9d7bb'; c.fillRect(x - 17, groundY - 21, 7, 7);
  c.fillRect(x + 10, groundY - 21, 7, 7);
}

function countryside(c: Ctx2D): void {
  rollingBand(c, '#adc1bf', [[0, 554], [135, 535], [290, 559], [470, 521], [655, 546], [850, 513], [1020, 543], [1185, 515], [1280, 533]]);
  rollingBand(c, '#90aca9', [[0, 635], [150, 607], [340, 621], [545, 575], [745, 612], [925, 570], [1100, 603], [1280, 577]]);
  // Broad cultivation bands give this direction a landscape rhythm.
  c.strokeStyle = '#bed0bd'; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(0, 600); c.bezierCurveTo(270, 572, 475, 626, 730, 586);
  c.bezierCurveTo(930, 557, 1100, 589, 1280, 567); c.stroke();
  c.strokeStyle = '#84a39f'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, 625); c.bezierCurveTo(240, 603, 430, 652, 700, 614);
  c.bezierCurveTo(920, 585, 1105, 616, 1280, 595); c.stroke();
  cottage(c, 68, 538);
  grove(c, [[180, 570], [265, 585], [355, 568], [455, 594], [575, 569], [690, 581], [790, 555], [915, 579], [1050, 562], [1170, 580]], '#819f96', '#75918b');
  rollingBand(c, '#799a90', [[0, 673], [190, 644], [380, 660], [570, 631], [770, 651], [960, 627], [1130, 643], [1280, 635]]);
}

function cloud(c: Ctx2D, x: number, y: number, width: number, height: number): void {
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

export function storybookClouds(c: Ctx2D): void {
  cloud(c, -27, 46, 130, 46);
  cloud(c, 304, 65, 141, 56);
  cloud(c, 585, 42, 113, 43);
  cloud(c, 866, 48, 129, 52);
  cloud(c, 1090, 81, 122, 44);
}

export const backgroundVariants: Record<string, (ctx: Ctx2D) => void> = {
  'wooded-valley': woodedValley,
  countryside,
};
