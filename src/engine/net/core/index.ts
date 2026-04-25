/**
 * Generic host-authoritative P2P netcode core.
 *
 * This module has ZERO game-specific imports. All game knowledge is injected
 * via the interfaces in types.ts. If this rule holds, extracting to a
 * separate package is a file-move operation.
 */

// Generic interfaces
export type {
  SnapshotCodec,
  InterpolationConfig,
  InputCodec,
} from './types';

// Network simulator (latency/jitter/loss injection)
export { NetworkSimulator } from './networkSimulator';
export type { SimulatorConfig } from './networkSimulator';

// Delta compression (XOR + RLE)
export { createDelta, applyDelta } from './deltaCompression';

// Generic protocol (transport-level encoding, no game types)
export {
  CoreMsgType,
  encodePing, encodePong, decodePingPong,
  encodeSnapshotAck, decodeSnapshotAck,
  PROTOCOL_VERSION,
} from './protocol';

// Interpolation engine (generic ring buffer + adaptive delay)
export { SnapshotInterpolation } from './interpolation';
export type { InterpolationResult } from './interpolation';

// Host authority (generic input buffering + snapshot broadcast)
export { GenericHostAuthority, generateReclaimToken } from './hostAuthority';
export type { HostTransport, HostDebugStats } from './hostAuthority';

// Config types
export type { HostAuthorityConfig } from './types';

// Debug overlay
export { drawNetDebugOverlay } from './debugOverlay';
export type { NetDebugStats } from './debugOverlay';
