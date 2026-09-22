import { mkdtemp, readFile, writeFile, readdir, copyFile, symlink, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd(), scratch=await mkdtemp(path.join(os.tmpdir(),'aubl-rpc-emulators-'));
const output=path.join(root,'outputs/scoring-rpc-emulator',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(output,{recursive:true});
try {
 const source=path.join(scratch,'functions'); await mkdir(source);
 for(const name of await readdir(path.join(root,'functions'))) {
  if(/^scoring_test_.*\.py$/.test(name))await copyFile(path.join(root,'functions',name),path.join(source,name));
 }
 await copyFile(path.join(root,'functions/requirements.txt'),path.join(source,'requirements.txt'));
 await symlink(path.join(root,'functions/venv'),path.join(source,'venv'));
 await writeFile(path.join(source,'main.py'),`from firebase_admin import initialize_app
from firebase_functions import https_fn
from scoring_test_rpc import scoring_test_writer_from_request
initialize_app()
@https_fn.on_call(region="asia-northeast3", timeout_sec=60)
def scoring_test_writer(req: https_fn.CallableRequest[object]):
    return scoring_test_writer_from_request(req)
`);
 await writeFile(path.join(source,'.env.local'),'SCORING_TEST_RPC_ENABLED=true\nSCORING_TEST_SERVER_ENABLED=true\nSCORING_TEST_COMMIT_ENABLED=true\n');
 const config=JSON.parse(await readFile(path.join(root,'firebase.scoring-rpc-test.json'),'utf8'));
 config.functions[0].source='functions';
 await copyFile(path.join(root,config.firestore.rules),path.join(scratch,'firestore.rules'));
 config.firestore.rules='firestore.rules';
 const configPath=path.join(scratch,'firebase.json'); await writeFile(configPath,JSON.stringify(config));
 const command=`"${process.execPath}" "${path.join(root,process.argv.includes('--provider')?'scripts/test-durable-provider-browser.mjs':'scripts/test-scoring-rpc-emulator.mjs')}"`;
 const home=path.join(scratch,'home'); await mkdir(home);
 // Do not inherit Firebase tokens, ADC paths, cloud credentials or the user's CLI config.
 const env=Object.fromEntries(['PATH','LANG','LC_ALL','TMPDIR','JAVA_HOME'].flatMap(key=>
  process.env[key]===undefined?[]:[[key,process.env[key]]]));
 Object.assign(env,{HOME:home,XDG_CONFIG_HOME:path.join(home,'.config'),CLOUDSDK_CONFIG:path.join(home,'.config/gcloud'),
  FIREBASE_EMULATORS_PATH:path.join(os.homedir(),'.cache/firebase/emulators'),
  GCE_METADATA_HOST:'127.0.0.1:9',GCE_METADATA_IP:'127.0.0.1:9',
  AUBL_PROVIDER_RPC:process.argv.includes('--provider')?'true':'false',CI:'true',GCLOUD_PROJECT:'demo-aubl-scoring',AUBL_RPC_ROOT:root,AUBL_RPC_OUTPUT:output,
  SCORING_TEST_RPC_ENABLED:'true',SCORING_TEST_SERVER_ENABLED:'true',SCORING_TEST_COMMIT_ENABLED:'true'});
 const child=spawn('firebase',['emulators:exec','--non-interactive','--project','demo-aubl-scoring','--config',configPath,'--only','auth,firestore,functions',command],{
  cwd:root,stdio:'inherit',env});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
 process.exitCode=code;
} finally { await rm(scratch,{recursive:true,force:true}); console.log(`RPC_EMULATOR_OUTPUT=${output}`); }
