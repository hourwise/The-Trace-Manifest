#!/usr/bin/env node
// N4-OPS-01 offline maintenance-profile builder. It reads saved evidence files and writes
// content-addressed local files. It never contacts Cloudflare or Preview, never sends a
// request, and never records an owner approval: approval is a separate file the owner writes.
import {
 N4_VERSION,PREVIEW_DATABASE_ID,PREVIEW_DATABASE_NAME,IDENTITY_MIGRATION_SHA256,PLAN_SCHEMA,MAX_PAGE,MAX_SLOTS,MAX_PROFILE_BYTES,MAX_WINDOW_MS,CLOSING_MARGIN_MS,
 MAX_ROW_CHANGES,MAX_WRITE_UNITS,DEFAULT_MAX_EVIDENCE_AGE_MINUTES,HARD_MAX_EVIDENCE_AGE_MINUTES,UUID,APPROVAL_REF,SCHEMA,PROFILE_KEYS,SLOT_KEYS,CLASSES,
 fail,sha256,canonical,exactKeys,isoUtc,email,hash,cursorText,rowId,byteOrder,readEvidence,parseArgs,outputDirectory,writeAddressed,jsonBytes,profileObject,deployableBytes,requestId,reservation,deriveOutcome,main,isEntry,
} from './lib.mjs';

export function validatePlan(ev,expected){
 hash(expected,'--plan-sha256');if(ev.sha256!==expected)fail('plan_identity_mismatch',`plan file SHA-256 ${ev.sha256} is not the reviewed ${expected}`);
 const p=ev.value;
 if(p?.schema!==PLAN_SCHEMA||p.owner_approval!==null||p.execution_window!==null||p.remote_operations_authorised!==false)fail('plan_contract','plan must be the null-approval N4 readiness plan');
 hash(p.implementation_sha256,'plan implementation_sha256');
 if(p.migration?.sha256!==IDENTITY_MIGRATION_SHA256)fail('migration_identity_mismatch','plan migration is not frozen 0080');
 if(p.target?.environment!=='preview'||p.target.database_id!==PREVIEW_DATABASE_ID||p.target.database_name!==PREVIEW_DATABASE_NAME)fail('target_mismatch','plan target is not the recorded Preview database');
 return {sha256:ev.sha256,implementation_sha256:p.implementation_sha256,migration_sha256:p.migration.sha256,source_commit:p.source_commit};
}

export function validateTarget(ev,plan){
 const t=ev.value;
 exactKeys(t,['schema','status','environment','database_name','database_id','target_attestation_sha256','implementation_sha256','migration_sha256','worker_deployment_ref','pages_deployment_ref','verified_at_utc','verified_by','evidence'],'target evidence');
 if(t.schema!==SCHEMA.target)fail('malformed_input','target evidence schema');
 if(t.status!=='VERIFIED')fail('unverified_target','A0 target evidence must have status VERIFIED');
 if(t.environment!=='preview'||t.database_name!==PREVIEW_DATABASE_NAME||t.database_id!==PREVIEW_DATABASE_ID)fail('target_mismatch','target evidence does not name the recorded Preview database');
 hash(t.target_attestation_sha256,'target_attestation_sha256');
 if(t.implementation_sha256!==plan.implementation_sha256)fail('implementation_mismatch','deployed implementation differs from the reviewed plan');
 if(t.migration_sha256!==IDENTITY_MIGRATION_SHA256)fail('migration_identity_mismatch','target migration is not frozen 0080');
 for(const k of ['worker_deployment_ref','pages_deployment_ref'])if(typeof t[k]!=='string'||!t[k].length||t[k].length>200)fail('malformed_input',k);
 isoUtc(t.verified_at_utc,'verified_at_utc');email(t.verified_by,'verified_by');
 if(!Array.isArray(t.evidence)||!t.evidence.length||t.evidence.length>50)fail('unverified_target','target evidence must list 1 to 50 hashed source records');
 for(const [i,e] of t.evidence.entries()){exactKeys(e,['label','sha256'],`evidence[${i}]`);if(typeof e.label!=='string'||!e.label.length||e.label.length>200)fail('malformed_input',`evidence[${i}].label`);hash(e.sha256,`evidence[${i}].sha256`);}
 return {sha256:ev.sha256,environment:'preview',database_name:t.database_name,database_id:t.database_id,target_attestation_sha256:t.target_attestation_sha256,implementation_sha256:t.implementation_sha256,migration_sha256:t.migration_sha256,verified_at_utc:t.verified_at_utc};
}

