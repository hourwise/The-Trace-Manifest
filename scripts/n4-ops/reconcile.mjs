#!/usr/bin/env node
// N4-OPS-01 offline receipt reconciler. It compares saved request records, receipt lookups,
// the approved package and profile, and the owner's raw deployment readbacks. It never sends,
// retries or replays a request, and a missing receipt is never read as zero writes.
import {N4_VERSION,UUID,SCHEMA,CLASSES,fail,sha256,canonical,exactKeys,isoUtc,email,readEvidence,parseArgs,outputDirectory,writeAddressed,jsonBytes,deriveOutcome,accountingShape,main,isEntry} from './lib.mjs';
import {loadPackage,validateApproval,validateProfile,deploymentVerification,inventoryBody} from './profile-builder.mjs';
import {EVIDENCE_SOURCES,SYNTHETIC_NOTE,SAVED_NOTE,checkReconciliation,campaignClosure} from './chain.mjs';

export {CLASSES,EVIDENCE_SOURCES};
// A fresh apply response (identity-maintenance/service.ts) plus the Worker's accounting (worker.ts).
const APPLY_KEYS=['schema','request_id','receipt','replayed','writes','batch_statements','provider_rows_written','provider_accounting_available','accounting'];
const SYNTHETIC_MARKER='SYNTHETIC_NOT_PROVIDER';
// Refusals the Worker returns before its atomic batch: no nonce, candidate update or receipt is written.
const PRECOMMIT=new Set(['identity_request_not_approved','identity_approval_mismatch','identity_outside_maintenance_window','identity_maintenance_disabled','identity_approval_required','identity_stale_selection','identity_selection_changed','identity_unresolved_conflict','identity_precommit_write_budget','identity_empty_selection','identity_uncertified_write_indexes','identity_target_mismatch','identity_verified_preview_target_required','identity_signed_publisher_required','identity_preview_only','identity_schema_0080_required','identity_statement_budget','identity_receipt_byte_bound','identity_campaign_bound','identity_batch_approval_bound','identity_request_contract','identity_cursor','identity_page_bound','identity_request_id','identity_invalid_json','identity_operation_contract','identity_route_contract','identity_request_too_large','identity_publisher_required','identity_legacy_id_exceeds_bound','identity_snapshot_byte_bound','identity_inventory_disabled']);
const TARGET_CODES=new Set(['identity_target_mismatch','identity_verified_preview_target_required','identity_preview_only']);

