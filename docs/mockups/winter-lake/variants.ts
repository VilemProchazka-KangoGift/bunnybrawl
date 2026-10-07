import type { Ctx2D } from '../../../src/engine/types';

type Point = readonly [number, number];

export const VARIANTS = ['current', 'quiet-shore', 'glacial-basin', 'violet-inlet'] as const;
export type Variant = (typeof VARIANTS)[number];

export const descriptions: Record<Exclude<Variant, 'current'>, string> = {
  'quiet-shore': 'A wide, level frozen lake and low rolling shore leave the most breathing room around players.',
  'glacial-basin': 'Asymmetric glacial walls make the lake feel enclosed while keeping the center jump lane open.',
  'violet-inlet': 'A winding inlet and violet distance add storybook atmosphere, with shoreline silhouettes limited to the edges.',
};

export const skies: Record<Exclude<Variant, 'current'>, { offset: number; color: string }[]> = {
  'quiet-shore': [
    { offset: 0, color: '#40587D' }, { offset: .43, color: '#7796B0' },
    { offset: .78, color: '#B6CAD2' }, { offset: 1, color: '#D4DEE0' },
  ],
  'glacial-basin': [
    { offset: 0, color: '#44577B' }, { offset: .4, color: '#7892AD' },
    { offset: .78, color: '#B2C4D4' }, { offset: 1, color: '#D1DBE1' },
  ],
  'violet-inlet': [
    { offset: 0, color: '#47547B' }, { offset: .42, color: '#858EBA' },
    { offset: .76, color: '#BFC1D3' }, { offset: 1, color: '#D9D8D8' },
  ],
};

function band(ctx: Ctx2D, color: string, points: readonly Point[]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
  }
  const [x, y] = points[points.length - 1];
  ctx.lineTo(x, y);
  ctx.lineTo(1280, 720);
  ctx.lineTo(0, 720);
  ctx.closePath();
  ctx.fill();
}

function pine(ctx: Ctx2D, x: number, y: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x - h * .12, y - h * .66, x - h * .35, y - h * .42);
  ctx.quadraticCurveTo(x - h * .19, y - h * .47, x - h * .43, y - h * .12);
  ctx.quadraticCurveTo(x, y - h * .22, x + h * .42, y - h * .12);
  ctx.quadraticCurveTo(x + h * .19, y - h * .47, x + h * .34, y - h * .42);
  ctx.quadraticCurveTo(x + h * .13, y - h * .67, x, y - h);
  ctx.fill();
}

function icePlane(ctx: Ctx2D, horizon: readonly Point[], color: string, strokes: string): void {
  band(ctx, color, horizon);
  // A broken pale edge makes the horizontal band read as a frozen shore.
  ctx.strokeStyle = 'rgba(232, 246, 247, 0.48)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(horizon[0][0], horizon[0][1] + 2);
  for (let i = 1; i < horizon.length; i++) {
    const [px, py] = horizon[i - 1];
    const [x, y] = horizon[i];
    ctx.quadraticCurveTo(px, py + 2, (px + x) / 2, (py + y) / 2 + 2);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(226, 244, 247, 0.24)';
  ctx.beginPath();
  ctx.moveTo(200, 606); ctx.lineTo(420, 591); ctx.lineTo(550, 599);
  ctx.lineTo(358, 616); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(850, 604); ctx.lineTo(1090, 582); ctx.lineTo(1195, 589);
  ctx.lineTo(990, 612); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = strokes;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, 614);
  ctx.bezierCurveTo(230, 600, 325, 616, 493, 604);
  ctx.moveTo(590, 632);
  ctx.bezierCurveTo(742, 618, 877, 634, 1035, 608);
  ctx.moveTo(366, 570);
  ctx.bezierCurveTo(503, 565, 563, 573, 680, 566);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = .55;
  ctx.strokeStyle = strokes;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(265, 640); ctx.lineTo(308, 625); ctx.lineTo(343, 629);
  ctx.moveTo(742, 579); ctx.lineTo(793, 591); ctx.lineTo(818, 587);
  ctx.moveTo(1000, 646); ctx.lineTo(1036, 628); ctx.lineTo(1083, 635);
  ctx.stroke();
  ctx.restore();
}

