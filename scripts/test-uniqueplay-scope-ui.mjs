import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';
const requests = [], blocked = [], errors = [];
let responseStatus = 404;
const vite = await createServer({
  configFile:false, envDir:false, cacheDir:'.tmp/uniqueplay-scope-ui',
  esbuild:{jsx:'automatic'},
  resolve:{alias:Object.fromEntries(['app','core','features','shared'].map(name=>['@'+name,path.resolve('src',name)]))},
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','react-router-dom','firebase/app','firebase/auth']},
  server:{host:'127.0.0.1',port:5196,strictPort:true,watch:null,hmr:false,ws:false}, appType:'custom',
  plugins:[{
    name:'isolated-scope-ui',
    resolveId(id){ if(id==='/__scope-entry')return '\0scope-entry'; },
    load(id){if(id!=='\0scope-entry')return; return `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {MemoryRouter} from 'react-router-dom'; import {initializeApp} from 'firebase/app';
      initializeApp({apiKey:'fixture-only',projectId:'demo-aubl-scoped-ui'});
      const {default:Page}=await import('/src/app/pages/admin/AdminUniquePlaySyncPage.tsx');
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page)));
    `;},
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(req.url?.startsWith('/api/')){
        res.setHeader('content-type','application/json');
        if(req.method==='POST'){
          let body='';for await(const chunk of req)body+=chunk;
          requests.push({url:req.url,body:JSON.parse(body)});
          res.statusCode=responseStatus;res.end(JSON.stringify({message:'ISOLATED_SCOPE_REJECTION',code:'FIXTURE_REJECTED'}));return;
        }
        if(req.url.endsWith('/session'))res.end(JSON.stringify({status:'READY',authenticated:true}));
        else res.end(JSON.stringify([]));return;
      }
      if(req.url==='/__scope-ui'){
        res.setHeader('content-type','text/html');
        res.end(await server.transformIndexHtml('/__scope-ui','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__scope-entry"></script></body></html>'));return;
      }next();
    });},
  }],
});
let browser;
try{
  await vite.listen(); browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://127.0.0.1:5196')return route.continue();
    blocked.push(url.origin);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let passed=0;
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:5196/__scope-ui');
    const mode=page.getByLabel(/^수집 범위/);
    await mode.waitFor({timeout:15000});
    assert.equal(await mode.inputValue(),'SINCE_LAST_SYNC');
    const submit=page.getByRole('button',{name:/시즌 수집 시작/});
    await submit.waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('시즌 수집 시작')&&!b.disabled));
    const year=Number(await page.getByLabel('시즌 연도',{exact:true}).inputValue());
    const first=page.waitForResponse(r=>r.url().endsWith('/runs/scoped'));
    await submit.click();await first;
    assert.deepEqual(requests.at(-1),{url:'/api/admin/sync/unique-play/runs/scoped',body:{seasonYear:year,syncMode:'SINCE_LAST_SYNC'}});passed++;
    await mode.selectOption('FROM_DATE');
    const date=page.getByLabel('시작 날짜 (당일 포함)',{exact:true});
    const before=requests.length;await submit.click();
    assert.equal(await date.evaluate(el=>el.validity.valueMissing),true);assert.equal(requests.length,before);passed++;
    await date.fill(`${year}-09-01`);responseStatus=403;
    const second=page.waitForResponse(r=>r.url().endsWith('/runs/scoped'));
    await submit.click();await second;
    assert.deepEqual(requests.at(-1).body,{seasonYear:year,syncMode:'FROM_DATE',fromDate:`${year}-09-01`});passed++;
    await page.getByText('현재 AUBL 계정에 NAS 관리자 API 권한이 없습니다. Firebase 관리자 권한을 다시 확인하세요.',{exact:true}).first().waitFor();
    assert.equal(requests.length,before+1);passed++;
    responseStatus=404;
  }
  assert.equal(requests.some(r=>r.url.endsWith('/runs')),false);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log(`PASS: ${passed} desktop/mobile UI checks; no legacy fallback, browser errors or external requests.`);
}finally{await browser?.close();await vite.close();}
