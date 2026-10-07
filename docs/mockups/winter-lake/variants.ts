import type { Ctx2D } from '../../../src/engine/types';

type Point = readonly [number, number];

export const VARIANTS = [
  'current', 'quiet-shore', 'glacial-basin', 'violet-inlet',
  'mirror-ice', 'fir-shore', 'rose-dawn', 'polar-gap',
  'polar-open', 'polar-stepped', 'polar-offset', 'polar-alpenglow',
  'polar-soft-shoulders', 'polar-high-bluffs', 'polar-uneven-shore',
  'polar-powder-bank', 'polar-wind-carved', 'polar-frost-shelves', 'polar-pearl-shore',
  'polar-silver-banks', 'polar-lilac-snow', 'polar-deep-ice', 'polar-warm-drift',
  'polar-silver-banks-before', 'polar-silver-frostwork',
  'polar-silver-inked', 'polar-silver-gouache', 'polar-silver-comic',
  'polar-silver-painted',
] as const;
export type Variant = (typeof VARIANTS)[number];

export const descriptions: Record<Exclude<Variant, 'current'>, string> = {
  'quiet-shore': 'A wide, level frozen lake and low rolling shore leave the most breathing room around players.',
  'glacial-basin': 'Asymmetric glacial walls make the lake feel enclosed while keeping the center jump lane open.',
  'violet-inlet': 'A winding inlet and violet distance add storybook atmosphere, with shoreline silhouettes limited to the edges.',
  'mirror-ice': 'An uninterrupted blue ice sheet and broad glacier shoulders make the lake unmistakable.',
  'fir-shore': 'A dark fir belt gives the lake a wooded sense of place while keeping the ice open.',
  'rose-dawn': 'A warmer sunrise palette and blue ice test a gentler, less monochrome winter mood.',
  'polar-gap': 'Tall ice cliffs frame a distant gap for the most dramatic, enclosed composition.',
  'polar-open': 'Lower cliffs and a wide opening give characters and the lake more breathing room.',
  'polar-stepped': 'Tiered glacier walls emphasize carved ice and a deep, sheltered lake.',
  'polar-offset': 'One high wall and one low shelf lead the eye through a diagonal opening.',
  'polar-alpenglow': 'The original angular frame with warm light on the snow and cool ice below.',
  'polar-soft-shoulders': 'Low rounded snow banks retain Open Pass breathing room without pointed cliff edges.',
  'polar-high-bluffs': 'Taller rounded hills keep the gap dramatic while replacing sharp ice peaks.',
  'polar-uneven-shore': 'One broad high hill and one low bank create a gentler asymmetric pass.',
  'polar-powder-bank': 'Pale, uneven snow mounds with scattered powder texture.',
  'polar-wind-carved': 'Gentle asymmetric shores with thin wind-swept snow lines.',
  'polar-frost-shelves': 'Irregular rounded slopes with translucent layers of old snow and ice.',
  'polar-pearl-shore': 'A warmer pearl-colored snowbank with sparse soft patches.',
  'polar-silver-banks': 'Neutral silver snow banks contrast with a cooler blue lake.',
  'polar-lilac-snow': 'A soft violet shore frames turquoise ice with a wide, flat pass.',
  'polar-deep-ice': 'Low pale banks leave room for a bluer frozen lake to define the place.',
  'polar-warm-drift': 'Warm ivory snow and a cool lake separate the two surfaces gently.',
  'polar-silver-banks-before': 'The first Silver Banks study, retained for the bank-corner and texture comparison.',
  'polar-silver-frostwork': 'The smoothed Silver Banks shape with stronger clustered frost and branching ice seams.',
  'polar-silver-inked': 'Refined Silver Banks with hand-inked contours, hatch marks, and storybook ice.',
  'polar-silver-gouache': 'Refined Silver Banks with grainy painted snow and cloudy layered ice.',
  'polar-silver-comic': 'Refined Silver Banks with bolder cel-shaded forms and lively ice marks.',
  'polar-silver-painted': 'Painted backdrop concept composited under the exact production platforms and characters.',
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
  'mirror-ice': [
    { offset: 0, color: '#344E75' }, { offset: .43, color: '#688EAF' },
    { offset: .78, color: '#B5CFD8' }, { offset: 1, color: '#D5E7E8' },
  ],
  'fir-shore': [
    { offset: 0, color: '#445777' }, { offset: .43, color: '#7F9AAA' },
    { offset: .78, color: '#B8CBC9' }, { offset: 1, color: '#DDE1D7' },
  ],
  'rose-dawn': [
    { offset: 0, color: '#655978' }, { offset: .39, color: '#A98FA6' },
    { offset: .75, color: '#DCC0BC' }, { offset: 1, color: '#E6D6D2' },
  ],
  'polar-gap': [
    { offset: 0, color: '#334967' }, { offset: .43, color: '#6C8CA4' },
    { offset: .78, color: '#B3CCD0' }, { offset: 1, color: '#D8E4E3' },
  ],
  'polar-open': [
    { offset: 0, color: '#3B5474' }, { offset: .43, color: '#7A9BAD' },
    { offset: .78, color: '#BDD1D3' }, { offset: 1, color: '#DFE7E2' },
  ],
  'polar-stepped': [
    { offset: 0, color: '#30476A' }, { offset: .43, color: '#6C90AA' },
    { offset: .78, color: '#B0CDD7' }, { offset: 1, color: '#D6E4E8' },
  ],
  'polar-offset': [
    { offset: 0, color: '#3B4C72' }, { offset: .43, color: '#7B8EAD' },
    { offset: .78, color: '#B8C8D3' }, { offset: 1, color: '#DBDEE0' },
  ],
  'polar-alpenglow': [
    { offset: 0, color: '#545476' }, { offset: .43, color: '#A48DA7' },
    { offset: .78, color: '#D1B7BB' }, { offset: 1, color: '#DFD4D4' },
  ],
  'polar-soft-shoulders': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-high-bluffs': [
    { offset: 0, color: '#354C70' }, { offset: .43, color: '#7896AD' },
    { offset: .78, color: '#B7CCD4' }, { offset: 1, color: '#DAE5E6' },
  ],
  'polar-uneven-shore': [
    { offset: 0, color: '#425574' }, { offset: .43, color: '#8599B2' },
    { offset: .78, color: '#C5CDD5' }, { offset: 1, color: '#E0E2DF' },
  ],
  'polar-powder-bank': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-wind-carved': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-frost-shelves': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-pearl-shore': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-banks': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-lilac-snow': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-deep-ice': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-warm-drift': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-banks-before': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-frostwork': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-inked': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-gouache': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-comic': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
  'polar-silver-painted': [
    { offset: 0, color: '#3D5573' }, { offset: .43, color: '#7E9AAD' },
    { offset: .78, color: '#BCD0D3' }, { offset: 1, color: '#DFE6E1' },
  ],
};

