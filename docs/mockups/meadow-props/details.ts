import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { toThemeConfig } from '../../../src/engine/arenas/registry';
import { drawFgBush, drawFgWildflower, drawMushroom } from '../../../src/engine/themes/drawPrimitives';
import { studies } from './variants';
import type { Ctx2D, Platform } from '../../../src/engine/types';

const canvas = document.querySelector('#details') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const shrubSet = params.get('set') === 'shrubs';
if (shrubSet) canvas.width = 2100;
const c = canvas.getContext('2d') as Ctx2D;
const theme = toThemeConfig(meadow);
const columns = shrubSet ? [210, 630, 1050, 1470, 1890] : [210, 630, 1050, 1470];
const leafySet = params.get('set') === 'leafy';
const variants = shrubSet
  ? [studies.leafy, studies.shrubBranch, studies.shrubHedge, studies.shrubBramble, studies.shrubBloom]
  : leafySet
  ? [studies.leafy, studies.leafyAiry, studies.leafyBloom, studies.leafyDusky]
  : [undefined, studies.botanical, studies.leafy, studies.animation];
const names = shrubSet
  ? ['Leafy storybook', 'Clustered foliage', 'Hedge canopy', 'Berry thicket', 'Flowering bush']
  : leafySet
  ? ['Leafy storybook', 'Airy leaves', 'Bloom garden', 'Dusky leaves']
  : ['Current', 'Botanical ink', 'Leafy storybook', 'Bold animation'];
c.fillStyle = '#dce9e8'; c.fillRect(0, 0, canvas.width, 760);
c.fillStyle = '#193a38'; c.font = 'bold 29px sans-serif'; c.fillText(shrubSet ? 'Leafy storybook — berry bush studies' : leafySet ? 'Leafy storybook — variation study' : 'Meadow props — detail study', 30, 42);
c.font = '16px sans-serif'; c.fillText(shrubSet ? 'No exposed branches; every bush has berries. Other props stay Leafy storybook.' : 'Native Canvas drawings enlarged for inspection. Full scenes show their actual play size.', 31, 66);

const sample = (cx: number, baseline: number, scale: number, draw: () => void) => {
  c.save(); c.translate(cx, baseline); c.scale(scale, scale); draw(); c.restore();
};
for (let col = 0; col < variants.length; col++) {
  const cx = columns[col], study = variants[col];
  c.fillStyle = '#f3f2e5'; c.fillRect(cx - 200, 83, 400, 655);
  c.strokeStyle = '#a7bcb4'; c.strokeRect(cx - 200.5, 82.5, 401, 656);
  c.fillStyle = '#183a37'; c.font = 'bold 21px sans-serif'; c.textAlign = 'center'; c.fillText(names[col], cx, 117);
  c.font = 'bold 14px sans-serif';
  if (shrubSet) {
    c.fillText('Foreground cover · enlarged', cx, 158);
    c.fillText('Foreground cover · native size', cx, 510);
    c.fillStyle = '#83ad8a';
    c.fillRect(cx - 180, 390, 360, 3);
    c.fillRect(cx - 180, 651, 360, 3);
    sample(cx, 390, 3.2, () => study!.drawBush(c, 0, 0, 60, true));
    sample(cx, 651, 1, () => study!.drawBush(c, 0, 0, 60, true));
    continue;
  }
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
