import type { Ctx2D, Platform } from '../../types';

function drawCobweb(c: Ctx2D, x: number, y: number, direction: number): void {
  c.save();
  c.translate(x, y);
  c.scale(direction, 1);
  c.globalAlpha = .25;
  c.strokeStyle = '#b9c7d0';
  c.lineWidth = .9;
  for (const [dx, dy] of [[46, 4], [42, 27], [28, 47], [5, 53]]) {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(dx, dy);
    c.stroke();
  }
  for (let step = 1; step <= 3; step++) {
    const t = step / 4;
    c.beginPath();
    c.moveTo(46 * t, 4 * t);
    c.quadraticCurveTo(48 * t, 23 * t, 42 * t, 27 * t);
    c.quadraticCurveTo(39 * t, 41 * t, 28 * t, 47 * t);
    c.quadraticCurveTo(17 * t, 55 * t, 5 * t, 53 * t);
    c.stroke();
  }
  c.restore();
}

function drawWornPlaster(c: Ctx2D, x: number, y: number, mirror: boolean): void {
  c.save();
  c.translate(x, y);
  if (mirror) c.scale(-1, 1);
  c.globalAlpha = .13;
  c.fillStyle = '#aab9c1';
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(19, -4);
  c.lineTo(32, 2);
  c.lineTo(45, -2);
  c.lineTo(38, 12);
  c.lineTo(51, 19);
  c.lineTo(36, 23);
  c.lineTo(28, 17);
  c.lineTo(13, 25);
  c.lineTo(8, 13);
  c.closePath();
  c.fill();
  c.strokeStyle = '#25394a';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(18, -4);
  c.lineTo(22, 8);
  c.lineTo(16, 15);
  c.moveTo(39, 12);
  c.lineTo(46, 17);
  c.stroke();
  c.restore();
}

export function drawCastleWallDetails(c: Ctx2D): void {
  // Sparse age marks leave the window arches clear.
  drawCobweb(c, 18, 228, 1);
  drawCobweb(c, 1262, 221, -1);
  drawWornPlaster(c, 262, 366, false);
  drawWornPlaster(c, 1018, 374, true);
}

export function drawCastleGalleryDecoration(c: Ctx2D, gallery: Platform): void {
  const x = gallery.x, y = gallery.y, width = gallery.width;
  c.save();
  c.lineJoin = 'round';
  // A worn cloth runner lies flush on the playable stone, between the sentries.
  c.fillStyle = '#62516d';
  c.strokeStyle = '#b9a581';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(x + 151, y - 6);
  c.lineTo(x + width - 151, y - 6);
  c.lineTo(x + width - 145, y + 2);
  c.lineTo(x + 145, y + 2);
  c.closePath();
  c.fill();
  c.stroke();
  c.globalAlpha = .55;
  c.strokeStyle = '#ddd0aa';
  c.lineWidth = 1;
  for (const edgeX of [x + 169, x + width - 169]) {
    c.beginPath();
    c.moveTo(edgeX, y - 5);
    c.lineTo(edgeX, y + 1);
    c.stroke();
  }
  // Shallow relief stays on the front face; it cannot be mistaken for a step.
  c.globalAlpha = .4;
  c.strokeStyle = '#46566a';
  c.lineWidth = 1.2;
  for (let mark = x + 92; mark <= x + width - 92; mark += 100) {
    c.beginPath();
    c.moveTo(mark - 19, y + 17);
    c.quadraticCurveTo(mark - 15, y + 10, mark, y + 9);
    c.quadraticCurveTo(mark + 15, y + 10, mark + 19, y + 17);
    c.stroke();
    c.beginPath();
    c.moveTo(mark, y + 10);
    c.lineTo(mark, y + 17);
    c.stroke();
  }
  c.restore();
}
