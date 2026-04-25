import type { MatchState, MatchSettings, PlayerSlot } from '../../types';
import { isBotSlot } from '../../types';
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
  private stopSound: (name: string) => void;
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
    stopSound: (name: string) => void,
    resimulatingGetter: () => boolean,
    onMatchEnd: (winner: PlayerSlot | null) => void,
  ) {
    this.state = state;
    this.settings = settings;
    this.theme = theme;
    this.playSound = playSound;
    this.stopSound = stopSound;
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
      return;
    }

    // Host match-end guard: if every human left the match (disconnected) AND
    // no bots remain, stop the simulation rather than let it run forever with
    // no opponents. Online-only edge case: in local play, player.disconnected
    // never flips. If the lone survivor is a human, award them the win; if
    // only bots remain (unusual), end with no winner.
    if (!this.resimulatingGetter() && !this.state.matchOver) {
      let activeHumans = 0;
      let activeBots = 0;
      let lastActiveHuman: PlayerSlot | null = null;
      for (const p of this.state.players) {
        if (p.disconnected || !p.active) continue;
        if (isBotSlot(p.id)) {
          activeBots++;
        } else {
          activeHumans++;
          lastActiveHuman = p.id;
        }
      }
      if (activeHumans + activeBots === 0) {
        this.onMatchEnd(null);
      } else if (activeHumans === 1 && activeBots === 0) {
        this.onMatchEnd(lastActiveHuman);
      }
    }
  }

  cleanup(): void {
    // Stop the ambient loops we started in init(). Today GameLoop.stop() and
    // switchArena() also call audio.stopAllGameSounds() before reaching here,
    // but cleanup() is the contract for "stop everything this system owns" —
    // making it idempotent and self-contained avoids a footgun if a future
    // call site reaches cleanup without running stopAllGameSounds first.
    for (const loop of this.activeAmbientLoops) {
      this.stopSound(loop);
    }
    if (this.crowdStarted) {
      this.stopSound('crowd');
      this.crowdStarted = false;
    }
    this.activeAmbientLoops = [];
    this.periodicAmbientTimers.clear();
  }
}