const ISSUES=new Set(['invalid_url','oversize_url']);
/** Response-body checks shared by profile captures and the reconciler's final inventory. */
export function inventoryBody(b,q,target,where,{allowEmpty=false,allowConflicts=false}={}){
 if(!b||typeof b!=='object')fail('malformed_input',`${where} body`);
 if(b.schema!==N4_VERSION||b.after!==q.after||b.limit!==q.limit)fail('inventory_contract',`${where} response does not echo its request`);
 for(const k of ['environment','database_id','target_attestation_sha256','implementation_sha256','migration_sha256'])if(b[k]!==target[k])fail(k==='implementation_sha256'?'implementation_mismatch':k==='migration_sha256'?'migration_identity_mismatch':'target_mismatch',`${where} response ${k}`);
 hash(b.selection_sha256,`${where} selection_sha256`);
 if(!Array.isArray(b.rows)||typeof b.has_more!=='boolean')fail('inventory_contract',`${where} rows`);
 if(!b.rows.length&&!allowEmpty)fail('empty_selection',`${where} selects no rows`);
 if(b.rows.length>q.limit||(b.has_more===true&&b.rows.length!==q.limit))fail('inventory_contract',`${where} row count and has_more disagree`);
 let previous=q.after;const rows=[];
 for(const [i,r] of b.rows.entries()){
  exactKeys(r,['id','url_fingerprint','url_length','canonical_hash','issue','conflict','indexed_duplicate_sample'],`${where} rows[${i}]`);
  rowId(r.id,`${where} rows[${i}].id`);
  if(byteOrder(r.id,previous)<=0)fail('inventory_contract',`${where} rows are not strictly after the cursor in index order`);previous=r.id;
  if(r.conflict!==null&&!allowConflicts)fail('conflicting_row',`${where} row ${r.id} has conflict ${r.conflict}; record it and stop`);
  hash(r.url_fingerprint,`${where} rows[${i}].url_fingerprint`);if(!Number.isInteger(r.url_length)||r.url_length<0)fail('inventory_contract',`${where} rows[${i}].url_length`);
  if(r.issue===null&&r.canonical_hash!==null)hash(r.canonical_hash,`${where} rows[${i}].canonical_hash`);
  else if(r.issue!==null&&(!ISSUES.has(r.issue)||r.canonical_hash!==null))fail('inventory_contract',`${where} rows[${i}] issue/hash`);
  else if(r.issue===null&&r.canonical_hash===null&&!allowConflicts)fail('inventory_contract',`${where} rows[${i}] has neither hash nor issue`);
  rows.push({id:r.id,url_fingerprint:r.url_fingerprint,canonical_hash:r.canonical_hash,issue:r.issue});
 }
 const n=rows.length,res=n?reservation(n):{maximum_row_changes:0,maximum_write_units:0},conflicts=b.rows.filter(r=>r.conflict!==null).length;
 if(b.conflicts_in_page!==conflicts)fail('inventory_contract',`${where} conflicts_in_page`);
 if(b.inspection_writes!==0||(Number.isFinite(b.accounting?.provider_rows_written)&&b.accounting.provider_rows_written!==0))fail('inventory_reported_writes',where);
 if(b.next_cursor!==(n?rows.at(-1).id:null))fail('inventory_contract',`${where} next_cursor is not the last selected id`);
 if(b.estimated_row_changes!==res.maximum_row_changes||b.estimated_write_units!==res.maximum_write_units)fail('inventory_contract',`${where} estimates are not n+2 and 5n+8`);
 if(b.invalid_in_page!==rows.filter(r=>r.issue==='invalid_url').length||b.oversize_in_page!==rows.filter(r=>r.issue==='oversize_url').length)fail('inventory_contract',`${where} issue counts`);
 // Pending counts must be internally coherent: exact below 51, a guard-blocking lower bound at 51.
 const pending=b.known_pending_lower_bound;
 if(!Number.isInteger(pending)||pending<0||pending>51||b.pending_count_exact!==(pending<51)||b.missing_identity_guard_blocked!==(pending>50))fail('inventory_contract',`${where} pending counts are incoherent`);
 if(q.after===''&&(pending<Math.min(n,51)||(!n&&pending!==0)))fail('inventory_contract',`${where} pending lower bound contradicts the first page`);
 if(res.maximum_row_changes>MAX_ROW_CHANGES||res.maximum_write_units>MAX_WRITE_UNITS)fail('budget_exceeded',where);
 return {rows,res,pending,conflicts};
}

export function validateCapture(ev,target,opts={}){
 const c=ev.value,where=`inventory ${ev.sha256.slice(0,12)}`;
 exactKeys(c,['schema','captured_at_utc','publisher_email','request','response'],where);
 if(c.schema!==SCHEMA.inventory)fail('malformed_input',`${where} schema`);
 const captured=isoUtc(c.captured_at_utc,`${where} captured_at_utc`);email(c.publisher_email,`${where} publisher_email`);
 const q=c.request;exactKeys(q,['operation','environment','database_id','target_attestation_sha256','after','limit'],`${where} request`);
 if(q.operation!=='inspect')fail('malformed_input',`${where} is not an inspect request`);
 if(q.environment!=='preview'||q.database_id!==target.database_id||q.target_attestation_sha256!==target.target_attestation_sha256)fail('target_mismatch',`${where} request target differs from the verified target`);
 cursorText(q.after,`${where} after`);if(!Number.isInteger(q.limit)||q.limit<1||q.limit>MAX_PAGE)fail('page_bound',`${where} limit must be 1 to ${MAX_PAGE}`);
 exactKeys(c.response,['status','body'],`${where} response`);
 if(c.response.status!==200)fail('inventory_not_successful',`${where} status ${c.response.status}`);
 const b=c.response.body,{rows,res,pending}=inventoryBody(b,q,target,where,opts);
 return {capture_sha256:ev.sha256,captured_at_utc:c.captured_at_utc,captured_ms:captured,publisher_email:c.publisher_email,after:q.after,limit:q.limit,selection_sha256:b.selection_sha256,has_more:b.has_more,next_cursor:b.next_cursor,rows,known_pending_lower_bound:pending,conflicts_in_page:b.conflicts_in_page,...res};
}

