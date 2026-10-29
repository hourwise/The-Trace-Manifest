#!/usr/bin/env node
// N4-OPS-01 offline maintenance-profile builder. It reads saved evidence files and writes
// content-addressed local files. It never contacts Cloudflare or Preview, never sends a
// request, and never records an owner approval: approval is a separate file the owner writes.
import {
 N4_VERSION,PREVIEW_DATABASE_ID,PREVIEW_DATABASE_NAME,IDENTITY_MIGRATION_SHA256,PLAN_SCHEMA,MAX_PAGE,MAX_SLOTS,MAX_PROFILE_BYTES,MAX_WINDOW_MS,CLOSING_MARGIN_MS,
 MAX_ROW_CHANGES,MAX_WRITE_UNITS,DEFAULT_MAX_EVIDENCE_AGE_MINUTES,HARD_MAX_EVIDENCE_AGE_MINUTES,UUID,APPROVAL_REF,SCHEMA,PROFILE_KEYS,SLOT_KEYS,
 fail,sha256,exactKeys,isoUtc,email,hash,cursorText,byteOrder,readEvidence,parseArgs,outputDirectory,writeAddressed,jsonBytes,profileObject,deployableBytes,requestId,reservation,main,isEntry,
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
export function validateCapture(ev,target){
 const c=ev.value,where=`inventory ${ev.path}`;
 exactKeys(c,['schema','captured_at_utc','publisher_email','request','response'],where);
 if(c.schema!==SCHEMA.inventory)fail('malformed_input',`${where} schema`);
 const captured=isoUtc(c.captured_at_utc,`${where} captured_at_utc`);email(c.publisher_email,`${where} publisher_email`);
 const q=c.request;exactKeys(q,['operation','environment','database_id','target_attestation_sha256','after','limit'],`${where} request`);
 if(q.operation!=='inspect')fail('malformed_input',`${where} is not an inspect request`);
 if(q.environment!=='preview'||q.database_id!==target.database_id||q.target_attestation_sha256!==target.target_attestation_sha256)fail('target_mismatch',`${where} request target differs from verified target`);
 cursorText(q.after,`${where} after`);if(!Number.isInteger(q.limit)||q.limit<1||q.limit>MAX_PAGE)fail('page_bound',`${where} limit must be 1 to ${MAX_PAGE}`);
 exactKeys(c.response,['status','body'],`${where} response`);
 if(c.response.status!==200)fail('inventory_not_successful',`${where} status ${c.response.status}`);
 const b=c.response.body;if(!b||typeof b!=='object')fail('malformed_input',`${where} body`);
 if(b.schema!==N4_VERSION||b.after!==q.after||b.limit!==q.limit)fail('inventory_contract',`${where} response does not echo its request`);
 for(const k of ['environment','database_id','target_attestation_sha256','implementation_sha256','migration_sha256'])if(b[k]!==target[k])fail(k==='implementation_sha256'?'implementation_mismatch':k==='migration_sha256'?'migration_identity_mismatch':'target_mismatch',`${where} response ${k}`);
 hash(b.selection_sha256,`${where} selection_sha256`);
 if(!Array.isArray(b.rows))fail('inventory_contract',`${where} rows`);
 if(!b.rows.length)fail('empty_selection',`${where} selects no rows`);
 if(b.rows.length>q.limit||(b.has_more===true&&b.rows.length!==q.limit)||typeof b.has_more!=='boolean')fail('inventory_contract',`${where} row count and has_more disagree`);
 let previous=q.after;const rows=[];
 for(const [i,r] of b.rows.entries()){
  exactKeys(r,['id','url_fingerprint','url_length','canonical_hash','issue','conflict','indexed_duplicate_sample'],`${where} rows[${i}]`);
  if(typeof r.id!=='string'||!r.id.length||r.id.length>200)fail('inventory_contract',`${where} rows[${i}].id`);
  if(byteOrder(r.id,previous)<=0)fail('inventory_contract',`${where} rows are not strictly after the cursor in index order`);previous=r.id;
  if(r.conflict!==null)fail('conflicting_row',`${where} row ${r.id} has conflict ${r.conflict}; record it and stop`);
  hash(r.url_fingerprint,`${where} rows[${i}].url_fingerprint`);if(!Number.isInteger(r.url_length)||r.url_length<0)fail('inventory_contract',`${where} rows[${i}].url_length`);
  if(r.issue===null)hash(r.canonical_hash,`${where} rows[${i}].canonical_hash`);else if(!ISSUES.has(r.issue)||r.canonical_hash!==null)fail('inventory_contract',`${where} rows[${i}] issue/hash`);
  rows.push({id:r.id,url_fingerprint:r.url_fingerprint,canonical_hash:r.canonical_hash,issue:r.issue});
 }
 const n=rows.length,res=reservation(n);
 if(b.conflicts_in_page!==0)fail('conflicting_row',`${where} conflicts_in_page`);
 if(b.inspection_writes!==0||(Number.isFinite(b.accounting?.provider_rows_written)&&b.accounting.provider_rows_written!==0))fail('inventory_reported_writes',where);
 if(b.next_cursor!==rows.at(-1).id)fail('inventory_contract',`${where} next_cursor is not the last selected id`);
 if(b.estimated_row_changes!==res.maximum_row_changes||b.estimated_write_units!==res.maximum_write_units)fail('inventory_contract',`${where} estimates are not n+2 and 5n+8`);
 if(b.invalid_in_page!==rows.filter(r=>r.issue==='invalid_url').length||b.oversize_in_page!==rows.filter(r=>r.issue==='oversize_url').length)fail('inventory_contract',`${where} issue counts`);
 if(res.maximum_row_changes>MAX_ROW_CHANGES||res.maximum_write_units>MAX_WRITE_UNITS)fail('budget_exceeded',where);
 return {capture_sha256:ev.sha256,captured_at_utc:c.captured_at_utc,captured_ms:captured,publisher_email:c.publisher_email,after:q.after,limit:q.limit,selection_sha256:b.selection_sha256,has_more:b.has_more,next_cursor:b.next_cursor,rows,known_pending_lower_bound:b.known_pending_lower_bound??null,...res};
}

/** Same structural rules as approvedProfile(); used before writing and again before deployment or reconciliation. */
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
  if(!Number.isInteger(r.maximum_write_units)||r.maximum_write_units<13||r.maximum_write_units>Math.min(MAX_WRITE_UNITS,5*r.limit+8))fail('budget_exceeded',`requests[${i}].maximum_write_units`);
 }
 return {from,until};
}

