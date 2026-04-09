import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isTouchPrimary } from '../engine/touchDetect';
import './LandscapePrompt.css';

/** Set to true to temporarily suppress the landscape prompt (e.g. during text input). */
let _suppressed = false;
export function suppressLandscapePrompt(suppress: boolean) { _suppressed = suppress; }

export function LandscapePrompt() {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!isTouchPrimary()) return;

    const check = () => {
      setShowPrompt(!_suppressed && window.innerWidth < window.innerHeight);
    };
    check();
    const interval = setInterval(check, 300);
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('resize', check);
      clearInterval(interval);
    };
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="landscape-prompt">
      <div className="landscape-prompt-content">
        <div className="landscape-prompt-icon">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <rect x="18" y="10" width="44" height="60" rx="6" stroke="white" strokeWidth="3" fill="none" />
            <path d="M40 58 L40 62" stroke="white" strokeWidth="2" strokeLinecap="round" />
            {/* Rotation arrow */}
            <path d="M65 40 A28 28 0 0 1 40 68" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M38 64 L40 68 L36 68" fill="rgba(255,255,255,0.5)" />
          </svg>
        </div>
        <p className="landscape-prompt-text">{t('rotate_device', 'Rotate your device')}</p>
      </div>
    </div>
  );
}