/** Same structural rules as approvedProfile(), plus the exact n+2 / 5n+8 reservation the builder emits. */
export function validateProfile(p,ownerApproval){
 exactKeys(p,PROFILE_KEYS,'profile');
 if(p.schema!==N4_VERSION||p.environment!=='preview'||p.database_id!==PREVIEW_DATABASE_ID||p.migration_sha256!==IDENTITY_MIGRATION_SHA256)fail('profile_contract','profile schema, environment, database or migration');
 if(typeof p.approval_ref!=='string'||!APPROVAL_REF.test(p.approval_ref))fail('profile_contract','approval_ref');
 if(p.owner_approval!==ownerApproval)fail('profile_contract',ownerApproval===null?'an unapproved profile must carry owner_approval null':'owner_approval must equal approval_ref');
 hash(p.target_attestation_sha256,'profile target_attestation_sha256');hash(p.implementation_sha256,'profile implementation_sha256');email(p.publisher_email,'profile publisher_email');
 const from=isoUtc(p.from_utc,'from_utc'),until=isoUtc(p.until_utc,'until_utc');
 if(until<=from||until-from>MAX_WINDOW_MS)fail('window_bound','window must be finite, positive and at most one hour');
 if(until-from<=CLOSING_MARGIN_MS)fail('window_bound','window is shorter than the 15-second closing margin');
 if(!Array.isArray(p.requests)||!p.requests.length||p.requests.length>MAX_SLOTS)fail('too_many_slots',`a profile carries 1 to ${MAX_SLOTS} slots`);
 const ids=new Set(),selections=new Set();
 for(const [i,r] of p.requests.entries()){
  exactKeys(r,SLOT_KEYS,`profile requests[${i}]`);
  if(!UUID.test(r.request_id??'')||ids.has(r.request_id))fail('profile_contract',`requests[${i}].request_id`);ids.add(r.request_id);
  cursorText(r.after,`requests[${i}].after`);hash(r.selection_sha256,`requests[${i}].selection_sha256`);
  if(selections.has(r.selection_sha256))fail('profile_contract','duplicate selection');selections.add(r.selection_sha256);
  if(!Number.isInteger(r.limit)||r.limit<1||r.limit>MAX_PAGE)fail('page_bound',`requests[${i}].limit`);
  if(!Number.isInteger(r.maximum_row_changes)||r.maximum_row_changes<3||r.maximum_row_changes>Math.min(MAX_ROW_CHANGES,r.limit+2))fail('budget_exceeded',`requests[${i}].maximum_row_changes`);
  if(!Number.isInteger(r.maximum_write_units)||r.maximum_write_units!==5*(r.maximum_row_changes-2)+8||r.maximum_write_units>MAX_WRITE_UNITS)fail('budget_exceeded',`requests[${i}].maximum_write_units`);
 }
 return {from,until};
}

/** Every fact the owner approves, derived only from the exact profile that would be deployed. */
export function approvalFacts(profile,deployableSha){
 return {approval_ref:profile.approval_ref,environment:'preview',database_id:profile.database_id,publisher_email:profile.publisher_email,from_utc:profile.from_utc,until_utc:profile.until_utc,
  slots:profile.requests.length,total_maximum_row_changes:profile.requests.reduce((n,r)=>n+r.maximum_row_changes,0),total_maximum_write_units:profile.requests.reduce((n,r)=>n+r.maximum_write_units,0),deployable_profile_sha256:deployableSha};
}