function validatePrior(ev,acknowledge){
 const r=ev.value;
 if(r?.schema!==SCHEMA.reconciliation)fail('malformed_input','prior reconciliation schema');
 if(r.disposition==='NOT_VERIFIED')fail('prior_not_verified','reconcile the previous profile to PASS before preparing the next one');
 if(r.disposition==='STOP'){
  if(r.stop_continuable!==true)fail('prior_stop','the previous profile stopped on conflicting, unexpected or mismatched evidence');
  if(acknowledge!==ev.sha256)fail('prior_stop','continuing after a refused slot needs --acknowledge-stop <prior reconciliation SHA-256>');
 }else if(r.disposition!=='PASS')fail('malformed_input','prior reconciliation disposition');
 if(typeof r.resume_after!=='string'||!Array.isArray(r.chain?.approval_refs)||!Array.isArray(r.chain?.request_ids))fail('malformed_input','prior reconciliation chain');
 return {reconciliation_sha256:ev.sha256,disposition:r.disposition,stop_acknowledged:r.disposition==='STOP',resume_after:r.resume_after,approval_refs:r.chain.approval_refs,request_ids:r.chain.request_ids,final_inventory_required:true};
}

export function prepare(argv){
 const a=parseArgs(argv,{'plan':{type:'string',required:true},'plan-sha256':{type:'string',required:true},'target-evidence':{type:'string',required:true},'inventory':{type:'list',required:true},'approval-ref':{type:'string',required:true},'from-utc':{type:'string',required:true},'until-utc':{type:'string',required:true},'out-dir':{type:'string',required:true},'now':{type:'string'},'max-evidence-age-minutes':{type:'string'},'prior-reconciliation':{type:'string'},'acknowledge-stop':{type:'string'}});
 const dir=outputDirectory(a['out-dir']),now=a.now?isoUtc(a.now,'--now'):Date.now();
 const maxAge=a['max-evidence-age-minutes']===undefined?DEFAULT_MAX_EVIDENCE_AGE_MINUTES:Number(a['max-evidence-age-minutes']);
 if(!Number.isInteger(maxAge)||maxAge<1||maxAge>HARD_MAX_EVIDENCE_AGE_MINUTES)fail('malformed_input',`--max-evidence-age-minutes must be 1 to ${HARD_MAX_EVIDENCE_AGE_MINUTES}`);
 const plan=validatePlan(readEvidence(a.plan,'plan'),a['plan-sha256']),target=validateTarget(readEvidence(a['target-evidence'],'target evidence'),plan);
 if(a['acknowledge-stop']!==undefined&&a['prior-reconciliation']===undefined)fail('malformed_input','--acknowledge-stop needs --prior-reconciliation');
 const prior=a['prior-reconciliation']?validatePrior(readEvidence(a['prior-reconciliation'],'prior reconciliation'),a['acknowledge-stop']):null;
 if(a.inventory.length>MAX_SLOTS)fail('too_many_slots',`at most ${MAX_SLOTS} inventory captures per profile`);
 const ref=a['approval-ref'];if(!APPROVAL_REF.test(ref))fail('malformed_input','--approval-ref must match [-A-Za-z0-9_]{1,100}');
 if(prior?.approval_refs.includes(ref))fail('approval_ref_reused',ref);
 const slots=a.inventory.map(f=>validateCapture(readEvidence(f,'inventory'),target));
 if(new Set(slots.map(s=>s.capture_sha256)).size!==slots.length)fail('duplicate_inventory','the same capture was supplied twice');
 const expectedStart=prior?prior.resume_after:'';
 if(slots[0].after!==expectedStart)fail('cursor_chain',prior?`first selection must resume at the reconciled cursor ${JSON.stringify(expectedStart)}`:'the first profile of a campaign starts at after:""');
 for(let i=1;i<slots.length;i++){
  if(slots[i-1].has_more!==true)fail('cursor_chain',`capture ${i} follows a page that reported no further rows`);
  if(slots[i].after!==slots[i-1].next_cursor)fail('cursor_chain',`capture ${i+1} does not start at the previous page's next_cursor; missing pages are never assumed`);
 }
 if(new Set(slots.map(s=>s.selection_sha256)).size!==slots.length)fail('duplicate_selection','two captures have the same selection digest');
 const publisher=slots[0].publisher_email;if(slots.some(s=>s.publisher_email!==publisher))fail('publisher_mismatch','all captures must come from the same publisher');
 const from=isoUtc(a['from-utc'],'--from-utc'),until=isoUtc(a['until-utc'],'--until-utc');
 const oldest=Math.min(...slots.map(s=>s.captured_ms)),newest=Math.max(...slots.map(s=>s.captured_ms));
 if(newest>now)fail('stale_or_future_evidence','an inventory capture is dated in the future');
 if(newest<Date.parse(target.verified_at_utc))fail('stale_or_future_evidence','inventory predates the verified target evidence');
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
  evidence_policy:{max_evidence_age_minutes:maxAge,oldest_capture_utc:new Date(oldest).toISOString(),newest_capture_utc:new Date(newest).toISOString()},
  slots:slots.map((s,i)=>({index:i,request_id:slotsOut[i].request_id,capture_sha256:s.capture_sha256,captured_at_utc:s.captured_at_utc,after:s.after,limit:s.limit,selection_sha256:s.selection_sha256,has_more:s.has_more,next_cursor:s.next_cursor,known_pending_lower_bound:s.known_pending_lower_bound,maximum_row_changes:s.maximum_row_changes,maximum_write_units:s.maximum_write_units,rows:s.rows})),
  totals:{slots:slots.length,rows:slots.reduce((n,s)=>n+s.rows.length,0),maximum_row_changes:slotsOut.reduce((n,s)=>n+s.maximum_row_changes,0),maximum_write_units:slotsOut.reduce((n,s)=>n+s.maximum_write_units,0)},
  prior,chain:{approval_refs:[...(prior?.approval_refs??[]),ref],request_ids:[...(prior?.request_ids??[]),...slotsOut.map(s=>s.request_id)]},
  profile_without_approval:profile,
  deployable_profile_sha256_if_approved:sha256(deployable),deployable_profile_bytes_if_approved:deployable.length,
 };
 const out=writeAddressed(dir,'n4-approval-package','json',jsonBytes(pkg));
 return {action:'prepared',package:out.path,package_sha256:out.sha256,approval_ref:ref,slots:pkg.totals.slots,rows:pkg.totals.rows,deployable_profile_sha256_if_approved:pkg.deployable_profile_sha256_if_approved,deployable_profile_bytes:deployable.length,owner_approval:null,requests_sent:0};
}

