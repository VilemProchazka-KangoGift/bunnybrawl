import type { MatchState, MatchSettings, PlayerSlot } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { GameplaySystem } from '../types';
import { updateCrowdCheering, tickPeriodicAmbient } from '../cosmetics/sfx';
import { checkMatchEnd } from './match';
import { SLOW_MO_DURATION } from '../../constants';
import { randRange } from '../../themes/utils';

export class MatchSystem implements GameplaySystem {
  private state: MatchState;
  private settings: MatchSettings;
  private theme: ThemeConfig;
  private playSound: (name: string) => void;
  private resimulatingGetter: () => boolean;
  private onMatchEnd: (winner: PlayerSlot | null) => void;

  private crowdStarted: boolean;
  private activeAmbientLoops: string[];
  private periodicAmbientTimers: Map<string, number>;

  constructor(
    state: MatchState,
    settings: MatchSettings,
    theme: ThemeConfig,
    playSound: (name: string) => void,
    resimulatingGetter: () => boolean,
    onMatchEnd: (winner: PlayerSlot | null) => void,
  ) {
    this.state = state;
    this.settings = settings;
    this.theme = theme;
    this.playSound = playSound;
    this.resimulatingGetter = resimulatingGetter;
    this.onMatchEnd = onMatchEnd;
    this.crowdStarted = false;
    this.activeAmbientLoops = [];
    this.periodicAmbientTimers = new Map();
  }

  init(): void {
    // Start theme ambient loops
    const ambConfig = this.theme.ambientSoundConfig;
    if (ambConfig?.loops) {
      for (const loop of ambConfig.loops) {
        this.playSound(loop);
        this.activeAmbientLoops.push(loop);
      }
    }
    // Initialize periodic ambient timers with random first-fire delay
    if (ambConfig?.periodic) {
      for (const p of ambConfig.periodic) {
        const delay = randRange(p.intervalRange);
        this.periodicAmbientTimers.set(p.sound, delay);
      }
    }
  }

  fixedUpdate(dt: number): void {
    // Crowd cheering + periodic ambient sounds (skip during resimulation)
    if (!this.resimulatingGetter()) {
      this.crowdStarted = updateCrowdCheering(this.state, this.settings, this.crowdStarted, this.playSound);
      tickPeriodicAmbient(this.theme, this.periodicAmbientTimers, dt, this.playSound);
    }

    // Check match end
    const winner = checkMatchEnd(this.state, this.settings);
    if (winner !== null) {
      this.state.slowMotion = SLOW_MO_DURATION;
      this.onMatchEnd(winner);
    }
  }

  cleanup(): void {
    this.activeAmbientLoops = [];
    this.periodicAmbientTimers.clear();
  }
}
