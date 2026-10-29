#!/usr/bin/env node
// N4-OPS-01 offline receipt reconciler. It compares saved request records, receipt lookups,
// the approved package and profile, and deployment readback verifications. It never sends,
// retries or replays a request, and a missing receipt is never read as zero writes.
import {basename} from 'node:path';
import {N4_VERSION,UUID,SCHEMA,fail,sha256,canonical,exactKeys,isoUtc,readEvidence,parseArgs,outputDirectory,writeAddressed,jsonBytes,main,isEntry} from './lib.mjs';
import {loadPackage,validateApproval,validateProfile} from './profile-builder.mjs';

export const CLASSES=['COMPLETED_MATCHED','EXPLICITLY_REFUSED','UNUSED_AUTHORISED_SLOT','MISSING_OR_UNCERTAIN','CONFLICTING_OR_DUPLICATE','UNEXPECTED_WRITE_CONSUMPTION','STALE_OR_MISMATCHED_TARGET'];
const STOP_CLASSES=new Set(['EXPLICITLY_REFUSED','CONFLICTING_OR_DUPLICATE','UNEXPECTED_WRITE_CONSUMPTION','STALE_OR_MISMATCHED_TARGET']);
// Refusals the Worker returns before its atomic batch: no nonce, candidate update or receipt is written.
const PRECOMMIT=new Set(['identity_request_not_approved','identity_approval_mismatch','identity_outside_maintenance_window','identity_maintenance_disabled','identity_approval_required','identity_stale_selection','identity_selection_changed','identity_unresolved_conflict','identity_precommit_write_budget','identity_empty_selection','identity_uncertified_write_indexes','identity_target_mismatch','identity_verified_preview_target_required','identity_signed_publisher_required','identity_preview_only','identity_schema_0080_required','identity_statement_budget','identity_receipt_byte_bound','identity_campaign_bound','identity_batch_approval_bound','identity_request_contract','identity_cursor','identity_page_bound','identity_request_id','identity_invalid_json','identity_operation_contract','identity_route_contract','identity_request_too_large','identity_publisher_required','identity_legacy_id_exceeds_bound','identity_snapshot_byte_bound','identity_inventory_disabled']);
const TARGET_CODES=new Set(['identity_target_mismatch','identity_verified_preview_target_required','identity_preview_only']);

function loadVerification(ev,phase,pkgSha,profileSha){
 const v=ev.value;
 if(v?.schema!==SCHEMA.verification||v.phase!==phase)fail('malformed_input',`deployment ${phase} verification`);
 if(v.package_sha256!==pkgSha||v.deployable_profile_sha256!==profileSha)fail('malformed_input',`deployment ${phase} verification is for a different package or profile`);
 return {sha256:ev.sha256,disposition:v.disposition,captured_at_utc:v.readback_captured_at_utc,closed_after_window:v.closed_after_window??null};
}

function loadRequest(ev){
 const r=ev.value,where=`request record ${basename(ev.path)}`;
 exactKeys(r,['schema','sent_at_utc','request','response','received_at_utc'],where);
 if(r.schema!==SCHEMA.request)fail('malformed_input',`${where} schema`);
 exactKeys(r.request,['operation','environment','database_id','target_attestation_sha256','approval_ref','request_id','after','selection_sha256'],`${where} request`);
 if(r.request.operation!=='apply'||!UUID.test(r.request.request_id??''))fail('malformed_input',`${where} must record one apply request`);
 const sent=isoUtc(r.sent_at_utc,`${where} sent_at_utc`);
 if(r.response!==null){exactKeys(r.response,['status','body'],`${where} response`);if(!Number.isInteger(r.response.status))fail('malformed_input',`${where} status`);isoUtc(r.received_at_utc,`${where} received_at_utc`);}
 else if(r.received_at_utc!==null)fail('malformed_input',`${where} has a receive time but no response`);
 return {sha256:ev.sha256,sent,...r};
}
function loadLookup(ev){
 const r=ev.value,where=`receipt lookup ${basename(ev.path)}`;
 exactKeys(r,['schema','captured_at_utc','request','response'],where);
 if(r.schema!==SCHEMA.lookup)fail('malformed_input',`${where} schema`);
 exactKeys(r.request,['operation','environment','database_id','target_attestation_sha256','request_id'],`${where} request`);
 if(r.request.operation!=='receipt'||!UUID.test(r.request.request_id??''))fail('malformed_input',`${where} must record one receipt lookup`);
 exactKeys(r.response,['status','body'],`${where} response`);
 return {sha256:ev.sha256,at:isoUtc(r.captured_at_utc,`${where} captured_at_utc`),...r};
}

