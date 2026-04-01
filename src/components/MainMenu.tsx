import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { listArenas } from '../engine/arena';
import { listThemes } from '../engine/themes/registry';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawCloud,
  drawFgBush, drawTallGrass, drawFern, drawFgWildflower,
} from '../engine/themes/drawPrimitives';
import './MainMenu.css';

const MENU_GROUND_Y = 580;
const DAY_CYCLE_DURATION = 90; // seconds for full cycle

interface SimpleWildlife {
  x: number; y: number; vx: number; wingPhase: number;
  type: 'butterfly' | 'bird'; color: string;
}

function initWildlife(count: number, groundY: number): SimpleWildlife[] {
  const butterflyColors = ['#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'];
  const birdColors = ['#333', '#555', '#4A4A4A'];
  const result: SimpleWildlife[] = [];
  for (let i = 0; i < count; i++) {
    const isBird = i >= count * 0.7;
    result.push({
      x: Math.random() * CANVAS_WIDTH,
      y: isBird ? 30 + Math.random() * 80 : groundY * 0.3 + Math.random() * groundY * 0.5,
      vx: isBird ? 40 + Math.random() * 40 : 15 + Math.random() * 15,
      wingPhase: Math.random() * Math.PI * 2,
      type: isBird ? 'bird' : 'butterfly',
      color: isBird ? birdColors[i % birdColors.length] : butterflyColors[i % butterflyColors.length],
    });
  }
  return result;
}

