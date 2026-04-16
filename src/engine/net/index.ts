// Legacy exports (still used by gameLoop.ts, ai/, stomp.ts)
export { SeededRNG } from './prng';
export {
  takeSnapshot, restoreSnapshot,
  hashGameState,
} from './serialize';
export type { GameSnapshot, PlayerSnapshot, AISnapshot } from './serialize';

// Transport (Trystero MQTT signaling)
export { Transport } from './transport';
export type { ConnectionStatus, ConnectionHealth, TransportEvents, PeerInfo } from './transport';

// Protocol
export { MsgType, PROTOCOL_VERSION, decodeSlot } from './protocol';
export type { ReliableMessage, PlayerJoinedMessage, PlayerLeftMessage, SlotAssignmentMessage } from './protocol';
export {
  encodeInputMessage, decodeInputMessage,
  encodeInput, decodeInput,
  encodePing, encodePong, decodePingPong,
  encodeSnapshotAck, decodeSnapshotAck,
} from './protocol';

// Host-authoritative architecture
export { NetMatch } from './netMatch';
export type { NetMatchConfig } from './netMatch';

export { HostAuthority } from './hostAuthority';
export type { HostAuthorityConfig, HostDebugStats } from './hostAuthority';

export { EntityInterpolation, applySnapshotToState } from './interpolation';
export { InputEcho } from './inputEcho';

export { drawNetDebugOverlay } from './debugOverlay';
export type { NetDebugStats } from './debugOverlay';

export {
  encodeSnapshot, decodeSnapshot, takeAuthSnapshot,
  createDelta, applyDelta,
} from './snapshot';
export type { AuthSnapshot, SnapshotPlayer } from './snapshot';
