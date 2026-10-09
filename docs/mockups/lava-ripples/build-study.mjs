import fs from 'node:fs';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const write=(p,s)=>fs.writeFileSync(new URL(p,import.meta.url),s);
// Freeze the baseline once; subsequent builds use these snapshots.
for(const [name,path] of [['surface','../../../src/engine/rendering/surfaceImpact.ts'],['burn','../../../src/engine/rendering/burnEffects.ts']]){
 const target='baseline-'+name+'.ts.txt';if(!fs.existsSync(new URL(target,import.meta.url)))write(target,read(path));
}
const compile=p=>ts.transpileModule(read(p).replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const baseline='const SURFACE_RIPPLE_LIFE=.6, SURFACE_RIPPLE_MAX_RADIUS=60, THORN_SLOW_DURATION=5;\n'+compile('baseline-surface.ts.txt')+compile('baseline-burn.ts.txt');
const helpers=read('../invincibility-trail/variants.js').split('\n').filter(l=>l.startsWith('const sizes=')||l.startsWith('const surfaceGround=')).join('\n');
const names=Object.keys(JSON.parse(helpers.match(/const sizes=(.*);/)[1].replace(/([A-Za-z]+):/g,'"$1":')));
const characters=Object.fromEntries(names.map(name=>[name,'data:image/webp;base64,'+fs.readFileSync(new URL('../../../src/engine/characters/plush/assets/'+name.toLowerCase()+'.webp',import.meta.url)).toString('base64')]));
const backdrop=read('../movement-vfx/index.html').match(/backdrop.src='([^']+)'/)[1];
let html=read('template.html').replace('__CHARACTERS__',JSON.stringify(characters)).replace('__BACKDROP__',backdrop).replace('/*__HELPERS__*/',helpers).replace('/*__BASELINE__*/',baseline).replace('/*__SCENE__*/',read('scene.js'));
write('index.html',html);console.log('Built four lava-entry ripple comparisons with frozen current renderer.');