function polygon(ctx: Ctx2D, color: string, points: readonly Point[]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

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

function mirrorIce(ctx: Ctx2D): void {
  // Two broad glacier shoulders leave the upper middle open for jumping.
  polygon(ctx, '#91B3C2', [[-20, 560], [-20, 405], [100, 420], [225, 339], [315, 395], [405, 365], [550, 510], [630, 560]]);
  polygon(ctx, '#AAC8D0', [[120, 421], [225, 339], [315, 395], [249, 387], [200, 419]]);
  polygon(ctx, '#799FB2', [[-20, 560], [145, 481], [290, 499], [410, 451], [630, 560]]);
  polygon(ctx, '#9DBFCC', [[665, 560], [790, 453], [905, 382], [1040, 404], [1150, 346], [1300, 427], [1300, 560]]);
  polygon(ctx, '#C0D8DC', [[902, 385], [1150, 346], [1300, 427], [1140, 389], [1046, 425]]);
  polygon(ctx, '#779DB0', [[665, 560], [810, 495], [944, 506], [1130, 463], [1300, 520], [1300, 560]]);
  band(ctx, '#6B97AD', [[-20, 548], [175, 525], [410, 546], [630, 533], [815, 548], [1055, 521], [1300, 551]]);
  icePlane(ctx, [[-20, 542], [175, 537], [360, 548], [570, 541], [775, 548], [1000, 536], [1300, 547]], '#93CAD6', 'rgba(42, 120, 158, 0.42)');
  polygon(ctx, 'rgba(224, 247, 248, 0.28)', [[110, 586], [510, 566], [683, 579], [280, 605]]);
  polygon(ctx, 'rgba(238, 250, 249, 0.22)', [[745, 611], [1110, 571], [1240, 580], [905, 625]]);
}

function firShore(ctx: Ctx2D): void {
  band(ctx, '#9EB5B7', [[-20, 420], [165, 380], [322, 425], [490, 367], [680, 418], [870, 373], [1030, 432], [1300, 391]]);
  band(ctx, '#809EA5', [[-20, 495], [220, 448], [410, 480], [660, 437], [875, 486], [1065, 441], [1300, 475]]);
  // The forest has one connected mass rather than a sawtooth of tiny trees.
  band(ctx, '#607E82', [[-20, 549], [110, 513], [230, 535], [360, 500], [475, 527], [610, 510], [740, 532], [855, 501], [980, 528], [1115, 505], [1300, 539]]);
  for (const [x, y, h] of [[34, 531, 30], [116, 510, 38], [184, 522, 27], [313, 510, 41], [429, 511, 28], [796, 515, 30], [901, 510, 43], [1002, 511, 25], [1136, 514, 36], [1220, 522, 28]] as const) {
    pine(ctx, x, y, h, '#527278');
  }
  icePlane(ctx, [[-20, 574], [190, 554], [390, 565], [590, 553], [790, 568], [1000, 550], [1300, 566]], '#B3D0D0', 'rgba(83, 133, 148, 0.35)');
}

function roseDawn(ctx: Ctx2D): void {
  band(ctx, '#B3AABC', [[-20, 451], [165, 412], [336, 458], [520, 399], [705, 436], [855, 399], [1040, 449], [1300, 408]]);
  band(ctx, '#858FAA', [[-20, 525], [145, 475], [345, 499], [545, 451], [735, 489], [960, 453], [1170, 499], [1300, 477]]);
  // A cool shaded shore preserves the warm sky / cold lake separation.
  band(ctx, '#708FA6', [[-20, 560], [175, 536], [335, 553], [510, 520], [690, 545], [880, 523], [1085, 550], [1300, 534]]);
  icePlane(ctx, [[-20, 594], [185, 574], [375, 581], [560, 567], [760, 581], [940, 569], [1120, 575], [1300, 564]], '#AACBD7', 'rgba(74, 130, 168, 0.34)');
  polygon(ctx, 'rgba(255, 236, 220, 0.16)', [[455, 584], [665, 572], [746, 585], [530, 602]]);
}

function polarGap(ctx: Ctx2D): void {
  band(ctx, '#A8C5CF', [[-20, 480], [220, 454], [420, 476], [620, 436], [840, 475], [1030, 441], [1300, 478]]);
  // Broken ice walls frame the center without painting across the main jump lane.
  polygon(ctx, '#668FA7', [[-20, 630], [-20, 311], [82, 362], [145, 350], [220, 404], [298, 390], [377, 500], [487, 547], [560, 630]]);
  polygon(ctx, '#91B8C6', [[-20, 311], [82, 362], [145, 350], [121, 399], [47, 377], [-20, 402]]);
  polygon(ctx, '#527B96', [[-20, 630], [155, 485], [285, 501], [377, 557], [560, 630]]);
  polygon(ctx, '#648CA2', [[730, 630], [829, 514], [914, 407], [1007, 378], [1090, 332], [1200, 360], [1300, 308], [1300, 630]]);
  polygon(ctx, '#A1C2CD', [[914, 407], [1007, 378], [1090, 332], [1200, 360], [1300, 308], [1300, 390], [1190, 399], [1095, 372], [989, 425]]);
  polygon(ctx, '#4F7790', [[730, 630], [853, 530], [992, 493], [1144, 506], [1300, 466], [1300, 630]]);
  icePlane(ctx, [[-20, 645], [185, 593], [355, 568], [530, 546], [720, 548], [890, 560], [1080, 591], [1300, 638]], '#AED0D5', 'rgba(64, 129, 153, 0.37)');
}

function polarOpen(ctx: Ctx2D): void {
  band(ctx, '#A9C5CE', [[-20, 475], [230, 442], [440, 478], [640, 435], [825, 476], [1050, 444], [1300, 470]]);
  polygon(ctx, '#749AAB', [[-20, 620], [-20, 407], [95, 431], [181, 418], [275, 481], [375, 497], [500, 555], [535, 620]]);
  polygon(ctx, '#B2CFD1', [[-20, 407], [95, 431], [181, 418], [275, 481], [171, 456], [98, 468], [-20, 443]]);
  polygon(ctx, '#567D96', [[-20, 620], [125, 506], [310, 514], [500, 620]]);
  polygon(ctx, '#7295A9', [[745, 620], [876, 543], [1000, 466], [1085, 447], [1180, 419], [1300, 434], [1300, 620]]);
  polygon(ctx, '#B8CFD3', [[1000, 466], [1085, 447], [1180, 419], [1300, 434], [1300, 469], [1182, 460], [1095, 482]]);
  polygon(ctx, '#547A95', [[745, 620], [934, 520], [1126, 526], [1300, 494], [1300, 620]]);
  icePlane(ctx, [[-20, 620], [175, 579], [365, 555], [545, 541], [720, 542], [900, 555], [1095, 578], [1300, 620]], '#B4D2D3', 'rgba(72, 129, 153, 0.34)');
}

function polarStepped(ctx: Ctx2D): void {
  band(ctx, '#9EBECD', [[-20, 493], [230, 467], [435, 490], [650, 451], [840, 484], [1060, 452], [1300, 485]]);
  polygon(ctx, '#648AA5', [[-20, 650], [-20, 323], [126, 344], [126, 408], [240, 408], [240, 468], [355, 468], [445, 547], [540, 650]]);
  polygon(ctx, '#B1CBD2', [[-20, 323], [126, 344], [126, 367], [227, 382], [240, 408], [126, 408], [126, 385], [-20, 370]]);
  polygon(ctx, '#83ADC0', [[126, 408], [240, 408], [240, 432], [351, 448], [355, 468], [240, 468], [240, 451], [126, 447]]);
  polygon(ctx, '#456F8D', [[-20, 650], [126, 438], [240, 490], [355, 488], [540, 650]]);
  polygon(ctx, '#5C83A0', [[740, 650], [829, 540], [895, 465], [1000, 465], [1000, 400], [1105, 400], [1105, 345], [1218, 345], [1300, 310], [1300, 650]]);
  polygon(ctx, '#ABCBD3', [[895, 465], [1000, 465], [1000, 441], [1105, 422], [1105, 400], [1218, 400], [1218, 368], [1300, 345], [1300, 402], [1218, 422], [1105, 446], [1000, 486]]);
  polygon(ctx, '#3F6B88', [[740, 650], [918, 510], [1058, 525], [1218, 458], [1300, 460], [1300, 650]]);
  icePlane(ctx, [[-20, 654], [190, 610], [365, 577], [540, 555], [730, 556], [900, 578], [1085, 611], [1300, 654]], '#A3CAD5', 'rgba(54, 126, 160, 0.38)');
}

function polarOffset(ctx: Ctx2D): void {
  band(ctx, '#ACBCD0', [[-20, 469], [205, 429], [416, 465], [630, 414], [850, 454], [1050, 423], [1300, 459]]);
  polygon(ctx, '#6C819F', [[-20, 685], [-20, 293], [88, 321], [174, 307], [260, 382], [320, 369], [410, 474], [535, 532], [690, 656]]);
  polygon(ctx, '#A7BED0', [[-20, 293], [88, 321], [174, 307], [260, 382], [166, 347], [77, 361], [-20, 339]]);
  polygon(ctx, '#4B6C8B', [[-20, 685], [156, 451], [311, 470], [470, 570], [690, 656]]);
  polygon(ctx, '#8099B0', [[785, 660], [935, 548], [1050, 499], [1145, 471], [1300, 489], [1300, 660]]);
  polygon(ctx, '#C1D2DA', [[1030, 509], [1145, 471], [1300, 489], [1300, 520], [1155, 502]]);
  polygon(ctx, '#5F829C', [[785, 660], [988, 569], [1175, 556], [1300, 552], [1300, 660]]);
  icePlane(ctx, [[-20, 670], [170, 635], [355, 603], [540, 569], [725, 550], [910, 547], [1110, 553], [1300, 563]], '#B7CEDA', 'rgba(78, 119, 151, 0.36)');
}

function polarAlpenglow(ctx: Ctx2D): void {
  band(ctx, '#B4AEBE', [[-20, 485], [210, 452], [420, 480], [640, 430], [860, 472], [1055, 438], [1300, 480]]);
  polygon(ctx, '#8B89AB', [[-20, 635], [-20, 323], [90, 358], [158, 339], [252, 403], [312, 397], [404, 508], [560, 635]]);
  polygon(ctx, '#D6BFC7', [[-20, 323], [90, 358], [158, 339], [252, 403], [157, 374], [82, 391], [-20, 371]]);
  polygon(ctx, '#697996', [[-20, 635], [162, 487], [320, 508], [560, 635]]);
  polygon(ctx, '#8F8FAE', [[735, 635], [846, 513], [934, 401], [1020, 380], [1092, 340], [1204, 363], [1300, 315], [1300, 635]]);
  polygon(ctx, '#E0C8CB', [[934, 401], [1020, 380], [1092, 340], [1204, 363], [1300, 315], [1300, 396], [1200, 399], [1096, 375], [1008, 427]]);
  polygon(ctx, '#637995', [[735, 635], [850, 526], [995, 503], [1140, 516], [1300, 469], [1300, 635]]);
  icePlane(ctx, [[-20, 646], [185, 596], [355, 568], [535, 546], [720, 548], [895, 561], [1080, 594], [1300, 640]], '#B2CFDA', 'rgba(92, 123, 159, 0.36)');
}

function roundedBank(
  ctx: Ctx2D, side: 'left' | 'right', topY: number, innerX: number,
  face: string, shadow: string, snow: string,
): void {
  ctx.save();
  if (side === 'right') { ctx.translate(1280, 0); ctx.scale(-1, 1); }
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.moveTo(-40, 720);
  ctx.lineTo(-40, topY + 25);
  ctx.bezierCurveTo(65, topY - 15, 165, topY - 13, 235, topY + 12);
  ctx.bezierCurveTo(325, topY + 45, innerX - 55, 518, innerX, 583);
  ctx.bezierCurveTo(innerX + 30, 630, innerX + 55, 666, innerX + 65, 720);
  ctx.closePath();
  ctx.fill();

  // A broad curved snow cap follows the hill instead of making another peak.
  ctx.fillStyle = snow;
  ctx.beginPath();
  ctx.moveTo(-40, topY + 25);
  ctx.bezierCurveTo(65, topY - 15, 165, topY - 13, 235, topY + 12);
  ctx.bezierCurveTo(325, topY + 45, innerX - 55, 518, innerX, 583);
  ctx.bezierCurveTo(innerX - 58, 541, 316, topY + 91, 228, topY + 55);
  ctx.bezierCurveTo(145, topY + 20, 60, topY + 31, -40, topY + 67);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.moveTo(-40, 720);
  ctx.lineTo(-40, topY + 129);
  ctx.bezierCurveTo(95, topY + 91, 192, topY + 117, 289, topY + 145);
  ctx.bezierCurveTo(innerX - 26, 579, innerX + 17, 633, innerX + 65, 720);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function polarSoftShoulders(ctx: Ctx2D): void {
  band(ctx, '#A9C4CC', [[-20, 484], [205, 452], [420, 478], [640, 443], [865, 476], [1080, 450], [1300, 482]]);
  roundedBank(ctx, 'left', 424, 470, '#7B9DAA', '#577E92', '#B9D2D3');
  roundedBank(ctx, 'right', 421, 470, '#789AAA', '#537B91', '#BED4D5');
  icePlane(ctx, [[-20, 625], [165, 586], [345, 558], [535, 544], [725, 545], [930, 558], [1110, 585], [1300, 624]], '#B3D2D5', 'rgba(71, 128, 152, 0.34)');
}

function polarHighBluffs(ctx: Ctx2D): void {
  band(ctx, '#A3BFCA', [[-20, 487], [220, 451], [445, 480], [655, 437], [865, 478], [1080, 447], [1300, 483]]);
  roundedBank(ctx, 'left', 354, 535, '#7395A8', '#486F89', '#BAD2D8');
  roundedBank(ctx, 'right', 361, 525, '#7496A8', '#4A718B', '#C4D8DC');
  icePlane(ctx, [[-20, 654], [195, 608], [385, 574], [555, 552], [730, 552], [905, 575], [1090, 608], [1300, 654]], '#A7CCD5', 'rgba(62, 127, 157, 0.36)');
}

function polarUnevenShore(ctx: Ctx2D): void {
  band(ctx, '#A8B9C9', [[-20, 479], [220, 447], [440, 474], [650, 425], [875, 466], [1070, 441], [1300, 479]]);
  roundedBank(ctx, 'left', 356, 575, '#7C8FAB', '#546F8F', '#CBD2DC');
  roundedBank(ctx, 'right', 446, 420, '#869FB3', '#637F99', '#D4DDE0');
  icePlane(ctx, [[-20, 655], [165, 624], [370, 587], [575, 555], [780, 545], [1000, 551], [1300, 571]], '#B6D0D8', 'rgba(91, 129, 159, 0.34)');
}

type BankTexture = 'powder' | 'wind' | 'shelves' | 'patches';

function irregularBank(
  ctx: Ctx2D, ridge: readonly Point[], face: string, lower: string,
  texture: BankTexture, seed: number,
): void {
  const first = ridge[0];
  const last = ridge[ridge.length - 1];
  const minX = first[0];
  const maxX = last[0];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < ridge.length; i++) {
    const [px, py] = ridge[i - 1];
    const [x, y] = ridge[i];
    ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
  }
  ctx.lineTo(last[0], last[1]);
  ctx.lineTo(maxX, 720);
  ctx.lineTo(minX, 720);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 380, 0, 690);
  fill.addColorStop(0, face);
  fill.addColorStop(1, lower);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();

  // The ridge is lit, but the texture stays far below the contrast of platforms.
  ctx.strokeStyle = 'rgba(237, 247, 245, 0.30)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1] + 3);
  for (let i = 1; i < ridge.length; i++) {
    const [px, py] = ridge[i - 1];
    const [x, y] = ridge[i];
    ctx.quadraticCurveTo(px, py + 3, (px + x) / 2, (py + y) / 2 + 3);
  }
  ctx.stroke();

  if (texture === 'powder' || texture === 'patches') {
    for (let i = 0; i < (texture === 'powder' ? 42 : 12); i++) {
      const x = minX + 18 + ((i * 97 + seed * 53) % Math.max(1, maxX - minX - 36));
      const y = 455 + ((i * 61 + seed * 29) % 175);
      const w = texture === 'powder' ? 2 + i % 3 : 12 + i % 4 * 8;
      ctx.fillStyle = texture === 'powder'
        ? 'rgba(240, 248, 246, 0.34)' : 'rgba(236, 246, 241, 0.18)';
      ctx.beginPath();
      ctx.ellipse(x, y, w, texture === 'powder' ? 1.5 : 4, -.12, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const count = texture === 'wind' ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const x = minX + 18 + (i * 83 + seed * 39) % Math.max(1, maxX - minX - 128);
      const y = 460 + i * (texture === 'wind' ? 27 : 43) + seed % 11;
      ctx.strokeStyle = texture === 'wind'
        ? 'rgba(234, 247, 246, 0.28)' : 'rgba(219, 241, 243, 0.35)';
      ctx.lineWidth = texture === 'wind' ? 2 : 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 30, y - 6, x + 78, y + 6, x + 105, y - 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function traceLakeShore(ctx: Ctx2D, shore: readonly Point[]): void {
  ctx.moveTo(shore[0][0], shore[0][1]);
  for (let i = 1; i < shore.length; i++) {
    const [px, py] = shore[i - 1];
    const [x, y] = shore[i];
    ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
  }
  ctx.lineTo(shore[shore.length - 1][0], shore[shore.length - 1][1]);
}

function organicLake(
  ctx: Ctx2D, shore: readonly Point[], seed: number,
  color: string, detail: 'frost' | 'veins' | 'snow',
): void {
  ctx.save();
  ctx.beginPath();
  traceLakeShore(ctx, shore);
  ctx.lineTo(1300, 720);
  ctx.lineTo(-20, 720);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.clip();

  // Broad, interrupted patches suggest frozen water under dusted snow.
  for (let i = 0; i < 9; i++) {
    const x = 65 + (i * 173 + seed * 61) % 1180;
    const y = 565 + (i * 71 + seed * 17) % 95;
    ctx.fillStyle = i % 3 === 0
      ? 'rgba(91, 150, 168, 0.10)' : 'rgba(239, 249, 247, 0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y, 34 + (i % 4) * 17, 4 + i % 3 * 2, -.08 + i % 3 * .08, 0, Math.PI * 2);
    ctx.fill();
  }

  const seamCount = detail === 'veins' ? 7 : detail === 'frost' ? 5 : 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < seamCount; i++) {
    const x = 65 + (i * 229 + seed * 47) % 1000;
    const y = 588 + (i * 59 + seed * 13) % 70;
    ctx.strokeStyle = detail === 'snow'
      ? 'rgba(238, 249, 247, 0.20)' : 'rgba(77, 134, 157, 0.20)';
    ctx.lineWidth = detail === 'veins' ? 1.5 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 25, y - 7, x + 46, y + 5, x + 69, y - 4);
    ctx.bezierCurveTo(x + 87, y - 7, x + 99, y + 1, x + 116, y - 2);
    ctx.stroke();
  }
  ctx.restore();

  // Only fragments of the snowy waterline catch the light.
  ctx.save();
  ctx.strokeStyle = 'rgba(238, 248, 246, 0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([81, 46, 17, 71, 49, 63]);
  ctx.beginPath();
  traceLakeShore(ctx, shore);
  ctx.stroke();
  ctx.restore();
}

function polarPowderBank(ctx: Ctx2D): void {
  band(ctx, '#B5CCD1', [[-20, 483], [185, 455], [385, 477], [610, 451], [825, 475], [1040, 448], [1300, 481]]);
  irregularBank(ctx, [[-20, 434], [95, 411], [185, 431], [285, 409], [385, 476], [510, 560]], '#C8DCDB', '#ACC8CE', 'powder', 1);
  irregularBank(ctx, [[775, 561], [862, 518], [953, 457], [1052, 441], [1150, 421], [1243, 439], [1300, 429]], '#C4D9D9', '#A9C5CD', 'powder', 4);
  organicLake(ctx, [[-20, 625], [128, 611], [239, 585], [325, 575], [429, 563], [552, 568], [650, 537], [762, 554], [874, 566], [962, 575], [1075, 583], [1190, 599], [1300, 607]], 2, '#B3D2D5', 'snow');
}

function polarWindCarved(ctx: Ctx2D): void {
  band(ctx, '#B2CBD2', [[-20, 484], [225, 461], [420, 480], [640, 444], [890, 473], [1125, 453], [1300, 481]]);
  irregularBank(ctx, [[-20, 425], [85, 421], [181, 438], [272, 418], [360, 455], [470, 540]], '#BFD5D7', '#A4C1CA', 'wind', 2);
  irregularBank(ctx, [[759, 561], [862, 515], [965, 474], [1060, 458], [1155, 448], [1240, 425], [1300, 432]], '#C4D9DB', '#ACC8CF', 'wind', 7);
  organicLake(ctx, [[-20, 614], [125, 604], [215, 585], [320, 575], [448, 574], [545, 548], [671, 569], [769, 535], [859, 560], [965, 576], [1085, 584], [1201, 590], [1300, 616]], 5, '#AED0D5', 'frost');
}

function polarFrostShelves(ctx: Ctx2D): void {
  band(ctx, '#B5CDD3', [[-20, 483], [205, 459], [412, 476], [625, 451], [865, 474], [1075, 445], [1300, 482]]);
  irregularBank(ctx, [[-20, 450], [78, 419], [163, 427], [249, 438], [340, 432], [420, 493], [525, 566]], '#B9D4DB', '#9FC4CE', 'shelves', 3);
  irregularBank(ctx, [[760, 562], [852, 533], [945, 486], [1018, 457], [1092, 471], [1190, 433], [1300, 442]], '#C3D9DE', '#A9C9D2', 'shelves', 8);
  organicLake(ctx, [[-20, 628], [105, 605], [212, 591], [345, 572], [454, 568], [559, 536], [668, 567], [783, 550], [901, 565], [1024, 577], [1130, 594], [1210, 590], [1300, 608]], 7, '#ADD0D8', 'veins');
}

function polarPearlShore(ctx: Ctx2D): void {
  band(ctx, '#BBCDD0', [[-20, 484], [220, 455], [440, 480], [640, 449], [850, 475], [1075, 452], [1300, 481]]);
  irregularBank(ctx, [[-20, 443], [75, 436], [155, 414], [248, 419], [340, 463], [420, 500], [510, 565]], '#D6DDD9', '#B6CDCF', 'patches', 6);
  irregularBank(ctx, [[777, 560], [869, 521], [942, 499], [1032, 465], [1110, 455], [1195, 465], [1300, 436]], '#D0DBDA', '#B4CDCF', 'patches', 9);
  organicLake(ctx, [[-20, 620], [115, 602], [225, 594], [339, 572], [446, 570], [568, 573], [671, 540], [805, 554], [921, 567], [1038, 571], [1149, 587], [1300, 609]], 4, '#BBD4D5', 'snow');
}

interface WindStudy {
  far: string;
  left: readonly Point[];
  right: readonly Point[];
  leftSnow: string;
  leftBase: string;
  rightSnow: string;
  rightBase: string;
  shore: readonly Point[];
  lake: string;
  seed: number;
}

function windStudy(ctx: Ctx2D, study: WindStudy): void {
  band(ctx, study.far, [[-20, 484], [225, 461], [420, 480], [640, 444], [890, 473], [1125, 453], [1300, 481]]);
  irregularBank(ctx, study.left, study.leftSnow, study.leftBase, 'wind', study.seed);
  irregularBank(ctx, study.right, study.rightSnow, study.rightBase, 'wind', study.seed + 5);
  organicLake(ctx, study.shore, study.seed + 3, study.lake, 'frost');
}

function polarSilverBanksBefore(ctx: Ctx2D): void {
  windStudy(ctx, {
    far: '#A9BCC7',
    left: [[-20, 434], [75, 427], [175, 433], [275, 420], [367, 466], [476, 548]],
    right: [[758, 560], [850, 525], [954, 469], [1051, 453], [1164, 447], [1251, 429], [1300, 437]],
    leftSnow: '#D5DCDB', leftBase: '#B8CACC',
    rightSnow: '#D0DAD9', rightBase: '#B4C8CB',
    shore: [[-20, 620], [130, 604], [245, 588], [366, 574], [480, 562], [593, 558], [702, 559], [818, 558], [928, 570], [1045, 581], [1170, 600], [1300, 615]],
    lake: '#9FC6D0', seed: 2,
  });
}

const silverLeftRidge: readonly Point[] = [
  [-20, 434], [75, 427], [175, 433], [275, 420],
  [362, 466], [438, 525], [497, 553], [554, 564], [620, 567],
];
const silverRightRidge: readonly Point[] = [
  [722, 566], [767, 562], [850, 525], [954, 469],
  [1051, 453], [1164, 447], [1251, 429], [1300, 437],
];
const silverLakeShore: readonly Point[] = [
  [-20, 620], [130, 604], [245, 588], [366, 574],
  [480, 562], [593, 558], [702, 559], [818, 558],
  [928, 570], [1045, 581], [1170, 600], [1300, 615],
];

function silverBankLayers(ctx: Ctx2D, ridge: readonly Point[], side: 'left' | 'right', frostwork: boolean): void {
  const first = ridge[0];
  const last = ridge[ridge.length - 1];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < ridge.length; i++) {
    const [px, py] = ridge[i - 1];
    const [x, y] = ridge[i];
    ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
  }
  ctx.lineTo(last[0], last[1]);
  ctx.lineTo(last[0], 720);
  ctx.lineTo(first[0], 720);
  ctx.closePath();
  ctx.clip();

  const shift = side === 'left' ? 0 : 780;
  ctx.fillStyle = 'rgba(246, 250, 246, 0.14)';
  ctx.beginPath();
  ctx.moveTo(shift - 30, 470);
  ctx.bezierCurveTo(shift + 65, 452, shift + 126, 471, shift + 204, 456);
  ctx.bezierCurveTo(shift + 273, 447, shift + 338, 475, shift + 415, 478);
  ctx.bezierCurveTo(shift + 317, 492, shift + 250, 470, shift + 190, 483);
  ctx.bezierCurveTo(shift + 106, 495, shift + 41, 478, shift - 30, 500);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(104, 153, 163, 0.10)';
  ctx.beginPath();
  ctx.moveTo(shift + 5, 532);
  ctx.bezierCurveTo(shift + 111, 513, shift + 191, 542, shift + 255, 526);
  ctx.bezierCurveTo(shift + 318, 510, shift + 383, 537, shift + 450, 556);
  ctx.bezierCurveTo(shift + 359, 545, shift + 287, 551, shift + 211, 550);
  ctx.bezierCurveTo(shift + 115, 552, shift + 52, 542, shift + 5, 555);
  ctx.closePath();
  ctx.fill();

  // Curved layers follow the wind direction rather than dividing the bank into straight stripes.
  for (let i = 0; i < 3; i++) {
    const y = 461 + i * 37 + (side === 'right' ? 17 : 0);
    ctx.strokeStyle = i === 1 ? 'rgba(119, 157, 163, 0.19)' : 'rgba(248, 251, 247, 0.29)';
    ctx.lineWidth = frostwork ? 6 - i : 4 - i * .6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shift + 28 + i * 15, y);
    ctx.bezierCurveTo(shift + 95, y - 12, shift + 155, y + 9, shift + 230, y - 3);
    ctx.bezierCurveTo(shift + 275, y - 9, shift + 322, y + 5, shift + 378, y + 13);
    ctx.stroke();
  }

  // Sparse, uneven frost flecks break up the smooth fill without competing with platforms.
  const count = frostwork ? 23 : 13;
  for (let i = 0; i < count; i++) {
    const x = first[0] + 42 + (i * 79 + (side === 'right' ? 29 : 7)) % Math.max(1, last[0] - first[0] - 85);
    const y = 463 + (i * 57 + (side === 'right' ? 17 : 3)) % 133;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(125, 165, 169, 0.16)' : 'rgba(246, 251, 247, 0.31)';
    ctx.beginPath();
    ctx.ellipse(x, y, frostwork ? 3 + i % 4 : 2 + i % 3, 1.2 + i % 2, -.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function silverLakeDetails(ctx: Ctx2D, frostwork: boolean): void {
  ctx.save();
  ctx.beginPath();
  traceLakeShore(ctx, silverLakeShore);
  ctx.lineTo(1300, 720);
  ctx.lineTo(-20, 720);
  ctx.closePath();
  ctx.clip();

  // Clouded plates have uneven edges and sit below the crisp playfield art.
  for (const [x, y, w] of [[120, 627, 210], [413, 610, 240], [705, 621, 190], [953, 608, 220]] as const) {
    ctx.fillStyle = frostwork ? 'rgba(239, 250, 248, 0.13)' : 'rgba(239, 250, 248, 0.10)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + w * .22, y - 11, x + w * .35, y + 3, x + w * .55, y - 5);
    ctx.bezierCurveTo(x + w * .76, y - 8, x + w * .86, y + 2, x + w, y - 2);
    ctx.bezierCurveTo(x + w * .72, y + 9, x + w * .28, y + 11, x, y);
    ctx.fill();
  }

  const seams = frostwork
    ? [[173, 638, 125], [350, 622, 163], [565, 640, 140], [820, 610, 157], [1000, 641, 118]] as const
    : [[186, 637, 115], [503, 632, 148], [850, 617, 136]] as const;
  ctx.strokeStyle = 'rgba(67, 130, 151, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const [x, y, length] of seams) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + length * .28, y - 11, x + length * .48, y + 6, x + length * .72, y - 2);
    ctx.quadraticCurveTo(x + length * .86, y - 6, x + length, y - 1);
    ctx.stroke();
    if (frostwork) {
      ctx.beginPath();
      ctx.moveTo(x + length * .48, y + 2);
      ctx.quadraticCurveTo(x + length * .58, y + 11, x + length * .69, y + 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

type CartoonStyle = 'inked' | 'gouache' | 'comic';

function traceSilverBank(ctx: Ctx2D, ridge: readonly Point[]): void {
  ctx.moveTo(ridge[0][0], ridge[0][1]);
  for (let i = 1; i < ridge.length; i++) {
    const [px, py] = ridge[i - 1];
    const [x, y] = ridge[i];
    ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
  }
  ctx.lineTo(ridge[ridge.length - 1][0], ridge[ridge.length - 1][1]);
}

function silverRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function cartoonBank(ctx: Ctx2D, ridge: readonly Point[], side: 'left' | 'right', style: CartoonStyle): void {
  const first = ridge[0];
  const last = ridge[ridge.length - 1];
  ctx.save();
  ctx.beginPath();
  traceSilverBank(ctx, ridge);
  if (style !== 'gouache') {
    ctx.strokeStyle = style === 'comic' ? 'rgba(57, 83, 101, 0.72)' : 'rgba(70, 98, 112, 0.55)';
    ctx.lineWidth = style === 'comic' ? 4 : 2.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.lineTo(last[0], 720);
  ctx.lineTo(first[0], 720);
  ctx.closePath();
  ctx.clip();

  const left = side === 'left';
  const offset = left ? 0 : 780;
  if (style === 'comic') {
    ctx.fillStyle = 'rgba(101, 145, 163, 0.24)';
    ctx.beginPath();
    ctx.moveTo(offset - 20, 550);
    ctx.bezierCurveTo(offset + 68, 507, offset + 174, 529, offset + 265, 513);
    ctx.bezierCurveTo(offset + 342, 504, offset + 412, 542, offset + 485, 554);
    ctx.lineTo(offset + 530, 675);
    ctx.lineTo(offset - 20, 675);
    ctx.closePath();
    ctx.fill();
  }

  if (style === 'gouache') {
    const random = silverRandom(left ? 1284 : 8207);
    for (let i = 0; i < 260; i++) {
      const x = first[0] + random() * (last[0] - first[0]);
      const y = 428 + random() * 204;
      const w = 3 + random() * 19;
      const h = 1.1 + random() * 4.2;
      ctx.fillStyle = i % 5 < 3 ? 'rgba(247, 251, 248, 0.11)' : 'rgba(103, 151, 165, 0.09)';
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, (random() - .5) * .35, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const hatchCount = style === 'comic' ? 11 : 19;
    ctx.strokeStyle = style === 'comic' ? 'rgba(65, 100, 116, 0.35)' : 'rgba(77, 112, 126, 0.28)';
    ctx.lineWidth = style === 'comic' ? 2.2 : 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < hatchCount; i++) {
      const x = offset + 34 + (i * 89 + (left ? 9 : 47)) % 392;
      const y = 461 + (i * 47 + (left ? 11 : 29)) % 139;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 11, y - 4, x + 22 + i % 4 * 4, y - 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function cartoonLake(ctx: Ctx2D, style: CartoonStyle): void {
  ctx.save();
  ctx.beginPath();
  traceLakeShore(ctx, silverLakeShore);
  ctx.lineTo(1300, 720);
  ctx.lineTo(-20, 720);
  ctx.closePath();
  ctx.clip();

  if (style === 'gouache') {
    const random = silverRandom(46181);
    for (let i = 0; i < 360; i++) {
      const x = -10 + random() * 1300;
      const y = 557 + random() * 115;
      const w = 2.5 + random() * 19;
      ctx.fillStyle = i % 6 < 4 ? 'rgba(224, 247, 246, 0.095)' : 'rgba(64, 130, 157, 0.085)';
      ctx.beginPath();
      ctx.ellipse(x, y, w, 1 + random() * 3, (random() - .5) * .22, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = style === 'comic' ? 'rgba(62, 114, 137, 0.46)' : 'rgba(64, 113, 134, 0.31)';
    ctx.lineWidth = style === 'comic' ? 3.3 : 1.8;
    ctx.lineCap = 'round';
    for (const [x, y, length] of [[80, 627, 148], [352, 610, 124], [632, 632, 192], [936, 618, 155]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length * .29, y - 8, x + length * .54, y + 6, x + length, y - 3);
      ctx.stroke();
    }
    // Short offshoots make the ice marks feel drawn rather than stamped ellipses.
    for (const [x, y] of [[168, 622], [420, 607], [746, 626], [1032, 612]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 8, y + 9, x + 18, y + 12);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (style !== 'gouache') {
    ctx.save();
    ctx.beginPath();
    traceLakeShore(ctx, silverLakeShore);
    ctx.strokeStyle = style === 'comic' ? 'rgba(61, 100, 119, 0.58)' : 'rgba(71, 110, 126, 0.40)';
    ctx.lineWidth = style === 'comic' ? 4 : 2.4;
    ctx.setLineDash(style === 'comic' ? [120, 15, 175, 10] : [158, 11, 90, 8]);
    ctx.stroke();
    ctx.restore();
  }
}

function refinedSilverBanks(ctx: Ctx2D, frostwork: boolean, cartoon?: CartoonStyle): void {
  band(ctx, '#A9BCC7', [[-20, 484], [225, 461], [420, 480], [640, 444], [890, 473], [1125, 453], [1300, 481]]);
  irregularBank(ctx, silverLeftRidge, '#D5DCDB', '#B8CACC', 'wind', 2);
  irregularBank(ctx, silverRightRidge, '#D0DAD9', '#B4C8CB', 'wind', 7);
  silverBankLayers(ctx, silverLeftRidge, 'left', frostwork);
  silverBankLayers(ctx, silverRightRidge, 'right', frostwork);
  if (cartoon) {
    cartoonBank(ctx, silverLeftRidge, 'left', cartoon);
    cartoonBank(ctx, silverRightRidge, 'right', cartoon);
  }
  organicLake(ctx, silverLakeShore, 5, '#9FC6D0', 'frost');
  silverLakeDetails(ctx, frostwork);
  if (cartoon) cartoonLake(ctx, cartoon);
}

function polarSilverBanks(ctx: Ctx2D): void {
  refinedSilverBanks(ctx, false);
}

function polarSilverFrostwork(ctx: Ctx2D): void {
  refinedSilverBanks(ctx, true);
}

function polarSilverInked(ctx: Ctx2D): void {
  refinedSilverBanks(ctx, false, 'inked');
}

function polarSilverGouache(ctx: Ctx2D): void {
  refinedSilverBanks(ctx, false, 'gouache');
}

function polarSilverComic(ctx: Ctx2D): void {
  refinedSilverBanks(ctx, false, 'comic');
}

function polarLilacSnow(ctx: Ctx2D): void {
  windStudy(ctx, {
    far: '#B4B9CA',
    left: [[-20, 438], [82, 419], [185, 435], [291, 443], [380, 484], [476, 547]],
    right: [[764, 562], [855, 515], [939, 470], [1022, 455], [1117, 459], [1194, 435], [1300, 443]],
    leftSnow: '#CBCDD9', leftBase: '#B4BFD1',
    rightSnow: '#D3D3DE', rightBase: '#B8C3D2',
    shore: [[-20, 620], [118, 601], [247, 586], [364, 567], [480, 559], [595, 558], [700, 561], [820, 557], [937, 570], [1061, 584], [1180, 601], [1300, 613]],
    lake: '#A5CFD0', seed: 4,
  });
}

function polarDeepIce(ctx: Ctx2D): void {
  windStudy(ctx, {
    far: '#AABEC6',
    left: [[-20, 449], [91, 434], [195, 444], [275, 438], [371, 475], [475, 553]],
    right: [[760, 562], [861, 526], [950, 480], [1047, 464], [1147, 447], [1242, 450], [1300, 444]],
    leftSnow: '#CDD9D8', leftBase: '#B4CDCF',
    rightSnow: '#D1DDDB', rightBase: '#B7CED0',
    shore: [[-20, 625], [113, 603], [245, 587], [366, 576], [482, 566], [594, 561], [707, 559], [820, 563], [936, 571], [1052, 581], [1170, 599], [1300, 615]],
    lake: '#97B9CB', seed: 6,
  });
}

function polarWarmDrift(ctx: Ctx2D): void {
  windStudy(ctx, {
    far: '#B4C4C5',
    left: [[-20, 434], [80, 432], [178, 425], [275, 446], [356, 476], [474, 550]],
    right: [[760, 561], [850, 530], [946, 490], [1038, 463], [1130, 446], [1220, 456], [1300, 438]],
    leftSnow: '#DEDCD3', leftBase: '#C5CEC9',
    rightSnow: '#E0DED6', rightBase: '#C4CFCA',
    shore: [[-20, 619], [120, 600], [238, 588], [352, 575], [470, 563], [588, 560], [701, 557], [818, 558], [936, 570], [1046, 586], [1172, 601], [1300, 615]],
    lake: '#9FC8D4', seed: 8,
  });
}

export const drawBackdrop: Record<Exclude<Variant, 'current'>, (ctx: Ctx2D) => void> = {
  'quiet-shore': quietShore,
  'glacial-basin': glacialBasin,
  'violet-inlet': violetInlet,
  'mirror-ice': mirrorIce,
  'fir-shore': firShore,
  'rose-dawn': roseDawn,
  'polar-gap': polarGap,
  'polar-open': polarOpen,
  'polar-stepped': polarStepped,
  'polar-offset': polarOffset,
  'polar-alpenglow': polarAlpenglow,
  'polar-soft-shoulders': polarSoftShoulders,
  'polar-high-bluffs': polarHighBluffs,
  'polar-uneven-shore': polarUnevenShore,
  'polar-powder-bank': polarPowderBank,
  'polar-wind-carved': polarWindCarved,
  'polar-frost-shelves': polarFrostShelves,
  'polar-pearl-shore': polarPearlShore,
  'polar-silver-banks': polarSilverBanks,
  'polar-silver-banks-before': polarSilverBanksBefore,
  'polar-silver-frostwork': polarSilverFrostwork,
  'polar-silver-inked': polarSilverInked,
  'polar-silver-gouache': polarSilverGouache,
  'polar-silver-comic': polarSilverComic,
  'polar-silver-painted': polarSilverBanks,
  'polar-lilac-snow': polarLilacSnow,
  'polar-deep-ice': polarDeepIce,
  'polar-warm-drift': polarWarmDrift,
};
