// Hidden dev menu — opened via backtick on the main menu (or 4s long-press
// on the settings gear on mobile). Surfaces every URL debug param as a UI
// row so devs don't have to remember query-string spellings.
//
// "Live" rows take effect immediately via their emitters. "Reload-required"
// rows persist to localStorage on toggle; the modal triggers `location.reload()`
// on close iff any of them changed since open.

import { useReducer, useRef } from 'react';
import { setDebugFlag, getDebugFlag, type DebugFlagName } from '../engine/debugFlags';
import {
  isLightingEnabled, setLightingEnabled,
} from '../engine/lighting';
import { getBrightness, setBrightness } from '../engine/lighting/brightness';
import { getPhotosensitivity, setPhotosensitivity } from '../engine/lighting/photosensitivity';
import { getPerfTier, setPerfTier } from '../engine/lighting/perfTier';
import type { PerfTier } from '../engine/lighting/types';
import { isSimWorkerEnabled, setSimWorkerEnabled } from '../engine/worker/simWorkerFlag';
import { isInputEchoEnabled, setInputEchoEnabled } from '../engine/net/inputEchoFlag';
import { isTurnEnabled, setTurnEnabled } from '../engine/net/turnFlag';
import { isSabDemoEnabled, setSabDemoEnabled } from '../engine/worker/sabDemoFlag';
import {
  getSimLatency, setSimLatency,
  getSimJitter, setSimJitter,
  getSimLoss, setSimLoss,
} from '../engine/net/netSimFlags';

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

const PERF_TIERS: readonly PerfTier[] = ['low', 'med', 'high'];

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="dev-section-header">{children}</div>;
}

interface ToggleRowProps {
  testId: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ testId, label, desc, checked, onChange }: ToggleRowProps) {
  return (
    <div className="mod-row">
      <label className="mod-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={testId}
        />
        <div className="mod-info">
          <span className="mod-name">{label}</span>
          <span className="mod-desc">{desc}</span>
        </div>
      </label>
    </div>
  );
}

interface NumberRowProps {
  testId: string;
  label: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function NumberRow({ testId, label, desc, value, min, max, step, onChange }: NumberRowProps) {
  return (
    <div className="dev-row">
      <div className="mod-info">
        <span className="mod-name">{label}</span>
        <span className="mod-desc">{desc}</span>
      </div>
      <input
        type="number"
        className="dev-input"
        value={value}
        min={min}
        max={max}
        step={step}
        // Emitter's `parse` clamps invalid input to the default — no need to
        // pre-validate here.
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        data-testid={testId}
      />
    </div>
  );
}

// Getters for the reload-on-close flag set. Snapshot taken on mount, compared
// on close — any drift triggers a reload so boot-only flags take effect.
const RELOAD_GETTERS = [
  isSimWorkerEnabled, isInputEchoEnabled, isTurnEnabled, isSabDemoEnabled,
  getSimLatency, getSimJitter, getSimLoss,
] as const;

export function DevMenu({ onClose }: DevMenuProps) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const initialSnapshot = useRef(RELOAD_GETTERS.map(g => g()));

  const closeAndMaybeReload = () => {
    const dirty = RELOAD_GETTERS.some((g, i) => g() !== initialSnapshot.current[i]);
    onClose();
    if (dirty) location.reload();
  };

  const toggleDebug = (k: DebugFlagName) => {
    setDebugFlag(k, !getDebugFlag(k));
    rerender();
  };

