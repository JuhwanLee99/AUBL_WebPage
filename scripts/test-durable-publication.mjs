import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const bundle=await build({stdin:{contents:"export * from './src/shared/lib/durableScoringPublication'; export {canonicalCommitJson} from './src/shared/lib/durableScoringCommitAdapter';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {DurableScoringPublication,canonicalCommitJson}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
function fixture(overrides={}){
 const scope={environment:'local-emulator',projectId:'demo-aubl-scoring',uid:'local',matchId:'TEST_SCORING_PUBLICATION',testRunId:'TEST_RUN_PUBLICATION',writerSessionId:'tab',lockEpoch:1,...overrides};
 const metadata={nextSequence:1,acknowledgedSequence:0,serverRevision:0,inputReceipts:{}};
 const inputs=[],requests=[],statuses=[],uploaded=new Map();let valid=true,uploadHook=async()=>{},commitHook=async()=>{},current;
 const writer={assertScope:()=>{},runPublication:fn=>fn(),review:async()=>structuredClone({metadata,inputs}),
  prepare:async(manifest,requestId,lastInputSequence)=>{metadata.pending={requestId,manifest,firstInputSequence:metadata.acknowledgedSequence+1,lastInputSequence,expectedRevision:metadata.serverRevision};},
  flush:async()=>{const request=structuredClone(metadata.pending);requests.push(request);await commitHook(request);
   metadata.acknowledgedSequence=request.lastInputSequence;metadata.serverRevision=request.expectedRevision+1;
   inputs.splice(0,inputs.findIndex(row=>row.sequence>request.lastInputSequence)<0?inputs.length:inputs.findIndex(row=>row.sequence>request.lastInputSequence));delete metadata.pending;return true;}};
 const options={ruleProfileVersion:'test',engineVersion:'test',projectionVersion:'test',upload:async(id,bytes,hash)=>{
  await uploadHook(id,bytes);const blockId=sha(canonicalCommitJson({matchId:scope.matchId,sha256:hash}));uploaded.set(blockId,Buffer.from(bytes));return{blockId,sha256:hash,size:bytes.length};}};
 const pub=new DurableScoringPublication(scope,writer,options,{validate:()=>{if(!valid)throw Error('ACCESS_REVOKED')},assertCurrent:after=>assert.deepEqual(after,current),stats:after=>({events:after.events.length}),notify:s=>statuses.push(s)});
 const add=(extra={},applied=true)=>{const seq=metadata.nextSequence++,id='input_'+seq;
  current={activeMatchId:scope.matchId,score:{home:0,away:seq},events:[{eventId:id}],feed:[{message:'LOCAL_'+seq}],...extra};
  inputs.push({sequence:seq,inputId:id,snapshot:JSON.stringify({version:1,checkpointVersion:2,kind:'composite-play',scope,input:{id},after:current})});
  metadata.inputReceipts[id]={localApplication:applied?'applied':'pending'};return id;};
 return{pub,add,metadata,inputs,requests,statuses,uploaded,options,scope,writer,setUpload:fn=>uploadHook=fn,setCommit:fn=>commitHook=fn,revoke:()=>valid=false};
}
test('publishes four groups from frozen input and acknowledges only its sequence',async()=>{
 const f=fixture();f.add();await f.pub.drain();assert.equal(f.requests.length,1);assert.equal(f.requests[0].manifest.blocks.length,4);
 assert.equal(f.metadata.acknowledgedSequence,1);assert.equal(f.inputs.length,0);assert.equal(f.statuses.at(-1).phase,'saved');
});
test('concurrent drains share one operation',async()=>{
 const f=fixture(),hold=defer();f.add();f.setUpload(()=>hold.promise);const a=f.pub.drain(),b=f.pub.drain();assert.equal(a,b);hold.resolve();await a;assert.equal(f.requests.length,1);
});
test('input arriving during ACK is sent separately without deletion',async()=>{
 const f=fixture();f.add();f.setCommit(async request=>{if(request.lastInputSequence===1)f.add();});await f.pub.drain();
 assert.deepEqual(f.requests.map(r=>[r.firstInputSequence,r.lastInputSequence]),[[1,1],[2,2]]);assert.equal(f.metadata.serverRevision,2);
});
test('lost response preserves frozen request for identical retry',async()=>{
 const f=fixture();f.add();let first=true;f.setCommit(async()=>{if(first){first=false;throw Error('LOST')}});
 await assert.rejects(f.pub.drain(),/LOST/);assert.equal(f.inputs.length,1);const pending=structuredClone(f.metadata.pending),uploads=f.uploaded.size;
 await f.pub.drain();assert.deepEqual(f.requests,[pending,pending]);assert.equal(f.uploaded.size,uploads);assert.equal(f.inputs.length,0);
});
test('upload failure does not prepare or acknowledge',async()=>{
 const f=fixture();f.add();f.setUpload(async()=>{throw Error('OFFLINE')});await assert.rejects(f.pub.drain(),/OFFLINE/);
 assert.equal(f.metadata.pending,undefined);assert.equal(f.requests.length,0);assert.equal(f.inputs.length,1);
 f.setUpload(async()=>{});await f.pub.drain();assert.equal(f.inputs.length,0);
});
test('unapplied input blocks transport',async()=>{
 const f=fixture();f.add({},false);await assert.rejects(f.pub.drain(),/local-application-review-required/);assert.equal(f.uploaded.size,0);
});
test('authority loss during upload prevents commit',async()=>{
 const f=fixture();f.add();f.setUpload(async()=>f.revoke());await assert.rejects(f.pub.drain(),/ACCESS_REVOKED/);
 assert.equal(f.requests.length,0);assert.equal(f.inputs.length,1);
});
test('stopped publication cannot restart',async()=>{
 const f=fixture();f.add();f.pub.stop();await assert.rejects(f.pub.drain(),/publication-stopped/);assert.equal(f.requests.length,0);
});
test('large UTF-8 state is split without losing bytes',async()=>{
 const f=fixture(),text='가'.repeat(50000);f.add({note:text});await f.pub.drain();
 const chunks=f.requests[0].manifest.blocks.filter(b=>b.kind==='state');assert.ok(chunks.length>1);assert.ok(chunks.every(b=>b.size<=128*1024));
 assert.equal(JSON.parse(Buffer.concat(chunks.map(b=>f.uploaded.get(b.blockId))).toString()).note,text);
});
test('oversized projection preserves queue before uploading',async()=>{
 const f=fixture();f.add({note:'X'.repeat(8*1024*1024)});await assert.rejects(f.pub.drain(),/publication-too-large/);assert.equal(f.uploaded.size,0);assert.equal(f.inputs.length,1);
});
test('blocked queue prevents transmission',async()=>{
 const f=fixture();f.add();f.metadata.blockedReason='conflict';await assert.rejects(f.pub.drain(),/publication-queue-blocked/);assert.equal(f.requests.length,0);
});

test('same writer retry retains upload request IDs and content addresses',async()=>{
 const f=fixture(),attempts=[];f.add();let fail=true;
 f.setUpload(async(id,bytes)=>{attempts.push({id,body:Buffer.from(bytes).toString('base64')});if(fail){fail=false;throw Error('UPLOAD_RESPONSE_LOST')}});
 await assert.rejects(f.pub.drain(),/UPLOAD_RESPONSE_LOST/);
 await f.pub.drain();
 assert.deepEqual(attempts[0],attempts[1]);
 assert.match(attempts[0].id,/^block_[a-f0-9]{64}$/);
 assert.equal(f.metadata.acknowledgedSequence,1);
});

for(const change of [{writerSessionId:'next_tab'},{lockEpoch:2},{writerSessionId:'next_tab',lockEpoch:2}]){
 test(`handoff separates reservations but preserves immutable blocks ${JSON.stringify(change)}`,async()=>{
  const first=fixture(),next=fixture(change),before=[],after=[];
  first.add();next.add();
  first.setUpload(async(id,bytes)=>before.push({id,hash:sha(bytes)}));
  next.setUpload(async(id,bytes)=>after.push({id,hash:sha(bytes)}));
  await first.pub.drain();await next.pub.drain();
  assert.equal(before.length,4);assert.equal(after.length,4);
  assert.deepEqual(before.map(item=>item.hash),after.map(item=>item.hash));
  assert.ok(before.every((item,index)=>item.id!==after[index].id));
  assert.deepEqual(first.requests[0].manifest.blocks,next.requests[0].manifest.blocks);
 });
}
