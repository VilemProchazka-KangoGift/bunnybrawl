// Hidden dev menu — opened via backtick on the main menu. Toggles debug overlays.

import { useReducer } from 'react';
import { setDebugFlag, getDebugFlag, type DebugFlagName } from '../engine/debugFlags';

interface DevMenuProps {
  onClose: () => void;
}

interface FlagDef {
  key: DebugFlagName;
  label: string;
  desc: string;
}

const FLAGS: readonly FlagDef[] = [
  { key: 'fps', label: 'FPS counter', desc: 'Show frames-per-second overlay.' },
  { key: 'net', label: 'Net debug overlay', desc: 'RTT, jitter, snapshot stats during online matches.' },
  { key: 'nav', label: 'Nav graph overlay', desc: 'AI navigation graph (in-match only).' },
  { key: 'perf', label: 'Perf instrumentation', desc: 'Section timing capture for perf reports.' },
];

export function DevMenu({ onClose }: DevMenuProps) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const toggle = (k: DebugFlagName) => {
    setDebugFlag(k, !getDebugFlag(k));
    rerender();
  };

  return (
    <div className="mods-overlay" onClick={onClose}>
      <div className="mods-modal" onClick={e => e.stopPropagation()} data-testid="dev-menu">
        <h2 className="mods-title">Dev Menu</h2>
        <p className="help-text" style={{ opacity: 0.7, marginBottom: 12 }}>
          Hidden debug toggles. Press <kbd>`</kbd> to open/close.
        </p>
        {FLAGS.map(f => (
          <div className="mod-row" key={f.key}>
            <label className="mod-toggle">
              <input
                type="checkbox"
                checked={getDebugFlag(f.key)}
                onChange={() => toggle(f.key)}
                data-testid={`dev-toggle-${f.key}`}
              />
              <div className="mod-info">
                <span className="mod-name">{f.label}</span>
                <span className="mod-desc">{f.desc}</span>
              </div>
            </label>
          </div>
        ))}
        <button className="btn-base mods-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