export function loadPackage(path){
 const ev=readEvidence(path,'approval package'),p=ev.value;
 if(p?.schema!==SCHEMA.package||p.status!=='AWAITING_OWNER_APPROVAL'||p.owner_approval!==null||p.approved_at_utc!==null)fail('malformed_input','approval package');
 validateProfile(p.profile_without_approval,null);
 const bytes=deployableBytes(p.profile_without_approval);
 if(sha256(bytes)!==p.deployable_profile_sha256_if_approved||p.profile_without_approval.approval_ref!==p.approval_ref)fail('package_inconsistent','package profile does not reproduce its recorded deployable hash');
 if(p.slots.length!==p.profile_without_approval.requests.length||p.slots.some((s,i)=>s.request_id!==p.profile_without_approval.requests[i].request_id||s.selection_sha256!==p.profile_without_approval.requests[i].selection_sha256||s.rows.length+2!==s.maximum_row_changes))fail('package_inconsistent','package slots and profile disagree');
 return {ev,pkg:p,deployable:bytes};
}

const APPROVAL_KEYS=['schema','decision','approval_ref','owner_email','approved_at_utc','package_sha256','deployable_profile_sha256','environment','database_id','publisher_email','from_utc','until_utc','slots','total_maximum_row_changes','total_maximum_write_units','statement'];
export function approvalTemplate(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true}});const {ev,pkg}=loadPackage(a.package);
 return {schema:SCHEMA.approval,decision:null,approval_ref:pkg.approval_ref,owner_email:null,approved_at_utc:null,package_sha256:ev.sha256,deployable_profile_sha256:pkg.deployable_profile_sha256_if_approved,environment:'preview',database_id:pkg.target.database_id,publisher_email:pkg.publisher_email,from_utc:pkg.window.from_utc,until_utc:pkg.window.until_utc,slots:pkg.totals.slots,total_maximum_row_changes:pkg.totals.maximum_row_changes,total_maximum_write_units:pkg.totals.maximum_write_units,statement:null};
}