/** Every check a durable receipt must pass to count as this slot's committed execution. */
function receiptFindings(receipt,slot,pkgSlot,profile){
 const out=[],add=(cls,code)=>out.push({class:cls,code});
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return [{class:'CONFLICTING_OR_DUPLICATE',code:'receipt_malformed'}];
 const {receipt_sha256,...body}=receipt;let digest=null;try{digest=sha256(canonical(body));}catch{}
 if(digest===null||digest!==receipt_sha256)add('CONFLICTING_OR_DUPLICATE','receipt_integrity_failed');
 if(receipt.schema!==N4_VERSION||receipt.request_id!==slot.request_id)add('CONFLICTING_OR_DUPLICATE','receipt_identity');
 for(const k of ['environment','database_id','target_attestation_sha256','implementation_sha256','migration_sha256'])if(receipt[k]!==profile[k])add('STALE_OR_MISMATCHED_TARGET','receipt_'+k);
 if(receipt.approval_ref!==profile.approval_ref||receipt.publisher!==profile.publisher_email||receipt.selection_sha256!==slot.selection_sha256||receipt.after!==slot.after)add('CONFLICTING_OR_DUPLICATE','receipt_not_this_slot');
 const input={approval_ref:profile.approval_ref,request_id:slot.request_id,after:slot.after,selection_sha256:slot.selection_sha256};
 if(receipt.request_hash!==sha256(canonical({input,profile})))add('CONFLICTING_OR_DUPLICATE','receipt_from_a_different_profile');
 if(receipt.maximum_row_changes!==slot.maximum_row_changes||receipt.maximum_write_units!==slot.maximum_write_units)add('CONFLICTING_OR_DUPLICATE','receipt_budget_not_approved');
 const d=Array.isArray(receipt.decisions)?receipt.decisions:null;
 if(!d||d.length!==pkgSlot.rows.length||d.some((x,i)=>x?.id!==pkgSlot.rows[i].id||x.canonical_hash!==pkgSlot.rows[i].canonical_hash||x.issue!==pkgSlot.rows[i].issue||x.url_fingerprint!==pkgSlot.rows[i].url_fingerprint))add('CONFLICTING_OR_DUPLICATE','receipt_rows_differ_from_approved_inventory');
 const n=pkgSlot.rows.length;
 if(receipt.writes!==n+2||receipt.reserved_write_units!==5*n+8||receipt.writes>slot.maximum_row_changes)add('UNEXPECTED_WRITE_CONSUMPTION','receipt_logical_changes');
 if(receipt.indexed!==pkgSlot.rows.filter(r=>r.canonical_hash).length||receipt.deferred!==pkgSlot.rows.filter(r=>r.issue).length||receipt.next_cursor!==pkgSlot.next_cursor)add('CONFLICTING_OR_DUPLICATE','receipt_outcome_differs');
 if(receipt.canonical_admissions!==0||receipt.editorial_state_changes!==0||receipt.replayed!==false)add('UNEXPECTED_WRITE_CONSUMPTION','receipt_reports_other_mutation');
 return out;
}

