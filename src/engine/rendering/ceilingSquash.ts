import type { Player, PlayerSlot, Platform } from '../types';

interface Contact { started: number; near: boolean; vy: number }

/** Cosmetic response shared by renderer workers and snapshot guests. */
export class CeilingSquash {
  private readonly contacts = new Map<PlayerSlot, Contact>();

  pulse(player: Player, platforms: readonly Platform[], now: number): number {
    if (!player.active || player.state === 'splat' || player.state === 'respawning') {
      this.contacts.delete(player.id); return 0;
    }
    let contact = this.contacts.get(player.id);
    if (!contact) {
      contact = { started: -Infinity, near: false, vy: 0 };
      this.contacts.set(player.id, contact);
    }
    const near = platforms.some(platform => {
      const bottom = platform.y + platform.height - (platform.bottomCollisionInset ?? 0);
      const gap = player.y - bottom;
      return player.x + player.width > platform.x + (platform.leftCollisionInset ?? 0)
        && player.x < platform.x + platform.width && gap >= -.5 && gap <= 8 * player.height / 32;
    });
    // Anticipate the last rising frame; also catch contact between rendered snapshots.
    if (!contact.near && near && (player.vy < -10 || contact.vy < -10)) contact.started = now;
    contact.near = near;
    contact.vy = player.vy;
    const age = now - contact.started;
    if (age < 0 || age >= 280) return 0;
    const t = age < 60 ? age / 60 : 1 - (age - 60) / 220;
    return t * t * (3 - 2 * t);
  }
}
