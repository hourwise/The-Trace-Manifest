// N4-OPS-01: offline profile builder and receipt reconciler. Portable: fictional fixtures,
// the real N4 Worker against the local SQLite D1 harness, and temporary output folders only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {database} from './fixtures/news-import/helpers';
import {signInternalRequest} from '../src/security/internal-signature';
import worker from '../workers/ingestion/index';
import {canonical as runtimeCanonical,sha256} from '../src/lib/server/news-import/runtime/primitives';
import * as contract from '../src/lib/server/identity-maintenance/contract';
import * as lib from '../scripts/n4-ops/lib.mjs';
import {prepare,finalize,approvalTemplate,verifyDeployment,validateProfile} from '../scripts/n4-ops/profile-builder.mjs';
import {reconcile} from '../scripts/n4-ops/reconcile.mjs';

const PLAN='docs/audit/local-news-p4-n4-preview-plan.json',PLAN_SHA='9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9';
const plan=JSON.parse(readFileSync(PLAN,'utf8')),IMPLEMENTATION=plan.implementation_sha256,ATTESTATION='a'.repeat(64),SECRET='LOCAL-N4-OPS-TEST-ONLY-'.repeat(3),PUBLISHER='publisher@example.test';
const base={environment:'preview',database_id:contract.PREVIEW_DATABASE_ID,target_attestation_sha256:ATTESTATION};
const iso=(ms:number)=>new Date(ms).toISOString();
const dir=()=>mkdtempSync(join(tmpdir(),'trace-n4-ops-'));
const save=(d:string,name:string,value:unknown)=>{const p=join(d,name);writeFileSync(p,JSON.stringify(value,null,1));return p;};
const refused=(fn:()=>unknown,code:string)=>assert.throws(fn,(e:any)=>{assert.equal(e.code,code,e.message);return true;});

/** The SQLite harness reports no provider rows_read/rows_written, so the reconciler would rightly say
 * NOT_VERIFIED. These tests add labelled synthetic metadata (2 storage writes per logical change);
 * it exercises the reconciliation path and is not a measurement of D1. */