const RECONCILIATION_SLOT_KEYS=['index','request_id','after','selection_sha256','rows','class','basis','absence_confirmed','logical_changes','reserved_row_changes','reserved_write_units','storage_writes','next_cursor','attempts','lookups','response_codes','findings'];
/** A prior reconciliation is accepted only if its label follows from its own slots and reasons. */
export function validatePrior(ev,{acknowledge,restart}={}){
 const r=ev.value;
 if(r?.schema!==SCHEMA.reconciliation)fail('malformed_input','prior reconciliation schema');
 if(!Array.isArray(r.slots)||!r.slots.length||!Array.isArray(r.campaign_findings)||!Array.isArray(r.not_verified_reasons)||!Array.isArray(r.stop_reasons))fail('prior_inconsistent','prior reconciliation is incomplete');
 for(const [i,s] of r.slots.entries()){exactKeys(s,RECONCILIATION_SLOT_KEYS,`prior slots[${i}]`);if(s.index!==i||!CLASSES.includes(s.class))fail('prior_inconsistent',`prior slots[${i}]`);}
 const o=deriveOutcome(r.slots,r.campaign_findings.map(c=>c?.code),r.not_verified_reasons);
 const counts=Object.fromEntries(CLASSES.map(c=>[c,r.slots.filter(s=>s.class===c).length]));
 if(o.disposition!==r.disposition||canonical(o.stop_reasons)!==canonical(r.stop_reasons)||o.stop_continuable!==r.stop_continuable||o.resume_after!==r.resume_after||CLASSES.some(c=>r.totals?.[c]!==counts[c]))
  fail('prior_inconsistent','the prior reconciliation\'s disposition, reasons or resume cursor do not follow from its own slots');
 if(r.disposition==='NOT_VERIFIED')fail('prior_not_verified','reconcile the previous profile to PASS before preparing the next one');
 if(r.disposition==='STOP'){
  if(r.stop_continuable!==true)fail('prior_stop','the previous profile stopped on conflicting, unexpected or mismatched evidence');
  if(acknowledge!==ev.sha256)fail('prior_stop','continuing after a refused slot needs --acknowledge-stop <prior reconciliation SHA-256>');
 }
 if(restart!==undefined){
  if(restart!==ev.sha256)fail('malformed_input','--restart-from-start must name the prior reconciliation SHA-256');
  if(r.disposition!=='PASS'||r.campaign_reported_more_rows!==false)fail('restart_not_allowed','a restart from after:"" follows only a PASS profile whose walk reported no further rows');
 }
 if(typeof r.resume_after!=='string'||!Array.isArray(r.chain?.approval_refs)||!Array.isArray(r.chain?.request_ids))fail('prior_inconsistent','prior reconciliation chain');
 const freshAfter=[r.latest_execution_utc,r.deployment?.closure?.readback_captured_at_utc].filter(v=>v!==null&&v!==undefined).map((v,i)=>isoUtc(v,`prior evidence time ${i}`));
 if(!freshAfter.length)fail('prior_inconsistent','prior reconciliation records neither execution nor closure time');
 return {reconciliation_sha256:ev.sha256,disposition:r.disposition,stop_acknowledged:r.disposition==='STOP',restart_from_start:restart!==undefined,resume_after:restart!==undefined?'':r.resume_after,
  fresh_after_utc:new Date(Math.max(...freshAfter)).toISOString(),approval_refs:r.chain.approval_refs,request_ids:r.chain.request_ids,final_inventory_required:true};
}

