import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { suppressLandscapePrompt } from './LandscapePrompt';
import './MobileTextInput.css';

interface MobileTextInputProps {
  value: string;
  maxLength: number;
  label: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * Fullscreen text input overlay for mobile.
 * Unlocks orientation so the user can type in portrait (more room above keyboard),
 * then re-locks landscape on close.
 */
export function MobileTextInput({ value, maxLength, label, onConfirm, onCancel }: MobileTextInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Suppress the "rotate your device" prompt while typing
    suppressLandscapePrompt(true);
    // Unlock orientation so user can type in portrait
    (screen.orientation as any)?.unlock?.();
    inputRef.current?.focus();
    return () => {
      suppressLandscapePrompt(false);
      // Re-lock landscape when overlay closes
      (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => {});
    };
  }, []);

  const handleDone = () => {
    onConfirm(draft);
  };

  // Portal to document.body — escapes GameScaler's CSS transform which breaks position:fixed
  return createPortal(
    <div className="mobile-text-overlay">
      <div className="mobile-text-content">
        <span className="mobile-text-label">{label}</span>
        <input
          ref={inputRef}
          className="mobile-text-input"
          type="text"
          maxLength={maxLength}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[\p{C}]/gu, '').slice(0, maxLength))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleDone(); }}
        />
        <div className="mobile-text-buttons">
          <button className="btn-base mobile-text-cancel" onClick={onCancel}>{t('pause_back', 'Cancel')}</button>
          <button className="btn-base mobile-text-done" onClick={handleDone}>{t('done', 'Done')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
