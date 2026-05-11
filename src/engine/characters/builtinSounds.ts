/**
 * Side-effect manifest. Importing this module triggers each
 * `packs/<name>.audio.ts` to run its top-level
 * `registerCharacterVoice('<Name>', () => new Howl(...))` call,
 * populating the audio module's voice registry.
 *
 * MAIN-ONLY — every imported file pulls Howler into the bundle.
 * `App.tsx` imports this once at startup; the sim-in-worker bundle
 * never does, so Howler never enters the worker module graph.
 *
 * Each pack's audio file owns its own character name; this file is
 * just a list of side-effect imports.
 */

import './packs/axolotl.audio';
import './packs/bear.audio';
import './packs/bunny.audio';
import './packs/cat.audio';
import './packs/chick.audio';
import './packs/cow.audio';
import './packs/fox.audio';
import './packs/frog.audio';
import './packs/goat.audio';
import './packs/hedgehog.audio';
import './packs/horse.audio';
import './packs/monkey.audio';
import './packs/owl.audio';
import './packs/panda.audio';
import './packs/pig.audio';
import './packs/rhino.audio';
import './packs/sheep.audio';
import './packs/tiger.audio';
import './packs/wolf.audio';
