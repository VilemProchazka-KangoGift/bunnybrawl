import type { InputState } from '../types';
import type { TouchInputManager } from '../touchInput';

/**
 * Merge keyboard + touch input into a single `InputState`. Used by
 * `GameLoop.getInputAny` (local sim) and `EngineWorkerProxy.getInputAny`
 * (remote sim) — same merge semantics, different sources for the
 * airborne lookup.
 *
 * `airborne` flips the touch manager's tap → fast-fall conversion: an
 * airborne player's "jump" tap becomes a "down" press. The caller looks
 * up the touch player's `state` from whichever state ref they own
 * (Simulator state on main, mirrored state on worker proxy) and passes
 * the boolean in.
 */
export function mergeKeyboardTouchInput(
  kb: InputState,
  touch: TouchInputManager | null,
  airborne: boolean,
  out?: InputState,
): InputState {
  if (!touch) return kb;
  const ti = touch.getInputForPlayer(airborne);
  if (out) {
    out.left = kb.left || ti.left;
    out.right = kb.right || ti.right;
    out.jump = kb.jump || ti.jump;
    out.down = kb.down || ti.down;
    return out;
  }
  return {
    left: kb.left || ti.left,
    right: kb.right || ti.right,
    jump: kb.jump || ti.jump,
    down: kb.down || ti.down,
  };
}
