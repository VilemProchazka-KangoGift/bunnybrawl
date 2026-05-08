/**
 * ReconnectController — guest-side reconnection state machine.
 *
 * Owns the retry timer + attempt counter. Reaches into shared context to
 * coordinate with GuestLoop (clearing baselines, resetting interpolation,
 * resetting cosmetic baselines) and to fire the caller-supplied
 * onReconnecting / onReconnectAttempt / onDisconnect / onStall callbacks.
 *
 * Cross-collaborator state read/written here lives on NetMatchContext:
 *   reconnecting, lastSnapshotTime, stallNotified, autoSlowReported,
 *   prevGuestPhase, guestMatchOverFired, guestBaselines, interpolation.
 */
import type { NetMatchContext } from './NetMatchContext';
import { MsgType } from '../protocol';
import type { ReliableMessage } from '../protocol';

/** 12 attempts × 1.5s = 18s total. Must stay within host's 20s
 *  GRACE_PERIOD so the same slot can be reclaimed. */
export const MAX_RECONNECT_ATTEMPTS = 12;
export const RECONNECT_INTERVAL_MS = 1500;

export class ReconnectController {
  private ctx: NetMatchContext;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: NetMatchContext) {
    this.ctx = ctx;
  }

  /** Start reconnection attempt after disconnect/hard stall (guest only). */
  startReconnection(): void {
    if (this.ctx.reconnecting || this.ctx.isHost) return;
    this.ctx.reconnecting = true;
    this.ctx.onReconnecting?.(true);

    let attempts = 0;
    this.ctx.onReconnectAttempt?.(attempts, MAX_RECONNECT_ATTEMPTS);

    const tryAttempt = () => {
      attempts++;
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        this.abortReconnection();
        return;
      }
      this.ctx.onReconnectAttempt?.(attempts, MAX_RECONNECT_ATTEMPTS);
      const code = this.ctx.transport.roomCode;
      if (!code) return;
      this.ctx.transport.joinRoom(code).then(() => {
        // Re-send on every tick after a successful joinRoom — if
        // RECONNECT_SYNC was lost, the next RECONNECT_REQUEST will produce
        // another response from the host (handler is idempotent).
        this.ctx.transport.sendReliable({
          type: MsgType.RECONNECT_REQUEST,
          slot: this.ctx.localSlot,
          playerName: '',
          reclaimToken: this.ctx.ownReclaimToken ?? '',
        } as ReliableMessage);
      }).catch(() => { /* retry next tick */ });
    };
    tryAttempt();
    this.reconnectTimer = setInterval(tryAttempt, RECONNECT_INTERVAL_MS);
  }

  /** Complete reconnection after host confirms. */
  completeReconnection(): void {
    this.ctx.reconnecting = false;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Stale snapshots would block fresh ones via the out-of-order guard, or
    // lerp across a huge frame gap and teleport entities. Reset latches too
    // so the first post-reconnect snapshot re-fires any phase/match-end edge.
    this.ctx.interpolation?.reset();
    // Drop the encoded baseline ring too — frames the host knew we ACKed are
    // gone after reconnect; the next snapshot must be a full keyframe and we
    // start over from there. Clear `autoSlowReported` so the guest will
    // re-signal CONNECTION_UNSTABLE if its autoSlow is still flipped, since
    // the host's per-peer state has been reset.
    this.ctx.guestBaselines.clear();
    this.ctx.autoSlowReported = false;
    // Cosmetic prev-state baselines also need a reset — without this, the
    // first post-reconnect snapshot triggers transitions against pre-
    // disconnect state (e.g. jump/land sounds for a player who landed
    // during the disconnect, score-anim crunch for delta points scored
    // while we were gone, possibly a duplicate victory sound).
    this.ctx.gameLoop.resetCosmeticBaselines();
    this.ctx.guestMatchOverFired = false;
    // Sync prev-phase to current state so the next snapshot tick doesn't see
    // a synthetic loading→playing edge and re-fire onEnterPlayingPhase. That
    // would double-start non-idempotent ambient loops (wind/lava/etc.) and
    // append duplicate entries to MatchSystem.activeAmbientLoops.
    this.ctx.prevGuestPhase = this.ctx.gameLoop.getState().phase;
    this.ctx.lastSnapshotTime = performance.now();
    this.ctx.stallNotified = false;
    this.ctx.onReconnecting?.(false);
    this.ctx.onStall?.(false);
  }

  /** Abort reconnection after timeout — disconnect as before. */
  abortReconnection(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ctx.reconnecting = false;
    this.ctx.onReconnecting?.(false);
    this.ctx.onDisconnect?.();
  }

  /** Cancel any pending retry timer. Called from NetMatch.stop. */
  dispose(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
