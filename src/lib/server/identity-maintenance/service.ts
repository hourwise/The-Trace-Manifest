import {canonical,sha256} from '../news-import/runtime/primitives';
import {candidateUrlIdentity} from '../candidate-identity';
import {inspectCandidateIdentities,prepareCandidateIdentityBackfill,type Actor} from '../news-import/service';
import {IDENTITY_WRITE_INDEXES} from './index-certificate';
import {IdentityError,N4_VERSION,approvedProfile,type IdentityEnvironment} from './contract';

const predicate='source_url_hash IS NULL AND submitted_url IS NOT NULL AND source_url_identity_issue IS NULL';
const eventId=(id:string)=>'n4-identity:'+id;
function publisher(actor:Actor){if(actor.role!=='publisher'||!/^\S+@\S+\.\S+$/.test(actor.email)||actor.email.length>200)throw new IdentityError('identity_publisher_required',403);}
interface Snapshot {sql:string;parameters:unknown[];value:string;rows:any[][]}
async function snapshot(db:D1Database,after:string,limit:number):Promise<Snapshot>{
 const columns=['substr(id,1,201) AS id','length(id) AS id_length','substr(submitted_url,1,4097) AS url','length(submitted_url) AS url_length','substr(source_hash,1,257) AS hash','length(source_hash) AS hash_length','substr(lead_text,1,8193) AS lead','length(lead_text) AS lead_length','state','intake_type','substr(created_by,1,201) AS creator','length(created_by) AS creator_length','substr(created_at,1,201) AS created','length(created_at) AS created_length','substr(reviewed_by,1,201) AS reviewer','length(reviewed_by) AS reviewer_length','substr(reviewed_at,1,201) AS reviewed','length(reviewed_at) AS reviewed_length','substr(updated_at,1,201) AS updated','length(updated_at) AS updated_length'];
 const names=columns.map(c=>c.includes(' AS ')?c.split(' AS ')[1]:c);
 const sql=`SELECT json_group_array(json_array(${names.join(',')})) AS value FROM (SELECT ${columns.join(',')} FROM editorial_candidates INDEXED BY idx_editorial_candidate_unindexed_url WHERE id>? AND ${predicate} ORDER BY id LIMIT ?)`;
 const row=await db.prepare(sql).bind(after,limit+1).first<{value:string}>(),value=row?.value??'[]';
 if(new TextEncoder().encode(value).length>400000)throw new IdentityError('identity_snapshot_byte_bound');
 return {sql,parameters:[after,limit+1],value,rows:JSON.parse(value)};
}
function snapshotGuard(db:D1Database,s:Snapshot){return db.prepare(`SELECT json(CASE WHEN (${s.sql})=? THEN '{}' ELSE 'stale_identity_work_selection' END)`).bind(...s.parameters,s.value);}
async function schemaReady(db:D1Database){
 const row=await db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_editorial_candidate_unindexed_url' LIMIT 1").first<{sql:string}>();
 return !!row?.sql&&/source_url_identity_issue/.test(row.sql);
}
async function inspected(db:D1Database,actor:Actor,after:string,limit:number,summary=true){
 if(!await schemaReady(db))throw new IdentityError('identity_schema_0080_required',503);
 const s=await snapshot(db,after,limit);
 if(s.rows.some(r=>r[1]>200))throw new IdentityError('identity_legacy_id_exceeds_bound');
 const page=await inspectCandidateIdentities(db,actor,after,limit);
 // Reconcile the accepted classifier against the independent state/history snapshot.
 if(canonical(page.rows.map(r=>[r.id,r.submitted_url,r.url_length,r.source_hash]))!==canonical(s.rows.slice(0,limit).map(r=>[r[0],r[2],r[3],r[4]])))throw new IdentityError('identity_selection_changed');
 const rows=[];for(const row of page.rows){
  const raw=s.rows.find(r=>r[0]===row.id)!;let conflict=raw[5]>256||raw[7]>8192||[11,13,15,17,19].some(i=>raw[i]>200)?'protected_field_exceeds_bound':(!row.canonical_hash&&!row.issue?'unclassifiable_empty_url':null);
  let peerIds:string[]=[];
  if(row.canonical_hash){const peers=await db.prepare('SELECT substr(id,1,201) AS id,length(id) AS id_length,substr(submitted_url,1,4097) AS url,length(submitted_url) AS url_length FROM editorial_candidates INDEXED BY idx_editorial_candidate_url_hash WHERE source_url_hash=? AND id<>? ORDER BY source_url_hash,id LIMIT 2').bind(row.canonical_hash,row.id).all<{id:string;id_length:number;url:string;url_length:number}>();
   peerIds=peers.results.map(p=>p.id);for(const peer of peers.results)if(peer.id_length>200||peer.url_length>4096||(await candidateUrlIdentity(peer.url)).hash!==row.canonical_hash)conflict='conflicting_indexed_identity';
  }
  rows.push({id:row.id,url_fingerprint:sha256(row.submitted_url+':'+row.url_length),url_length:row.url_length,canonical_hash:row.canonical_hash,issue:row.issue,conflict,indexed_duplicate_sample:peerIds});
 }
 const n=rows.length,selection=sha256(canonical({schema:N4_VERSION,after,limit,snapshot:s.rows}));
 let pending:number|null=null,indexedSample:string|null=null;
 if(summary){pending=Number((await db.prepare(`SELECT count(*) AS n FROM (SELECT id FROM editorial_candidates INDEXED BY idx_editorial_candidate_unindexed_url WHERE ${predicate} ORDER BY id LIMIT 51)`).first<{n:number}>())?.n??0);indexedSample=(await db.prepare("SELECT 'present' AS id FROM editorial_candidates INDEXED BY idx_editorial_candidate_url_hash WHERE source_url_hash>'' ORDER BY source_url_hash,id LIMIT 1").first<{id:string}>())?.id??null;}
 return {snapshot:s,page,view:{schema:N4_VERSION,after,limit,selection_sha256:selection,rows,has_more:page.has_more,next_cursor:page.next_cursor,known_pending_lower_bound:pending,pending_count_exact:pending!==null&&pending<51,missing_identity_guard_blocked:pending===null?null:pending>50,package_import_readiness:'NOT_ESTABLISHED_REQUIRES_SPECIFIC_PACKAGE_PREFLIGHT',already_indexed_observed_lower_bound:indexedSample?1:0,already_indexed_global_count:null,previously_deferred_global_count:null,invalid_in_page:rows.filter(r=>r.issue==='invalid_url').length,oversize_in_page:rows.filter(r=>r.issue==='oversize_url').length,conflicts_in_page:rows.filter(r=>r.conflict).length,estimated_row_changes:n?n+2:0,estimated_write_units:n?5*n+8:0,inspection_writes:0,scan_page_bound:limit+1,duplicate_samples_complete:false}};
}
export async function inspectIdentityPage(db:D1Database,actor:Actor,after:string,limit:number){publisher(actor);return (await inspected(db,actor,after,limit)).view;}