function classifySlot(slot,pkgSlot,profile,target,requests,lookups,untilMs){
 const findings=[],add=(cls,code,detail)=>findings.push({class:cls,code,...(detail?{detail}:{})});
 for(const r of requests){
  if(r.request.environment!=='preview'||r.request.database_id!==target.database_id||r.request.target_attestation_sha256!==target.target_attestation_sha256)add('STALE_OR_MISMATCHED_TARGET','request_target_differs');
  if(r.request.approval_ref!==profile.approval_ref||r.request.after!==slot.after||r.request.selection_sha256!==slot.selection_sha256)add('CONFLICTING_OR_DUPLICATE','request_differs_from_approved_slot');
 }
 for(const l of lookups)if(l.request.environment!=='preview'||l.request.database_id!==target.database_id||l.request.target_attestation_sha256!==target.target_attestation_sha256)add('STALE_OR_MISMATCHED_TARGET','lookup_target_differs');
 const receipts=[],responses=requests.filter(r=>r.response).map(r=>r.response);
 for(const res of responses)if(res.status===200&&res.body?.receipt)receipts.push({source:'apply',receipt:res.body.receipt});
 const durable=lookups.filter(l=>l.response.status===200&&l.response.body?.receipt);
 for(const l of durable)receipts.push({source:'lookup',receipt:l.response.body.receipt});
 const distinct=new Map();for(const r of receipts)distinct.set(canonical(r.receipt),r.receipt);
 if(distinct.size>1)add('CONFLICTING_OR_DUPLICATE','multiple_distinct_receipts');
 const fresh=responses.filter(r=>r.status===200&&r.body?.replayed===false);
 if(fresh.length>1)add('CONFLICTING_OR_DUPLICATE','duplicate_execution_responses');
 const codes=responses.filter(r=>r.status!==200).map(r=>String(r.body?.error??'unrecognised_response'));
 if(codes.includes('identity_provider_write_bound_exceeded_reconcile'))add('UNEXPECTED_WRITE_CONSUMPTION','provider_write_bound_exceeded');
 if(codes.includes('identity_conflicting_request'))add('CONFLICTING_OR_DUPLICATE','worker_reported_conflicting_request');
 for(const c of codes)if(TARGET_CODES.has(c))add('STALE_OR_MISMATCHED_TARGET','worker_refused_target:'+c);
 const receipt=distinct.size===1?[...distinct.values()][0]:null;
 let storage={status:'NOT_APPLICABLE',provider_rows_written:null},logical=null,basis;
 if(receipt){
  for(const f of receiptFindings(receipt,slot,pkgSlot,profile))add(f.class,f.code);
  logical=receipt.writes;
  for(const r of fresh)if(r.body.writes!==receipt.writes)add('UNEXPECTED_WRITE_CONSUMPTION','response_writes_differ_from_receipt');
  const measured=fresh.find(r=>r.body.provider_accounting_available===true&&Number.isSafeInteger(r.body.provider_rows_written));
  if(measured){storage={status:'MEASURED',provider_rows_written:measured.body.provider_rows_written};if(measured.body.provider_rows_written>slot.maximum_write_units)add('UNEXPECTED_WRITE_CONSUMPTION','provider_rows_written_above_reservation');}
  else storage={status:'NOT_MEASURED',provider_rows_written:null};
  basis=durable.length?'durable_receipt_lookup':'apply_response_only';
 }
 const conclusive=lookups.filter(l=>l.response.status===404&&l.response.body?.error==='identity_receipt_not_found'&&l.at>=untilMs);
 const blocking=findings.find(f=>f.class==='STALE_OR_MISMATCHED_TARGET')??findings.find(f=>f.class==='CONFLICTING_OR_DUPLICATE')??findings.find(f=>f.class==='UNEXPECTED_WRITE_CONSUMPTION');
 let cls,absenceConfirmed=null;
 if(receipt&&conclusive.length){cls='CONFLICTING_OR_DUPLICATE';findings.push({class:cls,code:'receipt_present_and_absent'});}
 else if(blocking)cls=blocking.class;
 else if(receipt)cls=durable.length?'COMPLETED_MATCHED':'MISSING_OR_UNCERTAIN',basis=durable.length?basis:'receipt_not_confirmed_by_durable_lookup';
 else{
  absenceConfirmed=conclusive.length>0;
  const uncertain=!requests.length?false:requests.some(r=>!r.response||(r.response.status!==200&&!PRECOMMIT.has(String(r.response.body?.error))));
  if(!requests.length){cls=absenceConfirmed?'UNUSED_AUTHORISED_SLOT':'MISSING_OR_UNCERTAIN';basis=absenceConfirmed?'no_request_and_no_receipt_after_window':'no_request_record_and_no_post_window_lookup';}
  else if(!uncertain){cls='EXPLICITLY_REFUSED';basis='precommit_refusal:'+[...new Set(codes)].join(',');}
  else if(absenceConfirmed){cls='EXPLICITLY_REFUSED';basis='uncertain_response_but_no_receipt_after_window';}
  else{cls='MISSING_OR_UNCERTAIN';basis='uncertain_response_without_post_window_lookup';}
 }
 return {index:pkgSlot.index,request_id:slot.request_id,after:slot.after,selection_sha256:slot.selection_sha256,rows:pkgSlot.rows.length,class:cls,basis:basis??null,absence_confirmed:absenceConfirmed,
  logical_changes:logical,reserved_row_changes:slot.maximum_row_changes,reserved_write_units:slot.maximum_write_units,storage_writes:storage,next_cursor:cls==='COMPLETED_MATCHED'?receipt.next_cursor:null,
  attempts:requests.length,lookups:lookups.length,response_codes:[...new Set(codes)].sort(),findings};
}