function loadRequest(ev){
 const r=ev.value,where=`request record ${ev.sha256.slice(0,12)}`;
 exactKeys(r,['schema','evidence_source','sent_at_utc','request','response','received_at_utc'],where);
 if(r.schema!==SCHEMA.request)fail('malformed_input',`${where} schema`);
 if(!EVIDENCE_SOURCES.includes(r.evidence_source))fail('malformed_input',`${where} evidence_source must be one of ${EVIDENCE_SOURCES.join(', ')}`);
 exactKeys(r.request,['operation','environment','database_id','target_attestation_sha256','approval_ref','request_id','after','selection_sha256'],`${where} request`);
 if(r.request.operation!=='apply'||!UUID.test(r.request.request_id??''))fail('malformed_input',`${where} must record one apply request`);
 const sent=isoUtc(r.sent_at_utc,`${where} sent_at_utc`);let received=null;
 if(r.response!==null){exactKeys(r.response,['status','body'],`${where} response`);if(!Number.isInteger(r.response.status))fail('malformed_input',`${where} status`);received=isoUtc(r.received_at_utc,`${where} received_at_utc`);}
 else if(r.received_at_utc!==null)fail('malformed_input',`${where} has a receive time but no response`);
 return {sha256:ev.sha256,sent,received,...r};
}
function loadLookup(ev){
 const r=ev.value,where=`receipt lookup ${ev.sha256.slice(0,12)}`;
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

/** Storage evidence from one fresh apply response, validated against the whole supported response shape.
 * Measurements that are absent everywhere stay NOT_MEASURED (never zero). A measurement claimed anywhere
 * (the availability flag, the top-level count or a complete accounting object) must be claimed consistently
 * everywhere, or the record is INVALID. An explicit synthetic marker keeps the record synthetic whatever
 * its envelope says. A source label is an operator attestation, not proof of provenance. */
export function storageEvidence(body,source){
 const marker=body.measurement_source,synthetic=source==='synthetic_fixture'||marker===SYNTHETIC_MARKER;
 const invalid=code=>({status:'INVALID',code,synthetic});
 if(marker!==undefined&&marker!==SYNTHETIC_MARKER)return invalid('storage_source_unsupported');
 if(marker!==undefined&&source!=='synthetic_fixture')return invalid('storage_source_contradiction');
 const keys=Object.keys(body).filter(k=>k!=='measurement_source');
 if(keys.some(k=>!APPLY_KEYS.includes(k))||['schema','request_id','receipt','replayed','writes','batch_statements'].some(k=>!keys.includes(k)))return invalid('apply_response_contract');
 if(body.schema!==N4_VERSION||!Number.isSafeInteger(body.writes)||body.writes<0||!Number.isSafeInteger(body.batch_statements)||body.batch_statements<1)return invalid('apply_response_contract');
 const top=body.provider_rows_written,available=body.provider_accounting_available,acct=body.accounting;
 if(top!==undefined&&top!==null&&(!Number.isSafeInteger(top)||top<0))return invalid('storage_measurement_invalid');
 if(available!==undefined&&typeof available!=='boolean')return invalid('storage_accounting_malformed');
 const shape=acct===undefined||acct===null?null:accountingShape(acct);
 if(shape&&!shape.ok)return invalid(shape.code);
 const claims=[available===true,top!==undefined&&top!==null,shape?.complete===true];
 if(!claims.some(Boolean)){
  // Nothing measured. A real Worker always sends accounting, so a missing object is noted but stays unknown.
  return {status:'NOT_MEASURED',synthetic};
 }
 if(!claims.every(Boolean))return invalid(acct===undefined||acct===null?'storage_accounting_missing':'storage_measurements_contradict');
 if(shape.written!==top)return invalid('storage_measurements_contradict');
 return {status:'MEASURED',rows:top,synthetic};
}

function classifySlot(slot,pkgSlot,profile,target,requests,lookups,untilMs){
 const findings=[],add=(cls,code,detail)=>findings.push({class:cls,code,...(detail?{detail}:{})});
 for(const r of requests){
  if(r.request.environment!=='preview'||r.request.database_id!==target.database_id||r.request.target_attestation_sha256!==target.target_attestation_sha256)add('STALE_OR_MISMATCHED_TARGET','request_target_differs');
  if(r.request.approval_ref!==profile.approval_ref||r.request.after!==slot.after||r.request.selection_sha256!==slot.selection_sha256)add('CONFLICTING_OR_DUPLICATE','request_differs_from_approved_slot');
  if(r.received!==null&&r.received<r.sent)add('CONFLICTING_OR_DUPLICATE','response_recorded_before_request');
 }
 for(const l of lookups)if(l.request.environment!=='preview'||l.request.database_id!==target.database_id||l.request.target_attestation_sha256!==target.target_attestation_sha256)add('STALE_OR_MISMATCHED_TARGET','lookup_target_differs');
 const receipts=[],responses=requests.filter(r=>r.response).map(r=>r.response);
 for(const res of responses)if(res.status===200&&res.body?.receipt)receipts.push(res.body.receipt);
 const durable=lookups.filter(l=>l.response.status===200&&l.response.body?.receipt);
 for(const l of durable)receipts.push(l.response.body.receipt);
 const distinct=new Map();for(const r of receipts)distinct.set(canonical(r),r);
 if(distinct.size>1)add('CONFLICTING_OR_DUPLICATE','multiple_distinct_receipts');
 const freshRecords=requests.filter(r=>r.response?.status===200&&r.response.body?.replayed===false);
 if(freshRecords.length>1)add('CONFLICTING_OR_DUPLICATE','duplicate_execution_responses');
 const codes=responses.filter(r=>r.status!==200).map(r=>String(r.body?.error??'unrecognised_response'));
 if(codes.includes('identity_provider_write_bound_exceeded_reconcile'))add('UNEXPECTED_WRITE_CONSUMPTION','provider_write_bound_exceeded');
 if(codes.includes('identity_conflicting_request'))add('CONFLICTING_OR_DUPLICATE','worker_reported_conflicting_request');
 for(const c of codes)if(TARGET_CODES.has(c))add('STALE_OR_MISMATCHED_TARGET','worker_refused_target:'+c);
 const receipt=distinct.size===1?[...distinct.values()][0]:null,firstSent=requests.length?Math.min(...requests.map(r=>r.sent)):null;
 // A durable receipt cannot exist before the request that created it was sent.
 if(firstSent!==null&&durable.some(l=>l.at<firstSent))add('CONFLICTING_OR_DUPLICATE','receipt_seen_before_request');
 let storage={status:'NOT_APPLICABLE',provider_rows_written:null,basis:null},logical=null,basis;
 if(receipt){
  for(const f of receiptFindings(receipt,slot,pkgSlot,profile))add(f.class,f.code);
  logical=receipt.writes;
  for(const r of freshRecords)if(r.response.body.writes!==receipt.writes)add('UNEXPECTED_WRITE_CONSUMPTION','response_writes_differ_from_receipt');
  const measured=freshRecords.map(r=>({record:r,e:storageEvidence(r.response.body,r.evidence_source)}));
  for(const m of measured)if(m.e.status==='INVALID')add('CONFLICTING_OR_DUPLICATE',m.e.code);
  const ok=measured.find(m=>m.e.status==='MEASURED');
  if(ok){storage={status:'MEASURED',provider_rows_written:ok.e.rows,basis:ok.e.synthetic?'synthetic_fixture':'saved_worker_response'};if(ok.e.rows>slot.maximum_write_units)add('UNEXPECTED_WRITE_CONSUMPTION','provider_rows_written_above_reservation');}
  else storage={status:measured.some(m=>m.e.status==='INVALID')?'INVALID':'NOT_MEASURED',provider_rows_written:null,basis:null};
  basis=durable.length?'durable_receipt_lookup':'apply_response_only';
 }
 const conclusive=lookups.filter(l=>l.response.status===404&&l.response.body?.error==='identity_receipt_not_found'&&l.at>=untilMs);
 if(receipt&&conclusive.length)add('CONFLICTING_OR_DUPLICATE','receipt_present_and_absent');
 const blocking=findings.find(f=>f.class==='STALE_OR_MISMATCHED_TARGET')??findings.find(f=>f.class==='CONFLICTING_OR_DUPLICATE')??findings.find(f=>f.class==='UNEXPECTED_WRITE_CONSUMPTION');
 let cls,absenceConfirmed=null;
 if(blocking)cls=blocking.class;
 else if(receipt){cls=durable.length?'COMPLETED_MATCHED':'MISSING_OR_UNCERTAIN';if(!durable.length)basis='receipt_not_confirmed_by_durable_lookup';}
 else{
  absenceConfirmed=conclusive.length>0;
  const uncertain=requests.some(r=>!r.response||(r.response.status!==200&&!PRECOMMIT.has(String(r.response.body?.error))));
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
 const a=parseArgs(argv,{'package':{type:'string',required:true},'approval-record':{type:'string',required:true},'profile':{type:'string',required:true},'readback-open':{type:'string'},'readback-closure':{type:'string'},'request':{type:'list'},'receipt-lookup':{type:'list'},'audit-evidence':{type:'string'},'final-inventory':{type:'string'},'out-dir':{type:'string',required:true},'now':{type:'string'}});
 // Trusted observation-time boundary: the workstation clock when the reconciler runs. An operator-declared
 // --now (needed for intentionally future-dated synthetic fixtures) is recorded as such and never certifies.
 const observed=a.now?isoUtc(a.now,'--now'):Date.now(),observationSource=a.now?'operator_declared':'system_clock';
 const dir=outputDirectory(a['out-dir']),loaded=loadPackage(a.package,{now:observed}),{ev:pkgEv,pkg,facts}=loaded;
 const approval=validateApproval(readEvidence(a['approval-record'],'owner approval record'),loaded);
 const profEv=readEvidence(a.profile,'deployable profile');if(profEv.sha256!==facts.deployable_profile_sha256)fail('profile_mismatch','profile is not the approved deployable profile');
 const profile=profEv.value;validateProfile(profile,pkg.approval_ref);
 const sources=[{role:'approval_package',sha256:pkgEv.sha256},{role:'owner_approval',sha256:approval.sha256},{role:'deployable_profile',sha256:profEv.sha256}];
 const campaign=[],addCampaign=(cls,code,detail)=>campaign.push({class:cls,code,...(detail?{detail}:{})}),notVerified=[];
 // Deployment checks are recomputed from the owner's raw readbacks, never trusted from a derived verdict file.
 const deployment={};
 for(const phase of ['open','closure']){
  const path=a['readback-'+phase];
  if(!path){deployment[phase]=null;notVerified.push(`deployment_${phase}_readback_not_supplied`);continue;}
  const ev=readEvidence(path,`deployment ${phase} readback`),v=deploymentVerification(loaded,approval,profEv.sha256,ev,phase);sources.push({role:'readback_'+phase,sha256:ev.sha256});
  deployment[phase]={disposition:v.disposition,readback_sha256:ev.sha256,readback_captured_at_utc:v.readback_captured_at_utc,verification_sha256:sha256(jsonBytes(v)),failed_checks:v.checks.filter(c=>c.result!=='PASS').map(c=>c.check),closed_after_window:v.closed_after_window};
  if(v.disposition!=='PASS')addCampaign('STALE_OR_MISMATCHED_TARGET',`deployment_${phase}_verification_stop`);
 }
 const slotIds=new Set(profile.requests.map(r=>r.request_id)),requests=a.request.map(p=>{const ev=readEvidence(p,'request record');sources.push({role:'request_record',sha256:ev.sha256});return loadRequest(ev);});
 const lookups=a['receipt-lookup'].map(p=>{const ev=readEvidence(p,'receipt lookup');sources.push({role:'receipt_lookup',sha256:ev.sha256});return loadLookup(ev);});
 if(new Set(requests.map(r=>r.sha256)).size!==requests.length||new Set(lookups.map(l=>l.sha256)).size!==lookups.length)fail('duplicate_input','the same record was supplied twice');
 const future=[...requests.flatMap(r=>[r.sent,r.received??r.sent]),...lookups.map(l=>l.at),...['open','closure'].filter(p=>deployment[p]).map(p=>Date.parse(deployment[p].readback_captured_at_utc))];
 if(future.some(t=>t>observed))fail('stale_or_future_evidence','a saved record is dated after the observation time; live evidence cannot come from the future');
 for(const r of requests)if(!slotIds.has(r.request.request_id))addCampaign('CONFLICTING_OR_DUPLICATE','request_for_unapproved_slot',r.request.request_id);
 for(const l of lookups)if(!slotIds.has(l.request.request_id))addCampaign('CONFLICTING_OR_DUPLICATE','lookup_for_unapproved_slot',l.request.request_id);
 const from=Date.parse(profile.from_utc),until=Date.parse(profile.until_utc);
 for(const r of requests)if(r.sent<from||r.sent>until)addCampaign('CONFLICTING_OR_DUPLICATE','request_sent_outside_approved_window',r.request.request_id);
 const openAt=deployment.open?Date.parse(deployment.open.readback_captured_at_utc):null,closeAt=deployment.closure?Date.parse(deployment.closure.readback_captured_at_utc):null;
 const times=requests.flatMap(r=>[r.sent,...(r.received!==null?[r.received]:[])]),latest=times.length?Math.max(...times):null;
 if(openAt!==null&&requests.some(r=>r.sent<openAt))addCampaign('CONFLICTING_OR_DUPLICATE','request_sent_before_deployment_verification');
 if(closeAt!==null&&latest!==null&&closeAt<latest)addCampaign('CONFLICTING_OR_DUPLICATE','closure_recorded_before_execution_finished');
 const target={database_id:profile.database_id,target_attestation_sha256:profile.target_attestation_sha256};
 const slots=profile.requests.map((s,i)=>classifySlot(s,pkg.slots[i],profile,target,requests.filter(r=>r.request.request_id===s.request_id),lookups.filter(l=>l.request.request_id===s.request_id),until));
 // Manual sequencing: slot k+1 is sent only after slot k completed, both in outcome and in recorded time.
 const firstIncomplete=slots.findIndex(s=>s.class!=='COMPLETED_MATCHED');
 let ordered=!(firstIncomplete>=0&&slots.slice(firstIncomplete+1).some(s=>s.class==='COMPLETED_MATCHED'||s.attempts>0));
 for(let i=1;i<profile.requests.length&&ordered;i++){
  const mine=requests.filter(r=>r.request.request_id===profile.requests[i].request_id),before=requests.filter(r=>r.request.request_id===profile.requests[i-1].request_id&&r.response?.status===200);
  if(mine.length&&before.length&&Math.min(...mine.map(r=>r.sent))<Math.min(...before.map(r=>r.received??r.sent)))ordered=false;
 }
 if(!ordered)addCampaign('CONFLICTING_OR_DUPLICATE','slots_not_executed_in_order');
 const completed=slots.filter(s=>s.class==='COMPLETED_MATCHED');
 let audit=null;
 if(a['audit-evidence']){
  const ev=readEvidence(a['audit-evidence'],'audit evidence'),v=ev.value;sources.push({role:'audit_evidence',sha256:ev.sha256});
  exactKeys(v,['schema','captured_at_utc','query_ref','identity_receipt_event_ids','identity_maintenance_nonces_in_window'],'audit evidence');
  if(v.schema!==SCHEMA.audit||!Array.isArray(v.identity_receipt_event_ids)||(v.identity_maintenance_nonces_in_window!==null&&(!Number.isSafeInteger(v.identity_maintenance_nonces_in_window)||v.identity_maintenance_nonces_in_window<0)))fail('malformed_input','audit evidence');
  const at=isoUtc(v.captured_at_utc,'audit captured_at_utc');if(at>observed)fail('stale_or_future_evidence','audit evidence is dated after the observation time');
  const expected=completed.map(s=>'n4-identity:'+s.request_id).sort(),found=[...v.identity_receipt_event_ids].sort();
  const receiptsMatch=canonical(found)===canonical(expected),noncesMatch=v.identity_maintenance_nonces_in_window===null?null:v.identity_maintenance_nonces_in_window===completed.length;
  if(at<until)notVerified.push('audit_evidence_captured_before_window_closed');
  if(!receiptsMatch)addCampaign('CONFLICTING_OR_DUPLICATE','audit_receipts_differ_from_completed_slots');
  if(noncesMatch===false)addCampaign('UNEXPECTED_WRITE_CONSUMPTION','nonce_count_differs_from_completed_slots');
  audit={sha256:ev.sha256,query_ref:v.query_ref,receipt_event_ids_match:receiptsMatch,nonces_match:noncesMatch,nonce_check:'aggregate count only; individual nonce identity is not recorded or verified'};
 }
 let finalInventory=null;
 if(a['final-inventory']){
  const ev=readEvidence(a['final-inventory'],'final inventory'),v=ev.value;sources.push({role:'final_inventory',sha256:ev.sha256});
  try{
   exactKeys(v,['schema','captured_at_utc','publisher_email','request','response'],'final inventory');
   if(v.schema!==SCHEMA.inventory)fail('malformed_input','final inventory schema');
   const at=isoUtc(v.captured_at_utc,'final inventory captured_at_utc');email(v.publisher_email,'final inventory publisher_email');
   exactKeys(v.request,['operation','environment','database_id','target_attestation_sha256','after','limit'],'final inventory request');exactKeys(v.response,['status','body'],'final inventory response');
   if(v.request.operation!=='inspect'||v.response.status!==200||!Number.isInteger(v.request.limit)||v.request.limit<1||v.request.limit>25)fail('malformed_input','final inventory must be a successful inspect');
   if(v.request.after!=='')fail('final_inventory_not_from_start','the final inventory must restart at after:""');
   if(v.request.environment!=='preview'||v.request.database_id!==profile.database_id||v.request.target_attestation_sha256!==profile.target_attestation_sha256)fail('target_mismatch','final inventory request target');
   const {rows,pending,conflicts}=inventoryBody(v.response.body,v.request,profile,'final inventory',{allowEmpty:true,allowConflicts:true});
   if(v.publisher_email!==profile.publisher_email)fail('publisher_mismatch','final inventory publisher');
   const after=Math.max(from,latest??from,closeAt??from);
   if(at<after)fail('stale_or_future_evidence','the final inventory must be captured after this profile\'s execution and closure');
   if(at>observed)fail('stale_or_future_evidence','the final inventory is dated after the observation time');
   // One page is one page: an exact count is reported as exact, 51 only as a lower bound, and nothing here
   // says the backlog beyond the page was inspected.
   finalInventory={sha256:ev.sha256,captured_at_utc:v.captured_at_utc,limit:v.request.limit,known_pending_lower_bound:pending,pending_count_kind:v.response.body.pending_count_exact?'EXACT':'LOWER_BOUND',pending_count_exact:v.response.body.pending_count_exact,missing_identity_guard_blocked:v.response.body.missing_identity_guard_blocked,rows_in_first_page:rows.length,has_more:v.response.body.has_more,conflicts_in_page:conflicts};
  }catch(error){addCampaign(error.code==='target_mismatch'||error.code==='implementation_mismatch'||error.code==='migration_identity_mismatch'?'STALE_OR_MISMATCHED_TARGET':'CONFLICTING_OR_DUPLICATE','final_inventory_invalid',error.message);}
 }
 for(const s of slots){
  if(s.class==='MISSING_OR_UNCERTAIN')notVerified.push(`slot_${s.index}_uncertain`);
  if(s.class==='COMPLETED_MATCHED'&&s.storage_writes.status!=='MEASURED')notVerified.push(`slot_${s.index}_storage_writes_not_measured`);
  if(s.class==='COMPLETED_MATCHED'&&!s.attempts)notVerified.push(`slot_${s.index}_request_record_missing`);
 }
 const outcome=deriveOutcome(slots,campaign.map(c=>c.code),notVerified),{disposition}=outcome;
 const count=Object.fromEntries(CLASSES.map(c=>[c,slots.filter(s=>s.class===c).length])),measured=completed.filter(s=>s.storage_writes.status==='MEASURED');
 const evidenceSources=[...new Set(requests.map(r=>r.evidence_source))].sort();
 const markers=requests.filter(r=>r.response?.body?.measurement_source===SYNTHETIC_MARKER).length,synthetic=evidenceSources.includes('synthetic_fixture')||markers>0;
 sources.sort((x,y)=>(x.role+x.sha256).localeCompare(y.role+y.sha256));
 const certifies=disposition==='PASS'&&!synthetic&&observationSource==='system_clock'&&completed.length>0&&completed.every(s=>s.storage_writes.status==='MEASURED'&&s.storage_writes.basis==='saved_worker_response');
 const result={schema:SCHEMA.reconciliation,disposition,stop_continuable:outcome.stop_continuable,
  evidence_basis:{request_record_sources:evidenceSources,synthetic,synthetic_markers:markers,observation_time_utc:new Date(observed).toISOString(),observation_time_source:observationSource,certifies_provider_consumption:certifies,
   note:synthetic?SYNTHETIC_NOTE:SAVED_NOTE},
  approval_ref:pkg.approval_ref,package_sha256:pkgEv.sha256,approval_record_sha256:approval.sha256,deployable_profile_sha256:profEv.sha256,
  target:{environment:'preview',database_id:profile.database_id,target_attestation_sha256:profile.target_attestation_sha256,implementation_sha256:profile.implementation_sha256,migration_sha256:profile.migration_sha256},
  window:{from_utc:profile.from_utc,until_utc:profile.until_utc},deployment,
  latest_execution_utc:latest===null?null:new Date(latest).toISOString(),
  totals:{slots:slots.length,...count,committed_logical_changes:completed.reduce((n,s)=>n+s.logical_changes,0),reserved_row_changes_for_completed:completed.reduce((n,s)=>n+s.reserved_row_changes,0),
   reserved_write_units_for_completed:completed.reduce((n,s)=>n+s.reserved_write_units,0),measured_storage_rows_written:measured.reduce((n,s)=>n+s.storage_writes.provider_rows_written,0),slots_with_unmeasured_storage:completed.length-measured.length,
   candidates_completed:completed.reduce((n,s)=>n+s.rows,0)},
  audit,final_inventory:finalInventory,final_inventory_required:true,campaign_closure:campaignClosure(finalInventory,!!a['final-inventory']),
  resume_after:outcome.resume_after,campaign_reported_more_rows:outcome.last_done>=0?pkg.slots[outcome.last_done].has_more:null,
  chain:pkg.chain,slots,campaign_findings:campaign,stop_reasons:outcome.stop_reasons,not_verified_reasons:notVerified,sources,
  notice:'Offline comparison of saved evidence. No request was sent, retried or replayed. A missing receipt is never treated as zero writes. Local evidence is not Cloudflare billing.'};
 // The record must pass the same re-derivation a successor will apply to it.
 try{checkReconciliation(result);}catch(error){fail('internal_inconsistency',error.message);}
 const json=writeAddressed(dir,'n4-reconciliation','json',jsonBytes(result));
 const md=writeAddressed(dir,'n4-reconciliation-report','md',Buffer.from(report(result,json.sha256)));
 return {action:'reconciled',disposition,stop_continuable:outcome.stop_continuable,synthetic,reconciliation:json.path,reconciliation_sha256:json.sha256,report:md.path,resume_after:outcome.resume_after,requests_sent:0};
}

export function report(r,sha){
 const line=s=>`| ${s.index} | \`${s.request_id}\` | ${s.rows} | **${s.class}** | ${s.basis??''} | ${s.logical_changes??'—'} / ${s.reserved_row_changes} | ${s.storage_writes.status==='MEASURED'?`${s.storage_writes.provider_rows_written} (${s.storage_writes.basis})`:s.storage_writes.status} / ${s.reserved_write_units} | ${s.findings.map(f=>f.code).join(', ')||'—'} |`;
 const dep=d=>d?`${d.disposition}${d.failed_checks.length?` (${d.failed_checks.join(', ')})`:''}`:'NOT SUPPLIED';
 return [`# N4 maintenance reconciliation — ${r.approval_ref}`,'',
  ...(r.evidence_basis.synthetic?['> **SYNTHETIC EVIDENCE — not a measurement of D1 and not Cloudflare billing.** This reconciliation exercises the tooling only.','']:[]),
  `**Disposition: ${r.disposition}**${r.disposition==='STOP'&&r.stop_continuable?' (refused slot with confirmed absence; continuing needs an explicit owner acknowledgement)':''}`,'',
  `- Machine-readable reconciliation SHA-256: \`${sha}\``,`- Package \`${r.package_sha256}\`, owner approval record \`${r.approval_record_sha256}\`, deployed profile \`${r.deployable_profile_sha256}\``,
  `- Target: Preview \`${r.target.database_id}\`, attestation \`${r.target.target_attestation_sha256}\`, implementation \`${r.target.implementation_sha256}\``,`- Window: ${r.window.from_utc} to ${r.window.until_utc}; latest recorded execution ${r.latest_execution_utc??'none'}`,
  `- Deployment readbacks (recomputed): open ${dep(r.deployment.open)}, closure ${dep(r.deployment.closure)}`,
  `- Committed logical changes: ${r.totals.committed_logical_changes} (reserved ${r.totals.reserved_row_changes_for_completed}); measured storage rows written: ${r.totals.measured_storage_rows_written} (reserved units ${r.totals.reserved_write_units_for_completed}; ${r.totals.slots_with_unmeasured_storage} completed slot(s) unmeasured)`,
  `- Evidence basis: ${r.evidence_basis.request_record_sources.join(', ')||'no request records'}${r.evidence_basis.synthetic_markers?`; ${r.evidence_basis.synthetic_markers} record(s) carry an explicit synthetic marker`:''}; observation time ${r.evidence_basis.observation_time_utc} (${r.evidence_basis.observation_time_source.replace('_',' ')}); certifies provider consumption: ${r.evidence_basis.certifies_provider_consumption?'yes, for operator-saved responses':'no'}`,
  `- Audit/nonce evidence: ${r.audit?`receipts ${r.audit.receipt_event_ids_match?'match':'DIFFER'}, nonce count ${r.audit.nonces_match===null?'not supplied':r.audit.nonces_match?'matches':'DIFFERS'} (aggregate only)`:'not supplied'}`,
  `- Resume cursor for the next profile: \`${JSON.stringify(r.resume_after)}\`. A final inventory from \`after: ""\` is always required before closing the campaign${r.final_inventory?`; supplied: pending ${r.final_inventory.pending_count_kind==='EXACT'?'exactly':'at least'} ${r.final_inventory.known_pending_lower_bound}, ${r.final_inventory.rows_in_first_page} row(s) in its first page`:''}.`,
  `- Campaign closure (a separate conclusion from this profile's disposition): **${r.campaign_closure.status}**`,'',
  '| Slot | Request id | Rows | Class | Basis | Logical / reserved | Storage / reserved units | Findings |','|---|---|---|---|---|---|---|---|',...r.slots.map(line),'',
  r.stop_reasons.length?`**STOP reasons:** ${r.stop_reasons.join(', ')}`:'No STOP reason.',r.not_verified_reasons.length?`**Not verified:** ${r.not_verified_reasons.join(', ')}`:'Nothing left unverified.','',
  `_${r.notice}_`,''].join('\n');
}

if(isEntry(import.meta.url))main(reconcile);
