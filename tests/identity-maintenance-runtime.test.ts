/** Optional real workerd/D1 smoke test; no account, remote binding or production credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {database} from './fixtures/news-import/helpers';
import {signInternalRequest} from '../src/security/internal-signature';
import {N4_VERSION,PREVIEW_DATABASE_ID,IDENTITY_MIGRATION_SHA256} from '../src/lib/server/identity-maintenance/contract';

test('N4 real local workerd/D1 enforces atomic maintenance and reports provider row accounting',async()=>{
 const path=mkdtempSync(join(tmpdir(),'trace-n4-d1-')),fixture=database(),secret='LOCAL-N4-RUNTIME-ONLY-'.repeat(3);
 const bundled=await build({stdin:{contents:"import {handleIdentityRequest} from './src/lib/server/identity-maintenance/worker';export default {fetch:handleIdentityRequest};",resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false});
 const bindings:any={TRACE_ENVIRONMENT:'preview',TRACE_INTERNAL_SERVICE_SECRET:secret,TRACE_IDENTITY_INVENTORY_ENABLED:'true',TRACE_IDENTITY_DATABASE_ID:PREVIEW_DATABASE_ID,TRACE_IDENTITY_TARGET_ATTESTATION_SHA256:'a'.repeat(64),TRACE_IDENTITY_IMPLEMENTATION_SHA256:'b'.repeat(64)};
 const options={modules:true as const,script:bundled.outputFiles[0].text,compatibilityDate:'2026-07-12',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'local-only-n4'},host:'127.0.0.1',cf:false,telemetry:{enabled:false},resourcePersistencePath:path,resourceTmpPath:join(path,'tmp'),unsafeDevRegistryPath:join(path,'registry'),bindings};
 const mf=new Miniflare(convertV4MiniflareOptions(options));
 try{
  const db=await mf.getD1Database('DB');
  const tables=['editorial_sections','editorial_topics','editorial_candidates','admin_request_nonces','admin_audit_log','news_import_packages','news_import_versions','news_import_deliveries','news_import_proposals','news_import_events','news_import_version_links'];
  const objects=fixture.sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all().filter(o=>tables.includes(String(o.tbl_name)));
  for(const object of objects)await db.prepare(String(object.sql)).run();
  await db.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,source_hash,state,created_by) VALUES ('runtime','manual_url','https://runtime.trace.test/path?utm_source=old','preserve','new','fixture')").run();
  const base={environment:'preview',database_id:PREVIEW_DATABASE_ID,target_attestation_sha256:'a'.repeat(64)};
  async function send(input:any,nonce=crypto.randomUUID()){
   const body=JSON.stringify(input),identity={operator:'publisher@example.test',role:'publisher' as const,timestamp:String(Date.now()),nonce},signature=await signInternalRequest(secret,'POST','/admin/identity-maintenance',body,identity);
   const response=await mf.dispatchFetch('https://worker.test/admin/identity-maintenance',{method:'POST',body,headers:{'X-Trace-Internal-Version':'v1','X-Trace-Operator':identity.operator,'X-Trace-Role':identity.role,'X-Trace-Timestamp':identity.timestamp,'X-Trace-Nonce':nonce,'X-Trace-Signature':signature}});return {status:response.status,body:await response.json() as any};
  }
  const inspected=await send({...base,operation:'inspect',after:'',limit:25});assert.equal(inspected.status,200,JSON.stringify(inspected.body));assert.equal(inspected.body.accounting.provider_metadata_complete,true);assert.equal(inspected.body.accounting.provider_rows_written,0);
  const id=crypto.randomUUID(),profile={schema:N4_VERSION,approval_ref:'LOCAL-RUNTIME-N4',owner_approval:'LOCAL-RUNTIME-N4',...base,implementation_sha256:'b'.repeat(64),migration_sha256:IDENTITY_MIGRATION_SHA256,publisher_email:'publisher@example.test',from_utc:new Date(Date.now()-60000).toISOString(),until_utc:new Date(Date.now()+600000).toISOString(),requests:[{request_id:id,after:'',limit:25,selection_sha256:inspected.body.selection_sha256,maximum_row_changes:3,maximum_write_units:13}]};
  await mf.setOptions(convertV4MiniflareOptions({...options,bindings:{...bindings,TRACE_IDENTITY_MAINTENANCE_ENABLED:'true',TRACE_IDENTITY_MAINTENANCE_PROFILE:JSON.stringify(profile)}}));
  const input={...base,operation:'apply',approval_ref:profile.approval_ref,request_id:id,after:'',selection_sha256:inspected.body.selection_sha256},applied=await send(input);assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.writes,3);assert.equal(applied.body.provider_accounting_available,true);assert.ok(applied.body.provider_rows_written<=13);
  const replay=await send(input);assert.equal(replay.status,200);assert.equal(replay.body.writes,0);assert.equal(replay.body.accounting.provider_rows_written,0);
  const currentDb=await mf.getD1Database('DB'),row=await currentDb.prepare("SELECT source_hash,state,source_url_hash FROM editorial_candidates WHERE id='runtime'").first();assert.equal(row!.source_hash,'preserve');assert.equal(row!.state,'new');assert.equal(String(row!.source_url_hash).length,64);
  console.log('N4_LOCAL_D1 '+JSON.stringify({inspect:inspected.body.accounting,apply:applied.body.accounting,logical_changes:applied.body.writes,write_unit_reservation:13,replay:replay.body.accounting,remote:false}));
 }finally{fixture.close();await mf.dispose();const child=relative(resolve(tmpdir()),resolve(path));if(!child||child.startsWith('..')||!child.startsWith('trace-n4-d1-'))throw new Error('Unexpected temporary cleanup target');rmSync(path,{recursive:true,force:true});}
});