  return (
    <div className="mods-overlay" onClick={closeAndMaybeReload}>
      <div className="mods-modal dev-menu-modal" onClick={e => e.stopPropagation()} data-testid="dev-menu">
        <h2 className="mods-title">Dev Menu</h2>
        <p className="dev-menu-hint">
          Mirrors every <code>?param</code> debug flag. Press <kbd>`</kbd> to open/close.
          Some flags require a page reload — closing the modal will reload automatically.
        </p>

        <SectionHeader>Debug overlays</SectionHeader>
        {FLAGS.map(f => (
          <ToggleRow
            key={f.key}
            testId={`dev-toggle-${f.key}`}
            label={f.label}
            desc={f.desc}
            checked={getDebugFlag(f.key)}
            onChange={() => toggleDebug(f.key)}
          />
        ))}

        <SectionHeader>Lighting &amp; accessibility</SectionHeader>
        <ToggleRow
          testId="dev-toggle-lighting"
          label="Lighting"
          desc="Master kill switch for the lighting pipeline."
          checked={isLightingEnabled()}
          onChange={(v) => { setLightingEnabled(v); rerender(); }}
        />
        <ToggleRow
          testId="dev-toggle-photosensitivity"
          label="Photosensitivity safe mode"
          desc="Caps ambient floor + sun intensity; reduces flicker amplitude."
          checked={getPhotosensitivity()}
          onChange={(v) => { setPhotosensitivity(v); rerender(); }}
        />
        <NumberRow
          testId="dev-input-brightness"
          label="Brightness"
          desc="Final composite multiplier. Range 0.5–1.5."
          value={getBrightness()}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(v) => { setBrightness(v); rerender(); }}
        />
        <div className="dev-row">
          <div className="mod-info">
            <span className="mod-name">Perf tier</span>
            <span className="mod-desc">Lighting pipeline quality tier (M1 only honors med).</span>
          </div>
          <select
            className="dev-input"
            value={getPerfTier()}
            onChange={(e) => { setPerfTier(e.target.value as PerfTier); rerender(); }}
            data-testid="dev-select-perftier"
          >
            {PERF_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <SectionHeader>Experiments (reload on close)</SectionHeader>
        <ToggleRow
          testId="dev-toggle-simworker"
          label="Sim in worker"
          desc="Run the full Simulator inside the engine worker (?simWorker=on)."
          checked={isSimWorkerEnabled()}
          onChange={(v) => { setSimWorkerEnabled(v); rerender(); }}
        />
        <ToggleRow
          testId="dev-toggle-inputecho"
          label="Input echo"
          desc="Guest-side instant visual feedback. Off = legacy ?noecho."
          checked={isInputEchoEnabled()}
          onChange={(v) => { setInputEchoEnabled(v); rerender(); }}
        />
        <ToggleRow
          testId="dev-toggle-turn"
          label="TURN relay servers"
          desc="Free relay for symmetric NAT fallback. Off = legacy ?noturn."
          checked={isTurnEnabled()}
          onChange={(v) => { setTurnEnabled(v); rerender(); }}
        />
        <ToggleRow
          testId="dev-toggle-sabdemo"
          label="SAB demo entry"
          desc="Boot into the SharedArrayBuffer demo harness instead of the app."
          checked={isSabDemoEnabled()}
          onChange={(v) => { setSabDemoEnabled(v); rerender(); }}
        />

        <SectionHeader>Network simulation (reload on close)</SectionHeader>
        <NumberRow
          testId="dev-input-simlatency"
          label="Latency (ms)"
          desc="Per-packet delay applied to both peers."
          value={getSimLatency()}
          min={0}
          max={1000}
          step={10}
          onChange={(v) => { setSimLatency(v); rerender(); }}
        />
        <NumberRow
          testId="dev-input-simjitter"
          label="Jitter (ms)"
          desc="Random ± variation added to latency."
          value={getSimJitter()}
          min={0}
          max={500}
          step={5}
          onChange={(v) => { setSimJitter(v); rerender(); }}
        />
        <NumberRow
          testId="dev-input-simloss"
          label="Packet loss (%)"
          desc="Probability each packet is dropped."
          value={getSimLoss()}
          min={0}
          max={100}
          step={1}
          onChange={(v) => { setSimLoss(v); rerender(); }}
        />

        <button className="btn-base mods-close-btn" onClick={closeAndMaybeReload} data-testid="dev-close-btn">
          Close
        </button>
      </div>
    </div>
  );
}