export function validateApproval(ev,pkgEv,pkg,now){
 const r=ev.value;exactKeys(r,APPROVAL_KEYS,'owner approval record');
 if(r.schema!==SCHEMA.approval)fail('malformed_input','owner approval schema');
 if(r.decision!=='APPROVED')fail('not_approved','the owner approval record does not say APPROVED');
 const expect={approval_ref:pkg.approval_ref,package_sha256:pkgEv.sha256,deployable_profile_sha256:pkg.deployable_profile_sha256_if_approved,environment:'preview',database_id:pkg.target.database_id,publisher_email:pkg.publisher_email,from_utc:pkg.window.from_utc,until_utc:pkg.window.until_utc,slots:pkg.totals.slots,total_maximum_row_changes:pkg.totals.maximum_row_changes,total_maximum_write_units:pkg.totals.maximum_write_units};
 for(const [k,v] of Object.entries(expect))if(r[k]!==v)fail('approval_mismatch',`approval ${k} does not match the package`);
 email(r.owner_email,'owner_email');
 if(typeof r.statement!=='string'||r.statement.length<20||r.statement.length>2000||!r.statement.includes(pkg.deployable_profile_sha256_if_approved))fail('approval_mismatch','the owner statement must quote the exact deployable profile SHA-256');
 const at=isoUtc(r.approved_at_utc,'approved_at_utc');
 if(at<Date.parse(pkg.evidence_policy.newest_capture_utc))fail('approval_mismatch','approval predates the inventory it approves');
 if(at>Date.parse(pkg.window.from_utc))fail('approval_mismatch','approval was recorded after the window opened');
 if(now!==undefined&&at>now)fail('approval_mismatch','approval is dated in the future');
 return {sha256:ev.sha256,approval_ref:r.approval_ref,owner_email:r.owner_email,approved_at_utc:r.approved_at_utc};
}

