import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

// Real modal/preview engine, controlled local store outcomes. No Firebase/production IO.
const fixture = `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import RunnerMatrixButton from './src/features/scorekeeper/components/RunnerMatrixButton';
let store;
export function useDemoStore() { return store; }
function App() {
 const [state,setState] = useState({activeMatchId:'LOCAL',inning:1,half:'top',outs:0,bases:['R1',null,null],score:{home:0,away:0},pitchCount:0,balls:0,strikes:0,batterIndex:{home:0,away:0},runnerResponsiblePitcher:{0:'P1',1:null,2:null},events:[],scoringRejections:[]});
 const [disabled,setDisabled] = useState(false);
 window.control ??= {calls:[],mode:'wait'};
 const c = window.control;
 c.disable=()=>setDisabled(true);
 c.change=()=>setState(s=>({...s,outs:1}));
 c.accept=()=>setState(s=>({...s,events:[...s.events,{runnerPlay:{input:c.calls.at(-1)}}]}));
 c.reject=(eventType='runner_matrix')=>setState(s=>({...s,scoringRejections:[...s.scoringRejections,{id:crypto.randomUUID(),matchId:'LOCAL',eventType,reason:'LOCAL_REJECT'}]}));
 store={state,actions:{recordRunnerPlay(input){c.calls.push(structuredClone(input));if(c.mode==='throw')throw Error('LOCAL_THROW');}}};
 globalThis.__runnerStore = () => store;
 return <RunnerMatrixButton disabled={disabled}/>;
}
createRoot(document.getElementById('root')).render(<App/>);`;
const compiled = await build({ stdin:{contents:fixture,resolveDir:process.cwd(),sourcefile:'runner-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',outdir:'/tmp/runner-fixture',
 alias:{'@shared/lib':path.resolve('src/shared/lib')},plugins:[{name:'local-store-only',setup(b){
 b.onResolve({filter:/^@shared\/state\/demoStore$/},()=>({path:'store',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useDemoStore(){return globalThis.__runnerStore();}'}));
 b.onResolve({filter:/firebase/},()=>({errors:[{text:'Production dependency forbidden'}]}));
 }}],define:{'process.env.NODE_ENV':'"development"'} });
const javascript = compiled.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css = compiled.outputFiles.find(f=>f.path.endsWith('.css'))?.text ?? '';
const server = createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?javascript:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const results=[]; let browser;
try {
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  for(const scenario of ['success','rejected','throw','close-reopen','timeout-late-success','permission','stale','unrelated-rejection']) {
   const page=await browser.newPage({viewport}); const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   try {
    await page.goto(origin);
    await page.getByRole('button',{name:'전체 주자 함께 기록',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('combobox',{name:'1루 주자 결과',exact:true}).selectOption('1');
    await dialog.getByRole('textbox',{name:'판정 메모',exact:true}).fill('LOCAL_DRAFT');
    if(scenario==='close-reopen') {
     await dialog.getByRole('button',{name:'초안 유지하고 닫기',exact:true}).click();
     await page.getByRole('button',{name:'전체 주자 함께 기록',exact:true}).click();
     assert.equal(await dialog.getByRole('textbox',{name:'판정 메모',exact:true}).inputValue(),'LOCAL_DRAFT');
    } else if(scenario==='permission'||scenario==='stale') {
     await page.evaluate(kind=>window.control[kind==='permission'?'disable':'change'](),scenario);
     await page.waitForFunction(()=>document.querySelector('button[type=submit]').disabled);
     assert.equal(await page.evaluate(()=>window.control.calls.length),0);
     assert.equal(await dialog.getByRole('textbox',{name:'판정 메모',exact:true}).inputValue(),'LOCAL_DRAFT');
    } else {
     if(scenario==='throw')await page.evaluate(()=>window.control.mode='throw');
     if(scenario==='timeout-late-success')await page.clock.install();
     await dialog.getByRole('button',{name:'한 사건으로 저장',exact:true}).click();
     if(scenario==='throw'||scenario==='rejected') {
      if(scenario==='rejected')await page.evaluate(()=>window.control.reject());
      await dialog.getByRole('alert').waitFor();
      assert.equal(await dialog.getByRole('textbox',{name:'판정 메모',exact:true}).inputValue(),'LOCAL_DRAFT');
     } else {
      assert.equal(await dialog.getByRole('button',{name:'반영 확인 중',exact:true}).isDisabled(),true);
      // A duplicate submit event must not dispatch again, even outside button activation.
      await dialog.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(await page.evaluate(()=>window.control.calls.length),1);
      if(scenario==='unrelated-rejection') {
       await page.evaluate(()=>window.control.reject('other'));
       assert.equal(await dialog.getByRole('button',{name:'반영 확인 중',exact:true}).isDisabled(),true);
      }
      if(scenario==='timeout-late-success') {
       await page.clock.fastForward(8100);
       assert.match(await dialog.getByRole('status').innerText(),/지연/);
       assert.equal(await dialog.getByRole('button',{name:'반영 확인 중',exact:true}).isDisabled(),true);
      }
      await page.evaluate(()=>window.control.accept());
      await dialog.waitFor({state:'hidden'});
     }
    }
    assert.deepEqual(errors,[]);results.push({viewport:viewport.width,scenario,passed:true});
   } finally { await page.close({runBeforeUnload:false}); }
  }
 }
} finally {
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 const directory=path.join('outputs/runner-matrix-intake',new Date().toISOString().replace(/[:.]/g,'-'));
 await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:results.length,expected:16,directory}));
}
assert.equal(results.length,16);
