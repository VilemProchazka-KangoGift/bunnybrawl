/**
 * MessageRouter — central switch for reliable + unreliable transport
 * messages. Reads game-specific MsgType bytes off the wire and routes to
 * the right collaborator (HostLoop / GuestLoop / ReconnectController /
 * LoadingHandshake) or directly drives the gameLoop for simple cases
 * (PAUSE / SETTINGS_SYNC / MATCH_RESULT / DISCONNECT).
 *
 * Source-authentication note: LOADED and CONNECTION_UNSTABLE derive the
 * sender's slot from `fromPeerId` via hostAuthority.getSlotForPeer — the
 * msg.slot field is untrusted (see "REJECTS LOADED with spoofed slot field"
 * test).
 */
import type { PlayerSlot } from '../../types';
import { MsgType } from '../protocol';
import type { ReliableMessage } from '../protocol';
import type { NetMatchContext } from './NetMatchContext';
import type { LoadingHandshake } from './LoadingHandshake';
import type { ReconnectController } from './ReconnectController';

/** Snapshot path callbacks the router needs from GuestLoop. Wired in
 *  the NetMatch constructor so the router doesn't import GuestLoop and
 *  drag its render-side dependencies in. */
export interface GuestSnapshotHandlers {
  handleGuestSnapshot: (data: ArrayBuffer) => void;
  handleGuestDelta: (data: ArrayBuffer) => void;
}

export class MessageRouter {
  private ctx: NetMatchContext;
  private loading: LoadingHandshake;
  private reconnect: ReconnectController;
  private guest: GuestSnapshotHandlers;

  constructor(
    ctx: NetMatchContext,
    loading: LoadingHandshake,
    reconnect: ReconnectController,
    guest: GuestSnapshotHandlers,
  ) {
    this.ctx = ctx;
    this.loading = loading;
    this.reconnect = reconnect;
    this.guest = guest;
  }

  handleUnreliableMessage(data: ArrayBuffer, fromPeerId?: string): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);

    if (this.ctx.isHost && this.ctx.hostAuthority) {
      this.ctx.hostAuthority.handleUnreliableMessage(data, fromPeerId);
    } else if (type === MsgType.SNAPSHOT) {
      this.guest.handleGuestSnapshot(data);
    } else if (type === MsgType.SNAPSHOT_DELTA) {
      this.guest.handleGuestDelta(data);
    }
    // Ping/pong handled by Transport — it intercepts before dispatching here.
  }

  handleReliableMessage(msg: ReliableMessage, fromPeerId?: string): void {
    if (this.ctx.isHost && this.ctx.hostAuthority) {
      this.ctx.hostAuthority.handleReliableMessage(msg, fromPeerId);
    }

    if (msg.type === MsgType.PAUSE) {
      if ((msg as { paused: boolean }).paused) {
        this.ctx.gameLoop.pause();
      } else {
        this.ctx.gameLoop.resume();
      }
    } else if (!this.ctx.isHost && msg.type === MsgType.SETTINGS_SYNC) {
      // Host-authoritative — guests apply the host's settings, the host never
      // accepts SETTINGS_SYNC from anyone. Without the !isHost gate, a buggy
      // or hostile guest could swap the host's arena mid-match by sending
      // SETTINGS_SYNC{arenaId:'volcano'} — Match.tsx wires onArenaChange to
      // gameLoop.switchArena which rebuilds the host's match state in place.
      if ('arenaId' in msg) {
        this.ctx.onArenaChange?.((msg as { arenaId: string }).arenaId);
      }
    } else if (!this.ctx.isHost && msg.type === MsgType.MATCH_RESULT) {
      // Host-broadcast only. A guest sending MATCH_RESULT to the host would
      // otherwise schedule a victory transition with the guest's chosen
      // winner, racing the host's authoritative endMatch.
      this.ctx.onMatchEnd?.(
        (msg as { winner: string | null }).winner as PlayerSlot | null,
        this.ctx.gameLoop.getState(),
      );
    } else if (!this.ctx.isHost && msg.type === MsgType.DISCONNECT) {
      // Host receives a guest's graceful DISCONNECT via hostAuthority
      // (peer removal). The NetMatchConfig.onDisconnect callback is the
      // guest's "reconnect-budget exhausted → flash 'Could not reconnect'"
      // hook — firing it on the host on a guest's polite leave would push
      // the host into the disconnect-victory screen.
      this.ctx.onDisconnect?.();
    } else if (!this.ctx.isHost && msg.type === MsgType.RECONNECT_SYNC) {
      // Honor host's pause state so the guest's render doesn't diverge from
      // a suspended simulation on the other end. Host gating: a guest sending
      // RECONNECT_SYNC could otherwise pause/unpause the host's sim and reset
      // the host's cosmetic prev-state baselines (silencing legitimate SFX
      // until the next state transition).
      const syncMsg = msg as { paused?: boolean };
      if (syncMsg.paused) this.ctx.gameLoop.pause();
      else this.ctx.gameLoop.resume();
      this.reconnect.completeReconnection();
    } else if (this.ctx.isHost && msg.type === MsgType.LOADED) {
      // Source-authenticate the slot from peerId. A peer could otherwise send
      // LOADED{slot: anotherPeer} and force-start the match before that peer
      // has actually warmed assets. CONNECTION_UNSTABLE below uses the same
      // pattern.
      if (!fromPeerId || !this.ctx.hostAuthority) return;
      const senderSlot = this.ctx.hostAuthority.getSlotForPeer(fromPeerId) as PlayerSlot | undefined;
      if (!senderSlot) return;
      this.loading.recordGuestLoaded(senderSlot);
    } else if (this.ctx.isHost && msg.type === MsgType.CONNECTION_UNSTABLE) {
      const stalled = (msg as { stalled: boolean }).stalled;
      if (fromPeerId && this.ctx.hostAuthority) {
        // Half-rate broadcast to this peer while they're stalled. Pairs with
        // the widened interpolation delay ceiling on the guest side — guest
        // can absorb the larger inter-arrival gaps without falling out of
        // the lerp window into extrapolation.
        this.ctx.hostAuthority.setPeerUnstable(fromPeerId, stalled);
        const slot = this.ctx.hostAuthority.getSlotForPeer(fromPeerId);
        if (slot) this.ctx.onGuestConnectionUnstable?.(slot, stalled);
      }
    } else if (this.ctx.isHost && msg.type === MsgType.RECONNECT_REQUEST) {
      if (!fromPeerId || !this.ctx.hostAuthority) return;
      const reqSlot = (msg as { slot: string }).slot as PlayerSlot;
      const presentedToken = (msg as { reclaimToken?: string }).reclaimToken;
      if (!this.ctx.hostAuthority.handleReconnectRequest(reqSlot, fromPeerId, presentedToken)) return;
      // Ack with current pause state so the guest's render doesn't diverge
      // from a suspended host sim.
      this.ctx.transport.sendReliableTo(fromPeerId, {
        type: MsgType.RECONNECT_SYNC,
        slot: reqSlot,
        snapshotFrame: this.ctx.hostAuthority.getLocalFrame(),
        paused: this.ctx.gameLoop.isPaused(),
      } as ReliableMessage);
      this.ctx.hostAuthority.sendSnapshotTo(fromPeerId, this.ctx.gameLoop.getState());
      this.loading.forgetSlot(reqSlot);
      this.ctx.onGuestReconnected?.(reqSlot);
    }
  }
}
