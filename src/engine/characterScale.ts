/** Shared gameplay size: distances and velocities scale together, time does not.
 * Keep this pure so the lobby, simulator and workers use exactly the same rule.
 */
export function normalizeCharacterScale(value?: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(1.5, Math.max(1, value)) : 1;
}

export const CHARACTER_SCALE_STUDY = [1, 1.25, 1.5] as const;
