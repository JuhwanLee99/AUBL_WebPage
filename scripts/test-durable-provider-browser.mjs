import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';
import { sourceModules } from './e2e/scoring/source-modules.mjs';

const root=process.cwd(), modules=sourceModules(root), results=[];
const realRpc=process.env.AUBL_PROVIDER_RPC==='true';
if(realRpc){assert.equal(process.env.GCLOUD_PROJECT,'demo-aubl-scoring');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8188');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9198');}
const fixture=(operation,runId,extra={})=>{
 const result=spawnSync(path.join(root,'functions/venv/bin/python'),[path.join(root,'scripts/scoring-rpc-fixture.py'),operation],{env:{...process.env,PYTHONPATH:path.join(root,'functions')},input:JSON.stringify({runId,...extra}),encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
let source=`import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {DemoStoreProvider,useDemoStore} from './src/shared/state/demoStore';
import CompositePlayButton from './src/features/scorekeeper/components/CompositePlayButton';
import {initialState,reducer} from 'virtual:scoring-reducer';
import {makeFixture,scenarios} from './scripts/e2e/scoring/scenarios.mjs';
import {auth} from './src/shared/firebase/client';
const seed=reducer(initialState,{type:'hydrate',state:makeFixture(initialState,scenarios[0])});
const oldId=seed.activeMatchId;seed.activeMatchId='TEST_SCORING_PROVIDER';
seed.matches=seed.matches.map(m=>m.id===oldId?{...m,id:seed.activeMatchId}:m);
seed.scorerUid=auth.currentUser.uid;
const publishing=window.location.search==='?publish';
window.rpc={calls:[],uploads:0,lose:false,receipts:new Map()};
const options={auth,scope:{environment:'local-emulator',projectId:'demo-aubl-scoring',testRunId:'TEST_RUN_PROVIDER',matchId:seed.activeMatchId,uid:seed.scorerUid,writerSessionId:'tab',lockEpoch:1},initialState:seed,initialRevision:0,transport:{commit:async request=>{
 if(!publishing)throw Error('RPC_NOT_ALLOWED_IN_THIS_TEST');
 window.rpc.calls.push(structuredClone(request));
 const prior=window.rpc.receipts.get(request.requestId);
 const ack=prior||{...request,uid:seed.scorerUid,committedRevision:request.expectedRevision+1,headRevision:request.expectedRevision+1,commitId:'a'.repeat(64),replayed:false};
 window.rpc.receipts.set(request.requestId,ack);
 if(window.rpc.lose){window.rpc.lose=false;throw Error('LOCAL_RESPONSE_LOST')}
 return {...ack,replayed:Boolean(prior)};
}}};
if(publishing)options.publication={ruleProfileVersion:'test',engineVersion:'test',projectionVersion:'test',upload:async(id,body,sha256)=>{
 window.rpc.uploads++;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({matchId:seed.activeMatchId,sha256})));
 return {blockId:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),sha256,size:body.length};
}};
function Probe(){const store=useDemoStore();window.probe=store;return <><div data-testid="phase">{store.durable?.status}</div><CompositePlayButton/></>;}
function App(){const [enabled,setEnabled]=useState(true);window.removeSession=()=>setEnabled(false);return <DemoStoreProvider durableSession={enabled?options:undefined}><Probe/></DemoStoreProvider>;}
createRoot(document.getElementById('root')).render(<App/>);`;
if(realRpc){
 source="import {createScoringEmulatorTransport} from './src/shared/lib/scoringEmulatorTransport';\n"+source;
 source=source.replace('const seed=reducer','async function boot(){await window.createFixtureUser();const runId=await window.seedFixture(auth.currentUser.uid);const seed=reducer');
 source=source.replace("'TEST_SCORING_PROVIDER'","'TEST_SCORING_RPC_E2E'");
 const start=source.indexOf("const publishing="),end=source.indexOf('function Probe()');
 source=source.slice(0,start)+`
 window.rpc={calls:[],uploads:0,lose:false};
 const rpc=createScoringEmulatorTransport(auth,{projectId:'demo-aubl-scoring',runId,matchId:seed.activeMatchId,uid:seed.scorerUid,writerSessionId:'tab'});
 const session=await rpc.acquire('provider_acquire');
 const options={auth,scope:{environment:'local-emulator',projectId:'demo-aubl-scoring',testRunId:runId,matchId:seed.activeMatchId,uid:seed.scorerUid,writerSessionId:'tab',lockEpoch:session.lockEpoch},initialState:seed,initialRevision:0,
 transport:{commit:async request=>{window.rpc.calls.push(structuredClone(request));const ack=await rpc.commit(request);if(window.rpc.lose){window.rpc.lose=false;throw Error('LOCAL_RESPONSE_LOST_AFTER_REAL_COMMIT')}return ack;}},
 publication:{ruleProfileVersion:'test',engineVersion:'test',projectionVersion:'test',upload:async(...args)=>{window.rpc.uploads++;return rpc.upload(...args)}}};
 `+source.slice(end);
 source+='}boot().catch(error=>{window.bootError=String(error);console.error(error)});';
}
const effects=['autoPurgeExpiredMatches','syncGameStateWrite','stopGameStateWrite','stopScheduleMatchesWrite','stopLiveScorePatch','syncLiveScorePatch','syncScheduleMatchesWrite','syncOnlineViewerCount','syncPresenceHeartbeat','syncScorerLock','syncScorerLockHeartbeat','subscribeActiveMatchState','subscribeCurrentMatchPointer','subscribeFeedAndEvents','subscribeMatchesSnapshot'];
const bundle=await build({stdin:{contents:source,sourcefile:'provider-fixture.jsx',loader:'jsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},alias:{'@shared':path.join(root,'src/shared')},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/^virtual:/},a=>({path:a.path,namespace:'virtual'}));
 b.onLoad({filter:/.*/,namespace:'virtual'},a=>({contents:modules.get(a.path),resolveDir:root,loader:'js'}));
 b.onResolve({filter:/^\/@fs\//},a=>({path:a.path.slice(5)}));
 b.onResolve({filter:/(?:^|\/)firebase\/client$/},()=>({path:'client',namespace:'fixture'}));
 if(!realRpc)b.onResolve({filter:/^firebase\/auth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/demoStore\.effects$/},()=>({path:'effects',namespace:'fixture'}));
 b.onResolve({filter:/demoStore\.scheduleActions$/},()=>({path:'schedule',namespace:'fixture'}));
 b.onResolve({filter:/demoStore\.gameActions$/},()=>({path:'game',namespace:'fixture'}));
 b.onResolve({filter:/\/useRecordSource$/},()=>({path:'recordSource',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='client'&&realRpc?`import {initializeApp} from 'firebase/app';import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,deleteUser,signOut} from 'firebase/auth';export const auth=getAuth(initializeApp({projectId:'demo-aubl-scoring',apiKey:'local-emulator-only'}));connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});export const firestore={};window.createFixtureUser=()=>createUserWithEmailAndPassword(auth,crypto.randomUUID()+'@local.invalid','local-only-password-2026');window.cleanupFixtureUser=()=>deleteUser(auth.currentUser);window.revoke=()=>signOut(auth);`:a.path==='client'?`export const auth={currentUser:{uid:'LOCAL_E2E_SCORER'},app:{options:{projectId:'demo-aubl-scoring'}},emulatorConfig:{host:'127.0.0.1',port:9198}};export const firestore={};globalThis.fixtureAuth=auth;`:
 a.path==='auth'?`const callbacks=new Set();export const getIdTokenResult=async()=>({claims:{}});export function onIdTokenChanged(auth,callback){callbacks.add(callback);queueMicrotask(()=>{if(callbacks.has(callback))callback(auth.currentUser)});return()=>callbacks.delete(callback)};globalThis.revoke=()=>{globalThis.fixtureAuth.currentUser=null;for(const fn of callbacks)fn(null)};`:
 `const denied=()=>{globalThis.legacyCalls=(globalThis.legacyCalls||0)+1;throw Error('LEGACY_PATH_EXECUTED')};`+(a.path==='effects'?effects.map(name=>`export const ${name}=denied;`).join('\n'):`export const ${a.path==='schedule'?'useScheduleActions':a.path==='game'?'useGameActions':'useRecordSource'}=denied;`)}));
}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const apply=async page=>{
 await page.getByRole('button',{name:'복합 플레이 기록',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox',{name:/^타격 판정/}).selectOption('single');
 await dialog.getByLabel('이번 투구',{exact:false}).selectOption('in_play');
 await dialog.getByRole('button',{name:'B 이동 / 아웃 추가',exact:true}).click();
 await dialog.locator('fieldset.runner-matrix-row').last().getByRole('combobox',{name:/^원인/}).selectOption('hit');
 await dialog.getByLabel('순서·득점·타점·실책·책임 확인',{exact:false}).check();
 await dialog.getByRole('button',{name:'이 플레이 적용',exact:true}).click();await dialog.waitFor({state:'hidden'});
};
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(const scenario of (realRpc?['publication','response-loss']:['modal','legacy-denied','logout','no-fallback','recovery','publication','response-loss'])){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});const errors=[];
  await context.route('**/*',route=>(new URL(route.request().url()).origin===origin||(realRpc&&['http://127.0.0.1:9198','http://127.0.0.1:5108'].includes(new URL(route.request().url()).origin)))?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(realRpc?30000:6000);page.on('pageerror',e=>errors.push(e.message));
  const runId=realRpc?'TEST_RUN_RPC_E2E_'+randomUUID().replaceAll('-',''):null;
  if(realRpc)await page.exposeFunction('seedFixture',uid=>{fixture('seed',runId,{uid});return runId;});
  try{
   await page.goto(origin+(['publication','response-loss'].includes(scenario)?'?publish':''));await page.waitForFunction(()=>window.probe?.durable?.status==='ready');
   if(scenario==='publication'||scenario==='response-loss'){
    if(scenario==='response-loss')await page.evaluate(()=>window.rpc.lose=true);
    await apply(page);
    if(scenario==='response-loss'){
     await page.waitForFunction(()=>window.probe.durable.publication.phase==='failed');
     assert.equal((await page.evaluate(()=>window.probe.durable.recovery.inspectRecovery())).length,1);
     await page.getByRole('button',{name:'서버 저장 재시도',exact:true}).click();
    }
    await page.waitForFunction(()=>window.probe.durable.publication.phase==='saved');
    const report=await page.evaluate(()=>({sync:window.probe.durable.publication,calls:window.rpc.calls,uploads:window.rpc.uploads,events:window.probe.state.events.length}));
    assert.equal(report.sync.acknowledgedSequence,1);assert.equal(report.sync.revision,1);assert.equal(report.events,1);assert.equal(report.uploads,4);
    assert.equal(report.calls.length,scenario==='response-loss'?2:1);
    if(scenario==='response-loss')assert.deepEqual(report.calls[0],report.calls[1]);
    assert.equal((await page.evaluate(()=>window.probe.durable.recovery.inspectRecovery())).length,0);
   }else if(scenario==='modal'||scenario==='recovery'){
    await apply(page);assert.equal(await page.evaluate(()=>window.probe.state.events.length),1);
    assert.equal((await page.evaluate(()=>window.probe.durable.recovery.inspectRecovery()))[0].status,'applied');
    if(scenario==='recovery'){
     await page.reload();await page.waitForFunction(()=>window.probe?.durable?.status==='ready');
     assert.equal(await page.evaluate(()=>window.probe.state.events.length),0);
     await page.evaluate(async()=>{const [row]=await window.probe.durable.recovery.inspectRecovery();await window.probe.durable.recovery.recoverInput(row.inputId)});
     assert.equal(await page.evaluate(()=>window.probe.state.events.length),1);
    }
   }else if(scenario==='legacy-denied'){
    await page.evaluate(()=>{window.probe.actions.addBall();window.probe.actions.setLiveVideoUrl('forbidden');window.probe.actions.endGame('forbidden')});
    await page.getByRole('alert').filter({hasText:'다른 입력은 반영하지 않았습니다'}).waitFor();
    assert.equal(await page.evaluate(()=>window.probe.state.events.length),0);
   }else if(scenario==='logout'){
    await page.evaluate(()=>window.revoke());await page.waitForFunction(()=>window.probe.durable.status==='blocked');
    assert.equal(await page.getByRole('button',{name:'복합 플레이 기록',exact:true}).isDisabled(),true);
   }else{
    await page.evaluate(()=>window.removeSession());await page.getByRole('alert').filter({hasText:'기존 저장으로 자동 전환하지 않습니다'}).waitFor();
   }
   if(realRpc){
    const stored=fixture('read',runId),view=await page.evaluate(()=>({events:window.probe.state.events,feed:window.probe.state.feed}));
    assert.equal(stored.head.revision,1);assert.equal(stored.receipts,1);
    assert.deepEqual(JSON.parse(stored.blocks.events),view.events);assert.deepEqual(JSON.parse(stored.blocks.feed),view.feed);
    assert.equal(JSON.parse(stored.blocks.state).activeMatchId,'TEST_SCORING_RPC_E2E');
    assert.ok(stored.blocks.stats);
   }
   assert.equal(await page.evaluate(()=>window.legacyCalls||0),0);assert.deepEqual(errors,[]);
   results.push({viewport:viewport.width,scenario,status:'passed'});
  }finally{try{if(realRpc){try{await page.evaluate(()=>window.cleanupFixtureUser?.());}finally{assert.equal(fixture('cleanup',runId).cleaned,true);}}}finally{await context.close();}}
 }
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 const directory=path.join(realRpc?'outputs/durable-provider-rpc-browser':'outputs/durable-provider-browser',new Date().toISOString().replace(/[:.]/g,'-'));
 await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'results.json'),JSON.stringify({results,expected:realRpc?4:14,productionAccess:false,limitations:realRpc?['actual Provider/modal/Auth/RPC/Firestore; fixture route rather than production app route','response loss injected after real RPC ACK; readback uses emulator Admin fixture','handoff and public spectator readback not covered']:['actual Provider/reducer/modal and IndexedDB; auth and legacy IO mocked','publication uses a simulated upload and commit server']},null,2));
 console.log(JSON.stringify({passed:results.length,expected:realRpc?4:14,directory}));
}
assert.equal(results.length,realRpc?4:14);
