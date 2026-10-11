import fs from 'node:fs';import ts from '../../../node_modules/typescript/lib/typescript.js';import {build} from 'vite';
const dir=new URL('./',import.meta.url),baseline=new URL('baseline-rock.ts.txt',dir);
if(!fs.existsSync(baseline))fs.copyFileSync(new URL('../../../src/engine/rendering/hazards/lava.ts',dir),baseline);
const source=fs.readFileSync(baseline,'utf8').replace(/^import .*;\r?\n/gm,'');fs.writeFileSync(new URL('baseline-rock.js',dir),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
await build({configFile:false,base:'/bunnybrawl/',define:{__BUILD_TIME__:JSON.stringify('study')},build:{outDir:'test-results/rock-static',emptyOutDir:true,rolldownOptions:{input:'docs/mockups/falling-rocks/index.html'}}});
