import { registerArena } from './registry';
// Side-effect import: registers cross-arena shared reactive decoration kinds
// (decoration.hangingVine, decoration.fern, decoration.tallGrass) before any
// arena pack module evaluates and references them in buildReactiveDecorations.
import '../gameLoop/cosmetics/sharedDecorationKinds';
import { meadow } from './packs/meadow';
import { winterLake } from './packs/winterLake';
import { volcano } from './packs/volcano';
import { castle } from './packs/castle';
import { candyLand } from './packs/candyLand';
import { treetops } from './packs/treetops';
import { underwater } from './packs/underwater';
import { hauntedGraveyard } from './packs/hauntedGraveyard';
import { rooftops } from './packs/rooftops';
import { spaceStation } from './packs/spaceStation';
import { waterfall } from './packs/waterfall';
import { lobby } from './packs/lobby';

/** Register all built-in arena packs. Must be called before any arena lookups. */
export function registerBuiltinArenas(): void {
  [
    meadow, winterLake, volcano, castle, candyLand,
    treetops, underwater, hauntedGraveyard, rooftops, spaceStation, waterfall,
    lobby,
  ].forEach(registerArena);
}
