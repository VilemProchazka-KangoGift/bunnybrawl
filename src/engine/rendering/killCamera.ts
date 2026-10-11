import type { MatchState } from '../types';
import { HITSTOP_DURATION, KILL_CAMERA_DURATION, KILL_CAMERA_KICK, KILL_CAMERA_ZOOM } from '../constants';

/** Renderer-local kick follows transported kill events, without shaking other hits. */
export class KillCamera {
  private primed = false;
  private latest = '';
  private started = -Infinity;
  clear(): void { this.primed = false; this.latest = ''; this.started = -Infinity; }
  frame(state: MatchState, now: number): { scale: number; y: number } | null {
    const entry = state.killFeed.at(-1);
    const key = entry ? `${entry.timestamp}:${entry.attacker}:${entry.victim}` : '';
    if (!this.primed || state.phase !== 'playing' || now < this.started) {
      this.primed = true; this.latest = key; this.started = -Infinity;
      return null;
    }
    if (key !== this.latest) {
      if (key) this.started = now;
      else this.started = -Infinity;
      this.latest = key;
    }
    const age = (now - this.started) / 1000;
    if (age < 0 || age >= KILL_CAMERA_DURATION) return null;
    const zoom = Math.max(0, 1 - age / HITSTOP_DURATION);
    return { scale: 1 + KILL_CAMERA_ZOOM * zoom * zoom,
      y: KILL_CAMERA_KICK * Math.sin(age / KILL_CAMERA_DURATION * Math.PI * 2) * (1 - age / KILL_CAMERA_DURATION) };
  }
}
