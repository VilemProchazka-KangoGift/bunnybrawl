import type { Player, PlayerSlot, Particle } from '../types';
interface Contact { slow: number; started: number; direction: number }
/** Visual recoil is independent of physical knockback and the five-second slow. */
export class ThornRecoil {
 private readonly contacts = new Map<PlayerSlot, Contact>();
 sample(player: Player, particles: readonly Particle[], now: number): number {
  if(!player.active || player.state==='splat' || player.state==='respawning') {this.contacts.delete(player.id);return 0;}
  let c=this.contacts.get(player.id);
  if(!c){c={slow:0,started:-Infinity,direction:0};this.contacts.set(player.id,c);}
  if(player.slowTimer>4.8 && player.slowTimer>c.slow+.08){
   const thorn=particles.find(t=>t.shape==='thornJolt'&&t.maxLife-t.life<.15&&Math.abs(t.x-player.x-player.width/2)<player.width*1.5&&Math.abs(t.y-player.y-player.height/2)<player.height);
   if(thorn){c.started=now-(thorn.maxLife-thorn.life)*1000;c.direction=player.vx!==0?(player.vx>0?-1:1):player.facing==='right'?-1:1;}
  }
  c.slow=player.slowTimer;
  const t=(now-c.started)/400;
  if(t<=0||t>=1)return 0;
  return c.direction*Math.sin(Math.PI*Math.min(1,t*2))*(1-t);
 }
}
