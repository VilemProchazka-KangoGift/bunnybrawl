import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { toThemeConfig } from '../../../src/engine/arenas/registry';
import { drawFgBush, drawFgWildflower, drawMushroom } from '../../../src/engine/themes/drawPrimitives';
import { studies } from './variants';
import type { Ctx2D, Platform } from '../../../src/engine/types';

const canvas = document.querySelector('#details') as HTMLCanvasElement;
const c = canvas.getContext('2d') as Ctx2D;
const theme = toThemeConfig(meadow);
const columns = [215, 640, 1065];
const variants = [undefined, studies.storybook, studies.woodcut];
const names = ['Current', 'Garden storybook', 'Field-guide woodcut'];
c.fillStyle = '#dce9e8'; c.fillRect(0, 0, 1280, 760);
c.fillStyle = '#193a38'; c.font = 'bold 29px sans-serif'; c.fillText('Meadow props — detail study', 30, 42);
c.font = '16px sans-serif'; c.fillText('Native Canvas drawings enlarged for inspection. Full scenes show their actual play size.', 31, 66);

const sample = (cx: number, baseline: number, scale: number, draw: () => void) => {
  c.save(); c.translate(cx, baseline); c.scale(scale, scale); draw(); c.restore();
};
for (let col = 0; col < 3; col++) {
  const cx = columns[col], study = variants[col];
  c.fillStyle = '#f3f2e5'; c.fillRect(cx - 200, 83, 400, 655);
  c.strokeStyle = '#a7bcb4'; c.strokeRect(cx - 200.5, 82.5, 401, 656);
  c.fillStyle = '#183a37'; c.font = 'bold 21px sans-serif'; c.textAlign = 'center'; c.fillText(names[col], cx, 117);
  c.font = 'bold 14px sans-serif';
  c.fillText('Foreground bush · full cover', cx, 151);
  c.fillText('Platform edge and stump', cx, 366);
  c.fillText('Flower and mushroom', cx, 592);
  c.fillStyle = '#83ad8a';
  for (const y of [318, 547, 702]) c.fillRect(cx - 180, y, 360, 3);
  sample(cx, 318, 2.1, () => study ? study.drawBush(c, 0, 0, 60, true) : drawFgBush(c, 0, 0, 60));
  const ledge = { ...meadow.platforms.find(p => p.style !== 'stump')!, x: -102, y: 0, width: 150, height: 30 } as Platform;
  const stump = { ...meadow.platforms.find(p => p.style === 'stump')!, x: 60, y: -27, width: 40, height: 57 } as Platform;
  sample(cx, 465, 1.7, () => {
    if (study) { study.drawPlatform(c, ledge, false); study.drawPlatform(c, stump, false); }
    else { theme.drawPlatform(c, ledge, false); theme.drawPlatform(c, stump, false); }
  });
  sample(cx - 55, 701, 3, () => study ? study.drawFlower(c, 0, 0, '#FF6B8A', 20) : drawFgWildflower(c, 0, 0, '#FF6B8A', 20));
  sample(cx + 65, 701, 3, () => study ? study.drawMushroom(c, 0, 0) : drawMushroom(c, 0, 0));
}
c.textAlign = 'start';
document.documentElement.dataset.ready = 'true';
