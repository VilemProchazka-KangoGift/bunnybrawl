import type { InputState, PlayerSlot } from '../types';

/** Perf-only, read-only probe. Times input consumption and render submission,
 * not display presentation. Epoch clocks allow comparison across threads. */
export interface InputProbeRequest {
  id: number;
  slot: PlayerSlot;
  button: keyof InputState;
  pressed: boolean;
}

export class InputProbe {
  private request: InputProbeRequest | null = null;
  private consumedAt: number | null = null;

  arm(request: InputProbeRequest): void {
    this.request = request;
    this.consumedAt = null;
  }

  observe(slot: PlayerSlot, input: InputState, now: number): void {
    if (this.request?.slot === slot && this.consumedAt === null
      && input[this.request.button] === this.request.pressed) {
      this.consumedAt = now;
    }
  }

  rendered(now: number): { id: number; consumedAt: number; renderedAt: number } | null {
    if (!this.request || this.consumedAt === null) return null;
    const result = { id: this.request.id, consumedAt: this.consumedAt, renderedAt: now };
    this.request = null;
    this.consumedAt = null;
    return result;
  }

  clear(): void { this.request = null; this.consumedAt = null; }
}
