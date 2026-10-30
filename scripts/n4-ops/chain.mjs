// N4-OPS-R2 reconciliation-record re-derivation. A reconciliation can authorise a successor only if
// every label in it follows from its own subordinate slot, storage, deployment, source and chain
// facts. Local and pure: no file, network or process access, and nothing here approves or sends.
import {PREVIEW_DATABASE_ID,IDENTITY_MIGRATION_SHA256,MAX_PAGE,MAX_SLOTS,CLOSING_MARGIN_MS,HASH,UUID,APPROVAL_REF,SCHEMA,CLASSES,fail,canonical,isoUtc,reservation,deriveOutcome} from './lib.mjs';

export const EVIDENCE_SOURCES=['saved_worker_response','synthetic_fixture'];
export const STORAGE_STATUSES=['NOT_APPLICABLE','MEASURED','NOT_MEASURED','INVALID'];
// Findings the reconciler raises when a fresh apply response's storage evidence is malformed or contradictory.
export const STORAGE_CODES=new Set(['apply_response_contract','storage_accounting_malformed','storage_accounting_missing','storage_measurement_invalid','storage_measurements_contradict','storage_source_contradiction','storage_source_unsupported']);
export const SYNTHETIC_NOTE='SYNTHETIC EVIDENCE: storage figures came from test fixtures or carry a synthetic marker, not from D1. This reconciliation certifies nothing about provider consumption.';
export const SAVED_NOTE='Operator-saved Worker responses; local tooling cannot authenticate them against Cloudflare.';
export const CLOSURE_NOTE='Separate from this profile\'s disposition. Zero pending is an exact count on one operator-saved inspection from after:"" at its capture time; it is not proof that no row was added later.';
export const RECONCILIATION_KEYS=['schema','disposition','stop_continuable','evidence_basis','approval_ref','package_sha256','approval_record_sha256','deployable_profile_sha256','target','window','deployment','latest_execution_utc','totals','audit','final_inventory','final_inventory_required','campaign_closure','resume_after','campaign_reported_more_rows','chain','slots','campaign_findings','stop_reasons','not_verified_reasons','sources','notice'];
export const RECONCILIATION_SLOT_KEYS=['index','request_id','after','selection_sha256','rows','class','basis','absence_confirmed','logical_changes','reserved_row_changes','reserved_write_units','storage_writes','next_cursor','attempts','lookups','response_codes','findings'];
export const DEPLOYMENT_KEYS=['disposition','readback_sha256','readback_captured_at_utc','verification_sha256','failed_checks','closed_after_window'];
export const FINAL_INVENTORY_KEYS=['sha256','captured_at_utc','limit','known_pending_lower_bound','pending_count_kind','pending_count_exact','missing_identity_guard_blocked','rows_in_first_page','has_more','conflicts_in_page'];
const BLOCKING=['STALE_OR_MISMATCHED_TARGET','CONFLICTING_OR_DUPLICATE','UNEXPECTED_WRITE_CONSUMPTION'];
const ROLES=['approval_package','owner_approval','deployable_profile','readback_open','readback_closure','request_record','receipt_lookup','audit_evidence','final_inventory'];
const TOTAL_KEYS=['slots',...CLASSES,'committed_logical_changes','reserved_row_changes_for_completed','reserved_write_units_for_completed','measured_storage_rows_written','slots_with_unmeasured_storage','candidates_completed'];

/** The campaign-closure conclusion, kept apart from the profile disposition. */
export function campaignClosure(finalInventory,finalInventoryInvalid){
 const status=finalInventory===null?(finalInventoryInvalid?'NOT_ESTABLISHED_FINAL_INVENTORY_INVALID':'NOT_ESTABLISHED_NO_FINAL_INVENTORY')
  :finalInventory.pending_count_kind==='EXACT'&&finalInventory.known_pending_lower_bound===0?'NO_PENDING_ROWS_AT_CAPTURE':'PENDING_ROWS_REMAIN';
 return {status,note:CLOSURE_NOTE};
}

/** Re-derives a reconciliation's labels from its own subordinate evidence. Any label that does not follow,
 * any missing field and any contradiction refuses with prior_inconsistent; nothing is taken on trust. */