export const workerVariables=(pkg,profileSha)=>({TRACE_ENVIRONMENT:'preview',TRACE_IDENTITY_DATABASE_ID:pkg.target.database_id,TRACE_IDENTITY_TARGET_ATTESTATION_SHA256:pkg.target.target_attestation_sha256,TRACE_IDENTITY_IMPLEMENTATION_SHA256:pkg.plan.implementation_sha256,TRACE_IDENTITY_MAINTENANCE_ENABLED:'true',TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256:profileSha});

export function finalize(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true},'approval-record':{type:'string',required:true},'out-dir':{type:'string',required:true},'now':{type:'string'}});
 const dir=outputDirectory(a['out-dir']),now=a.now?isoUtc(a.now,'--now'):Date.now();
 const {ev,pkg,deployable}=loadPackage(a.package),approval=validateApproval(readEvidence(a['approval-record'],'owner approval record'),ev,pkg,now);
 if(now+CLOSING_MARGIN_MS>=Date.parse(pkg.window.until_utc))fail('window_expired','the approved window has closed; prepare a new package');
 const out=writeAddressed(dir,'n4-profile','json',deployable);
 if(out.sha256!==pkg.deployable_profile_sha256_if_approved)fail('package_inconsistent');
 return {action:'finalized',profile:out.path,deployable_profile_sha256:out.sha256,profile_bytes:deployable.length,approval_record_sha256:approval.sha256,expected_worker_variables:workerVariables(pkg,out.sha256),
  next_step:'Owner configures exactly these Worker variables (profile value = the file bytes), then records a deployment readback and runs verify-deployment --phase open before the first slot. Nothing has been configured or sent.',requests_sent:0};
}

