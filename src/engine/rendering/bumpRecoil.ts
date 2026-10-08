import type { Player, PlayerSlot } from '../types';

interface Contact { squash: number; started: number; direction: number }

/** Renderer-owned response to the shared push marker, including guest snapshots. */
export class BumpRecoil {
  private readonly contacts = new Map<PlayerSlot, Contact>();

  offset(player: Player, players: readonly Player[], now: number): number {
    let contact = this.contacts.get(player.id);
    if (!player.active || player.state === 'splat' || player.state === 'respawning') {
      this.contacts.delete(player.id);
      return 0;
    }
    if (!contact) {
      contact = { squash: 1, started: -Infinity, direction: 0 };
      this.contacts.set(player.id, contact);
    }
    if (contact.squash >= .95 && Math.abs(player.sideSquash - .8) < .01) {
      // Locate the touching body, rather than using facing or exchanged velocity.
      let nearest: Player | undefined;
      let distance = Infinity;
      for (const other of players) {
        if (other === player || other.id === player.id || !other.active
          || other.state === 'splat' || other.state === 'respawning') continue;
        if (Math.abs(other.y - player.y) >= Math.min(player.height, other.height) * .5) continue;
        const dx = other.x + other.width / 2 - player.x - player.width / 2;
        if (Math.abs(dx) < distance && Math.abs(dx) <= (player.width + other.width) * .65) {
          nearest = other; distance = Math.abs(dx);
        }
      }
      if (nearest) {
        contact.started = now;
        contact.direction = player.x + player.width / 2 < nearest.x + nearest.width / 2 ? -1 : 1;
      }
    }
    contact.squash = player.sideSquash;
    const age = (now - contact.started) / 180;
    if (age < 0 || age >= 1) return 0;
    return contact.direction * 4 * (player.width / 32) * Math.sin(Math.PI * age);
  }
}
