import type { Ctx2D, Platform } from '../../types';

// Static wall art is part of the cached background. Muted opaque colors keep
// it secondary without letting the painted wall show through the objects.
export const CASTLE_WALL_PROPS = {
  shield: { x: 297, y: 477, width: 62, height: 80 },
  swordStand: { x: 920, y: 477, width: 64, height: 78 },
  trophy: { x: 480, y: 316, width: 48, height: 52 },
  crossedSwords: { x: 731, y: 411, width: 58, height: 58 },
  pennant: { x: 405, y: 310, width: 60, height: 90 },
} as const;

type Prop = { x: number; y: number; width: number; height: number };

export function castleArmorBounds(gallery: Platform): readonly [Prop, Prop] {
  const y = gallery.y - 74;
  return [
    { x: gallery.x + 65, y, width: 46, height: 66 },
    { x: gallery.x + gallery.width - 111, y, width: 46, height: 66 },
  ];
}

function onWall(c: Ctx2D, prop: Prop, draw: () => void): void {
  c.save();
  c.globalAlpha = 1;
  c.translate(prop.x, prop.y);
  c.scale(prop.width / 120, prop.height / 130);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw();
  c.restore();
}

function shield(c: Ctx2D): void {
  c.beginPath();
  c.moveTo(60, 10); c.lineTo(103, 28); c.lineTo(103, 75);
  c.quadraticCurveTo(103, 103, 60, 123);
  c.quadraticCurveTo(17, 103, 17, 75);
  c.lineTo(17, 28); c.closePath();
  c.fillStyle = '#4b4a61'; c.strokeStyle = '#303a4c'; c.lineWidth = 7;
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(60, 17); c.lineTo(96, 32); c.lineTo(96, 75);
  c.quadraticCurveTo(96, 98, 60, 115);
  c.quadraticCurveTo(24, 98, 24, 75); c.lineTo(24, 32); c.closePath();
  c.strokeStyle = '#9d9378'; c.lineWidth = 4; c.stroke();
  c.beginPath(); c.moveTo(44, 68);
  c.quadraticCurveTo(60, 44, 77, 68);
  c.quadraticCurveTo(62, 60, 60, 82);
  c.quadraticCurveTo(58, 62, 44, 68);
  c.fillStyle = '#b0a27b'; c.fill();
}

function swordStand(c: Ctx2D): void {
  c.strokeStyle = '#344052'; c.lineWidth = 11;
  c.beginPath(); c.moveTo(38, 20); c.lineTo(38, 117);
  c.moveTo(82, 20); c.lineTo(82, 117);
  c.moveTo(24, 43); c.lineTo(96, 43);
  c.moveTo(24, 99); c.lineTo(96, 99); c.stroke();
  c.strokeStyle = '#766c65'; c.lineWidth = 6; c.stroke();
  c.beginPath(); c.moveTo(60, 7); c.lineTo(69, 28);
  c.lineTo(64, 82); c.lineTo(56, 82); c.lineTo(51, 28); c.closePath();
  c.fillStyle = '#84949d'; c.strokeStyle = '#344052'; c.lineWidth = 4;
  c.fill(); c.stroke();
  c.strokeStyle = '#a99a79'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(45, 84); c.lineTo(75, 84);
  c.moveTo(60, 87); c.lineTo(60, 108); c.stroke();
}

function trophy(c: Ctx2D): void {
  c.strokeStyle = '#344052'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(35, 38); c.lineTo(23, 38); c.lineTo(23, 52);
  c.quadraticCurveTo(23, 67, 39, 69);
  c.moveTo(85, 38); c.lineTo(97, 38); c.lineTo(97, 52);
  c.quadraticCurveTo(97, 67, 81, 69); c.stroke();
  c.beginPath(); c.moveTo(35, 30); c.lineTo(85, 30); c.lineTo(85, 56);
  c.quadraticCurveTo(85, 83, 60, 90);
  c.quadraticCurveTo(35, 83, 35, 56); c.closePath();
  c.fillStyle = '#9d896a'; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(39, 35); c.lineTo(59, 35); c.lineTo(59, 82);
  c.quadraticCurveTo(39, 72, 39, 54); c.closePath();
  c.fillStyle = '#b5a584'; c.fill();
  c.beginPath(); c.moveTo(60, 92); c.lineTo(60, 107);
  c.moveTo(40, 110); c.lineTo(80, 110);
  c.strokeStyle = '#344052'; c.lineWidth = 9; c.stroke();
  c.strokeStyle = '#a99a79'; c.lineWidth = 5; c.stroke();
}

function crossedSwords(c: Ctx2D): void {
  c.strokeStyle = '#344052'; c.lineWidth = 15;
  c.beginPath(); c.moveTo(22, 21); c.lineTo(84, 96);
  c.moveTo(98, 21); c.lineTo(36, 96); c.stroke();
  c.strokeStyle = '#8799a3'; c.lineWidth = 9; c.stroke();
  c.strokeStyle = '#a99a79'; c.lineWidth = 7;
  c.beginPath(); c.moveTo(42, 63); c.lineTo(62, 50);
  c.moveTo(78, 63); c.lineTo(58, 50); c.stroke();
  c.fillStyle = '#a99a79';
  for (const x of [35, 85]) {
    c.beginPath(); c.arc(x, 99, 6, 0, Math.PI * 2); c.fill();
  }
}

function pennant(c: Ctx2D): void {
  c.strokeStyle = '#344052'; c.lineWidth = 7;
  c.beginPath(); c.moveTo(17, 13); c.lineTo(103, 13); c.stroke();
  c.beginPath(); c.moveTo(23, 17); c.lineTo(97, 17);
  c.lineTo(91, 111); c.lineTo(70, 104); c.lineTo(54, 122);
  c.lineTo(29, 111); c.closePath();
  c.fillStyle = '#554b57'; c.strokeStyle = '#34394b'; c.lineWidth = 6;
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(27, 21); c.lineTo(52, 21); c.lineTo(48, 108);
  c.lineTo(33, 104); c.closePath();
  c.fillStyle = '#685b64'; c.fill();
  c.fillStyle = '#aa9b7b';
  c.beginPath(); c.ellipse(62, 68, 15, 18, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(53, 42, 5, 17, -.25, 0, Math.PI * 2);
  c.ellipse(71, 41, 5, 17, .25, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#554b57';
  c.beginPath(); c.ellipse(65, 67, 12, 14, 0, 0, Math.PI * 2); c.fill();
}

export function drawCastleWallProps(c: Ctx2D): void {
  onWall(c, CASTLE_WALL_PROPS.shield, () => shield(c));
  onWall(c, CASTLE_WALL_PROPS.swordStand, () => swordStand(c));
  onWall(c, CASTLE_WALL_PROPS.trophy, () => trophy(c));
  onWall(c, CASTLE_WALL_PROPS.crossedSwords, () => crossedSwords(c));
  onWall(c, CASTLE_WALL_PROPS.pennant, () => pennant(c));
}