export function reconcile(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true},'approval-record':{type:'string',required:true},'profile':{type:'string',required:true},'deployment-open':{type:'string'},'deployment-closure':{type:'string'},'request':{type:'list'},'receipt-lookup':{type:'list'},'audit-evidence':{type:'string'},'final-inventory':{type:'string'},'out-dir':{type:'string',required:true}});
 const dir=outputDirectory(a['out-dir']),{ev:pkgEv,pkg}=loadPackage(a.package);
 const approval=validateApproval(readEvidence(a['approval-record'],'owner approval record'),pkgEv,pkg);
 const profEv=readEvidence(a.profile,'deployable profile');if(profEv.sha256!==pkg.deployable_profile_sha256_if_approved)fail('profile_mismatch','profile is not the approved deployable profile');
 const profile=profEv.value;validateProfile(profile,pkg.approval_ref);
 const sources=[{role:'approval_package',sha256:pkgEv.sha256},{role:'owner_approval',sha256:approval.sha256},{role:'deployable_profile',sha256:profEv.sha256}];
 const campaign=[],addCampaign=(cls,code,detail)=>campaign.push({class:cls,code,...(detail?{detail}:{})}),notVerified=[];
 const deployment={};
 for(const phase of ['open','closure']){
  const path=a['deployment-'+phase];
  if(!path){deployment[phase]=null;notVerified.push(`deployment_${phase}_verification_not_supplied`);continue;}
  const ev=readEvidence(path,`deployment ${phase} verification`);deployment[phase]=loadVerification(ev,phase,pkgEv.sha256,profEv.sha256);sources.push({role:'deployment_'+phase,sha256:ev.sha256});
  if(deployment[phase].disposition!=='PASS')addCampaign('STALE_OR_MISMATCHED_TARGET',`deployment_${phase}_verification_stop`);
 }
 const slotIds=new Set(profile.requests.map(r=>r.request_id)),requests=a.request.map(p=>{const ev=readEvidence(p,'request record');sources.push({role:'request_record',sha256:ev.sha256});return loadRequest(ev);});
 const lookups=a['receipt-lookup'].map(p=>{const ev=readEvidence(p,'receipt lookup');sources.push({role:'receipt_lookup',sha256:ev.sha256});return loadLookup(ev);});
 if(new Set(requests.map(r=>r.sha256)).size!==requests.length||new Set(lookups.map(l=>l.sha256)).size!==lookups.length)fail('duplicate_input','the same record was supplied twice');
 for(const r of requests)if(!slotIds.has(r.request.request_id))addCampaign('CONFLICTING_OR_DUPLICATE','request_for_unapproved_slot',r.request.request_id);
 for(const l of lookups)if(!slotIds.has(l.request.request_id))addCampaign('CONFLICTING_OR_DUPLICATE','lookup_for_unapproved_slot',l.request.request_id);
 const from=Date.parse(profile.from_utc),until=Date.parse(profile.until_utc);
 for(const r of requests)if(r.sent<from||r.sent>until)addCampaign('CONFLICTING_OR_DUPLICATE','request_sent_outside_approved_window',r.request.request_id);
 if(deployment.open&&requests.some(r=>r.sent<Date.parse(deployment.open.captured_at_utc)))addCampaign('CONFLICTING_OR_DUPLICATE','request_sent_before_deployment_verification');
 const target={database_id:profile.database_id,target_attestation_sha256:profile.target_attestation_sha256};
 const slots=profile.requests.map((s,i)=>classifySlot(s,pkg.slots[i],profile,target,requests.filter(r=>r.request.request_id===s.request_id),lookups.filter(l=>l.request.request_id===s.request_id),until));
 // Manual sequencing: a slot may only complete after every earlier slot completed.
 const firstIncomplete=slots.findIndex(s=>s.class!=='COMPLETED_MATCHED');
 if(firstIncomplete>=0&&slots.slice(firstIncomplete+1).some(s=>s.class==='COMPLETED_MATCHED'||s.attempts>0))addCampaign('CONFLICTING_OR_DUPLICATE','slots_not_executed_in_order');
 const completed=slots.filter(s=>s.class==='COMPLETED_MATCHED');
 let audit=null;
 if(a['audit-evidence']){
  const ev=readEvidence(a['audit-evidence'],'audit evidence'),v=ev.value;sources.push({role:'audit_evidence',sha256:ev.sha256});
  exactKeys(v,['schema','captured_at_utc','query_ref','identity_receipt_event_ids','identity_maintenance_nonces_in_window'],'audit evidence');
  if(v.schema!==SCHEMA.audit||!Array.isArray(v.identity_receipt_event_ids)||(v.identity_maintenance_nonces_in_window!==null&&!Number.isInteger(v.identity_maintenance_nonces_in_window)))fail('malformed_input','audit evidence');
  const at=isoUtc(v.captured_at_utc,'audit captured_at_utc'),expected=completed.map(s=>'n4-identity:'+s.request_id).sort(),found=[...v.identity_receipt_event_ids].sort();
  const receiptsMatch=canonical(found)===canonical(expected),noncesMatch=v.identity_maintenance_nonces_in_window===null?null:v.identity_maintenance_nonces_in_window===completed.length;
  if(at<until)notVerified.push('audit_evidence_captured_before_window_closed');
  if(!receiptsMatch)addCampaign('CONFLICTING_OR_DUPLICATE','audit_receipts_differ_from_completed_slots');
  if(noncesMatch===false)addCampaign('UNEXPECTED_WRITE_CONSUMPTION','nonce_count_differs_from_completed_slots');
  audit={sha256:ev.sha256,query_ref:v.query_ref,receipt_event_ids_match:receiptsMatch,nonces_match:noncesMatch};
 }
 let finalInventory=null;
 if(a['final-inventory']){
  const ev=readEvidence(a['final-inventory'],'final inventory'),v=ev.value;sources.push({role:'final_inventory',sha256:ev.sha256});
  if(v?.schema!==SCHEMA.inventory||v.request?.operation!=='inspect'||v.response?.status!==200||v.response.body?.schema!==N4_VERSION)fail('malformed_input','final inventory capture');
  if(v.request.after!=='')fail('final_inventory_not_from_start','the final inventory must restart at after:""');
  if(v.request.database_id!==target.database_id||v.request.target_attestation_sha256!==target.target_attestation_sha256)addCampaign('STALE_OR_MISMATCHED_TARGET','final_inventory_target_differs');
  const b=v.response.body;finalInventory={sha256:ev.sha256,captured_at_utc:v.captured_at_utc,known_pending_lower_bound:b.known_pending_lower_bound??null,pending_count_exact:b.pending_count_exact??null,missing_identity_guard_blocked:b.missing_identity_guard_blocked??null,rows_in_first_page:Array.isArray(b.rows)?b.rows.length:null,conflicts_in_page:b.conflicts_in_page??null};
 }
 const count=Object.fromEntries(CLASSES.map(c=>[c,slots.filter(s=>s.class===c).length]));
 for(const s of slots){if(s.class==='MISSING_OR_UNCERTAIN')notVerified.push(`slot_${s.index}_uncertain`);if(s.class==='COMPLETED_MATCHED'&&s.storage_writes.status!=='MEASURED')notVerified.push(`slot_${s.index}_storage_writes_not_measured`);}
 const stopReasons=[...slots.filter(s=>STOP_CLASSES.has(s.class)).map(s=>`slot_${s.index}_${s.class}`),...campaign.map(c=>c.code)];
 const disposition=stopReasons.length?'STOP':notVerified.length?'NOT_VERIFIED':'PASS';
 const lastDone=firstIncomplete<0?slots.length-1:firstIncomplete-1;
 const resumeAfter=lastDone>=0?slots[lastDone].next_cursor:slots[0].after;
 const stopContinuable=disposition==='STOP'&&!campaign.length&&!notVerified.length&&slots.every((s,i)=>i<=lastDone?s.class==='COMPLETED_MATCHED':i===lastDone+1?s.class==='EXPLICITLY_REFUSED'&&s.absence_confirmed===true:s.class==='UNUSED_AUTHORISED_SLOT');
 const measured=completed.filter(s=>s.storage_writes.status==='MEASURED');
 sources.sort((x,y)=>(x.role+x.sha256).localeCompare(y.role+y.sha256));
 const result={schema:SCHEMA.reconciliation,disposition,stop_continuable:stopContinuable,
  approval_ref:pkg.approval_ref,package_sha256:pkgEv.sha256,approval_record_sha256:approval.sha256,deployable_profile_sha256:profEv.sha256,
  target:{environment:'preview',database_id:profile.database_id,target_attestation_sha256:profile.target_attestation_sha256,implementation_sha256:profile.implementation_sha256,migration_sha256:profile.migration_sha256},
  window:{from_utc:profile.from_utc,until_utc:profile.until_utc},deployment,
  totals:{slots:slots.length,...count,committed_logical_changes:completed.reduce((n,s)=>n+s.logical_changes,0),reserved_row_changes_for_completed:completed.reduce((n,s)=>n+s.reserved_row_changes,0),
   reserved_write_units_for_completed:completed.reduce((n,s)=>n+s.reserved_write_units,0),measured_storage_rows_written:measured.reduce((n,s)=>n+s.storage_writes.provider_rows_written,0),slots_with_unmeasured_storage:completed.length-measured.length,
   candidates_completed:completed.reduce((n,s)=>n+s.rows,0)},
  audit,final_inventory:finalInventory,final_inventory_required:true,
  resume_after:resumeAfter,campaign_reported_more_rows:lastDone>=0?pkg.slots[lastDone].has_more:null,
  chain:pkg.chain,slots,campaign_findings:campaign,stop_reasons:stopReasons,not_verified_reasons:notVerified,sources,
  notice:'Offline comparison of saved evidence. No request was sent, retried or replayed. A missing receipt is never treated as zero writes. Local evidence is not Cloudflare billing.'};
 const json=writeAddressed(dir,'n4-reconciliation','json',jsonBytes(result));
 const md=writeAddressed(dir,'n4-reconciliation-report','md',Buffer.from(report(result,json.sha256)));
 return {action:'reconciled',disposition,stop_continuable:stopContinuable,reconciliation:json.path,reconciliation_sha256:json.sha256,report:md.path,resume_after:resumeAfter,requests_sent:0};
}