export function prepare(argv){
 const a=parseArgs(argv,{'plan':{type:'string',required:true},'plan-sha256':{type:'string',required:true},'target-evidence':{type:'string',required:true},'inventory':{type:'list',required:true},'approval-ref':{type:'string',required:true},'from-utc':{type:'string',required:true},'until-utc':{type:'string',required:true},'out-dir':{type:'string',required:true},'now':{type:'string'},'max-evidence-age-minutes':{type:'string'},'prior-reconciliation':{type:'string'},'acknowledge-stop':{type:'string'},'restart-from-start':{type:'string'}});
 const dir=outputDirectory(a['out-dir']),now=a.now?isoUtc(a.now,'--now'):Date.now();
 const maxAge=a['max-evidence-age-minutes']===undefined?DEFAULT_MAX_EVIDENCE_AGE_MINUTES:Number(a['max-evidence-age-minutes']);
 if(!Number.isInteger(maxAge)||maxAge<1||maxAge>HARD_MAX_EVIDENCE_AGE_MINUTES)fail('malformed_input',`--max-evidence-age-minutes must be 1 to ${HARD_MAX_EVIDENCE_AGE_MINUTES}`);
 const plan=validatePlan(readEvidence(a.plan,'plan'),a['plan-sha256']),target=validateTarget(readEvidence(a['target-evidence'],'target evidence'),plan);
 if((a['acknowledge-stop']!==undefined||a['restart-from-start']!==undefined)&&a['prior-reconciliation']===undefined)fail('malformed_input','--acknowledge-stop and --restart-from-start need --prior-reconciliation');
 const prior=a['prior-reconciliation']?validatePrior(readEvidence(a['prior-reconciliation'],'prior reconciliation'),{acknowledge:a['acknowledge-stop'],restart:a['restart-from-start']}):null;
 if(a.inventory.length>MAX_SLOTS)fail('too_many_slots',`at most ${MAX_SLOTS} inventory captures per profile`);
 const ref=a['approval-ref'];if(!APPROVAL_REF.test(ref))fail('malformed_input','--approval-ref must match [-A-Za-z0-9_]{1,100}');
 if(prior?.approval_refs.includes(ref))fail('approval_ref_reused',ref);
 const slots=a.inventory.map(f=>validateCapture(readEvidence(f,'inventory'),target));
 if(new Set(slots.map(s=>s.capture_sha256)).size!==slots.length)fail('duplicate_inventory','the same capture was supplied twice');
 const expectedStart=prior?prior.resume_after:'';
 if(slots[0].after!==expectedStart)fail('cursor_chain',prior?`first selection must resume at ${JSON.stringify(expectedStart)}`:'the first profile of a campaign starts at after:""');
 for(let i=1;i<slots.length;i++){
  if(slots[i-1].has_more!==true)fail('cursor_chain',`capture ${i} follows a page that reported no further rows`);
  if(slots[i].after!==slots[i-1].next_cursor)fail('cursor_chain',`capture ${i+1} does not start at the previous page's next_cursor; missing pages are never assumed`);
 }
 if(new Set(slots.map(s=>s.selection_sha256)).size!==slots.length)fail('duplicate_selection','two captures have the same selection digest');
 const publisher=slots[0].publisher_email;if(slots.some(s=>s.publisher_email!==publisher))fail('publisher_mismatch','all captures must come from the same publisher');
 const from=isoUtc(a['from-utc'],'--from-utc'),until=isoUtc(a['until-utc'],'--until-utc');
 const oldest=Math.min(...slots.map(s=>s.captured_ms)),newest=Math.max(...slots.map(s=>s.captured_ms));
 if(newest>now)fail('stale_or_future_evidence','an inventory capture is dated in the future');
 if(slots.some(s=>s.captured_ms<Date.parse(target.verified_at_utc)))fail('stale_or_future_evidence','every inventory capture must follow the verified target evidence');
 if(prior&&slots.some(s=>s.captured_ms<=Date.parse(prior.fresh_after_utc)))fail('stale_or_future_evidence','every inventory capture must be newer than the previous profile\'s last execution and closure; inspect again');
 if(now-oldest>maxAge*60000||from-oldest>maxAge*60000)fail('stale_or_future_evidence',`inventory is older than ${maxAge} minutes at preparation or window start; inspect again`);
 if(from<newest)fail('window_bound','the window must open after the last inventory capture');
 if(from<now)fail('window_bound','the window has already opened; owner approval must precede it');
 const slotsOut=slots.map((s,i)=>({request_id:requestId(ref,i,s.after,s.selection_sha256),after:s.after,limit:s.limit,selection_sha256:s.selection_sha256,maximum_row_changes:s.maximum_row_changes,maximum_write_units:s.maximum_write_units}));
 if(prior&&slotsOut.some(s=>prior.request_ids.includes(s.request_id)))fail('request_id_reused');
 const profile=profileObject({approval_ref:ref,database_id:target.database_id,target_attestation_sha256:target.target_attestation_sha256,implementation_sha256:plan.implementation_sha256,migration_sha256:plan.migration_sha256,publisher_email:publisher,from_utc:a['from-utc'],until_utc:a['until-utc'],requests:slotsOut},null);
 validateProfile(profile,null);
 const deployable=deployableBytes(profile);if(deployable.length>MAX_PROFILE_BYTES)fail('profile_too_large',`${deployable.length} bytes exceeds ${MAX_PROFILE_BYTES}; use fewer captures`);
 const pkg={
  schema:SCHEMA.package,status:'AWAITING_OWNER_APPROVAL',owner_approval:null,approved_at_utc:null,
  notice:'Preparation only. This package is not an owner approval, does not configure any Worker variable and sends no request. The ability to set Worker variables is not evidence that approval occurred.',
  approval_ref:ref,plan,target,publisher_email:publisher,
  window:{from_utc:a['from-utc'],until_utc:a['until-utc'],duration_ms:until-from,closing_margin_ms:CLOSING_MARGIN_MS},
  evidence_policy:{max_evidence_age_minutes:maxAge,oldest_capture_utc:new Date(oldest).toISOString(),newest_capture_utc:new Date(newest).toISOString(),captures_after_utc:prior?.fresh_after_utc??target.verified_at_utc},
  slots:slots.map((s,i)=>({index:i,request_id:slotsOut[i].request_id,capture_sha256:s.capture_sha256,captured_at_utc:s.captured_at_utc,after:s.after,limit:s.limit,selection_sha256:s.selection_sha256,has_more:s.has_more,next_cursor:s.next_cursor,known_pending_lower_bound:s.known_pending_lower_bound,maximum_row_changes:s.maximum_row_changes,maximum_write_units:s.maximum_write_units,rows:s.rows})),
  totals:{slots:slots.length,rows:slots.reduce((n,s)=>n+s.rows.length,0),maximum_row_changes:slotsOut.reduce((n,s)=>n+s.maximum_row_changes,0),maximum_write_units:slotsOut.reduce((n,s)=>n+s.maximum_write_units,0)},
  prior,chain:{approval_refs:[...(prior?.approval_refs??[]),ref],request_ids:[...(prior?.request_ids??[]),...slotsOut.map(s=>s.request_id)]},
  profile_without_approval:profile,
  deployable_profile_sha256_if_approved:sha256(deployable),deployable_profile_bytes_if_approved:deployable.length,
 };
 const out=writeAddressed(dir,'n4-approval-package','json',jsonBytes(pkg));
 return {action:'prepared',package:out.path,package_sha256:out.sha256,approval_ref:ref,slots:pkg.totals.slots,rows:pkg.totals.rows,deployable_profile_sha256_if_approved:pkg.deployable_profile_sha256_if_approved,deployable_profile_bytes:deployable.length,owner_approval:null,requests_sent:0};
}

