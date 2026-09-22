import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

assert.equal(process.env.GCLOUD_PROJECT,'demo-aubl-scoring');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8188');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9198');
const root=process.env.AUBL_RPC_ROOT, output=process.env.AUBL_RPC_OUTPUT;
assert.ok(root&&output);
const bundle=await build({stdin:{contents:`export { createScoringEmulatorTransport } from './src/shared/lib/scoringEmulatorTransport'; export { canonicalCommitJson } from './src/shared/lib/durableScoringCommitAdapter';`,resolveDir:root},bundle:true,packages:'external',platform:'node',format:'esm',write:false});
const moduleFile=path.join(output,'transport.mjs');await writeFile(moduleFile,bundle.outputFiles[0].text);
const {createScoringEmulatorTransport,canonicalCommitJson}=await import(pathToFileURL(moduleFile));
const runId='TEST_RUN_RPC_E2E_'+randomUUID().replaceAll('-',''), matchId='TEST_SCORING_RPC_E2E';
const apps=[], users=[], results=[];let cleanup=false;
const hash=value=>createHash('sha256').update(value).digest('hex');
const fixture=(operation,extra={})=>{
 const child=spawnSync(path.join(root,'functions/venv/bin/python'),[path.join(root,'scripts/scoring-rpc-fixture.py'),operation],{
  env:{...process.env,PYTHONPATH:path.join(root,'functions')},input:JSON.stringify({runId,...extra}),encoding:'utf8',timeout:30000});
 assert.equal(child.status,0,child.stderr||child.error?.message);return JSON.parse(child.stdout);
};
const client=async signedIn=>{
 const app=initializeApp({projectId:'demo-aubl-scoring',apiKey:'local-emulator-only'},randomUUID());apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});
 if(signedIn){const {user}=await createUserWithEmailAndPassword(auth,randomUUID()+'@local.invalid','local-only-password-2026');users.push(user);}
 const f=getFunctions(app,'asia-northeast3');connectFunctionsEmulator(f,'127.0.0.1',5108);
 return {auth,invoke:httpsCallable(f,'scoring_test_writer')};
};
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
try {
 const owner=await client(true), guest=await client(false), outsider=await client(true);
 const uid=owner.auth.currentUser.uid;
 fixture('seed',{uid});
 const identity={projectId:'demo-aubl-scoring',runId,matchId,uid,writerSessionId:'local_tab'};
 const transport=createScoringEmulatorTransport(owner.auth,identity);
 const request={action:'acquire',runId,matchId,writerSessionId:'local_tab',requestId:'first'};
 await check('anonymous callable rejected',()=>assert.rejects(guest.invoke(request),/unauthenticated/i));
 await check('unregistered authenticated user rejected',()=>assert.rejects(outsider.invoke(request),/not-a-participant/));
 await check('body UID cannot override verified auth',()=>assert.rejects(owner.invoke({...request,uid:'LOCAL_ADMIN'}),/invalid-rpc-fields/));
 let session;
 await check('authenticated session acquired through SDK',async()=>{session=await transport.acquire('first');assert.equal(session.lockEpoch,1);assert.equal(session.replayed,false);});
 await check('same session request is replayed',async()=>assert.equal((await transport.acquire('first')).replayed,true));
 await check('second writer cannot take over',()=>assert.rejects(owner.invoke({...request,writerSessionId:'other_tab',requestId:'other'}),/writer-session-mismatch/));
 const blocks=[], expected={};
 await check('four immutable block kinds upload through SDK',async()=>{
  for(const kind of ['state','feed','events','stats']){
   const body=JSON.stringify({kind,marker:'LOCAL_RPC_E2E',matchId});expected[kind]=body;
   const descriptor=await transport.upload('upload_'+kind,new TextEncoder().encode(body),hash(body));
   blocks.push({kind,...descriptor});
  }
 });
 const manifest={version:1,matchId,ruleProfileVersion:'test',engineVersion:'test',projectionVersion:'test',blocks};
 const commit={runId,matchId,writerSessionId:'local_tab',lockEpoch:session.lockEpoch,requestId:'commit_one',expectedRevision:0,
  firstInputSequence:1,lastInputSequence:1,manifest,payloadHash:hash(canonicalCommitJson(manifest))};
 let ack;
 await check('atomic commit ACK binds authenticated writer',async()=>{ack=await transport.commit(commit);assert.equal(ack.uid,uid);assert.equal(ack.committedRevision,1);assert.equal(ack.replayed,false);});
 await check('response-loss retry returns same commit',async()=>{const retry=await transport.commit(commit);assert.equal(retry.commitId,ack.commitId);assert.equal(retry.replayed,true);});
 await check('stored revision and immutable bodies match',async()=>{const stored=fixture('read');assert.equal(stored.head.revision,1);assert.equal(stored.head.commitId,ack.commitId);assert.equal(stored.receipts,1);assert.deepEqual(stored.blocks,expected);});
 await check('stopped run rejects even replayed commit',async()=>{fixture('stop');await assert.rejects(transport.commit(commit),/run-not-active/);});
 await check('logout invalidates transport',async()=>{await signOut(owner.auth);await assert.rejects(transport.commit(commit),/emulator-writer-auth-changed/);});
} finally {
 const failures=[];
 try{cleanup=fixture('cleanup').cleaned===true;}catch(error){failures.push(String(error));}
 for(const user of users)try{await deleteUser(user);}catch(error){failures.push('Auth cleanup: '+String(error));}
 for(const app of apps)try{await deleteApp(app);}catch(error){failures.push(String(error));}
 await writeFile(path.join(output,'results.json'),JSON.stringify({results,expected:12,cleanup,cleanupErrors:failures,productionAccess:false,
  limitations:['isolated Functions entrypoint; unrelated production handlers not loaded','SDK transport + server storage only; actual Provider and spectator readback not connected','Admin emulator readback, not public viewer API']},null,2));
 assert.deepEqual(failures,[]);
}
assert.equal(results.length,12);assert.equal(cleanup,true);