function withSyntheticProviderMetadata(d1:any){
 const raw=new WeakMap<object,any>(),meta=(r:any)=>({...r,meta:{...r.meta,rows_read:Array.isArray(r.results)?r.results.length:0,rows_written:Number(r.meta?.changes??0)*2}});
 const wrap=(s:any):any=>{const p=new Proxy(s,{get(t,k){if(k==='bind')return(...a:unknown[])=>wrap(t.bind(...a));if(k==='all'||k==='run')return async()=>meta(await t[k]());const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});raw.set(p,s);return p;};
 return new Proxy(d1,{get(t,k){if(k==='prepare')return(sql:string)=>wrap(t.prepare(sql));if(k==='batch')return async(list:any[])=>(await t.batch(list.map(s=>raw.get(s)??s))).map(meta);const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});
}
function world(n:number){
 const db=database(),env:any={DB:withSyntheticProviderMetadata(db.asD1()),TRACE_ENVIRONMENT:'preview',TRACE_INTERNAL_SERVICE_SECRET:SECRET,TRACE_IDENTITY_INVENTORY_ENABLED:'true',TRACE_IDENTITY_DATABASE_ID:contract.PREVIEW_DATABASE_ID,TRACE_IDENTITY_TARGET_ATTESTATION_SHA256:ATTESTATION,TRACE_IDENTITY_IMPLEMENTATION_SHA256:IMPLEMENTATION};
 const insert=db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by) VALUES (?,'manual_url',?,'Original lead',?,'new','original@example.test')");
 db.sqlite.exec('BEGIN');for(let i=0;i<n;i++)insert.run('legacy-'+String(i).padStart(5,'0'),'https://legacy.trace.test/'+i+'?utm_source=old','original-'+i);db.sqlite.exec('COMMIT');
 return {db,env};
}
type W=ReturnType<typeof world>;
async function send(w:W,input:any){
 const body=JSON.stringify(input),identity={operator:PUBLISHER,role:'publisher' as const,timestamp:String(Date.now()),nonce:crypto.randomUUID()};
 const signature=await signInternalRequest(SECRET,'POST','/admin/identity-maintenance',body,identity);
 const r=await worker.fetch(new Request('https://worker.example/admin/identity-maintenance',{method:'POST',body,headers:{'X-Trace-Internal-Version':'v1','X-Trace-Operator':identity.operator,'X-Trace-Role':identity.role,'X-Trace-Timestamp':identity.timestamp,'X-Trace-Nonce':identity.nonce,'X-Trace-Signature':signature}}),w.env,{} as ExecutionContext);
 return {status:r.status,body:await r.json() as any};
}
/** What the operator saves after one explicit inventory call. */
async function capture(w:W,after:string,at:number,limit=25){const request={operation:'inspect',...base,after,limit};return {schema:lib.SCHEMA.inventory,captured_at_utc:iso(at),publisher_email:PUBLISHER,request,response:await send(w,request)};}
const targetEvidence=(over:any={})=>({schema:lib.SCHEMA.target,status:'VERIFIED',environment:'preview',database_name:'trace-manifest-db-preview',database_id:contract.PREVIEW_DATABASE_ID,target_attestation_sha256:ATTESTATION,implementation_sha256:IMPLEMENTATION,migration_sha256:contract.IDENTITY_MIGRATION_SHA256,worker_deployment_ref:'synthetic-worker-version',pages_deployment_ref:'synthetic-pages-deployment',verified_at_utc:'2020-01-01T00:00:00.000Z',verified_by:'owner@example.test',evidence:[{label:'synthetic A0 record (test only)',sha256:'c'.repeat(64)}],...over});

interface Cycle {out:string;pkg:any;pkgPath:string;approvalPath:string;profilePath:string;profile:any;openPath:string;window:{from:number;until:number}}
/** One owner cycle with synthetic times in the past so the real Worker's clock is inside the window. */
async function cycle(w:W,o:{out:string;after:string;pages:number;ref:string;prior?:string;ack?:string;limit?:number}):Promise<Cycle>{
 const T=Date.now(),captures:string[]=[];let after=o.after;
 for(let i=0;i<o.pages;i++){const c=await capture(w,after,T-60000,o.limit);captures.push(save(o.out,`capture-${o.ref}-${i}.json`,c));if(!c.response.body.has_more)break;after=c.response.body.next_cursor;}
 const target=save(o.out,'target.json',targetEvidence()),from=T-20000,until=from+3600000;
 const prep=prepare(['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',target,...captures.flatMap(c=>['--inventory',c]),'--approval-ref',o.ref,'--from-utc',iso(from),'--until-utc',iso(until),'--now',iso(T-30000),'--out-dir',o.out,...(o.prior?['--prior-reconciliation',o.prior]:[]),...(o.ack?['--acknowledge-stop',o.ack]:[])]) as any;
 const pkg=JSON.parse(readFileSync(prep.package,'utf8'));
 // The owner's own record; the tools only check it. Here it is a labelled synthetic fixture.
 const approval={...approvalTemplate(['--package',prep.package]),decision:'APPROVED',owner_email:'owner@example.test',approved_at_utc:iso(T-25000),statement:`SYNTHETIC TEST APPROVAL of deployable profile ${pkg.deployable_profile_sha256_if_approved}`};
 const approvalPath=save(o.out,`approval-${o.ref}.json`,approval);
 const fin=finalize(['--package',prep.package,'--approval-record',approvalPath,'--out-dir',o.out,'--now',iso(T-24000)]) as any;
 const profileText=readFileSync(fin.profile,'utf8');w.env.TRACE_IDENTITY_MAINTENANCE_ENABLED='true';w.env.TRACE_IDENTITY_MAINTENANCE_PROFILE=profileText;
 const readback=save(o.out,`readback-open-${o.ref}.json`,readbackOf(w,T-10000,fin.deployable_profile_sha256));
 const open=verifyDeployment(['--package',prep.package,'--approval-record',approvalPath,'--profile',fin.profile,'--readback',readback,'--phase','open','--out-dir',o.out]) as any;
 assert.equal(open.disposition,'PASS',JSON.stringify(open));
 return {out:o.out,pkg,pkgPath:prep.package,approvalPath,profilePath:fin.profile,profile:JSON.parse(profileText),openPath:open.verification,window:{from,until}};
}
function readbackOf(w:W,at:number,profileSha:string|null){
 return {schema:lib.SCHEMA.readback,captured_at_utc:iso(at),environment:'preview',worker_script:'synthetic-preview-worker',
  variables:{TRACE_ENVIRONMENT:w.env.TRACE_ENVIRONMENT,TRACE_IDENTITY_DATABASE_ID:w.env.TRACE_IDENTITY_DATABASE_ID,TRACE_IDENTITY_TARGET_ATTESTATION_SHA256:w.env.TRACE_IDENTITY_TARGET_ATTESTATION_SHA256,TRACE_IDENTITY_IMPLEMENTATION_SHA256:w.env.TRACE_IDENTITY_IMPLEMENTATION_SHA256,TRACE_IDENTITY_INVENTORY_ENABLED:w.env.TRACE_IDENTITY_INVENTORY_ENABLED??null,TRACE_IDENTITY_MAINTENANCE_ENABLED:w.env.TRACE_IDENTITY_MAINTENANCE_ENABLED??null,TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256:profileSha},
  secrets_present:{TRACE_INTERNAL_SERVICE_SECRET:true},import_gate:null,crons:[]};
}
/** Manual, in-order submission of the approved slots; every request and response is saved. */
async function execute(w:W,c:Cycle,count=c.profile.requests.length){
 const records:string[]=[];
 for(const slot of c.profile.requests.slice(0,count)){
  const request={operation:'apply',...base,approval_ref:c.profile.approval_ref,request_id:slot.request_id,after:slot.after,selection_sha256:slot.selection_sha256};
  const sent=Date.now(),response=await send(w,request);
  records.push(save(c.out,`request-${slot.request_id}.json`,{schema:lib.SCHEMA.request,sent_at_utc:iso(sent),request,response,received_at_utc:iso(Date.now())}));
  if(response.status!==200)break;
 }
 return records;
}
async function lookups(w:W,c:Cycle,at=Date.now()){
 const out:string[]=[];for(const slot of c.profile.requests){const request={operation:'receipt',...base,request_id:slot.request_id};out.push(save(c.out,`lookup-${slot.request_id}-${at}.json`,{schema:lib.SCHEMA.lookup,captured_at_utc:iso(at),request,response:await send(w,request)}));}
 return out;
}
function close(w:W,c:Cycle){
 delete w.env.TRACE_IDENTITY_MAINTENANCE_ENABLED;delete w.env.TRACE_IDENTITY_MAINTENANCE_PROFILE;
 const readback=save(c.out,`readback-closure-${c.profile.approval_ref}.json`,readbackOf(w,Date.now(),null));
 return (verifyDeployment(['--package',c.pkgPath,'--approval-record',c.approvalPath,'--profile',c.profilePath,'--readback',readback,'--phase','closure','--out-dir',c.out]) as any).verification;
}
const reconcileArgs=(c:Cycle,o:{requests:string[];lookups:string[];closure?:string;open?:boolean;extra?:string[]})=>['--package',c.pkgPath,'--approval-record',c.approvalPath,'--profile',c.profilePath,...(o.open===false?[]:['--deployment-open',c.openPath]),...(o.closure?['--deployment-closure',o.closure]:[]),...o.requests.flatMap(r=>['--request',r]),...o.lookups.flatMap(l=>['--receipt-lookup',l]),...(o.extra??[]),'--out-dir',c.out];
const result=(r:any)=>JSON.parse(readFileSync(r.reconciliation,'utf8'));

test('OPS-01 offline constants and canonical form match the frozen N4 contract and runtime',()=>{
 assert.equal(lib.N4_VERSION,contract.N4_VERSION);assert.equal(lib.PREVIEW_DATABASE_ID,contract.PREVIEW_DATABASE_ID);assert.equal(lib.IDENTITY_MIGRATION_SHA256,contract.IDENTITY_MIGRATION_SHA256);
 assert.equal(lib.MAX_PAGE,contract.MAX_IDENTITY_PAGE);assert.equal(lib.MAX_SLOTS,contract.MAX_IDENTITY_REQUESTS);assert.equal(String(lib.HASH),String(contract.HASH));assert.equal(String(lib.UUID),String(contract.UUID));
 assert.equal(lib.MAX_WINDOW_MS,plan.limits.window_max_ms);assert.equal(lib.CLOSING_MARGIN_MS,plan.limits.closing_margin_ms);assert.equal(lib.MAX_ROW_CHANGES,plan.limits.maximum_row_changes);assert.equal(lib.MAX_WRITE_UNITS,plan.limits.maximum_reserved_write_units);
 assert.equal(sha256(readFileSync(PLAN)),PLAN_SHA);
 for(const v of [{b:1,a:[{z:null,y:'é'},true]},{x:' ',n:-0.5},[],{nested:{k:{j:[1,2,{}]}}}])assert.equal(lib.canonical(v),runtimeCanonical(v));
});

test('OPS-01 tools are local-only: no network, process, provider or execution path',()=>{
 for(const file of ['lib.mjs','profile-builder.mjs','reconcile.mjs']){
  const src=readFileSync(join('scripts/n4-ops',file),'utf8');
  for(const m of src.matchAll(/from\s+'([^']+)'/g))assert.ok(['node:crypto','node:fs','node:path','node:url','./lib.mjs','./profile-builder.mjs'].includes(m[1]),`${file} imports ${m[1]}`);
  assert.ok(!/\bfetch\s*\(|child_process|XMLHttpRequest|WebSocket|wrangler\s|import\(/.test(src),`${file} contains a network or process path`);
 }
});

test('OPS-01 prepare produces a deterministic null-approval package whose profile the real Worker contract accepts',async()=>{
 const w=world(60),out=dir(),out2=dir();try{
  const T=Date.UTC(2026,10,2,9,0,0),c0=await capture(w,'',T),c1=await capture(w,c0.response.body.next_cursor,T+60000);
  const files=[save(out,'c0.json',c0),save(out,'c1.json',c1)],target=save(out,'target.json',targetEvidence());
  const args=(o:string)=>['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',target,'--inventory',files[0],'--inventory',files[1],'--approval-ref','N4-P01-SYNTH','--from-utc',iso(T+3600000),'--until-utc',iso(T+7200000),'--now',iso(T+120000),'--out-dir',o];
  const a=prepare(args(out)) as any,b=prepare(args(out2)) as any;
  assert.equal(a.package_sha256,b.package_sha256);assert.deepEqual(readFileSync(a.package),readFileSync(b.package));assert.equal(prepare(args(out)).package_sha256,a.package_sha256,'rerun is idempotent');
  const pkg=JSON.parse(readFileSync(a.package,'utf8'));
  assert.equal(pkg.owner_approval,null);assert.equal(pkg.approved_at_utc,null);assert.equal(pkg.profile_without_approval.owner_approval,null);assert.equal(pkg.status,'AWAITING_OWNER_APPROVAL');assert.equal(a.requests_sent,0);
  assert.deepEqual(pkg.profile_without_approval.requests.map((r:any)=>[r.limit,r.maximum_row_changes,r.maximum_write_units]),[[25,27,133],[25,27,133]]);
  assert.equal(pkg.profile_without_approval.requests[1].after,c0.response.body.next_cursor);
  const deployable=JSON.stringify({...pkg.profile_without_approval,owner_approval:'N4-P01-SYNTH'});assert.equal(sha256(deployable),pkg.deployable_profile_sha256_if_approved);
  const accepted=contract.approvedProfile({...w.env,TRACE_IDENTITY_MAINTENANCE_ENABLED:'true',TRACE_IDENTITY_MAINTENANCE_PROFILE:deployable},PUBLISHER,T+3700000);
  assert.equal(accepted.requests.length,2);
 }finally{w.db.close();rmSync(out,{recursive:true,force:true});rmSync(out2,{recursive:true,force:true});}
});

test('OPS-01 malformed profiles, mismatched identities, excessive budgets and stale or incomplete inventory fail closed',async()=>{
 const w=world(400),out=dir();try{
  const T=Date.UTC(2026,10,2,9,0,0),caps:any[]=[];let after='';for(let i=0;i<11;i++){const c=await capture(w,after,T);caps.push(c);after=c.response.body.next_cursor;}
  const files=caps.map((c,i)=>save(out,`c${i}.json`,c)),target=save(out,'target.json',targetEvidence());
  const args=(over:Record<string,string|string[]>={})=>{const v:any={'plan':PLAN,'plan-sha256':PLAN_SHA,'target-evidence':target,'inventory':files.slice(0,2),'approval-ref':'N4-NEG','from-utc':iso(T+3600000),'until-utc':iso(T+7200000),'now':iso(T+60000),'out-dir':out,...over};return Object.entries(v).flatMap(([k,x])=>Array.isArray(x)?x.flatMap(y=>['--'+k,y]):['--'+k,x as string]);};
  const p=(over:any)=>()=>prepare(args(over));
  refused(p({'plan-sha256':'0'.repeat(64)}),'plan_identity_mismatch');
  refused(p({'target-evidence':save(out,'t1.json',targetEvidence({implementation_sha256:'d'.repeat(64)}))}),'implementation_mismatch');
  refused(p({'target-evidence':save(out,'t2.json',targetEvidence({database_id:'00000000-0000-0000-0000-000000000000'}))}),'target_mismatch');
  refused(p({'target-evidence':save(out,'t3.json',targetEvidence({status:'RECORDED'}))}),'unverified_target');
  refused(p({'target-evidence':save(out,'t4.json',targetEvidence({migration_sha256:'e'.repeat(64)}))}),'migration_identity_mismatch');
  refused(p({'target-evidence':save(out,'t5.json',targetEvidence({target_attestation_sha256:'b'.repeat(64)}))}),'target_mismatch');
  const mutate=(i:number,fn:(c:any)=>void)=>{const c=structuredClone(caps[i]);fn(c);return save(out,`m${i}-${Math.random()}.json`,c);};
  refused(p({inventory:[mutate(0,c=>c.response.body.database_id='00000000-0000-0000-0000-000000000000')]}),'target_mismatch');
  refused(p({inventory:[mutate(0,c=>c.response.body.implementation_sha256='f'.repeat(64))]}),'implementation_mismatch');
  refused(p({inventory:[mutate(0,c=>c.response.body.selection_sha256='XYZ')]}),'malformed_hash');
  refused(p({inventory:[mutate(0,c=>c.response.body.estimated_write_units=134)]}),'inventory_contract');
  refused(p({inventory:[mutate(0,c=>c.response.body.rows[3].conflict='conflicting_indexed_identity')]}),'conflicting_row');
  refused(p({inventory:[mutate(0,c=>{c.response.body.rows=[];})]}),'empty_selection');
  refused(p({inventory:[mutate(0,c=>c.response.status=409)]}),'inventory_not_successful');
  refused(p({inventory:[mutate(0,c=>c.request.after='legacy-00001')]}),'inventory_contract');
  refused(p({inventory:[files[0],files[2]]}),'cursor_chain');
  refused(p({inventory:[files[1]]}),'cursor_chain');
  refused(p({inventory:files}),'too_many_slots');
  refused(p({inventory:[files[0],files[0]]}),'duplicate_inventory');
  refused(p({now:iso(T+5*3600000),'from-utc':iso(T+5*3600000+60000),'until-utc':iso(T+6*3600000)}),'stale_or_future_evidence');
  refused(p({now:iso(T-60000)}),'stale_or_future_evidence');
  refused(p({'from-utc':iso(T+30000)}),'window_bound');
  refused(p({'until-utc':iso(T+3600000+3600001)}),'window_bound');
  refused(p({'until-utc':iso(T+3600000)}),'window_bound');
  refused(p({'from-utc':'2026-11-02T10:00:00Z'}),'malformed_time');
  refused(p({'approval-ref':'has space'}),'malformed_input');
  // Longest legal cursors: ten 200-character cursors exceed the 4 KiB variable limit and are refused, not truncated.
  const long=world(0);try{const ins=long.db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,source_hash,state,created_by) VALUES (?,'manual_url',?,'o','new','f')");for(let i=0;i<10;i++)ins.run(String(i).padStart(3,'0')+'x'.repeat(197),'https://long.trace.test/'+i);
   const lc:string[]=[];let a2='';for(let i=0;i<10;i++){const c=await capture(long,a2,T,1);lc.push(save(out,`long${i}.json`,c));a2=c.response.body.next_cursor;}
   refused(p({inventory:lc}),'profile_too_large');}finally{long.db.close();}
  const bad={...JSON.parse(readFileSync(prepare(args()).package as any,'utf8')).profile_without_approval};
  refused(()=>validateProfile({...bad,extra:1},null),'malformed_input');
  refused(()=>validateProfile({...bad,owner_approval:'N4-NEG'},null),'profile_contract');
  refused(()=>validateProfile({...bad,requests:Array.from({length:11},(_,i)=>({...bad.requests[0],request_id:lib.requestId('x',i,'',String(i).padStart(64,'0')),selection_sha256:String(i).padStart(64,'0')}))},null),'too_many_slots');
  refused(()=>validateProfile({...bad,requests:[{...bad.requests[0],limit:26}]},null),'page_bound');
  refused(()=>validateProfile({...bad,requests:[{...bad.requests[0],maximum_row_changes:28}]},null),'budget_exceeded');
  refused(()=>validateProfile({...bad,requests:[{...bad.requests[0],maximum_write_units:134}]},null),'budget_exceeded');
  refused(()=>validateProfile({...bad,requests:[bad.requests[0],{...bad.requests[1],request_id:bad.requests[0].request_id}]},null),'profile_contract');
  refused(()=>validateProfile({...bad,database_id:'00000000-0000-0000-0000-000000000000'},null),'profile_contract');
 }finally{w.db.close();rmSync(out,{recursive:true,force:true});}
});

test('OPS-01 nothing approves or executes automatically; approval is only the owner record and must quote the exact hash',async()=>{
 const w=world(30),out=dir();try{
  const T=Date.UTC(2026,10,2,9,0,0),c=save(out,'c.json',await capture(w,'',T)),target=save(out,'target.json',targetEvidence());
  const base=['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',target,'--inventory',c,'--approval-ref','N4-AUTO','--from-utc',iso(T+3600000),'--until-utc',iso(T+7200000),'--now',iso(T+60000),'--out-dir',out];
  for(const flag of ['--approve','--owner-approval','--execute','--send','--apply','--auto'])refused(()=>prepare([...base,flag,'yes']),'unknown_argument');
  const pkgPath=(prepare(base) as any).package,pkg=JSON.parse(readFileSync(pkgPath,'utf8'));
  const template=approvalTemplate(['--package',pkgPath]) as any;assert.equal(template.decision,null);assert.equal(template.owner_email,null);assert.equal(template.approved_at_utc,null);assert.equal(template.statement,null);
  const fin=(record:any,now=iso(T+120000))=>()=>finalize(['--package',pkgPath,'--approval-record',save(out,`a-${Math.random()}.json`,record),'--out-dir',out,'--now',now]);
  refused(fin(template),'not_approved');
  const good={...template,decision:'APPROVED',owner_email:'owner@example.test',approved_at_utc:iso(T+90000),statement:'I approve deployable profile '+pkg.deployable_profile_sha256_if_approved};
  refused(fin({...good,statement:'I approve the latest profile, whatever it is.'}),'approval_mismatch');
  refused(fin({...good,deployable_profile_sha256:'0'.repeat(64)}),'approval_mismatch');
  refused(fin({...good,total_maximum_write_units:good.total_maximum_write_units+1}),'approval_mismatch');
  refused(fin({...good,until_utc:iso(T+7300000)}),'approval_mismatch');
  refused(fin({...good,approved_at_utc:iso(T+3700000)}),'approval_mismatch');
  refused(fin({...good,approved_at_utc:iso(T-60000)}),'approval_mismatch');
  refused(fin(good,iso(T+80000)),'approval_mismatch');
  refused(fin(good,iso(T+7200000)),'window_expired');
  const tampered=structuredClone(pkg);tampered.profile_without_approval.requests[0].maximum_write_units=132;
  refused(()=>finalize(['--package',save(out,'tampered.json',tampered),'--approval-record',save(out,'g.json',good),'--out-dir',out,'--now',iso(T+120000)]),'package_inconsistent');
  const selfApproved=structuredClone(pkg);selfApproved.owner_approval='N4-AUTO';
  refused(()=>finalize(['--package',save(out,'self.json',selfApproved),'--approval-record',save(out,'g2.json',good),'--out-dir',out,'--now',iso(T+120000)]),'malformed_input');
  const done=finalize(['--package',pkgPath,'--approval-record',save(out,'g3.json',good),'--out-dir',out,'--now',iso(T+120000)]) as any;
  assert.equal(done.deployable_profile_sha256,pkg.deployable_profile_sha256_if_approved);assert.equal(done.requests_sent,0);
  // The CLI entry points: unknown commands and options exit non-zero with a refusal, and output never lands in the repository.
  const cli=(script:string,args:string[])=>spawnSync(process.execPath,[join('scripts/n4-ops',script),...args],{encoding:'utf8'});
  for(const [script,args] of [['profile-builder.mjs',['apply']],['profile-builder.mjs',['approve','--package',pkgPath]],['reconcile.mjs',['--retry','true']]] as const){const r=cli(script,[...args]);assert.equal(r.status,2,r.stdout);assert.match(r.stderr,/refused/);}
  const inside=cli('profile-builder.mjs',['prepare',...base.slice(0,-2),'--out-dir',resolve('docs')]);assert.equal(inside.status,2);assert.match(inside.stderr,/output_inside_repository/);
  const ok=cli('profile-builder.mjs',['prepare',...base]);assert.equal(ok.status,0,ok.stderr);assert.equal(JSON.parse(ok.stdout).owner_approval,null);
 }finally{w.db.close();rmSync(out,{recursive:true,force:true});}
});

test('OPS-01 a completed profile reconciles to PASS against real Worker receipts; the next profile must resume from it',async()=>{
 const w=world(80),out=dir();try{
  const c=await cycle(w,{out,after:'',pages:2,ref:'N4-P01'}),requests=await execute(w,c),closure=close(w,c),found=await lookups(w,c);
  const audit=save(out,'audit.json',{schema:lib.SCHEMA.audit,captured_at_utc:iso(c.window.until+1000),query_ref:'synthetic bounded audit query',identity_receipt_event_ids:c.profile.requests.map((r:any)=>'n4-identity:'+r.request_id),identity_maintenance_nonces_in_window:2});
  const r=reconcile(reconcileArgs(c,{requests,lookups:found,closure,extra:['--audit-evidence',audit]})) as any,j=result(r);
  assert.equal(r.disposition,'PASS',JSON.stringify(j.not_verified_reasons)+JSON.stringify(j.stop_reasons));
  assert.equal(j.totals.COMPLETED_MATCHED,2);assert.equal(j.totals.committed_logical_changes,54);assert.equal(j.totals.slots_with_unmeasured_storage,0);assert.equal(j.audit.nonces_match,true);
  assert.equal(r.resume_after,c.pkg.slots[1].next_cursor);assert.match(readFileSync(r.report,'utf8'),/\*\*Disposition: PASS\*\*/);
  assert.equal(reconcile(reconcileArgs(c,{requests:[...requests].reverse(),lookups:[...found].reverse(),closure,extra:['--audit-evidence',audit]})).reconciliation_sha256,r.reconciliation_sha256,'input order does not change the result');
  const next=await cycle(w,{out,after:r.resume_after,pages:1,ref:'N4-P02',prior:r.reconciliation});assert.equal(next.pkg.prior.reconciliation_sha256,r.reconciliation_sha256);
  refused(()=>prepare(['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',join(out,'target.json'),'--inventory',join(out,'capture-N4-P02-0.json'),'--approval-ref','N4-P01','--from-utc',iso(Date.now()+60000),'--until-utc',iso(Date.now()+120000),'--out-dir',out,'--prior-reconciliation',r.reconciliation]),'approval_ref_reused');
  refused(()=>prepare(['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',join(out,'target.json'),'--inventory',join(out,'capture-N4-P01-0.json'),'--approval-ref','N4-P03','--from-utc',iso(Date.now()+60000),'--until-utc',iso(Date.now()+120000),'--out-dir',out,'--prior-reconciliation',r.reconciliation]),'cursor_chain');
 }finally{w.db.close();rmSync(out,{recursive:true,force:true});}
});

test('OPS-01 refused, uncertain, missing, duplicate, unexpected and mismatched evidence never reconciles to PASS',async()=>{
 const w=world(80),out=dir();try{
  const c=await cycle(w,{out,after:'',pages:3,ref:'N4-NEG'});
  // Stale selection: a row in slot 2 changes after inventory, so the Worker refuses it before writing.
  const first=await execute(w,c,1);w.db.sqlite.exec("UPDATE editorial_candidates SET lead_text='Edited after inventory' WHERE id='legacy-00030'");
  const second=await execute(w,{...c,profile:{...c.profile,requests:[c.profile.requests[1]]}} as any);
  assert.equal(JSON.parse(readFileSync(second[0],'utf8')).response.body.error,'identity_stale_selection');
  const closure=close(w,c),during=await lookups(w,c),after=await lookups(w,c,c.window.until+1000);
  const stop=result(reconcile(reconcileArgs(c,{requests:[...first,...second],lookups:[...during,...after],closure})));
  assert.equal(stop.disposition,'STOP');assert.deepEqual(stop.slots.map((s:any)=>s.class),['COMPLETED_MATCHED','EXPLICITLY_REFUSED','UNUSED_AUTHORISED_SLOT']);assert.equal(stop.stop_continuable,true);assert.equal(stop.resume_after,c.pkg.slots[0].next_cursor);
  // Without post-window lookups the same records cannot prove the unused slot: never zero by assumption.
  const nv=result(reconcile(reconcileArgs(c,{requests:[...first,...second],lookups:during,closure})));
  assert.equal(nv.slots[2].class,'MISSING_OR_UNCERTAIN');assert.equal(nv.stop_continuable,false);
  // A lost response with no durable lookup is uncertain, not refused and not zero.
  const lost=JSON.parse(readFileSync(second[0],'utf8'));lost.response=null;lost.received_at_utc=null;const lostPath=save(out,'lost.json',lost);
  const uncertain=result(reconcile(reconcileArgs(c,{requests:[...first,lostPath],lookups:during,closure})));
  assert.equal(uncertain.slots[1].class,'MISSING_OR_UNCERTAIN');assert.equal(uncertain.slots[1].logical_changes,null);assert.notEqual(uncertain.disposition,'PASS');
  // Completed slot reconciled from the apply response alone (no durable lookup) is not verified.
  assert.equal(result(reconcile(reconcileArgs(c,{requests:first,lookups:[],closure}))).slots[0].class,'MISSING_OR_UNCERTAIN');
  // Missing deployment verification records leave the profile NOT_VERIFIED even with good receipts.
  const noDeploy=result(reconcile(reconcileArgs(c,{requests:first,lookups:during,open:false})));assert.ok(noDeploy.not_verified_reasons.includes('deployment_open_verification_not_supplied'));
  // Tampered receipts: altered write count (re-sealed), different profile, or two distinct receipts for one slot.
  const lookupFor=(i:number)=>JSON.parse(readFileSync(during[i],'utf8'));
  const reseal=(fn:(r:any)=>void)=>{const l=lookupFor(0);const {receipt_sha256,...body}=l.response.body.receipt;fn(body);l.response.body.receipt={...body,receipt_sha256:sha256(runtimeCanonical(body))};return save(out,`tamper-${Math.random()}.json`,l);};
  const cls=(paths:string[],reqs:string[]=[])=>result(reconcile(reconcileArgs(c,{requests:reqs,lookups:paths,closure}))).slots[0];
  assert.equal(cls([reseal(b=>b.writes=28)]).class,'UNEXPECTED_WRITE_CONSUMPTION');
  assert.equal(cls([reseal(b=>b.request_hash='0'.repeat(64))]).class,'CONFLICTING_OR_DUPLICATE');
  assert.equal(cls([reseal(b=>b.database_id='00000000-0000-0000-0000-000000000000')]).class,'STALE_OR_MISMATCHED_TARGET');
  assert.equal(cls([reseal(b=>b.decisions[0].issue='invalid_url')]).class,'CONFLICTING_OR_DUPLICATE');
  const unsealed=lookupFor(0);unsealed.response.body.receipt.writes=26;assert.equal(cls([save(out,'unsealed.json',unsealed)]).class,'CONFLICTING_OR_DUPLICATE');
  const twice=JSON.parse(readFileSync(first[0],'utf8'));twice.sent_at_utc=iso(Date.parse(twice.sent_at_utc)+1);assert.equal(cls([during[0]],[first[0],save(out,'twice.json',twice)]).class,'CONFLICTING_OR_DUPLICATE');
  const over=JSON.parse(readFileSync(first[0],'utf8'));over.response.body.provider_rows_written=134;over.response.body.provider_accounting_available=true;assert.equal(cls([during[0]],[save(out,'over.json',over)]).class,'UNEXPECTED_WRITE_CONSUMPTION');
  const unmeasured=JSON.parse(readFileSync(first[0],'utf8'));unmeasured.response.body.provider_rows_written=null;unmeasured.response.body.provider_accounting_available=false;
  const um=result(reconcile(reconcileArgs(c,{requests:[save(out,'unmeasured.json',unmeasured)],lookups:during,closure})));assert.equal(um.slots[0].storage_writes.status,'NOT_MEASURED');assert.ok(um.not_verified_reasons.includes('slot_0_storage_writes_not_measured'));
  const wrongTarget=lookupFor(0);wrongTarget.request.database_id='00000000-0000-0000-0000-000000000000';assert.equal(cls([save(out,'wt.json',wrongTarget)]).class,'STALE_OR_MISMATCHED_TARGET');
  const bound=JSON.parse(readFileSync(first[0],'utf8'));bound.response={status:409,body:{error:'identity_provider_write_bound_exceeded_reconcile'}};assert.equal(cls([during[0]],[save(out,'bound.json',bound)]).class,'UNEXPECTED_WRITE_CONSUMPTION');
  // Out-of-order execution and audit evidence that disagrees are campaign-level STOPs.
  const skipped=JSON.parse(readFileSync(second[0],'utf8'));skipped.request={...skipped.request,request_id:c.profile.requests[2].request_id,after:c.profile.requests[2].after,selection_sha256:c.profile.requests[2].selection_sha256};
  assert.ok(result(reconcile(reconcileArgs(c,{requests:[save(out,'skip.json',skipped)],lookups:after,closure}))).stop_reasons.includes('slots_not_executed_in_order'));
  const audit=save(out,'audit-bad.json',{schema:lib.SCHEMA.audit,captured_at_utc:iso(c.window.until+1000),query_ref:'synthetic',identity_receipt_event_ids:[],identity_maintenance_nonces_in_window:3});
  const ab=result(reconcile(reconcileArgs(c,{requests:first,lookups:during,closure,extra:['--audit-evidence',audit]})));assert.ok(ab.stop_reasons.includes('audit_receipts_differ_from_completed_slots')&&ab.stop_reasons.includes('nonce_count_differs_from_completed_slots'));
  const foreign=JSON.parse(readFileSync(first[0],'utf8'));foreign.request.request_id='00000000-0000-4000-8000-000000000000';
  assert.ok(result(reconcile(reconcileArgs(c,{requests:[...first,save(out,'foreign.json',foreign)],lookups:during,closure}))).stop_reasons.includes('request_for_unapproved_slot'));
  // Continuing after a STOP needs the owner's explicit acknowledgement of that exact reconciliation; NOT_VERIFIED never continues.
  const stopFile=reconcile(reconcileArgs(c,{requests:[...first,...second],lookups:[...during,...after],closure})) as any,nvFile=reconcile(reconcileArgs(c,{requests:[...first,lostPath],lookups:during,closure})) as any;
  const cap=save(out,'resume.json',await capture(w,stop.resume_after,Date.now()-60000));
  const again=(prior:string,ack?:string)=>()=>prepare(['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',join(out,'target.json'),'--inventory',cap,'--approval-ref','N4-NEG-2','--from-utc',iso(Date.now()+60000),'--until-utc',iso(Date.now()+120000),'--out-dir',out,'--prior-reconciliation',prior,...(ack?['--acknowledge-stop',ack]:[])]);
  refused(again(stopFile.reconciliation),'prior_stop');refused(again(nvFile.reconciliation),'prior_not_verified');
  assert.equal((again(stopFile.reconciliation,stopFile.reconciliation_sha256)() as any).owner_approval,null);
 }finally{w.db.close();rmSync(out,{recursive:true,force:true});}
});

test('OPS-01 synthetic 3,750-candidate campaign: 150 batches across 15 approved profiles, reconciled, then a final inventory from the start',async()=>{
 const w=world(3750),out=dir();try{
  w.db.sqlite.exec("UPDATE editorial_candidates SET submitted_url='javascript:bad' WHERE id='legacy-00007';INSERT INTO editorial_candidates(id,intake_type,source_hash,state,created_by) VALUES ('lead-only','lead','x','new','fixture')");
  const original=JSON.stringify(w.db.sqlite.prepare('SELECT id,source_hash,submitted_url,lead_text,state,created_at,created_by,updated_at FROM editorial_candidates ORDER BY id').all());
  let prior:string|undefined,after='',profiles=0,batches=0,logical=0,reserved=0;
  while(true){
   const c=await cycle(w,{out,after,pages:10,ref:'N4-C'+String(profiles+1).padStart(2,'0'),prior});
   assert.ok(c.profile.requests.length<=10&&Buffer.byteLength(JSON.stringify(c.profile))<=4096);
   const requests=await execute(w,c),closure=close(w,c),found=await lookups(w,c),r=reconcile(reconcileArgs(c,{requests,lookups:found,closure})) as any,j=result(r);
   assert.equal(r.disposition,'PASS',JSON.stringify(j.not_verified_reasons)+JSON.stringify(j.stop_reasons));
   profiles++;batches+=j.totals.COMPLETED_MATCHED;logical+=j.totals.committed_logical_changes;reserved+=j.totals.reserved_write_units_for_completed;prior=r.reconciliation;after=r.resume_after;
   if(j.campaign_reported_more_rows===false)break;
  }
  assert.equal(profiles,15);assert.equal(batches,150);assert.equal(logical,4050);assert.equal(reserved,150*133);
  const final=await capture(w,'',Date.now());assert.equal(final.response.body.rows.length,0);assert.equal(final.response.body.known_pending_lower_bound,0);
  assert.equal(w.db.sqlite.prepare("SELECT count(*) n FROM editorial_candidates WHERE source_url_hash IS NOT NULL").get()!.n,3749);
  assert.equal(w.db.sqlite.prepare("SELECT count(*) n FROM editorial_candidates WHERE source_url_identity_issue='invalid_url'").get()!.n,1);
  assert.equal(w.db.sqlite.prepare("SELECT source_url_hash h FROM editorial_candidates WHERE id='lead-only'").get()!.h,null);
  assert.equal(JSON.stringify(w.db.sqlite.prepare('SELECT id,source_hash,submitted_url,lead_text,state,created_at,created_by,updated_at FROM editorial_candidates ORDER BY id').all()),original);
  assert.equal(w.db.sqlite.prepare("SELECT count(*) n FROM admin_audit_log WHERE action='identity_maintenance_n4'").get()!.n,150);
  console.log('N4_OPS_CAMPAIGN '+JSON.stringify({candidates:3750,profiles,batches,logical_changes:logical,reserved_write_units:reserved,final_inventory_pending:0,remote:false,note:'Synthetic local campaign; approvals are labelled test fixtures.'}));
 }finally{w.db.close();rmSync(out,{recursive:true,force:true});}
});

test('OPS-01 committed examples regenerate byte-identically',()=>{
 const out=dir();try{
  const r=spawnSync(process.execPath,['scripts/n4-ops/synthetic-examples.mjs','--out-dir',out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const committed='docs/audit/n4-ops-01-examples';
  const names=readdirSync(committed).filter(n=>!n.startsWith('.'));assert.equal(names.length,8);
  for(const name of names)assert.deepEqual(readFileSync(join(out,name)),readFileSync(join(committed,name)),name);
 }finally{rmSync(out,{recursive:true,force:true});}
});