const PACKAGE_KEYS=['schema','status','owner_approval','approved_at_utc','notice','approval_ref','plan','target','publisher_email','window','evidence_policy','slots','totals','prior','chain','profile_without_approval','deployable_profile_sha256_if_approved','deployable_profile_bytes_if_approved'];
const PACKAGE_SLOT_KEYS=['index','request_id','capture_sha256','captured_at_utc','after','limit','selection_sha256','has_more','next_cursor','known_pending_lower_bound','maximum_row_changes','maximum_write_units','rows'];
/** Loads a package and refuses it unless every summary and slot fact agrees with the profile it would emit. */
export function loadPackage(path){
 const ev=readEvidence(path,'approval package'),p=ev.value,bad=d=>fail('package_inconsistent',d);
 exactKeys(p,PACKAGE_KEYS,'approval package');
 if(p.schema!==SCHEMA.package||p.status!=='AWAITING_OWNER_APPROVAL'||p.owner_approval!==null||p.approved_at_utc!==null)fail('malformed_input','approval package status');
 const profile=p.profile_without_approval;validateProfile(profile,null);
 const bytes=deployableBytes(profile),sha=sha256(bytes);
 if(bytes.length>MAX_PROFILE_BYTES)fail('profile_too_large',`${bytes.length} bytes`);
 if(sha!==p.deployable_profile_sha256_if_approved||bytes.length!==p.deployable_profile_bytes_if_approved)bad('the profile does not reproduce the recorded deployable hash and size');
 if(p.approval_ref!==profile.approval_ref||p.publisher_email!==profile.publisher_email)bad('approval reference or publisher differs from the profile');
 const from=Date.parse(profile.from_utc),until=Date.parse(profile.until_utc);
 if(canonical(p.window)!==canonical({from_utc:profile.from_utc,until_utc:profile.until_utc,duration_ms:until-from,closing_margin_ms:CLOSING_MARGIN_MS}))bad('window summary differs from the profile');
 if(p.target?.environment!=='preview'||p.target.database_id!==profile.database_id||p.target.target_attestation_sha256!==profile.target_attestation_sha256||p.target.implementation_sha256!==profile.implementation_sha256||p.target.migration_sha256!==profile.migration_sha256)bad('target summary differs from the profile');
 if(p.plan?.implementation_sha256!==profile.implementation_sha256||p.plan.migration_sha256!==profile.migration_sha256)bad('plan summary differs from the profile');
 if(!Array.isArray(p.slots)||p.slots.length!==profile.requests.length)bad('slot count differs from the profile');
 const verified=isoUtc(p.target.verified_at_utc,'package target verified_at_utc');
 for(const [i,s] of p.slots.entries()){
  exactKeys(s,PACKAGE_SLOT_KEYS,`package slots[${i}]`);const r=profile.requests[i];
  if(s.index!==i||s.request_id!==r.request_id||s.after!==r.after||s.limit!==r.limit||s.selection_sha256!==r.selection_sha256||s.maximum_row_changes!==r.maximum_row_changes||s.maximum_write_units!==r.maximum_write_units)bad(`slot ${i} differs from the profile`);
  if(r.request_id!==requestId(profile.approval_ref,i,r.after,r.selection_sha256))bad(`slot ${i} request id is not derived from its selection`);
  if(!Array.isArray(s.rows)||!s.rows.length||s.rows.length>r.limit||canonical(reservation(s.rows.length))!==canonical({maximum_row_changes:r.maximum_row_changes,maximum_write_units:r.maximum_write_units}))bad(`slot ${i} rows do not match its reservation`);
  let previous=r.after;for(const [j,row] of s.rows.entries()){exactKeys(row,['id','url_fingerprint','canonical_hash','issue'],`package slots[${i}].rows[${j}]`);rowId(row.id,`slot ${i} row ${j}`);if(byteOrder(row.id,previous)<=0)bad(`slot ${i} rows are not in index order`);previous=row.id;}
  if(s.next_cursor!==s.rows.at(-1).id)bad(`slot ${i} next_cursor`);
  if(i>0&&(s.after!==p.slots[i-1].next_cursor||p.slots[i-1].has_more!==true))bad(`slot ${i} does not chain from slot ${i-1}`);
  if(isoUtc(s.captured_at_utc,`slot ${i} captured_at_utc`)<verified)bad(`slot ${i} predates target verification`);
 }
 const times=p.slots.map(s=>Date.parse(s.captured_at_utc));
 if(p.evidence_policy?.oldest_capture_utc!==new Date(Math.min(...times)).toISOString()||p.evidence_policy.newest_capture_utc!==new Date(Math.max(...times)).toISOString())bad('evidence times differ from the slots');
 const facts=approvalFacts(profile,sha);
 if(canonical(p.totals)!==canonical({slots:facts.slots,rows:p.slots.reduce((n,s)=>n+s.rows.length,0),maximum_row_changes:facts.total_maximum_row_changes,maximum_write_units:facts.total_maximum_write_units}))bad('totals differ from the profile');
 const priorRefs=p.prior?.approval_refs??[],priorIds=p.prior?.request_ids??[];
 if(canonical(p.chain)!==canonical({approval_refs:[...priorRefs,profile.approval_ref],request_ids:[...priorIds,...profile.requests.map(r=>r.request_id)]}))bad('campaign chain differs from the profile');
 if(profile.requests[0].after!==(p.prior?p.prior.resume_after:''))bad('first slot does not start at the recorded resume cursor');
 return {ev,pkg:p,deployable:bytes,facts};
}

