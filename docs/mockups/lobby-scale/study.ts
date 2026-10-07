import '../../../src/i18n';
import { mulberry32 } from '../../../src/engine/themes/drawPrimitives';
import { registerBuiltinCharacters, regenerateLobbyRoster } from '../../../src/engine/characters';
import { registerPlayablePlushRoster } from '../../../src/engine/characters/plush/playableRoster';
import { loadLobbyArena } from '../../../src/engine/arenas/loading';
import { preloadIllustratedBackdrop } from '../../../src/engine/arenas/illustratedBackdropAsset';
import { getTheme } from '../../../src/engine/arenas/operations';
import { LobbyGame } from '../../../src/engine/lobbyGame';
import { Renderer } from '../../../src/engine/renderer';
import { drawLobbyOverlay } from '../../../src/engine/lobbyRender';
import { normalizeCharacterScale } from '../../../src/engine/characterScale';
import { LOBBY_JUMP, LOBBY_GRAVITY, LOBBY_SPEED, GROUND_Y, WALL_HEIGHT } from '../../../src/engine/lobbyConstants';

registerBuiltinCharacters();
await Promise.all([loadLobbyArena(), registerPlayablePlushRoster().catch(() => registerPlayablePlushRoster()), preloadIllustratedBackdrop('meadow'), document.fonts.ready]);
const canvas = (id: string) => document.getElementById(id) as HTMLCanvasElement;
const renderer = new Renderer({ bgCanvas: canvas('bg'), fgCanvas: canvas('fg'), hudCanvas: canvas('hud'), theme: getTheme('lobby') });
const keys = new Set<string>();
let scale = normalizeCharacterScale(Number(new URLSearchParams(location.search).get('scale') ?? '1.5'));
let night = false;
let game: LobbyGame;
function reset() {
  Math.random = mulberry32(731);
  game?.destroy();
  regenerateLobbyRoster();
  game = new LobbyGame({ botCount: 0, isMobile: false, characterScale: scale });
  // Spread the cast deliberately so scale comparisons start from a readable lineup.
  game.extraChars.forEach((p, i) => { p.x = 50 + (i % 8) * 78; p.y = GROUND_Y - p.height; });
  game.players.forEach((p, i) => { p.x = 70 + i * 125; p.y = GROUND_Y - p.height; });
  renderer.renderBackground(game.getArena());
  document.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.scale) === scale)));
  document.getElementById('metrics')!.textContent = `Body: ${32 * scale} × ${32 * scale} px · speed: ${LOBBY_SPEED * scale} px/s · jump height: ${Math.round(LOBBY_JUMP ** 2 / (2 * LOBBY_GRAVITY) * scale)} px · jump airtime: 1.33 s · tutorial log: ${WALL_HEIGHT} px`;
  (document.getElementById('lobby-link') as HTMLAnchorElement).href = `/bunnybrawl/?characterScale=${scale}`;
  (document.getElementById('match-link') as HTMLAnchorElement).href = `/bunnybrawl/?arena=meadow&bots=2&characterScale=${scale}`;
}
reset();
renderer.setLobbyOverlayFn(ctx => {
  const counts = game.getReadyZoneCounts();
  drawLobbyOverlay(ctx, { players: game.players, bots: game.bots, extras: game.extraChars, countdown: game.countdown, countdownActive: game.countdownStarted, isMobile: false, inZoneCount: counts.inZone, humanInZoneCount: counts.humans, botInZoneCount: counts.bots });
});
document.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach(b => b.onclick = () => { scale = Number(b.dataset.scale); reset(); });
document.getElementById('night')!.onclick = () => { night = !night; };
document.getElementById('reset')!.onclick = reset;
window.addEventListener('keydown', e => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)) e.preventDefault(); keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => keys.clear());
const still = new URLSearchParams(location.search).has('still');
let last = performance.now();
function frame(time: number) {
  if (!still) game.update(Math.min((time - last) / 1000, .033), keys);
  last = time;
  const state = game.getMatchState();
  state.dayPhase = night ? .5 : 0;
  renderer.renderFrame(state, game.getArena(), game.getParticles());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.assign(window, { lobbyStudy: { getGame: () => game, setScale: (s: number) => { scale = normalizeCharacterScale(s); reset(); } } });