async function indexCertificate(db:D1Database):Promise<Snapshot>{
 const sql="SELECT json_group_array(json_array(name,tbl_name,sql)) AS value FROM (SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('editorial_candidates','admin_request_nonces','admin_audit_log') ORDER BY name LIMIT 12)";
 const value=(await db.prepare(sql).first<{value:string}>())?.value??'[]',rows=JSON.parse(value);
 if(canonical(rows.map(([name,table,sql]:any[])=>[name,table,sql===null?null:String(sql).trim().replace(/\s+/g,' ')]))!==canonical(IDENTITY_WRITE_INDEXES))throw new IdentityError('identity_uncertified_write_indexes');
 return {sql,parameters:[],value,rows};
}
export async function readIdentityReceipt(db:D1Database,actor:Actor,requestId:string){
 publisher(actor);const row=await db.prepare("SELECT operator_email,operator_role,action,request_id,substr(detail_code,1,16385) AS detail_code,length(detail_code) AS detail_length FROM admin_audit_log WHERE event_id=? LIMIT 1").bind(eventId(requestId)).first<{operator_email:string;operator_role:string;action:string;request_id:string;detail_code:string;detail_length:number}>();
 if(!row)return null;
 try{if(row.detail_length>16384||new TextEncoder().encode(row.detail_code).length>16384)throw new Error();const receipt=JSON.parse(row.detail_code),{receipt_sha256,...body}=receipt;if(row.operator_email!==actor.email||row.operator_role!=='publisher'||row.action!=='identity_maintenance_n4'||row.request_id!==requestId||receipt.schema!==N4_VERSION||receipt.request_id!==requestId||sha256(canonical(body))!==receipt_sha256)throw new Error();return receipt;}catch{throw new IdentityError('identity_receipt_integrity_failed');}
}
export async function applyIdentityBatch(env:IdentityEnvironment,actor:Actor,input:{approval_ref:string;request_id:string;after:string;selection_sha256:string}){
 publisher(actor);const profile=approvedProfile(env,actor.email),approved=profile.requests.find(r=>r.request_id===input.request_id);
 if(input.approval_ref!==profile.approval_ref||!approved||input.after!==approved.after||input.selection_sha256!==approved.selection_sha256)throw new IdentityError('identity_request_not_approved',403);
 const requestHash=sha256(canonical({input,profile})),old=await readIdentityReceipt(env.DB,actor,input.request_id);
 if(old){if(old.request_hash!==requestHash)throw new IdentityError('identity_conflicting_request');return {schema:N4_VERSION,request_id:input.request_id,receipt:old,replayed:true,original_writes:old.writes,writes:0};}
 const selected=await inspected(env.DB,actor,input.after,approved.limit,false),n=selected.view.rows.length;
 if(selected.view.selection_sha256!==approved.selection_sha256)throw new IdentityError('identity_stale_selection');
 if(!n)throw new IdentityError('identity_empty_selection');
 if(selected.view.conflicts_in_page)throw new IdentityError('identity_unresolved_conflict');
 const changes=n+2,writeUnits=5*n+8;
 if(changes>approved.maximum_row_changes||writeUnits>approved.maximum_write_units)throw new IdentityError('identity_precommit_write_budget');
 const plan=await prepareCandidateIdentityBackfill(env.DB,actor,input.after,approved.limit,26),indexes=await indexCertificate(env.DB);
 if(canonical(plan.page.rows.map(r=>r.id))!==canonical(selected.view.rows.map(r=>r.id)))throw new IdentityError('identity_selection_changed');
 const receiptBody={schema:N4_VERSION,approval_ref:profile.approval_ref,request_id:input.request_id,request_hash:requestHash,environment:profile.environment,database_id:profile.database_id,target_attestation_sha256:profile.target_attestation_sha256,implementation_sha256:profile.implementation_sha256,migration_sha256:profile.migration_sha256,publisher:actor.email,selection_sha256:approved.selection_sha256,after:input.after,...plan.result,writes:changes,reserved_write_units:writeUnits,maximum_row_changes:approved.maximum_row_changes,maximum_write_units:approved.maximum_write_units,replayed:false,canonical_admissions:0,editorial_state_changes:0};
 const receipt={...receiptBody,receipt_sha256:sha256(canonical(receiptBody))};
 const detail=canonical(receipt);if(new TextEncoder().encode(detail).length>16384)throw new IdentityError('identity_receipt_byte_bound');
 const db=env.DB,from=Date.parse(profile.from_utc),until=Date.parse(profile.until_utc);
 const statements=[snapshotGuard(db,selected.snapshot),snapshotGuard(db,indexes),db.prepare("SELECT json(CASE WHEN CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)>=? AND CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)+15000<? THEN '{}' ELSE 'identity_window_changed' END)").bind(from,until),db.prepare("INSERT INTO admin_request_nonces(nonce,operator_hash,expires_at) VALUES (?,?,datetime('now','+2 minutes'))").bind(actor.nonce!,sha256(actor.email)),...plan.statements.slice(0,-1),db.prepare("INSERT INTO admin_audit_log(event_id,operator_email,operator_role,action,target_type,target_id,request_id,outcome,detail_code) VALUES (?,?,'publisher','identity_maintenance_n4','identity_batch',?,?,'succeeded',?)").bind(eventId(input.request_id),actor.email,plan.result.next_cursor,input.request_id,detail)];
 if(statements.length>56)throw new IdentityError('identity_statement_budget');
 approvedProfile(env,actor.email);
 let results:D1Result[];
 try{results=await db.batch(statements);}catch{
  if(await db.prepare('SELECT nonce FROM admin_request_nonces WHERE nonce=? LIMIT 1').bind(actor.nonce!).first())throw new IdentityError('identity_nonce_replayed');
  const concurrent=await readIdentityReceipt(db,actor,input.request_id);if(concurrent&&concurrent.request_hash===requestHash)return {schema:N4_VERSION,request_id:input.request_id,receipt:concurrent,replayed:true,original_writes:concurrent.writes,writes:0};
  throw new IdentityError('identity_batch_aborted_reconcile');
 }
 if(results.length!==statements.length||results.some(r=>!r.success||!Number.isSafeInteger(r.meta?.changes)||r.meta.changes<0)||results.reduce((n,r)=>n+r.meta.changes,0)!==changes)throw new IdentityError('identity_committed_accounting_unavailable');
 const providerRows=results.every(r=>Number.isSafeInteger(r.meta?.rows_written))?results.reduce((n,r)=>n+r.meta.rows_written,0):null;
 if(providerRows!==null&&providerRows>approved.maximum_write_units)throw new IdentityError('identity_provider_write_bound_exceeded_reconcile');
 return {schema:N4_VERSION,request_id:input.request_id,receipt,replayed:false,writes:changes,batch_statements:statements.length,provider_rows_written:providerRows,provider_accounting_available:providerRows!==null};
}