const APPROVAL_KEYS=['schema','decision','approval_ref','owner_email','approved_at_utc','package_sha256','deployable_profile_sha256','environment','database_id','publisher_email','from_utc','until_utc','slots','total_maximum_row_changes','total_maximum_write_units','statement'];
export function approvalTemplate(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true}});const {ev,facts}=loadPackage(a.package);
 return {schema:SCHEMA.approval,decision:null,approval_ref:facts.approval_ref,owner_email:null,approved_at_utc:null,package_sha256:ev.sha256,deployable_profile_sha256:facts.deployable_profile_sha256,environment:facts.environment,database_id:facts.database_id,publisher_email:facts.publisher_email,from_utc:facts.from_utc,until_utc:facts.until_utc,slots:facts.slots,total_maximum_row_changes:facts.total_maximum_row_changes,total_maximum_write_units:facts.total_maximum_write_units,statement:null};
}

export function validateApproval(ev,loaded,now){
 const {ev:pkgEv,pkg,facts}=loaded,r=ev.value;exactKeys(r,APPROVAL_KEYS,'owner approval record');
 if(r.schema!==SCHEMA.approval)fail('malformed_input','owner approval schema');
 if(r.decision!=='APPROVED')fail('not_approved','the owner approval record does not say APPROVED');
 for(const [k,v] of Object.entries({...facts,package_sha256:pkgEv.sha256}))if(r[k]!==v)fail('approval_mismatch',`approval ${k} does not match the profile that would be deployed`);
 email(r.owner_email,'owner_email');
 if(typeof r.statement!=='string'||r.statement.length<20||r.statement.length>2000||!r.statement.includes(facts.deployable_profile_sha256))fail('approval_mismatch','the owner statement must quote the exact deployable profile SHA-256');
 const at=isoUtc(r.approved_at_utc,'approved_at_utc');
 if(at<Date.parse(pkg.evidence_policy.newest_capture_utc))fail('approval_mismatch','approval predates the inventory it approves');
 if(at>Date.parse(facts.from_utc))fail('approval_mismatch','approval was recorded after the window opened');
 if(now!==undefined&&at>now)fail('approval_mismatch','approval is dated in the future');
 return {sha256:ev.sha256,approval_ref:r.approval_ref,owner_email:r.owner_email,approved_at_utc:r.approved_at_utc};
}

export const workerVariables=(facts,implementation,attestation)=>({TRACE_ENVIRONMENT:'preview',TRACE_IDENTITY_DATABASE_ID:facts.database_id,TRACE_IDENTITY_TARGET_ATTESTATION_SHA256:attestation,TRACE_IDENTITY_IMPLEMENTATION_SHA256:implementation,TRACE_IDENTITY_MAINTENANCE_ENABLED:'true',TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256:facts.deployable_profile_sha256});

export function finalize(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true},'approval-record':{type:'string',required:true},'out-dir':{type:'string',required:true},'now':{type:'string'}});
 const dir=outputDirectory(a['out-dir']),now=a.now?isoUtc(a.now,'--now'):Date.now();
 const loaded=loadPackage(a.package),approval=validateApproval(readEvidence(a['approval-record'],'owner approval record'),loaded,now),{facts,deployable}=loaded,profile=loaded.pkg.profile_without_approval;
 if(now+CLOSING_MARGIN_MS>=Date.parse(facts.until_utc))fail('window_expired','the approved window has closed; prepare a new package');
 const out=writeAddressed(dir,'n4-profile','json',deployable);
 if(out.sha256!==facts.deployable_profile_sha256)fail('package_inconsistent');
 return {action:'finalized',profile:out.path,deployable_profile_sha256:out.sha256,profile_bytes:deployable.length,approval_record_sha256:approval.sha256,approved_facts:facts,expected_worker_variables:workerVariables(facts,profile.implementation_sha256,profile.target_attestation_sha256),
  next_step:'Owner configures exactly these Worker variables (profile value = the file bytes), then records a deployment readback and runs verify-deployment --phase open before the first slot. Nothing has been configured or sent.',requests_sent:0};
}