export function checkReconciliation(r){
 const bad=d=>fail('prior_inconsistent',d);
 const obj=(v,keys,where)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))bad(`${where} does not have exactly the recorded fields`);return v;};
 const time=(v,where)=>{try{return isoUtc(v,where);}catch{bad(`${where} is not a canonical UTC time`);}};
 const isHash=v=>typeof v==='string'&&HASH.test(v),nat=v=>Number.isSafeInteger(v)&&v>=0;
 const findingList=(v,where)=>{if(!Array.isArray(v)||v.some(f=>!f||typeof f!=='object'||Array.isArray(f)||!CLASSES.includes(f.class)||typeof f.code!=='string'||!f.code.length||Object.keys(f).some(k=>!['class','code','detail'].includes(k))))bad(`${where} findings`);return v;};
 obj(r,RECONCILIATION_KEYS,'reconciliation');
 if(r.schema!==SCHEMA.reconciliation)bad('schema');
 if(typeof r.approval_ref!=='string'||!APPROVAL_REF.test(r.approval_ref)||![r.package_sha256,r.approval_record_sha256,r.deployable_profile_sha256].every(isHash))bad('approval reference or record identities');
 const t=obj(r.target,['environment','database_id','target_attestation_sha256','implementation_sha256','migration_sha256'],'target');
 if(t.environment!=='preview'||t.database_id!==PREVIEW_DATABASE_ID||t.migration_sha256!==IDENTITY_MIGRATION_SHA256||!isHash(t.target_attestation_sha256)||!isHash(t.implementation_sha256))bad('target is not the recorded Preview database with the frozen migration');
 obj(r.window,['from_utc','until_utc'],'window');const from=time(r.window.from_utc,'window from_utc'),until=time(r.window.until_utc,'window until_utc');if(until<=from)bad('window');

 // Slots: each class must follow from its own findings, receipt facts, storage and attempts.
 if(!Array.isArray(r.slots)||!r.slots.length||r.slots.length>MAX_SLOTS)bad('slots');
 const ids=new Set();
 for(const [i,s] of r.slots.entries()){
  const at=`slot ${i}`;obj(s,RECONCILIATION_SLOT_KEYS,at);
  if(s.index!==i||!UUID.test(s.request_id??'')||ids.has(s.request_id)||!CLASSES.includes(s.class)||typeof s.after!=='string'||!isHash(s.selection_sha256))bad(`${at} identity`);ids.add(s.request_id);
  if(!Number.isInteger(s.rows)||s.rows<1||s.rows>MAX_PAGE||canonical(reservation(s.rows))!==canonical({maximum_row_changes:s.reserved_row_changes,maximum_write_units:s.reserved_write_units}))bad(`${at} reservation`);
  if(!nat(s.attempts)||!nat(s.lookups)||!Array.isArray(s.response_codes)||s.response_codes.some(c=>typeof c!=='string')||canonical(s.response_codes)!==canonical([...new Set(s.response_codes)].sort()))bad(`${at} attempt counts`);
  findingList(s.findings,at);
  const blocking=BLOCKING.find(c=>s.findings.some(f=>f.class===c));
  if(blocking?s.class!==blocking:BLOCKING.includes(s.class))bad(`${at} class ${s.class} does not follow from its findings`);
  const w=obj(s.storage_writes,['status','provider_rows_written','basis'],`${at} storage_writes`);
  if(!STORAGE_STATUSES.includes(w.status)||(w.status==='MEASURED'?!nat(w.provider_rows_written)||!EVIDENCE_SOURCES.includes(w.basis):w.provider_rows_written!==null||w.basis!==null))bad(`${at} storage measurement`);
  if(s.logical_changes!==null&&!nat(s.logical_changes))bad(`${at} logical changes`);
  if((w.status==='NOT_APPLICABLE')!==(s.logical_changes===null))bad(`${at} storage status does not match the presence of a receipt`);
  if(w.status==='INVALID'&&!s.findings.some(f=>STORAGE_CODES.has(f.code)))bad(`${at} invalid storage has no finding`);
  if(w.status==='MEASURED'&&w.provider_rows_written>s.reserved_write_units&&!s.findings.some(f=>f.code==='provider_rows_written_above_reservation'))bad(`${at} storage above the reservation has no finding`);
  if(s.class!=='COMPLETED_MATCHED'&&s.next_cursor!==null)bad(`${at} only a completed slot has a next cursor`);
  const ok={
   COMPLETED_MATCHED:()=>s.basis==='durable_receipt_lookup'&&s.lookups>0&&s.absence_confirmed===null&&s.logical_changes===s.rows+2&&typeof s.next_cursor==='string'&&s.next_cursor.length>0&&['MEASURED','NOT_MEASURED'].includes(w.status),
   EXPLICITLY_REFUSED:()=>s.attempts>0&&s.logical_changes===null&&(typeof s.basis==='string'&&s.basis.startsWith('precommit_refusal:')&&typeof s.absence_confirmed==='boolean'||s.basis==='uncertain_response_but_no_receipt_after_window'&&s.absence_confirmed===true),
   UNUSED_AUTHORISED_SLOT:()=>s.attempts===0&&s.absence_confirmed===true&&s.logical_changes===null&&s.basis==='no_request_and_no_receipt_after_window',
   MISSING_OR_UNCERTAIN:()=>s.basis==='receipt_not_confirmed_by_durable_lookup'&&s.logical_changes!==null&&s.absence_confirmed===null||s.basis==='no_request_record_and_no_post_window_lookup'&&s.attempts===0&&s.absence_confirmed===false&&s.logical_changes===null||s.basis==='uncertain_response_without_post_window_lookup'&&s.attempts>0&&s.absence_confirmed===false&&s.logical_changes===null,
  }[s.class];
  if(ok&&!ok())bad(`${at} ${s.class} does not follow from its recorded basis, attempts, lookups and receipt`);
 }

 // Deployment: a verdict follows from its failed checks, and time checks are re-derived.
 const dep=obj(r.deployment,['open','closure'],'deployment');
 for(const phase of ['open','closure']){
  const d=dep[phase];if(d===null)continue;obj(d,DEPLOYMENT_KEYS,`${phase} deployment`);
  if(!['PASS','STOP'].includes(d.disposition)||!Array.isArray(d.failed_checks)||d.failed_checks.some(c=>typeof c!=='string'||!c.length)||new Set(d.failed_checks).size!==d.failed_checks.length||(d.disposition==='PASS')!==(d.failed_checks.length===0)||!isHash(d.readback_sha256)||!isHash(d.verification_sha256))bad(`${phase} deployment verdict does not follow from its failed checks`);
  const at=time(d.readback_captured_at_utc,`${phase} readback time`);
  if(phase==='open'&&(d.closed_after_window!==null||(at+CLOSING_MARGIN_MS>=until&&!d.failed_checks.includes('readback_before_window_close'))))bad('open readback timing');
  if(phase==='closure'&&(d.closed_after_window!==(at>=until)||(at<from&&!d.failed_checks.includes('readback_after_window_open'))))bad('closure readback timing');
 }
 const openAt=dep.open?Date.parse(dep.open.readback_captured_at_utc):null,closeAt=dep.closure?Date.parse(dep.closure.readback_captured_at_utc):null;

 // Campaign findings that must be present whenever their evidence is recorded.
 findingList(r.campaign_findings,'campaign');
 const codes=r.campaign_findings.map(f=>f.code),need=(cond,code)=>{if(cond&&!codes.includes(code))bad(`campaign finding ${code} is missing although its evidence is recorded`);};
 for(const phase of ['open','closure'])need(dep[phase]?.disposition==='STOP',`deployment_${phase}_verification_stop`);
 const attempts=r.slots.reduce((n,s)=>n+s.attempts,0),lookups=r.slots.reduce((n,s)=>n+s.lookups,0);
 const latest=r.latest_execution_utc===null?null:time(r.latest_execution_utc,'latest_execution_utc');
 if(latest===null&&attempts>0)bad('slots record attempts but no execution time');
 need(closeAt!==null&&latest!==null&&closeAt<latest,'closure_recorded_before_execution_finished');
 const firstIncomplete=r.slots.findIndex(s=>s.class!=='COMPLETED_MATCHED');
 need(firstIncomplete>=0&&r.slots.slice(firstIncomplete+1).some(s=>s.class==='COMPLETED_MATCHED'||s.attempts>0),'slots_not_executed_in_order');

 // Sources: every recorded input, by role, once.
 if(!Array.isArray(r.sources)||r.sources.some(x=>!x||typeof x!=='object'||Object.keys(x).sort().join(',')!=='role,sha256'||!ROLES.includes(x.role)||!isHash(x.sha256)))bad('sources');
 if(canonical(r.sources)!==canonical([...r.sources].sort((x,y)=>(x.role+x.sha256).localeCompare(y.role+y.sha256))))bad('sources are not in canonical order');
 const role=k=>r.sources.filter(x=>x.role===k),one=(k,sha)=>{const v=role(k);if(v.length!==1||v[0].sha256!==sha)bad(`source ${k} does not match the recorded identity`);};
 one('approval_package',r.package_sha256);one('owner_approval',r.approval_record_sha256);one('deployable_profile',r.deployable_profile_sha256);
 for(const phase of ['open','closure']){if(dep[phase])one('readback_'+phase,dep[phase].readback_sha256);else if(role('readback_'+phase).length)bad(`source readback_${phase} without a deployment record`);}
 const requests=role('request_record').length,looked=role('receipt_lookup').length;
 if(requests<attempts||looked<lookups)bad('slots record more requests or lookups than were supplied');
 need(requests>attempts,'request_for_unapproved_slot');need(looked>lookups,'lookup_for_unapproved_slot');

 // Audit and final inventory.
 if(r.audit!==null){obj(r.audit,['sha256','query_ref','receipt_event_ids_match','nonces_match','nonce_check'],'audit');one('audit_evidence',r.audit.sha256);if(typeof r.audit.receipt_event_ids_match!=='boolean'||![true,false,null].includes(r.audit.nonces_match))bad('audit');}
 else if(role('audit_evidence').length)bad('audit source without an audit record');
 need(r.audit?.receipt_event_ids_match===false,'audit_receipts_differ_from_completed_slots');need(r.audit?.nonces_match===false,'nonce_count_differs_from_completed_slots');
 const fi=r.final_inventory,finalSources=role('final_inventory');
 if(finalSources.length>1)bad('more than one final inventory');
 if(fi!==null){
  obj(fi,FINAL_INVENTORY_KEYS,'final inventory');one('final_inventory',fi.sha256);
  const p=fi.known_pending_lower_bound,n=fi.rows_in_first_page,at=time(fi.captured_at_utc,'final inventory time');
  if(!Number.isInteger(fi.limit)||fi.limit<1||fi.limit>MAX_PAGE||!Number.isInteger(p)||p<0||p>51||fi.pending_count_kind!==(p<51?'EXACT':'LOWER_BOUND')||fi.pending_count_exact!==(p<51)||fi.missing_identity_guard_blocked!==(p>50)||!nat(n)||n>fi.limit||typeof fi.has_more!=='boolean'||!nat(fi.conflicts_in_page)||fi.conflicts_in_page>n)bad('final inventory counts');
  if(p<51?n!==Math.min(fi.limit,p)||fi.has_more!==(p>fi.limit):n!==fi.limit||fi.has_more!==true)bad('final inventory pending count contradicts its first page');
  if(at<Math.max(from,latest??from,closeAt??from))bad('final inventory predates this profile\'s execution and closure');
 }else need(finalSources.length>0,'final_inventory_invalid');
 if(r.final_inventory_required!==true)bad('final inventory requirement');
 if(canonical(r.campaign_closure)!==canonical(campaignClosure(fi,finalSources.length>0)))bad('campaign closure does not follow from the final inventory');

 // NOT_VERIFIED reasons, re-derived in the reconciler's order; only the audit timing reason cannot be recomputed.
 if(!Array.isArray(r.not_verified_reasons))bad('not_verified_reasons');
 const nv=['open','closure'].filter(p=>dep[p]===null).map(p=>`deployment_${p}_readback_not_supplied`);
 if(r.audit!==null&&r.not_verified_reasons.includes('audit_evidence_captured_before_window_closed'))nv.push('audit_evidence_captured_before_window_closed');
 for(const s of r.slots){
  if(s.class==='MISSING_OR_UNCERTAIN')nv.push(`slot_${s.index}_uncertain`);
  if(s.class==='COMPLETED_MATCHED'&&s.storage_writes.status!=='MEASURED')nv.push(`slot_${s.index}_storage_writes_not_measured`);
  if(s.class==='COMPLETED_MATCHED'&&!s.attempts)nv.push(`slot_${s.index}_request_record_missing`);
 }
 if(canonical(nv)!==canonical(r.not_verified_reasons))bad('not-verified reasons do not follow from the recorded deployment and slot evidence');
 const o=deriveOutcome(r.slots,codes,nv);
 if(o.disposition!==r.disposition||canonical(o.stop_reasons)!==canonical(r.stop_reasons)||o.stop_continuable!==r.stop_continuable||o.resume_after!==r.resume_after)bad('disposition, reasons, continuation or resume cursor do not follow from the slots and findings');
 if(o.last_done<0?r.campaign_reported_more_rows!==null:typeof r.campaign_reported_more_rows!=='boolean')bad('campaign_reported_more_rows');

 // Totals.
 const completed=r.slots.filter(s=>s.class==='COMPLETED_MATCHED'),measured=completed.filter(s=>s.storage_writes.status==='MEASURED');
 const totals={slots:r.slots.length,...Object.fromEntries(CLASSES.map(c=>[c,r.slots.filter(s=>s.class===c).length])),committed_logical_changes:completed.reduce((n,s)=>n+s.logical_changes,0),reserved_row_changes_for_completed:completed.reduce((n,s)=>n+s.reserved_row_changes,0),
  reserved_write_units_for_completed:completed.reduce((n,s)=>n+s.reserved_write_units,0),measured_storage_rows_written:measured.reduce((n,s)=>n+s.storage_writes.provider_rows_written,0),slots_with_unmeasured_storage:completed.length-measured.length,candidates_completed:completed.reduce((n,s)=>n+s.rows,0)};
 obj(r.totals,TOTAL_KEYS,'totals');if(canonical(totals)!==canonical(r.totals))bad('totals do not follow from the slots');

 // Chain: this profile's own approval reference and request ids close the recorded campaign chain.
 const c=obj(r.chain,['approval_refs','request_ids'],'chain');
 if(!Array.isArray(c.approval_refs)||!c.approval_refs.length||c.approval_refs.some(x=>typeof x!=='string'||!APPROVAL_REF.test(x))||new Set(c.approval_refs).size!==c.approval_refs.length||c.approval_refs.at(-1)!==r.approval_ref)bad('chain approval references must be unique and end with this profile\'s reference');
 if(!Array.isArray(c.request_ids)||c.request_ids.some(x=>!UUID.test(x??''))||new Set(c.request_ids).size!==c.request_ids.length||canonical(c.request_ids.slice(-r.slots.length))!==canonical(r.slots.map(s=>s.request_id)))bad('chain request ids must be unique and end with this profile\'s slots');

 // Evidence basis: synthetic stays synthetic, and only a clean, clock-observed, saved-response PASS certifies.
 const eb=obj(r.evidence_basis,['request_record_sources','synthetic','synthetic_markers','observation_time_utc','observation_time_source','certifies_provider_consumption','note'],'evidence_basis');
 const src=eb.request_record_sources;
 if(!Array.isArray(src)||src.some(x=>!EVIDENCE_SOURCES.includes(x))||canonical(src)!==canonical([...new Set(src)].sort())||(src.length>0)!==(requests>0))bad('request record sources');
 if(!nat(eb.synthetic_markers)||eb.synthetic!==(src.includes('synthetic_fixture')||eb.synthetic_markers>0))bad('synthetic flag does not follow from the sources and markers');
 if(r.slots.some(s=>s.storage_writes.basis==='synthetic_fixture')&&!eb.synthetic||r.slots.some(s=>s.storage_writes.basis==='saved_worker_response')&&!src.includes('saved_worker_response'))bad('storage basis does not follow from the request record sources');
 const observed=time(eb.observation_time_utc,'observation time');
 if(!['system_clock','operator_declared'].includes(eb.observation_time_source))bad('observation time source');
 if([latest,openAt,closeAt,fi?Date.parse(fi.captured_at_utc):null].some(v=>v!==null&&v>observed))bad('evidence is dated after the observation time');
 const certifies=r.disposition==='PASS'&&!eb.synthetic&&eb.observation_time_source==='system_clock'&&completed.length>0&&completed.every(s=>s.storage_writes.status==='MEASURED'&&s.storage_writes.basis==='saved_worker_response');
 if(eb.certifies_provider_consumption!==certifies||eb.note!==(eb.synthetic?SYNTHETIC_NOTE:SAVED_NOTE))bad('provider-consumption certification does not follow from the evidence');
 if(typeof r.notice!=='string'||typeof r.resume_after!=='string'||typeof r.stop_continuable!=='boolean')bad('notice or cursor');
 return {outcome:o,not_verified:nv,codes,observed_ms:observed,latest_ms:latest,closure_ms:closeAt};
}
