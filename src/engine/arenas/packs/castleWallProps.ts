import type { Ctx2D, Platform } from '../../types';

// Static wall art is part of the cached background. Bounds leave a gap around
// every playable platform, so none of these silhouettes suggests a foothold.
export const CASTLE_WALL_PROPS = {
  shield: { x: 297, y: 477, width: 62, height: 80 },
  swordStand: { x: 920, y: 477, width: 64, height: 78 },
  trophy: { x: 480, y: 316, width: 48, height: 52 },
  crossedSwords: { x: 731, y: 411, width: 58, height: 58 },
  pennant: { x: 405, y: 310, width: 60, height: 90 },
} as const;

type Prop = { x: number; y: number; width: number; height: number };

export function castleArmorMounts(gallery: Platform): readonly [Prop, Prop] {
  const y = gallery.y + gallery.height + 6;
  return [
    { x: gallery.x + 19, y, width: 60, height: 88 },
    { x: gallery.x + gallery.width - 79, y, width: 60, height: 88 },
  ];
}

export function drawCastleArmorMounts(c: Ctx2D, gallery: Platform): readonly [Prop, Prop] {
  const mounts = castleArmorMounts(gallery);
  c.save();
  c.globalAlpha = .3;
  c.fillStyle = '#263348';
  c.strokeStyle = '#82909f';
  c.lineWidth = 2;
  for (const mount of mounts) {
    c.beginPath();
    c.moveTo(mount.x, mount.y + 14);
    c.quadraticCurveTo(mount.x + mount.width / 2, mount.y - 6, mount.x + mount.width, mount.y + 14);
    c.lineTo(mount.x + mount.width, mount.y + mount.height);
    c.lineTo(mount.x, mount.y + mount.height);
    c.closePath();
    c.fill(); c.stroke();
  }
  c.restore();
  return mounts;
}

function onWall(c: Ctx2D, prop: Prop, draw: () => void): void {
  c.save();
  c.globalAlpha = .54;
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
  c.fillStyle = '#514777'; c.strokeStyle = '#1b2336'; c.lineWidth = 7;
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(60, 17); c.lineTo(96, 32); c.lineTo(96, 75);
  c.quadraticCurveTo(96, 98, 60, 115);
  c.quadraticCurveTo(24, 98, 24, 75); c.lineTo(24, 32); c.closePath();
  c.strokeStyle = '#c2a974'; c.lineWidth = 4; c.stroke();
  c.beginPath(); c.moveTo(44, 68);
  c.quadraticCurveTo(60, 44, 77, 68);
  c.quadraticCurveTo(62, 60, 60, 82);
  c.quadraticCurveTo(58, 62, 44, 68);
  c.fillStyle = '#d5ba7e'; c.fill();
}

function swordStand(c: Ctx2D): void {
  c.strokeStyle = '#202b3c'; c.lineWidth = 11;
  c.beginPath(); c.moveTo(38, 20); c.lineTo(38, 117);
  c.moveTo(82, 20); c.lineTo(82, 117);
  c.moveTo(24, 43); c.lineTo(96, 43);
  c.moveTo(24, 99); c.lineTo(96, 99); c.stroke();
  c.strokeStyle = '#927861'; c.lineWidth = 6; c.stroke();
  c.beginPath(); c.moveTo(60, 7); c.lineTo(69, 28);
  c.lineTo(64, 82); c.lineTo(56, 82); c.lineTo(51, 28); c.closePath();
  c.fillStyle = '#9eafb9'; c.strokeStyle = '#263043'; c.lineWidth = 4;
  c.fill(); c.stroke();
  c.strokeStyle = '#c9ad7b'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(45, 84); c.lineTo(75, 84);
  c.moveTo(60, 87); c.lineTo(60, 108); c.stroke();
}

function trophy(c: Ctx2D): void {
  c.strokeStyle = '#263043'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(35, 38); c.lineTo(23, 38); c.lineTo(23, 52);
  c.quadraticCurveTo(23, 67, 39, 69);
  c.moveTo(85, 38); c.lineTo(97, 38); c.lineTo(97, 52);
  c.quadraticCurveTo(97, 67, 81, 69); c.stroke();
  c.beginPath(); c.moveTo(35, 30); c.lineTo(85, 30); c.lineTo(85, 56);
  c.quadraticCurveTo(85, 83, 60, 90);
  c.quadraticCurveTo(35, 83, 35, 56); c.closePath();
  c.fillStyle = '#ba995f'; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(39, 35); c.lineTo(59, 35); c.lineTo(59, 82);
  c.quadraticCurveTo(39, 72, 39, 54); c.closePath();
  c.fillStyle = '#d9bd83'; c.fill();
  c.beginPath(); c.moveTo(60, 92); c.lineTo(60, 107);
  c.moveTo(40, 110); c.lineTo(80, 110);
  c.strokeStyle = '#263043'; c.lineWidth = 9; c.stroke();
  c.strokeStyle = '#c8a971'; c.lineWidth = 5; c.stroke();
}

function crossedSwords(c: Ctx2D): void {
  c.strokeStyle = '#263043'; c.lineWidth = 15;
  c.beginPath(); c.moveTo(22, 21); c.lineTo(84, 96);
  c.moveTo(98, 21); c.lineTo(36, 96); c.stroke();
  c.strokeStyle = '#a6b5bc'; c.lineWidth = 9; c.stroke();
  c.strokeStyle = '#c8a971'; c.lineWidth = 7;
  c.beginPath(); c.moveTo(42, 63); c.lineTo(62, 50);
  c.moveTo(78, 63); c.lineTo(58, 50); c.stroke();
  c.fillStyle = '#c8a971';
  for (const x of [35, 85]) {
    c.beginPath(); c.arc(x, 99, 6, 0, Math.PI * 2); c.fill();
  }
}

function pennant(c: Ctx2D): void {
  c.strokeStyle = '#22283a'; c.lineWidth = 7;
  c.beginPath(); c.moveTo(17, 13); c.lineTo(103, 13); c.stroke();
  c.beginPath(); c.moveTo(23, 17); c.lineTo(97, 17);
  c.lineTo(91, 111); c.lineTo(70, 104); c.lineTo(54, 122);
  c.lineTo(29, 111); c.closePath();
  c.fillStyle = '#624651'; c.strokeStyle = '#252538'; c.lineWidth = 6;
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(27, 21); c.lineTo(52, 21); c.lineTo(48, 108);
  c.lineTo(33, 104); c.closePath();
  c.fillStyle = '#7a5a61'; c.fill();
  c.fillStyle = '#c6aa74';
  c.beginPath(); c.ellipse(62, 68, 15, 18, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(53, 42, 5, 17, -.25, 0, Math.PI * 2);
  c.ellipse(71, 41, 5, 17, .25, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#624651';
  c.beginPath(); c.ellipse(65, 67, 12, 14, 0, 0, Math.PI * 2); c.fill();
}

export function drawCastleWallProps(c: Ctx2D): void {
  onWall(c, CASTLE_WALL_PROPS.shield, () => shield(c));
  onWall(c, CASTLE_WALL_PROPS.swordStand, () => swordStand(c));
  onWall(c, CASTLE_WALL_PROPS.trophy, () => trophy(c));
  onWall(c, CASTLE_WALL_PROPS.crossedSwords, () => crossedSwords(c));
  onWall(c, CASTLE_WALL_PROPS.pennant, () => pennant(c));
}