const READBACK_VARS=['TRACE_ENVIRONMENT','TRACE_IDENTITY_DATABASE_ID','TRACE_IDENTITY_TARGET_ATTESTATION_SHA256','TRACE_IDENTITY_IMPLEMENTATION_SHA256','TRACE_IDENTITY_INVENTORY_ENABLED','TRACE_IDENTITY_MAINTENANCE_ENABLED','TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256'];
/** Pure verification of one owner-recorded readback; the reconciler recomputes it from the raw readback. */
export function deploymentVerification(loaded,approval,profileSha,rb,phase){
 if(!['open','closure'].includes(phase))fail('malformed_input','phase is open or closure');
 const {ev,facts,pkg}=loaded,r=rb.value,profile=pkg.profile_without_approval;
 exactKeys(r,['schema','captured_at_utc','environment','worker_script','variables','secrets_present','import_gate','crons'],'deployment readback');
 if(r.schema!==SCHEMA.readback)fail('malformed_input','readback schema');
 exactKeys(r.variables,READBACK_VARS,'readback variables');exactKeys(r.secrets_present,['TRACE_INTERNAL_SERVICE_SECRET'],'readback secrets_present');
 const at=isoUtc(r.captured_at_utc,'readback captured_at_utc'),from=Date.parse(facts.from_utc),until=Date.parse(facts.until_utc),v=r.variables,expected=workerVariables(facts,profile.implementation_sha256,profile.target_attestation_sha256),checks=[];
 const check=(name,ok,detail)=>checks.push({check:name,result:ok?'PASS':'STOP',detail});
 check('readback_environment',r.environment==='preview'&&typeof r.worker_script==='string'&&r.worker_script.length>0,'Preview Worker environment');
 for(const k of ['TRACE_ENVIRONMENT','TRACE_IDENTITY_DATABASE_ID','TRACE_IDENTITY_TARGET_ATTESTATION_SHA256','TRACE_IDENTITY_IMPLEMENTATION_SHA256'])check('binding_'+k,v[k]===expected[k],`${k} must equal the approved value`);
 check('secret_present',r.secrets_present.TRACE_INTERNAL_SERVICE_SECRET===true,'presence only; the secret value is never read');
 check('import_gate_closed',r.import_gate!=='true','TRACE_NEWS_IMPORT_ENABLED must not be true');
 check('crons_empty',Array.isArray(r.crons)&&r.crons.length===0,'crons = [] (STOP-BURN)');
 if(phase==='open'){
  check('maintenance_enabled',v.TRACE_IDENTITY_MAINTENANCE_ENABLED==='true','maintenance flag set for the approved window');
  check('profile_matches_approval',v.TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256===profileSha,'deployed profile hash equals the owner-approved hash');
  check('readback_after_approval',at>=Date.parse(approval.approved_at_utc),'configuration follows approval');
  check('readback_before_window_close',at+CLOSING_MARGIN_MS<until,'verified before the closing margin');
 }else{
  check('maintenance_disabled',v.TRACE_IDENTITY_MAINTENANCE_ENABLED!=='true','maintenance flag removed or false');
  check('profile_removed',v.TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256===null,'profile variable removed');
  check('readback_after_window_open',at>=from,'closure is recorded after the window opened');
 }
 return {schema:SCHEMA.verification,phase,disposition:checks.every(c=>c.result==='PASS')?'PASS':'STOP',package_sha256:ev.sha256,approval_record_sha256:approval.sha256,deployable_profile_sha256:profileSha,readback_sha256:rb.sha256,readback_captured_at_utc:r.captured_at_utc,
  inventory_flag:v.TRACE_IDENTITY_INVENTORY_ENABLED,closed_after_window:phase==='closure'?at>=until:null,checks,
  notice:'Compares an owner-recorded readback with the approval. It does not read Cloudflare and is not independent proof of the deployed state.'};
}

export function verifyDeployment(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true},'approval-record':{type:'string',required:true},'profile':{type:'string',required:true},'readback':{type:'string',required:true},'phase':{type:'string',required:true},'out-dir':{type:'string',required:true}});
 const dir=outputDirectory(a['out-dir']),loaded=loadPackage(a.package),approval=validateApproval(readEvidence(a['approval-record'],'owner approval record'),loaded);
 const prof=readEvidence(a.profile,'deployable profile');if(prof.sha256!==loaded.facts.deployable_profile_sha256)fail('profile_mismatch','profile file is not the approved deployable profile');
 validateProfile(prof.value,loaded.pkg.approval_ref);
 const result=deploymentVerification(loaded,approval,prof.sha256,readEvidence(a.readback,'deployment readback'),a.phase);
 const out=writeAddressed(dir,`n4-deployment-${a.phase}`,'json',jsonBytes(result));
 return {action:'verified',phase:a.phase,disposition:result.disposition,verification:out.path,verification_sha256:out.sha256,failed:result.checks.filter(c=>c.result!=='PASS').map(c=>c.check)};
}

const COMMANDS={prepare,'approval-template':approvalTemplate,finalize,'verify-deployment':verifyDeployment};
if(isEntry(import.meta.url)){
 main(([command,...rest])=>{const run=COMMANDS[command];if(!run)fail('unknown_command',`use one of: ${Object.keys(COMMANDS).join(', ')}`);return run(rest);});
}
