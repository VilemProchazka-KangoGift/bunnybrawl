import fs from 'node:fs';
import ts from 'typescript';
const base=new URL('./',import.meta.url);const read=p=>fs.readFileSync(new URL('../../../'+p,base),'utf8').replace(/\r\n/g,'\n');
const ps=read('src/engine/gameLoop/cosmetics/ParticleSystem.ts'),particles=read('src/engine/gameLoop/cosmetics/particles.ts'),gibs=read('src/engine/gameLoop/cosmetics/gibs.ts'),render=read('src/engine/rendering/particles.ts'),constants=read('src/engine/constants.ts');
function fn(source,name){const start=source.indexOf('export function '+name+'(');if(start<0)throw Error(name);const end=source.indexOf('\n}',start)+2;return source.slice(start,end).replace('export ','');}
const start=ps.indexOf('  pickupCarrotVFX('),end=ps.indexOf('\n  }',start)+4;
let pickup=ps.slice(start,end).replace('  pickupCarrotVFX(', 'function pickupCarrotVFX(');
const names=['CARROT_SIZE','BLOOD_COLOR','GIB_GRAVITY','GIB_ROTATION_MAX','GIB_MAX_FLIGHT','GIB_BOUNCE_FACTOR','GIB_GEYSER_STRENGTH_MULT','CANVAS_WIDTH','CANVAS_HEIGHT'];
let code=names.map(n=>constants.match(new RegExp('export const '+n+' = [^;]+;'))[0].replace('export ','')).join('\n');
code+='\nconst MAX_LIVE_PARTICLES=600,GIB_FREELIST_CAP=600;\n'+ps.match(/const CARROT_PICKUP_COLORS = [^;]+;/)[0];
code+='\nfunction swapRemove(a,i){a[i]=a[a.length-1];a.pop()}\n';
code+=[fn(particles,'emitParticle'),fn(particles,'updateParticles'),fn(gibs,'launchGib'),fn(gibs,'updateGibs'),pickup,fn(render,'drawParticles'),fn(render,'drawGibs'),fn(render,'drawGibShape')].join('\n');
code=code.replaceAll('Math.random()', 'baselineRandom()');
code+=`\nlet baselineSeed=19371;function baselineRandom(){baselineSeed=(Math.imul(baselineSeed,1664525)+1013904223)>>>0;return baselineSeed/4294967296}
const baselineFrames=(()=>{const system={state:{gibs:[]},gibFreeList:[],particles:[],emitParticle(...args){emitParticle(this.particles,[],...args)}};pickupCarrotVFX.call(system,640,625);const frames=[],grounded=[],floor=[{x:0,y:660,width:1280,height:60}];for(let i=0;i<75;i++){frames.push({particles:system.particles.map(p=>({...p})),gibs:[...grounded,...system.state.gibs].map(g=>({...g}))});updateParticles(system.particles,[],false,floor,[],1/60);updateGibs(system.state.gibs,[],floor,undefined,new Map(),[],grounded,1/60)}return frames})();
function drawCurrentPickup(ctx,age){if(age<0)return;const frame=baselineFrames[Math.min(baselineFrames.length-1,Math.floor(age*60))];ctx.save();ctx.translate(-640,-660);drawGibs(ctx,frame.gibs);drawParticles(ctx,frame.particles);ctx.restore()}
`;
fs.writeFileSync(new URL('baseline.js',base), '// Frozen actual runtime pickup emitter, updates and drawing; seeded study randomness.\n'+ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText);
console.log('Captured runtime pickup baseline');
