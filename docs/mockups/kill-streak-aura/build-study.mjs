import fs from 'node:fs';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const write=(p,s)=>fs.writeFileSync(new URL(p,import.meta.url),s);
if(!fs.existsSync(new URL('baseline-aura.ts.txt',import.meta.url))){
 const source=read('../../../src/engine/rendering/players.ts');
 const colors=source.slice(source.indexOf('const KILL_STREAK_FLAME_COLORS'),source.indexOf('const AIR_LEAN_MAX_RAD'));
 const body=source.split('// Kill streak flame aura (d) -- drawn behind character sprite')[1].split('\n  ctx.save();')[0];
 write('baseline-aura.ts.txt',colors+'\nfunction drawCurrentAura(ctx,player,now){const {x,y,width,height}=player;const cx=x+width/2;const frameTime=now*1000;\n'+body.replace('player.killStreak >= 3 && !getSlowDevice()','true')+'\n}\n');
}
const baseline=ts.transpileModule(read('baseline-aura.ts.txt'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const helpers=read('../invincibility-trail/variants.js').split('\n').filter(l=>l.startsWith('const sizes=')).join('\n');
const names=Object.keys(JSON.parse(helpers.match(/const sizes=(.*);/)[1].replace(/([A-Za-z]+):/g,'"$1":')));
const characters=Object.fromEntries(names.map(name=>[name,'data:image/webp;base64,'+fs.readFileSync(new URL('../../../src/engine/characters/plush/assets/'+name.toLowerCase()+'.webp',import.meta.url)).toString('base64')]));
write('index.html',read('template.html').replace('__CHARACTERS__',JSON.stringify(characters)).replace('/*__HELPERS__*/',helpers).replace('/*__BASELINE__*/',baseline).replace('/*__SCENE__*/',read('scene.js')));
console.log('Built four kill-streak aura comparisons');