function quietShore(ctx: Ctx2D): void {
  band(ctx, '#94B0BD', [[-20, 435], [120, 410], [280, 455], [460, 403], [645, 438], [805, 395], [1000, 451], [1180, 415], [1300, 433]]);
  band(ctx, '#ABC3C8', [[-20, 515], [145, 485], [325, 508], [510, 471], [695, 500], [875, 468], [1050, 509], [1290, 476]]);
  band(ctx, '#799BAA', [[-20, 576], [170, 544], [325, 558], [475, 545], [650, 564], [835, 538], [1030, 565], [1300, 542]]);
  for (const [x, y, h] of [[165, 538, 27], [240, 546, 19], [975, 551, 23], [1065, 545, 31]] as const) {
    pine(ctx, x, y, h, '#668994');
  }
  icePlane(ctx, [[-20, 589], [245, 568], [435, 584], [605, 574], [785, 582], [1000, 565], [1300, 579]], '#B9D2D5', 'rgba(91, 142, 165, 0.34)');
}

function glacialBasin(ctx: Ctx2D): void {
  band(ctx, '#A5B8CB', [[-20, 376], [112, 322], [243, 382], [350, 354], [515, 460], [690, 486], [872, 438], [1020, 333], [1140, 389], [1300, 344]]);
  band(ctx, '#809FB5', [[-20, 442], [120, 385], [228, 430], [338, 413], [465, 514], [640, 535], [815, 503], [982, 405], [1120, 447], [1300, 391]]);
  ctx.strokeStyle = 'rgba(226,239,240,0.55)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(15, 388); ctx.quadraticCurveTo(112, 330, 220, 389);
  ctx.moveTo(1040, 363); ctx.quadraticCurveTo(1150, 405, 1270, 354);
  ctx.stroke();
  band(ctx, '#6B91A5', [[-20, 555], [162, 490], [317, 507], [475, 558], [680, 573], [838, 554], [1015, 492], [1300, 513]]);
  icePlane(ctx, [[-20, 601], [176, 565], [350, 567], [515, 582], [710, 584], [880, 575], [1065, 553], [1300, 578]], '#A9CBD3', 'rgba(62, 134, 165, 0.36)');
}

function violetInlet(ctx: Ctx2D): void {
  band(ctx, '#A7A5BF', [[-20, 454], [110, 409], [238, 437], [404, 395], [555, 424], [700, 384], [875, 444], [1050, 407], [1300, 454]]);
  band(ctx, '#8F9DB5', [[-20, 501], [148, 469], [302, 507], [490, 452], [650, 489], [840, 454], [1015, 497], [1300, 468]]);
  // Two banks taper toward a broad, pale central inlet.
  band(ctx, '#778EA5', [[-20, 542], [145, 530], [290, 553], [415, 560], [530, 590], [640, 604], [755, 620], [1280, 645]]);
  band(ctx, '#859BAB', [[-20, 645], [465, 620], [605, 600], [740, 568], [890, 542], [1050, 526], [1300, 530]]);
  for (const [x, y, h] of [[60, 530, 30], [145, 532, 23], [1065, 526, 27], [1170, 521, 34], [1230, 526, 21]] as const) {
    pine(ctx, x, y, h, '#667E95');
  }
  icePlane(ctx, [[-20, 648], [220, 625], [430, 616], [600, 588], [755, 575], [890, 552], [1080, 550], [1300, 569]], '#C4D0DA', 'rgba(113, 126, 159, 0.34)');
}

export const drawBackdrop: Record<Exclude<Variant, 'current'>, (ctx: Ctx2D) => void> = {
  'quiet-shore': quietShore,
  'glacial-basin': glacialBasin,
  'violet-inlet': violetInlet,
};
