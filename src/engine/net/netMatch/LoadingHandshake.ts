/**
 * LoadingHandshake — host-side LOADED handshake + hard timeout.
 *
 * Owns: loadedGuests set, hostSelfLoaded flag, loadingTimeout handle, and the
 * one-shot extension flag. Reads from / drives the shared gameLoop and
 * hostAuthority through NetMatchContext.
 *
 * Host waits for `MsgType.LOADED` from every expected guest AND its own
 * `markHostLoaded()` before flipping `state.phase = 'playing'`. Hard timeout:
 * `LOADING_TIMEOUT_MS = 15000` — laggards are marked disconnected and the
 * match proceeds.
 */
import type { PlayerSlot } from '../../types';
import { MsgType } from '../protocol';
import type { ReliableMessage } from '../protocol';
import type { NetMatchContext } from './NetMatchContext';

/** Maximum time host waits for all guests to signal LOADED before force-
 *  advancing phase to 'playing' (and treating laggards as disconnected). */
export const LOADING_TIMEOUT_MS = 15000;

export class LoadingHandshake {
  private ctx: NetMatchContext;

  // Host-side LOADED handshake state
  private loadedGuests = new Set<PlayerSlot>();
  private hostSelfLoaded = false;
  // One-shot flag: if loading timeout fires while hostSelfLoaded is false,
  // re-arm the timer once instead of force-flipping. Reset on each new
  // loading session via resetLoadingHandshake().
  private loadingTimeoutExtended = false;
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: NetMatchContext) {
    this.ctx = ctx;
  }

  /** Drop a stale LOADED for the given slot (called by the host's
   *  onPlayerDisconnect wrapper so a later reconnect re-runs the handshake). */
  forgetSlot(slot: PlayerSlot): void {
    this.loadedGuests.delete(slot);
  }

  /** Host: hard timeout for the LOADED handshake. If any guest fails to
   *  signal within LOADING_TIMEOUT_MS, force the match forward and treat
   *  non-responding slots as disconnected. */
  armLoadingTimeout(): void {
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.ctx.gameLoop.getState().phase !== 'loading') return;
      // Defer the force-flip if our own preload is still in flight — flipping
      // before host's assets are warm makes audio + sprites pop in over the
      // first few seconds of play. Single retry budget.
      if (!this.hostSelfLoaded && !this.loadingTimeoutExtended) {
        console.warn('[NetMatch] loading timeout fired but host not loaded — extending');
        this.loadingTimeoutExtended = true;
        this.armLoadingTimeout();
        return;
      }
      console.warn('[NetMatch] loading timeout — forcing phase=playing');
      const expected = this.ctx.hostAuthority!.getExpectedGuestSlots();
      const laggards: PlayerSlot[] = [];
      for (const slot of expected) {
        if (!this.loadedGuests.has(slot)) {
          laggards.push(slot);
          this.ctx.gameLoop.disconnectPlayer(slot);
        }
      }
      this.ctx.onLoadingTimeout?.(laggards);
      this.ctx.gameLoop.setPhase('playing');
    }, LOADING_TIMEOUT_MS);
  }

  /** Host: signal that this side's own loading tasks have completed. When
   *  combined with LOADED messages from all guests, flips phase to 'playing'. */
  markHostLoaded(): void {
    if (!this.ctx.isHost) return;
    this.hostSelfLoaded = true;
    this.checkAllLoaded();
  }

  /** Guest: tell host that our local loading is done. Host broadcasts a
   *  new snapshot with phase='playing' once all guests have signalled. */
  signalGuestLoaded(): void {
    if (this.ctx.isHost) return;
    this.ctx.transport.sendReliable({
      type: MsgType.LOADED,
      slot: this.ctx.localSlot,
    } as ReliableMessage);
  }

  /** Host: reset loading-handshake state when re-entering the 'loading'
   *  phase (rematch, arena change). Without this, a stale LOADED from the
   *  first match would cause checkAllLoaded to flip phase back to 'playing'
   *  before guests finish warming the new arena. */
  resetLoadingHandshake(): void {
    if (!this.ctx.isHost) return;
    this.loadedGuests.clear();
    this.hostSelfLoaded = false;
    this.loadingTimeoutExtended = false;
    this.armLoadingTimeout();
  }

  /** Host: record a LOADED arrival from the given slot (already
   *  source-authenticated by the MessageRouter via getSlotForPeer). */
  recordGuestLoaded(slot: PlayerSlot): void {
    this.loadedGuests.add(slot);
    this.checkAllLoaded();
  }

  /** Host: check whether all expected guests + host itself have completed
   *  loading. If so, flip phase to 'playing' — the next broadcast snapshot
   *  carries the new phase, auto-syncing all guests. */
  checkAllLoaded(): void {
    if (!this.ctx.isHost || !this.ctx.hostAuthority) return;
    if (!this.hostSelfLoaded) return;
    const expected = this.ctx.hostAuthority.getExpectedGuestSlots();
    const allIn = expected.every(s => this.loadedGuests.has(s));
    if (!allIn) return;
    if (this.ctx.gameLoop.getState().phase !== 'loading') return;
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    this.ctx.gameLoop.setPhase('playing');
  }

  /** Cancel the pending loading timeout (called from NetMatch.stop). */
  dispose(): void {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
  }
}