function updateAndDrawWildlife(ctx: CanvasRenderingContext2D, wildlife: SimpleWildlife[], dt: number, groundY: number): void {
  for (const w of wildlife) {
    w.x += w.vx * dt;
    w.wingPhase += dt * (w.type === 'bird' ? 6 : 10);
    if (w.x > CANVAS_WIDTH + 20) { w.x = -20; w.y = w.type === 'bird' ? 30 + Math.random() * 80 : groundY * 0.3 + Math.random() * groundY * 0.5; }

    ctx.save();
    ctx.translate(w.x, w.y + Math.sin(w.wingPhase * 0.3) * (w.type === 'butterfly' ? 8 : 3));

    if (w.type === 'butterfly') {
      const wing = Math.sin(w.wingPhase) * 0.6;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-6 * Math.cos(wing), -4 * Math.abs(Math.sin(wing)) - 3); ctx.lineTo(-3, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(6 * Math.cos(wing), -4 * Math.abs(Math.sin(wing)) - 3); ctx.lineTo(3, 0);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.fillRect(-0.5, -1.5, 1, 3);
    } else {
      const flap = Math.sin(w.wingPhase) * 4;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, flap); ctx.lineTo(-3, -3); ctx.lineTo(0, 0); ctx.lineTo(3, -3); ctx.lineTo(8, flap);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawDayNight(ctx: CanvasRenderingContext2D, now: number): void {
  const dayPhase = (now % DAY_CYCLE_DURATION) / DAY_CYCLE_DURATION;
  const nightIntensity = Math.max(0, (1 - Math.cos(dayPhase * Math.PI * 2)) / 2);

  // Sun (visible first half of cycle)
  if (dayPhase < 0.5) {
    const sunProgress = dayPhase / 0.5;
    const sunX = 60 + sunProgress * 1160;
    const sunY = 130 - Math.sin(sunProgress * Math.PI) * 90;
    const redshift = Math.max(0, Math.abs(sunProgress - 0.5) * 2 - 0.3) * 0.7;
    ctx.save();
    ctx.globalAlpha = 1 - nightIntensity;
    // Glow
    const glowGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 48);
    glowGrad.addColorStop(0, `rgba(${255}, ${Math.round(220 - redshift * 80)}, ${Math.round(50 - redshift * 50)}, 0.3)`);
    glowGrad.addColorStop(1, 'rgba(255, 200, 50, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath(); ctx.arc(sunX, sunY, 48, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = `rgb(${255}, ${Math.round(230 - redshift * 100)}, ${Math.round(80 - redshift * 80)})`;
    ctx.beginPath(); ctx.arc(sunX, sunY, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(255, ${Math.round(245 - redshift * 50)}, ${Math.round(150 - redshift * 100)})`;
    ctx.beginPath(); ctx.arc(sunX, sunY, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Darkness overlay
  if (nightIntensity > 0.02) {
    ctx.save();
    ctx.globalAlpha = nightIntensity * 0.55;
    ctx.fillStyle = 'rgb(10, 12, 45)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  // Moon (visible second half)
  if (dayPhase >= 0.5) {
    const moonProgress = (dayPhase - 0.5) / 0.5;
    const moonX = 60 + moonProgress * 1160;
    const moonY = 130 - Math.sin(moonProgress * Math.PI) * 90;
    ctx.save();
    ctx.globalAlpha = nightIntensity;
    // Glow
    ctx.fillStyle = 'rgba(170, 187, 221, 0.25)';
    ctx.beginPath(); ctx.arc(moonX, moonY, 22, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = '#E8E8F0';
    ctx.beginPath(); ctx.arc(moonX, moonY, 12, 0, Math.PI * 2); ctx.fill();
    // Crescent
    ctx.fillStyle = 'rgb(10, 12, 45)';
    ctx.beginPath(); ctx.arc(moonX + 5, moonY - 2, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Stars
  if (nightIntensity > 0.25) {
    ctx.save();
    ctx.fillStyle = '#FFF';
    for (let i = 0; i < 30; i++) {
      const sx = (i * 137 + 83) % CANVAS_WIDTH;
      const sy = (i * 89 + 47) % 200;
      const twinkle = Math.sin(now * 2 + i * 1.7) * 0.3 + 0.7;
      ctx.globalAlpha = (nightIntensity - 0.25) * 2 * twinkle;
      const sr = 1 + (i % 3) * 0.5;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Fireflies
  if (nightIntensity > 0.4) {
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const baseX = (i * 173 + 50) % CANVAS_WIDTH;
      const baseY = 300 + (i * 97) % 250;
      const fx = baseX + Math.sin(now * 0.7 + i * 2.1) * 30;
      const fy = baseY + Math.cos(now * 0.5 + i * 1.3) * 20;
      ctx.globalAlpha = (nightIntensity - 0.4) * 1.5 * (Math.sin(now * 3 + i * 4.7) * 0.3 + 0.7);
      ctx.fillStyle = '#AAFF44';
      ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#CCFF66';
      ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

let menuWildlife: SimpleWildlife[] | null = null;
let menuLastTime = 0;

function drawMenuBackground(ctx: CanvasRenderingContext2D): void {
  const now = performance.now() / 1000;
  if (!menuWildlife) menuWildlife = initWildlife(8, MENU_GROUND_Y);
  const dt = menuLastTime ? Math.min(now - menuLastTime, 0.05) : 1 / 60;
  menuLastTime = now;

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  skyGrad.addColorStop(0, '#4A90D9');
  skyGrad.addColorStop(0.6, '#87CEEB');
  skyGrad.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Distant treeline
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#3A6A3A';
  ctx.beginPath();
  ctx.moveTo(-10, MENU_GROUND_Y + 10);
  for (let x = 0; x < 1300; x += 40) {
    ctx.lineTo(x, MENU_GROUND_Y - 50 - Math.sin(x * 0.013) * 20 - (x * 7 % 17));
  }
  ctx.lineTo(1300, MENU_GROUND_Y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Animated clouds
  const cloudDefs = [
    { speed: 6, offset: 0, y: 70, size: 80 },
    { speed: 4, offset: 350, y: 40, size: 90 },
    { speed: 9, offset: 700, y: 100, size: 60 },
    { speed: 5, offset: 150, y: 25, size: 70 },
    { speed: 7, offset: 550, y: 85, size: 55 },
  ];
  for (const c of cloudDefs) {
    const cx = (now * c.speed + c.offset) % (CANVAS_WIDTH + 300) - 150;
    drawCloud(ctx, cx, c.y, c.size);
  }

  // Hills
  const hills: [number, number, number, number][] = [[0, 350, 130, 580], [280, 450, 110, 590], [650, 380, 140, 575], [950, 400, 115, 590]];
  for (const [hx, hw, hh, hby] of hills) {
    ctx.fillStyle = '#5C9E4C';
    ctx.beginPath();
    ctx.moveTo(hx, hby);
    ctx.quadraticCurveTo(hx + hw / 2, hby - hh, hx + hw, hby);
    ctx.lineTo(hx + hw, MENU_GROUND_Y + 10);
    ctx.lineTo(hx, MENU_GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
  }

  // Ground
  const groundGrad = ctx.createLinearGradient(0, MENU_GROUND_Y, 0, CANVAS_HEIGHT);
  groundGrad.addColorStop(0, '#4a8c3f');
  groundGrad.addColorStop(0.15, '#3a7030');
  groundGrad.addColorStop(1, '#2a5520');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, MENU_GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - MENU_GROUND_Y);
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, MENU_GROUND_Y, CANVAS_WIDTH, 4);
  ctx.strokeStyle = '#5DAF4A';
  ctx.lineWidth = 2;
  for (let x = 5; x < CANVAS_WIDTH; x += 15) {
    ctx.beginPath();
    ctx.moveTo(x, MENU_GROUND_Y);
    ctx.lineTo(x - 2, MENU_GROUND_Y - 6 - (x * 7 % 5));
    ctx.stroke();
  }

  // Background trees
  drawTree(ctx, 40, MENU_GROUND_Y, 60);
  drawTree(ctx, 280, MENU_GROUND_Y, 45);
  drawTree(ctx, 1000, MENU_GROUND_Y, 55);
  drawTree(ctx, 1200, MENU_GROUND_Y, 48);

  // Bushes
  drawBush(ctx, 140, MENU_GROUND_Y, 30);
  drawBush(ctx, 420, MENU_GROUND_Y, 24);
  drawBush(ctx, 850, MENU_GROUND_Y, 28);
  drawBush(ctx, 1100, MENU_GROUND_Y, 22);

  // Flowers
  const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'];
  for (let fx = 60; fx < CANVAS_WIDTH; fx += 70 + (fx * 3 % 40)) {
    drawFlower(ctx, fx, MENU_GROUND_Y, flowerColors[Math.floor(fx * 0.01) % flowerColors.length]);
  }

  // Mushrooms
  drawMushroom(ctx, 200, MENU_GROUND_Y);
  drawMushroom(ctx, 750, MENU_GROUND_Y);
  drawMushroom(ctx, 1150, MENU_GROUND_Y);

  // Grass tufts
  for (let gx = 30; gx < CANVAS_WIDTH; gx += 80 + (gx * 5 % 30)) {
    drawGrassTuft(ctx, gx, MENU_GROUND_Y);
  }

  // Foreground decorations
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawFgBush(ctx, 80, MENU_GROUND_Y, 55);
  drawFgBush(ctx, 500, MENU_GROUND_Y, 48);
  drawFgBush(ctx, 920, MENU_GROUND_Y, 52);
  drawFgBush(ctx, 1180, MENU_GROUND_Y, 42);
  drawTallGrass(ctx, 180, MENU_GROUND_Y, 7);
  drawTallGrass(ctx, 660, MENU_GROUND_Y, 8);
  drawTallGrass(ctx, 1060, MENU_GROUND_Y, 6);
  drawFern(ctx, 50, MENU_GROUND_Y);
  drawFern(ctx, 780, MENU_GROUND_Y);
  drawFern(ctx, 1230, MENU_GROUND_Y);
  drawFgWildflower(ctx, 320, MENU_GROUND_Y, '#FF6B8A', 20);
  drawFgWildflower(ctx, 600, MENU_GROUND_Y, '#DDA0DD', 18);
  drawFgWildflower(ctx, 1100, MENU_GROUND_Y, '#FFD700', 16);
  ctx.restore();

  // Fog wisps
  ctx.save();
  for (let fi = 0; fi < 12; fi++) {
    const fx = (now * (2 + fi * 0.4) + fi * 110) % (CANVAS_WIDTH + 100) - 50;
    const fy = MENU_GROUND_Y - 2 + Math.sin(fi * 2.1) * 8;
    ctx.globalAlpha = 0.08 + (fi % 3) * 0.04;
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 45, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Wildlife
  updateAndDrawWildlife(ctx, menuWildlife!, dt, MENU_GROUND_Y);

  // Day/night cycle
  drawDayNight(ctx, now);
}

export function MainMenu() {
  const { t, i18n } = useTranslation();
  const { setScreen, matchSettings, setMatchSettings } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const handlePlay = useCallback(() => {
    audio.init();
    audio.play('select');
    setScreen('charSelect');
  }, [setScreen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handlePlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const loop = () => {
      drawMenuBackground(ctx);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="main-menu" data-testid="main-menu">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="menu-bg-canvas" />
      <div className="menu-bg">
        <div className="menu-content">
          <h1 className="game-title">
            <span className="title-bunny">{t('title_bunny')}</span>
            <span className="title-brawl">{t('title_brawl')}</span>
          </h1>
          <p className="tagline">{t('tagline')}</p>
          <p className="controls-hint">{t('credits_players')}</p>

          <div className="menu-buttons">
            <button className="menu-btn play-btn" onClick={handlePlay} data-testid="play-button">
              {t('play')}
            </button>
          </div>

          <div className="arena-selector" data-testid="arena-selector">
            <span className="arena-label">{t('arena_label')}</span>
            <div className="arena-options">
              {(() => {
                const arenas = listArenas();
                const themes = listThemes();
                return arenas.map(a => {
                  const theme = themes.find(th => th.id === a.themeId);
                  return (
                    <button
                      key={a.id}
                      className={`arena-option ${matchSettings.arenaId === a.id ? 'selected' : ''}`}
                      onClick={() => {
                        audio.init();
                        audio.play('select');
                        setMatchSettings({ arenaId: a.id });
                      }}
                    >
                      <div className="arena-preview" style={{ background: theme?.previewGradient || '#333' }}>
                        <span className="arena-icon">{theme?.previewIcon || ''}</span>
                      </div>
                      <span className="arena-name">{t(theme?.nameKey || a.name)}</span>
                    </button>
                  );
                });
              })()}
              <button
                className={`arena-option ${matchSettings.arenaId === 'random' ? 'selected' : ''}`}
                onClick={() => {
                  audio.init();
                  audio.play('select');
                  setMatchSettings({ arenaId: 'random' });
                }}
              >
                <div className="arena-preview arena-preview-random">
                  <span className="arena-icon">🎲</span>
                </div>
                <span className="arena-name">{t('arena_random')}</span>
              </button>
            </div>
          </div>

          <div className="menu-settings">
            <label className="gore-toggle">
              <input
                type="checkbox"
                checked={matchSettings.goreMode}
                onChange={(e) => setMatchSettings({ goreMode: e.target.checked })}
                data-testid="gore-toggle"
              />
              <span>{t('blood_mode')}</span>
            </label>

            <div className="bot-settings" data-testid="bot-settings">
              <div className="bot-count-row">
                <span className="bot-label">{t('bot_label')}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.max(0, matchSettings.botCount - 1) })}
                  disabled={matchSettings.botCount <= 0}
                >-</button>
                <span className="bot-count" data-testid="bot-count">{matchSettings.botCount}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.min(5, matchSettings.botCount + 1) })}
                  disabled={matchSettings.botCount >= 5}
                >+</button>
              </div>
              {matchSettings.botCount > 0 && (
                <div className="bot-difficulty-row">
                  {(['easy', 'medium', 'hard', 'impossible'] as const).map(d => (
                    <button
                      key={d}
                      className={`difficulty-btn ${matchSettings.botDifficulty === d ? 'selected' : ''}`}
                      onClick={() => setMatchSettings({ botDifficulty: d })}
                    >
                      {t(`bot_diff_${d}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="credits">
            <p className="lang-toggle" style={{ marginTop: '8px', cursor: 'pointer', fontSize: '14px', opacity: 0.7 }}>
              <span
                onClick={() => i18n.changeLanguage('en')}
                style={{ fontWeight: i18n.language === 'en' ? 'bold' : 'normal', opacity: i18n.language === 'en' ? 1 : 0.6 }}
              >
                <svg width="18" height="12" viewBox="0 0 60 40" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <rect width="60" height="40" fill="#012169"/>
                  <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="7"/>
                  <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4"/>
                  <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="10"/>
                  <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6"/>
                </svg>
                EN
              </span>
              {' | '}
              <span
                onClick={() => i18n.changeLanguage('cs')}
                style={{ fontWeight: i18n.language === 'cs' ? 'bold' : 'normal', opacity: i18n.language === 'cs' ? 1 : 0.6 }}
              >
                <svg width="18" height="12" viewBox="0 0 60 40" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <rect width="60" height="20" fill="#fff"/>
                  <rect y="20" width="60" height="20" fill="#D7141A"/>
                  <polygon points="0,0 30,20 0,40" fill="#11457E"/>
                </svg>
                CS
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
