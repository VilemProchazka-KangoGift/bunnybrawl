/**
 * Test event sink for Simulator. Implements all SimulatorEvents callbacks by
 * pushing to typed arrays so tests can assert on emitted side effects without
 * involving audio/renderer/howler mocks.
 *
 * Usage:
 *   const events = new CapturedEvents();
 *   const sim = new Simulator({ arena, settings, activePlayers, events });
 *   sim.fixedUpdate(FIXED_TIMESTEP);
 *   expect(events.sfx).toContainEqual(expect.objectContaining({ name: 'stomp' }));
 */
import type { MatchPhase, MatchState, PlayerSlot } from '../../types';
import type { SimulatorEvents } from '../../simulator/types';

export class CapturedEvents implements Required<SimulatorEvents> {
  sfx: Array<{ name: string }> = [];
  musicStart: Array<{ themeId: string }> = [];
  musicStop = 0;
  soundStop: Array<{ name: string }> = [];
  soundVolume: Array<{ name: string; volume: number }> = [];
  allGameSoundsStop = 0;
  phaseChange: Array<{ phase: MatchPhase }> = [];
  matchEnd: Array<{ winner: PlayerSlot | null; state: MatchState }> = [];
  playerLanding: Array<{ slot: PlayerSlot; prevVy: number }> = [];
  stompHaptic: Array<{ slot: PlayerSlot }> = [];

  onSfxRequest = (name: string): void => {
    this.sfx.push({ name });
  };
  onMusicStartRequest = (themeId: string): void => {
    this.musicStart.push({ themeId });
  };
  onMusicStopRequest = (): void => {
    this.musicStop++;
  };
  onSoundStopRequest = (name: string): void => {
    this.soundStop.push({ name });
  };
  onSoundVolumeRequest = (name: string, volume: number): void => {
    this.soundVolume.push({ name, volume });
  };
  onAllGameSoundsStopRequest = (): void => {
    this.allGameSoundsStop++;
  };
  onPhaseChange = (phase: MatchPhase): void => {
    this.phaseChange.push({ phase });
  };
  onMatchEnd = (winner: PlayerSlot | null, state: MatchState): void => {
    this.matchEnd.push({ winner, state });
  };
  onPlayerLanding = (slot: PlayerSlot, prevVy: number): void => {
    this.playerLanding.push({ slot, prevVy });
  };
  onStompHaptic = (slot: PlayerSlot): void => {
    this.stompHaptic.push({ slot });
  };

  /** Reset every captured array/counter to its initial empty state. */
  clear(): void {
    this.sfx.length = 0;
    this.musicStart.length = 0;
    this.musicStop = 0;
    this.soundStop.length = 0;
    this.soundVolume.length = 0;
    this.allGameSoundsStop = 0;
    this.phaseChange.length = 0;
    this.matchEnd.length = 0;
    this.playerLanding.length = 0;
    this.stompHaptic.length = 0;
  }

  /** Convenience — names of all sfx requests fired since last clear, in order. */
  sfxNames(): string[] {
    return this.sfx.map(s => s.name);
  }
}