export function report(r,sha){
 const line=s=>`| ${s.index} | \`${s.request_id}\` | ${s.rows} | **${s.class}** | ${s.basis??''} | ${s.logical_changes??'—'} / ${s.reserved_row_changes} | ${s.storage_writes.status==='MEASURED'?s.storage_writes.provider_rows_written:s.storage_writes.status} / ${s.reserved_write_units} | ${s.findings.map(f=>f.code).join(', ')||'—'} |`;
 return [`# N4 maintenance reconciliation — ${r.approval_ref}`,'',
  `**Disposition: ${r.disposition}**${r.disposition==='STOP'&&r.stop_continuable?' (refused slot with confirmed absence; continuing needs an explicit owner acknowledgement)':''}`,'',
  `- Machine-readable reconciliation SHA-256: \`${sha}\``,`- Package \`${r.package_sha256}\`, owner approval record \`${r.approval_record_sha256}\`, deployed profile \`${r.deployable_profile_sha256}\``,
  `- Target: Preview \`${r.target.database_id}\`, attestation \`${r.target.target_attestation_sha256}\`, implementation \`${r.target.implementation_sha256}\``,`- Window: ${r.window.from_utc} to ${r.window.until_utc}`,
  `- Deployment verification: open ${r.deployment.open?.disposition??'NOT SUPPLIED'}, closure ${r.deployment.closure?.disposition??'NOT SUPPLIED'}`,
  `- Committed logical changes: ${r.totals.committed_logical_changes} (reserved ${r.totals.reserved_row_changes_for_completed}); measured storage rows written: ${r.totals.measured_storage_rows_written} (reserved units ${r.totals.reserved_write_units_for_completed}; ${r.totals.slots_with_unmeasured_storage} completed slot(s) unmeasured)`,
  `- Audit/nonce evidence: ${r.audit?`receipts ${r.audit.receipt_event_ids_match?'match':'DIFFER'}, nonces ${r.audit.nonces_match===null?'not supplied':r.audit.nonces_match?'match':'DIFFER'}`:'not supplied'}`,
  `- Resume cursor for the next profile: \`${JSON.stringify(r.resume_after)}\`. A final inventory from \`after: ""\` is always required before closing the campaign${r.final_inventory?`; supplied: pending lower bound ${r.final_inventory.known_pending_lower_bound}`:''}.`,'',
  '| Slot | Request id | Rows | Class | Basis | Logical / reserved | Storage / reserved units | Findings |','|---|---|---|---|---|---|---|---|',...r.slots.map(line),'',
  r.stop_reasons.length?`**STOP reasons:** ${r.stop_reasons.join(', ')}`:'No STOP reason.',r.not_verified_reasons.length?`**Not verified:** ${r.not_verified_reasons.join(', ')}`:'Nothing left unverified.','',
  `_${r.notice}_`,''].join('\n');
}

if(isEntry(import.meta.url))main(reconcile);
