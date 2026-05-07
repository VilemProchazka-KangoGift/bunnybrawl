/** Registers all 19 built-in characters into the character pack registry.
 *  Call this once at app startup before any game systems reference characters. */

import { registerCharacter } from './registry';
import { bunny } from './packs/bunny';
import { fox } from './packs/fox';
import { frog } from './packs/frog';
import { bear } from './packs/bear';
import { owl } from './packs/owl';
import { cat } from './packs/cat';
import { wolf } from './packs/wolf';
import { panda } from './packs/panda';
import { pig } from './packs/pig';
import { cow } from './packs/cow';
import { goat } from './packs/goat';
import { horse } from './packs/horse';
import { sheep } from './packs/sheep';
import { monkey } from './packs/monkey';
import { tiger } from './packs/tiger';
import { rhino } from './packs/rhino';
import { hedgehog } from './packs/hedgehog';
import { chick } from './packs/chick';
import { axolotl } from './packs/axolotl';

const BUILTINS = [
  bunny, fox, frog, bear, owl, cat, wolf, panda, pig,
  cow, goat, horse, sheep, monkey, tiger, rhino, hedgehog, chick,
  axolotl,
];

export function registerBuiltinCharacters(): void {
  for (const pack of BUILTINS) {
    registerCharacter(pack);
  }
}