const READBACK_VARS=['TRACE_ENVIRONMENT','TRACE_IDENTITY_DATABASE_ID','TRACE_IDENTITY_TARGET_ATTESTATION_SHA256','TRACE_IDENTITY_IMPLEMENTATION_SHA256','TRACE_IDENTITY_INVENTORY_ENABLED','TRACE_IDENTITY_MAINTENANCE_ENABLED','TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256'];
export function verifyDeployment(argv){
 const a=parseArgs(argv,{'package':{type:'string',required:true},'approval-record':{type:'string',required:true},'profile':{type:'string',required:true},'readback':{type:'string',required:true},'phase':{type:'string',required:true},'out-dir':{type:'string',required:true}});
 if(!['open','closure'].includes(a.phase))fail('malformed_input','--phase is open or closure');
 const dir=outputDirectory(a['out-dir']),{ev,pkg}=loadPackage(a.package),approval=validateApproval(readEvidence(a['approval-record'],'owner approval record'),ev,pkg);
 const prof=readEvidence(a.profile,'deployable profile');if(prof.sha256!==pkg.deployable_profile_sha256_if_approved)fail('profile_mismatch','profile file is not the approved deployable profile');
 validateProfile(prof.value,pkg.approval_ref);
 const rb=readEvidence(a.readback,'deployment readback'),r=rb.value;
 exactKeys(r,['schema','captured_at_utc','environment','worker_script','variables','secrets_present','import_gate','crons'],'deployment readback');
 if(r.schema!==SCHEMA.readback)fail('malformed_input','readback schema');
 exactKeys(r.variables,READBACK_VARS,'readback variables');exactKeys(r.secrets_present,['TRACE_INTERNAL_SERVICE_SECRET'],'readback secrets_present');
 const at=isoUtc(r.captured_at_utc,'readback captured_at_utc'),from=Date.parse(pkg.window.from_utc),until=Date.parse(pkg.window.until_utc),v=r.variables,expected=workerVariables(pkg,prof.sha256),checks=[];
 const check=(name,ok,detail)=>checks.push({check:name,result:ok?'PASS':'STOP',detail});
 check('readback_environment',r.environment==='preview'&&typeof r.worker_script==='string'&&r.worker_script.length>0,'Preview Worker environment');
 for(const k of ['TRACE_ENVIRONMENT','TRACE_IDENTITY_DATABASE_ID','TRACE_IDENTITY_TARGET_ATTESTATION_SHA256','TRACE_IDENTITY_IMPLEMENTATION_SHA256'])check('binding_'+k,v[k]===expected[k],`${k} must equal the approved value`);
 check('secret_present',r.secrets_present.TRACE_INTERNAL_SERVICE_SECRET===true,'presence only; the secret value is never read');
 check('import_gate_closed',r.import_gate!=='true','TRACE_NEWS_IMPORT_ENABLED must not be true');
 check('crons_empty',Array.isArray(r.crons)&&r.crons.length===0,'crons = [] (STOP-BURN)');
 if(a.phase==='open'){
  check('maintenance_enabled',v.TRACE_IDENTITY_MAINTENANCE_ENABLED==='true','maintenance flag set for the approved window');
  check('profile_matches_approval',v.TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256===prof.sha256,'deployed profile hash equals the owner-approved hash');
  check('readback_after_approval',at>=Date.parse(approval.approved_at_utc),'configuration follows approval');
  check('readback_before_window_close',at+CLOSING_MARGIN_MS<until,'verified before the closing margin');
 }else{
  check('maintenance_disabled',v.TRACE_IDENTITY_MAINTENANCE_ENABLED!=='true','maintenance flag removed or false');
  check('profile_removed',v.TRACE_IDENTITY_MAINTENANCE_PROFILE_SHA256===null,'profile variable removed');
  check('readback_after_window_open',at>=from,'closure is recorded after the window opened');
 }
 const result={schema:SCHEMA.verification,phase:a.phase,disposition:checks.every(c=>c.result==='PASS')?'PASS':'STOP',package_sha256:ev.sha256,approval_record_sha256:approval.sha256,deployable_profile_sha256:prof.sha256,readback_sha256:rb.sha256,readback_captured_at_utc:r.captured_at_utc,
  inventory_flag:v.TRACE_IDENTITY_INVENTORY_ENABLED,closed_after_window:a.phase==='closure'?at>=until:null,checks,
  notice:'Compares an owner-recorded readback with the approval. It does not read Cloudflare and is not independent proof of the deployed state.'};
 const out=writeAddressed(dir,`n4-deployment-${a.phase}`,'json',jsonBytes(result));
 return {action:'verified',phase:a.phase,disposition:result.disposition,verification:out.path,verification_sha256:out.sha256,failed:checks.filter(c=>c.result!=='PASS').map(c=>c.check)};
}

const COMMANDS={prepare,'approval-template':approvalTemplate,finalize,'verify-deployment':verifyDeployment};
if(isEntry(import.meta.url)){
 main(([command,...rest])=>{const run=COMMANDS[command];if(!run)fail('unknown_command',`use one of: ${Object.keys(COMMANDS).join(', ')}`);return run(rest);});
}
