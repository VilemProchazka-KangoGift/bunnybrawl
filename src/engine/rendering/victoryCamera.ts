import type { MatchState, PlayerSlot } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, VICTORY_ZOOM_MS, VICTORY_ZOOM_SCALE } from '../constants';

export class VictoryCamera {
  private started = 0;
  private winner: PlayerSlot | null = null;
  clear(): void { this.winner = null; }
  frame(state: MatchState, now: number): { scale: number; x: number; y: number } | null {
    const player = state.players.find(p => p.id === state.winner);
    if (!state.matchOver || !state.winner || !player) { this.clear(); return null; }
    if (this.winner !== state.winner || now < this.started) {
      this.winner = state.winner;
      this.started = now;
    }
    const t = Math.min(1, Math.max(0, (now - this.started) / VICTORY_ZOOM_MS));
    const scale = 1 + (VICTORY_ZOOM_SCALE - 1) * t * t * (3 - 2 * t);
    const clamp = (v: number, min: number) => Math.max(min, Math.min(0, v));
    return { scale,
      x: clamp(CANVAS_WIDTH / 2 - scale * (player.x + player.width / 2), CANVAS_WIDTH * (1 - scale)),
      y: clamp(CANVAS_HEIGHT / 2 - scale * (player.y + player.height / 2), CANVAS_HEIGHT * (1 - scale)),
    };
  }
}

