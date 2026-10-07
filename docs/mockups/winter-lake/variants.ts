import type { Ctx2D } from '../../../src/engine/types';

type Point = readonly [number, number];

export const VARIANTS = [
  'current', 'quiet-shore', 'glacial-basin', 'violet-inlet',
  'mirror-ice', 'fir-shore', 'rose-dawn', 'polar-gap',
  'polar-open', 'polar-stepped', 'polar-offset', 'polar-alpenglow',
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
};
