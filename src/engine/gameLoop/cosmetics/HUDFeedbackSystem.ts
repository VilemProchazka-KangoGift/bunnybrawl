import type { MatchState, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import { swapRemove } from '../../themes/utils';
import {
  COMBO_WINDOW_SEC,
  COMBO_POPUP_DURATION,
  GOAL_PULSE_DURATION,
} from '../../constants';

/** Cosmetic-only system that drives combo popups and goal-pulse HUD feedback.
 *  Triggers fire from data already in the snapshot (killFeed timestamps,
 *  Player.score), so the same logic runs on host AND guest with no protocol
 *  changes. Per-peer divergence in popup placement jitter is acceptable. */
export class HUDFeedbackSystem implements CosmeticSystem {
  private state: MatchState;
  private lastSeenTimestamp = -1;
  private prevScores: Map<PlayerSlot, number> = new Map();
  /** Per-killer rolling kill timestamps within COMBO_WINDOW_SEC. Map values
   *  are pruned in-place; keys are never deleted (bounded by player count). */
  private killWindows: Map<PlayerSlot, number[]> = new Map();

  constructor(state: MatchState) {
    this.state = state;
  }

  init(): void {
    // Baseline at the largest timestamp already in killFeed so existing
    // entries don't re-fire after init/resetBaseline. -1 = pre-match.
    let maxTs = -1;
    for (const e of this.state.killFeed) {
      if (e.timestamp > maxTs) maxTs = e.timestamp;
    }
    this.lastSeenTimestamp = maxTs;
    this.prevScores.clear();
    for (const p of this.state.players) {
      this.prevScores.set(p.id, p.score);
    }
    this.killWindows.clear();
  }

  /** Re-prime baselines without firing transitions. Used by phase/reconnect
   *  paths that would otherwise spawn ghost popups against a stale prev-state. */
  resetBaseline(): void {
    this.init();
  }

  cosmeticUpdate(dt: number): void {
    const state = this.state;

    // 1. Detect new kills from killFeed (timestamp-baseline scan, trim-safe).
    let maxSeen = this.lastSeenTimestamp;
    for (const entry of state.killFeed) {
      if (entry.timestamp <= this.lastSeenTimestamp) continue;
      if (entry.timestamp > maxSeen) maxSeen = entry.timestamp;

      let window = this.killWindows.get(entry.attacker);
      if (!window) {
        window = [];
        this.killWindows.set(entry.attacker, window);
      }
      // Prune entries outside the window (keep order, drop from front).
      const cutoff = entry.timestamp - COMBO_WINDOW_SEC;
      while (window.length > 0 && window[0] < cutoff) window.shift();
      window.push(entry.timestamp);

      if (window.length >= 2) {
        // Spawn popup at the victim's current position. If the victim was
        // already removed (disconnected mid-stomp), skip — no anchor.
        const victim = state.players.find(p => p.id === entry.victim);
        if (victim) {
          state.comboPopups.push({
            x: victim.x + victim.width / 2,
            y: victim.y,
            count: window.length,
            timer: COMBO_POPUP_DURATION,
            killer: entry.attacker,
          });
        }
      }
    }
    this.lastSeenTimestamp = maxSeen;

    // 2. Detect score rising edges → goal pulse.
    for (const p of state.players) {
      const prev = this.prevScores.get(p.id) ?? p.score;
      if (p.score > prev) {
        state.goalPulseTimers.set(p.id, GOAL_PULSE_DURATION);
      }
      this.prevScores.set(p.id, p.score);
    }

    // 3. Tick popup ages, remove expired.
    for (let i = state.comboPopups.length - 1; i >= 0; i--) {
      state.comboPopups[i].timer -= dt;
      if (state.comboPopups[i].timer <= 0) {
        swapRemove(state.comboPopups, i);
      }
    }

    // 4. Tick goal-pulse timers, drop zeroed.
    for (const [slot, t] of state.goalPulseTimers) {
      const next = t - dt;
      if (next <= 0) state.goalPulseTimers.delete(slot);
      else state.goalPulseTimers.set(slot, next);
    }
  }

  cleanup(): void {
    this.killWindows.clear();
    this.prevScores.clear();
  }
}
