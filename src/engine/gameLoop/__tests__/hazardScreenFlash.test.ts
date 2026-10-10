import {describe,it,expect} from 'vitest';
import {makePlayer,makeState} from '../../__tests__/testHelpers';
import {handleGhostCollision,handleHazardZoneCollision} from '../gameplay/playerCollisions';
import {getArena} from '../../arenas';
import {registerBuiltinArenas} from '../../arenas/builtin';
registerBuiltinArenas();
describe('hazard flash removal',()=>{
  it('lava still burns and knocks back without a screen flash request',()=>{
    const player=makePlayer({x:700,y:628,invincibleTimer:0,slowTimer:0});
    const hit=handleHazardZoneCollision(player,{...getArena('meadow'),hazardZones:[{x:690,y:635,width:100,height:25,type:'lava'}]});
    expect(hit?.type).toBe('hazardZone');expect(player.burnTimer).toBeGreaterThan(0);expect(hit?.screenFlash).toBeUndefined();
  });
  it('ghost still slows without a screen flash request',()=>{
    const player=makePlayer({x:700,y:628,invincibleTimer:0,slowTimer:0});
    const state=makeState({players:[player]});
    state.ghosts=[{x:716,y:644,size:32} as typeof state.ghosts[number]];
    const hit=handleGhostCollision(player,state);
    expect(hit?.type).toBe('ghost');expect(player.slowTimer).toBeGreaterThan(0);expect(hit?.screenFlash).toBeUndefined();
  });
});
