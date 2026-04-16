import type { MatchState } from '../types';

export interface GameplaySystem {
  init(state: MatchState): void;
  fixedUpdate(dt: number): void;
  cleanup(): void;
}

export interface CosmeticSystem {
  init(state: MatchState): void;
  cosmeticUpdate(dt: number): void;
  cleanup(): void;
}
