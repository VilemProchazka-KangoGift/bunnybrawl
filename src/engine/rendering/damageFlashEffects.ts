import type { Ctx2D, Player } from '../types';
const masks = new WeakMap<OffscreenCanvas, OffscreenCanvas>();
type FlashPlayer = Pick<Player, 'damageFlashTimer' | 'damageFlashSide' | 'burnTimer' | 'slowTimer'>;
export function damageFlashAlpha(player: FlashPlayer): number {
  return player.damageFlashTimer > 0 && player.damageFlashSide && !(player.burnTimer > 0)
    ? Math.min(.78, player.damageFlashTimer * 4) : 0;
}
/** Match the selected study while retaining inherited blink and echo attenuation. */
export function drawDamageSilhouette(ctx: Ctx2D, sprite: OffscreenCanvas,
  x: number, y: number, width: number, height: number, player: FlashPlayer): void {
  const flash = damageFlashAlpha(player);
  if (!flash) return;
  let mask = masks.get(sprite);
  if (!mask) {
    mask = new OffscreenCanvas(sprite.width, sprite.height);
    const mctx = mask.getContext('2d')!;
    mctx.drawImage(sprite, 0, 0);
    mctx.globalCompositeOperation = 'source-in';
    mctx.fillStyle = '#F04435';
    mctx.fillRect(0, 0, mask.width, mask.height);
    masks.set(sprite, mask);
  }
  const inherited = ctx.globalAlpha;
  const slowOpacity = player.slowTimer > 0 ? .7 + Math.sin(player.slowTimer * 8) * .15 : 1;
  ctx.globalAlpha = inherited / slowOpacity * flash;
  ctx.drawImage(mask, x, y, width, height);
  ctx.globalAlpha = inherited;
}
