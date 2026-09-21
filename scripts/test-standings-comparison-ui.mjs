import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

const origin='http://127.0.0.1:5198', errors=[], blocked=[], results=[];
const row=(teamName,rank,localTeamId)=>({teamName,rank,localTeamId,wins:3,losses:1,draws:0});
const fixtures={
  ranks:{before:[1,2,3,4,5].map(id=>row(`Team ${id}`,1,String(id))),source:[1,1,3,4,5].map((rank,index)=>row(`Team ${index+1}`,rank,String(index+1)))},
  alias:{before:[row('LAE',1,'31')],source:[row('L.A.E',3,'31')]},
  duplicate:{before:[row('One',1,'1'),row('Two',1,'1')],source:[row('New',2,'1')]},
  missing:{before:null,source:null},
};
const vite=await createServer({configFile:false,envDir:false,cacheDir:'.tmp/standings-comparison-ui',esbuild:{jsx:'automatic'},
  resolve:{alias:Object.fromEntries(['app','core','features','shared'].map(name=>['@'+name,path.resolve('src',name)]))},
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','firebase/app','firebase/auth']},
  server:{host:'127.0.0.1',port:5198,strictPort:true,watch:null,hmr:false,ws:false},appType:'custom',
  plugins:[{name:'isolated-standings-ui',resolveId(id){if(id==='/__standings-entry')return '\0standings-entry';},
    load(id){if(id!=='\0standings-entry')return;return `import React from 'react';import {createRoot} from 'react-dom/client';
      import {initializeApp} from 'firebase/app';initializeApp({apiKey:'fixture-only',projectId:'demo-standings-ui'});
      const {default:Table}=await import('/src/features/sync/components/UniquePlayDiffTable.tsx');
      const f=${JSON.stringify(fixtures)}[new URL(location.href).searchParams.get('case')];
      const item={itemId:'group-A',entityType:'GROUP',rawEntityType:'GROUP',action:'UPDATE',rawAction:'UPDATE',displayName:'A조 순위',externalId:'A',localEntityId:null,groupCode:'A',
        changes:f.before===null&&f.source===null?[]:[{field:'standings',label:'조별 순위',aublValue:f.before,sourceValue:f.source}],conflictReason:null,mappingCandidates:[],resolution:null,resolutionNote:null,resolved:true};
      createRoot(document.getElementById('root')).render(React.createElement(Table,{items:[item],resolvingItemId:null,onResolve:async()=>{throw new Error('Unexpected write');}}));`;},
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.url?.startsWith('/__standings-ui'))return next();res.setHeader('content-type','text/html');
      res.end(await server.transformIndexHtml('/__standings-ui','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__standings-entry"></script></body></html>'));
    });},
  }],
});
let browser;
try {
  await vite.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort();});
  for(const width of [1280,390])for(const scenario of Object.keys(fixtures)){
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});await page.goto(`${origin}/__standings-ui?case=${scenario}`);
    const region=page.getByRole('region',{name:'A조 순위 순위 비교',exact:true});await region.waitFor();
    assert.equal(await region.getByText('세부 필드 변경 없음',{exact:true}).count(),0);
    if(scenario==='missing')await region.getByRole('status').filter({hasText:'자료 누락은 변경 없음 또는 팀 삭제를 의미하지 않습니다.'}).waitFor();
    else{
      const table=region.getByRole('table');await table.waitFor();
      if(scenario==='ranks'){
        const rows=table.locator('tbody tr');assert.equal(await rows.count(),5);
        assert.deepEqual(await rows.locator('td:nth-child(3)').allTextContents(),['1','1','3','4','5']);
      }
      if(scenario==='alias'){assert.equal(await table.locator('tbody tr').count(),1);await table.getByText('(이전 표기: LAE)',{exact:false}).waitFor();}
      if(scenario==='duplicate'){assert.equal(await table.locator('tbody tr').count(),3);await region.getByRole('alert').filter({hasText:'팀 식별자가 중복'}).waitFor();}
    }
    results.push({width,scenario,passed:true});await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await writeFile('/tmp/aubl-standings-comparison-ui-results.json',JSON.stringify({results,errors,blocked},null,2));
  console.log(`PASS: ${results.length} desktop/mobile standings scenarios; no external requests.`);
} finally {await browser?.close();await vite.close();}
