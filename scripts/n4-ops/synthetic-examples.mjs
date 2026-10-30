#!/usr/bin/env node
// Regenerates docs/audit/n4-ops-01-examples from fixed synthetic evidence. Every value is fictional:
// no Preview data, no real approval, no request. tests/n4-ops-01.test.ts checks the committed bytes.
import {mkdirSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {N4_VERSION,PREVIEW_DATABASE_ID,IDENTITY_MIGRATION_SHA256,SCHEMA,REPO_ROOT,sha256,canonical,parseArgs,outputDirectory,main,isEntry,reservation} from './lib.mjs';
import {prepare,approvalTemplate,finalize,verifyDeployment} from './profile-builder.mjs';
import {reconcile} from './reconcile.mjs';

const PLAN=join(REPO_ROOT,'docs/audit/local-news-p4-n4-preview-plan.json'),PLAN_SHA='9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9';
const ATTESTATION=sha256('synthetic example attestation - not a real deployment'),PUBLISHER='publisher@example.test',OWNER='owner@example.test';
const target={environment:'preview',database_id:PREVIEW_DATABASE_ID,target_attestation_sha256:ATTESTATION};
const at=s=>`2026-11-02T${s}.000Z`;

function page(i,after,ids,implementation){
 const rows=ids.map(id=>id.endsWith('-bad')?{id,url_fingerprint:sha256('url:'+id),url_length:14,canonical_hash:null,issue:'invalid_url',conflict:null,indexed_duplicate_sample:[]}:{id,url_fingerprint:sha256('url:'+id),url_length:32,canonical_hash:sha256('https://example.test/'+id),issue:null,conflict:null,indexed_duplicate_sample:[]});
 const n=rows.length,res=reservation(n);
 return {schema:SCHEMA.inventory,captured_at_utc:at(`09:0${i}:00`),publisher_email:PUBLISHER,request:{operation:'inspect',...target,after,limit:3},
  response:{status:200,body:{schema:N4_VERSION,after,limit:3,selection_sha256:sha256('synthetic selection '+i),rows,has_more:true,next_cursor:ids.at(-1),known_pending_lower_bound:51,pending_count_exact:false,missing_identity_guard_blocked:true,
   package_import_readiness:'NOT_ESTABLISHED_REQUIRES_SPECIFIC_PACKAGE_PREFLIGHT',already_indexed_observed_lower_bound:0,already_indexed_global_count:null,previously_deferred_global_count:null,invalid_in_page:rows.filter(r=>r.issue==='invalid_url').length,oversize_in_page:0,conflicts_in_page:0,
   estimated_row_changes:res.maximum_row_changes,estimated_write_units:res.maximum_write_units,inspection_writes:0,scan_page_bound:4,duplicate_samples_complete:false,
   environment:'preview',database_id:PREVIEW_DATABASE_ID,target_attestation_sha256:ATTESTATION,implementation_sha256:implementation,migration_sha256:IDENTITY_MIGRATION_SHA256,database_identity_status:'DEPLOYMENT_ATTESTATION_REQUIRES_PROVIDER_PREFLIGHT',
   accounting:{sql_statements_sent:7,database_round_trips:7,provider_rows_read:40,provider_rows_written:0,provider_metadata_complete:true}}}};
}
/** Receipt in the exact shape and seal that applyIdentityBatch() stores. */
function receipt(profile,slot,pkgSlot){
 const input={approval_ref:profile.approval_ref,request_id:slot.request_id,after:slot.after,selection_sha256:slot.selection_sha256},n=pkgSlot.rows.length;
 const body={schema:N4_VERSION,approval_ref:profile.approval_ref,request_id:slot.request_id,request_hash:sha256(canonical({input,profile})),environment:'preview',database_id:profile.database_id,target_attestation_sha256:profile.target_attestation_sha256,implementation_sha256:profile.implementation_sha256,migration_sha256:profile.migration_sha256,publisher:profile.publisher_email,selection_sha256:slot.selection_sha256,after:slot.after,
  indexed:pkgSlot.rows.filter(r=>r.canonical_hash).length,deferred:pkgSlot.rows.filter(r=>r.issue).length,next_cursor:pkgSlot.next_cursor,writes:n+2,has_more:true,decisions:pkgSlot.rows.map(r=>({id:r.id,url_fingerprint:r.url_fingerprint,original_hash_prefix_fingerprint:sha256('orig:'+r.id),canonical_hash:r.canonical_hash,issue:r.issue})),
  reserved_write_units:5*n+8,maximum_row_changes:slot.maximum_row_changes,maximum_write_units:slot.maximum_write_units,replayed:false,canonical_admissions:0,editorial_state_changes:0};
 return {...body,receipt_sha256:sha256(canonical(body))};
}

export function generate(argv){
 const a=parseArgs(argv,{'out-dir':{type:'string',required:true}}),out=outputDirectory(a['out-dir']),work=join(out,'work');mkdirSync(work,{recursive:true});
 const plan=JSON.parse(readFileSync(PLAN,'utf8')),save=(name,v)=>{const p=join(work,name);writeFileSync(p,JSON.stringify(v,null,1)+'\n');return p;};
 const t=save('target.json',{schema:SCHEMA.target,status:'VERIFIED',environment:'preview',database_name:'trace-manifest-db-preview',database_id:PREVIEW_DATABASE_ID,target_attestation_sha256:ATTESTATION,implementation_sha256:plan.implementation_sha256,migration_sha256:IDENTITY_MIGRATION_SHA256,worker_deployment_ref:'SYNTHETIC-worker-version',pages_deployment_ref:'SYNTHETIC-pages-deployment',verified_at_utc:at('08:30:00'),verified_by:OWNER,evidence:[{label:'SYNTHETIC A0 provider and binding record',sha256:sha256('synthetic A0')}]});
 const c0=save('capture-0.json',page(0,'',['cand-0001','cand-0002','cand-0003-bad'],plan.implementation_sha256)),c1=save('capture-1.json',page(1,'cand-0003-bad',['cand-0004','cand-0005','cand-0006'],plan.implementation_sha256));
 const prep=prepare(['--plan',PLAN,'--plan-sha256',PLAN_SHA,'--target-evidence',t,'--inventory',c0,'--inventory',c1,'--approval-ref','N4-EXAMPLE-P01','--from-utc',at('10:00:00'),'--until-utc',at('10:45:00'),'--now',at('09:05:00'),'--out-dir',work]);
 const pkg=JSON.parse(readFileSync(prep.package,'utf8')),template=approvalTemplate(['--package',prep.package]);
 // Synthetic stand-in for the owner's own record, used only to exercise the tools; it is not committed.
 const approval=save('owner-approval.SYNTHETIC.json',{...template,decision:'APPROVED',owner_email:OWNER,approved_at_utc:at('09:30:00'),statement:`SYNTHETIC EXAMPLE ONLY, not an approval: deployable profile ${pkg.deployable_profile_sha256_if_approved}`});
 const fin=finalize(['--package',prep.package,'--approval-record',approval,'--out-dir',work,'--now',at('09:35:00')]),profile=JSON.parse(readFileSync(fin.profile,'utf8'));
 const vars=(enabled,profileSha)=>({TRACE_ENVIRONMENT:'preview',TRACE_IDENTITY_DATABASE_ID:PREVIEW_DATABASE_ID,TRACE_IDENTITY_TARGET_ATTESTATION_SHA256:ATTESTATION,TRACE_IDENTITY_IMPLEMENTATION_SHA256:plan.implementation_sha256,TRACE_IDENTITY_INVENTORY_ENABLED:'true',TRACE_IDENTITY_MAINTENANCE_ENABLED:enabled,TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256:profileSha});
 const readback=(name,time,enabled,sha)=>save(name,{schema:SCHEMA.readback,captured_at_utc:time,environment:'preview',worker_script:'SYNTHETIC-preview-worker',variables:vars(enabled,sha),secrets_present:{TRACE_INTERNAL_SERVICE_SECRET:true},import_gate:null,crons:[]});
 const common=['--package',prep.package,'--approval-record',approval,'--profile',fin.profile,'--out-dir',work];
 const openReadback=readback('readback-open.json',at('09:50:00'),'true',fin.deployable_profile_sha256),closureReadback=readback('readback-closure.json',at('10:20:00'),null,null);
 verifyDeployment([...common,'--readback',openReadback,'--phase','open']);verifyDeployment([...common,'--readback',closureReadback,'--phase','closure']);
 const apply=(i,time,response)=>save(`request-${i}-${time.slice(11,19).replace(/:/g,'')}.json`,{schema:SCHEMA.request,evidence_source:'synthetic_fixture',sent_at_utc:time,request:{operation:'apply',...target,approval_ref:profile.approval_ref,request_id:profile.requests[i].request_id,after:profile.requests[i].after,selection_sha256:profile.requests[i].selection_sha256},response,received_at_utc:response?time.replace(/\.000Z$/,'.900Z'):null});
 const ok=i=>({status:200,body:{schema:N4_VERSION,request_id:profile.requests[i].request_id,receipt:receipt(profile,profile.requests[i],pkg.slots[i]),replayed:false,writes:5,batch_statements:12,provider_rows_written:14,provider_accounting_available:true,accounting:{sql_statements_sent:29,database_round_trips:16,provider_rows_read:120,provider_rows_written:14,provider_metadata_complete:true}}});
 const lookup=(i,time,found)=>save(`lookup-${i}-${time.slice(11,19).replace(/:/g,'')}.json`,{schema:SCHEMA.lookup,captured_at_utc:time,request:{operation:'receipt',...target,request_id:profile.requests[i].request_id},response:found?{status:200,body:{receipt:receipt(profile,profile.requests[i],pkg.slots[i]),inspection_writes:0}}:{status:404,body:{error:'identity_receipt_not_found'}}});
 const rec=(requests,lookups)=>reconcile([...common.slice(0,6),'--readback-open',openReadback,'--readback-closure',closureReadback,...requests.flatMap(r=>['--request',r]),...lookups.flatMap(l=>['--receipt-lookup',l]),'--out-dir',work]);
 // Completed: both slots executed in order, durable receipts confirmed after the window.
 const done=rec([apply(0,at('10:02:00'),ok(0)),apply(1,at('10:05:00'),ok(1))],[lookup(0,at('10:50:00'),true),lookup(1,at('10:50:00'),true)]);
 // Failed: slot 1 refused as stale after a row changed; post-window lookup confirms no receipt.
 const failed=rec([apply(0,at('10:02:00'),ok(0)),apply(1,at('10:06:00'),{status:409,body:{error:'identity_stale_selection',accounting:{sql_statements_sent:30,database_round_trips:30,provider_rows_read:110,provider_rows_written:0,provider_metadata_complete:true}}})],[lookup(0,at('10:50:00'),true),lookup(1,at('10:50:00'),false)]);
 // Uncertain: slot 1's response was lost and no lookup was taken after the window, so writes are unknown.
 const uncertain=rec([apply(0,at('10:02:00'),ok(0)),apply(1,at('10:07:00'),null)],[lookup(0,at('10:50:00'),true)]);
 const copies={'example-approval-package-approval-null.json':prep.package,'example-owner-approval-template.json':save('template.json',template),'example-reconciliation-completed.json':done.reconciliation,'example-reconciliation-completed.md':done.report,'example-reconciliation-failed.json':failed.reconciliation,'example-reconciliation-failed.md':failed.report,'example-reconciliation-uncertain.json':uncertain.reconciliation,'example-reconciliation-uncertain.md':uncertain.report};
 for(const [name,from] of Object.entries(copies))copyFileSync(from,join(out,name));
 return {action:'examples_generated',files:Object.keys(copies),dispositions:{completed:done.disposition,failed:failed.disposition,uncertain:uncertain.disposition},requests_sent:0};
}

if(isEntry(import.meta.url))main(generate);
