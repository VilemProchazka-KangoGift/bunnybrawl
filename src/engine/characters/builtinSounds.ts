// Side-effect manifest — each import registers a character voice factory.
// MAIN-ONLY; the sim-in-worker bundle never imports this so Howler stays
// out of the worker module graph.

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
