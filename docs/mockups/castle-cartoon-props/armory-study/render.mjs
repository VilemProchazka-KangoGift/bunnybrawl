import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const names = ['shield-spears', 'sword-mace-rack', 'trophy-shelf', 'tournament-pennant'];
const sources = Object.fromEntries(await Promise.all(names.map(async name => [
  name, (await readFile(join(directory, 'sources', `${name}.png`))).toString('base64'),
])));
const baseline = (await readFile(join(directory, 'baseline-no-portraits.png'))).toString('base64');
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER
  ? { executablePath: process.env.CASTLE_PROPS_BROWSER }
  : {});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const renders = await page.evaluate(async ({ sources, baseline }) => {
    const decode = async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      return image;
    };
    const base = await decode(baseline);
    const art = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([name, bytes]) => [name, await decode(bytes)])));
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const draw = (name, cx, bottom, height, flip = false) => {
      const image = art[name];
      const width = height * image.naturalWidth / image.naturalHeight;
      ctx.save();
      ctx.translate(cx, bottom - height);
      if (flip) ctx.scale(-1, 1);
      ctx.globalAlpha = .91;
      ctx.filter = name === 'sword-mace-rack'
        ? 'saturate(.75) brightness(.94) contrast(1.04)'
        : 'saturate(.68) brightness(.82) contrast(1.04)';
      ctx.drawImage(image, -width / 2, 0, width, height);
      ctx.restore();
    };
    const variants = {
      'a-shield-spears': [['shield-spears', 328, 576, 110], ['shield-spears', 952, 576, 110, true]],
      'b-sword-mace-rack': [['sword-mace-rack', 328, 574, 106], ['sword-mace-rack', 952, 574, 106, true]],
      'c-trophy-shelf': [['trophy-shelf', 328, 560, 90], ['trophy-shelf', 952, 560, 90, true]],
      'd-tournament-pennant': [['tournament-pennant', 328, 565, 116], ['tournament-pennant', 952, 565, 116, true]],
      'e-asymmetric-armory': [['shield-spears', 328, 576, 110], ['sword-mace-rack', 952, 574, 106, true]],
    };
    const output = {};
    for (const [name, placements] of Object.entries(variants)) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      for (const placement of placements) draw(...placement);
      output[`${name}.png`] = canvas.toDataURL('image/png').split(',')[1];
      const detail = document.createElement('canvas');
      detail.width = 390;
      detail.height = 190;
      const dc = detail.getContext('2d');
      dc.fillStyle = '#253449';
      dc.fillRect(0, 0, 390, 190);
      dc.drawImage(canvas, 245, 410, 180, 170, 5, 15, 180, 170);
      dc.drawImage(canvas, 870, 410, 180, 170, 205, 15, 180, 170);
      output[`detail-${name}.png`] = detail.toDataURL('image/png').split(',')[1];
    }
    return output;
  }, { sources, baseline });
  for (const [name, base64] of Object.entries(renders)) {
    await writeFile(join(directory, name), Buffer.from(base64, 'base64'));
    console.log(name);
  }
  await page.close();
} finally {
  await browser.close();
}
