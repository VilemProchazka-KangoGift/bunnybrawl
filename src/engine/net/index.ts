// Legacy exports (still used by gameLoop.ts, ai/, stomp.ts — will be cleaned up later)
export { SeededRNG } from './prng';
export {
  takeSnapshot, restoreSnapshot, takeSnapshotInto, createEmptySnapshot,
  hashGameState, crc32,
} from './serialize';
export type { GameSnapshot, PlayerSnapshot, AISnapshot } from './serialize';

// Transport (rewritten to use Trystero)
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

// New host-authoritative architecture
export { NetMatch } from './netMatch';
export type { NetMatchConfig } from './netMatch';

export { HostAuthority } from './hostAuthority';
export type { HostAuthorityConfig, HostDebugStats } from './hostAuthority';

export { ClientPrediction } from './clientPrediction';
export { EntityInterpolation, applySnapshotToState } from './interpolation';
export { InputEcho } from './inputEcho';

export {
  encodeSnapshot, decodeSnapshot, takeAuthSnapshot,
  createDelta, applyDelta,
} from './snapshot';
export type { AuthSnapshot, SnapshotPlayer } from './snapshot';
