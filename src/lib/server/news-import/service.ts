import {candidateUrlIdentity} from '../candidate-identity';
import {EXPECTED_IMPORT_TRIGGERS} from './expected-triggers';
import {canonical,sha256} from './runtime/primitives';
import {validateBundle} from './runtime/bundle';
import {registration} from './runtime/registry';
import {canonicalSourceUrl,sourceUrlHash,classifySourceRelationship} from '../source-identity';

export const IMPORT_VERSION='trace-news-review-held-p4-r2.1';
export const IDENTITY_REFERENCE='f2237041150634b061affea9acec87084e400ea6';
export interface Actor {email:string;role:string;requestId:string;nonce?:string}
export class NewsImportError extends Error {constructor(public code:string,public status=409){super(code);}}
function publisher(actor:Actor){if(actor.role!=='publisher'||!/^\S+@\S+\.\S+$/.test(actor.email)||actor.email.length>200||!actor.requestId||actor.requestId.length>100)throw new NewsImportError('publisher_required',403);}
interface Snapshot {sql:string;parameters:unknown[];value:string;rows:any[][]}
async function snapshot(db:D1Database,columns:string[],from:string,where:string,parameters:unknown[],order:string,limit:number):Promise<Snapshot>{
 const sql=`SELECT json_group_array(json_array(${columns.map(c=>c.includes(' AS ')?c.split(' AS ').at(-1):c.split('.').at(-1)).join(',')})) AS value FROM (SELECT ${columns.join(',')} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${limit})`;
 const row=await db.prepare(sql).bind(...parameters).first<{value:string}>();const value=row?.value??'[]';return {sql,parameters,value,rows:JSON.parse(value)};
}
function guard(db:D1Database,s:Snapshot){return db.prepare(`SELECT json(CASE WHEN (${s.sql})=? THEN '{}' ELSE 'stale_news_import' END)`).bind(...s.parameters,s.value);}
function audit(db:D1Database,actor:Actor,id:string,action:string,target:string,reason:string){return db.prepare(`INSERT INTO admin_audit_log(event_id,operator_email,operator_role,action,target_type,target_id,request_id,outcome,detail_code) VALUES (?,?,'publisher',?,'editorial_candidate',?,?,'succeeded',?)`).bind(id,actor.email,action,target,actor.requestId,reason);}
function nonceStatement(db:D1Database,actor:Actor):D1PreparedStatement[]{return actor.nonce?[db.prepare(`INSERT INTO admin_request_nonces(nonce,operator_hash,expires_at) VALUES (?,?,datetime('now','+2 minutes'))`).bind(actor.nonce,sha256(actor.email))]:[];}
function compatibleHash(row:any[],urlHash:string){const [,url,hash,,lead,,intake]=row;return hash===urlHash||hash===sha256(`${intake}\n${url??''}\n${lead??''}`);}
async function candidateSnapshot(db:D1Database,hashes:string[]):Promise<Snapshot>{
 // Each ordered index walk stops at 51 BEFORE the outer merge/sort. A single
 // OR + ORDER BY could otherwise sort an unbounded matching legacy backlog.
 const fields='id,substr(submitted_url,1,4097) AS submitted_url,substr(source_hash,1,129) AS source_hash,source_url_hash,substr(lead_text,1,8193) AS lead_text,state,intake_type';
 const select=`SELECT * FROM (SELECT ${fields} FROM editorial_candidates INDEXED BY idx_editorial_candidate_url_hash WHERE source_url_hash IN (${hashes.map(()=>'?')}) ORDER BY source_url_hash,id LIMIT 51) UNION ALL SELECT * FROM (SELECT ${fields} FROM editorial_candidates INDEXED BY idx_editorial_candidate_unindexed_url WHERE source_url_hash IS NULL AND submitted_url IS NOT NULL AND source_url_identity_issue IS NULL ORDER BY id LIMIT 51) ORDER BY id LIMIT 51`;
 const sql=`SELECT json_group_array(json_array(id,submitted_url,source_hash,source_url_hash,lead_text,state,intake_type)) AS value FROM (${select})`,row=await db.prepare(sql).bind(...hashes).first<{value:string}>(),value=row?.value??'[]';return {sql,parameters:hashes,value,rows:JSON.parse(value)};
}
async function feedSnapshot(db:D1Database,hashes:string[]){return snapshot(db,['id','url','url_hash','source_id','ingestion_status'],'feed_items',`url_hash IN (${hashes.map(()=>'?')})`,hashes,'id',11);}
async function membershipSnapshot(db:D1Database,hashes:string[]):Promise<Snapshot>{
 // URL equality is unique. CROSS JOIN pins each probe to the reverse index;
 // its natural order makes LIMIT 5 effective before any outer sorting.
 const probe=`SELECT m.feed_item_id,m.cluster_id,s.publication_status,s.title FROM feed_items f INDEXED BY idx_feed_items_url_hash CROSS JOIN story_cluster_members m INDEXED BY idx_story_cluster_members_feed_item_primary_cluster JOIN story_clusters s ON s.id=m.cluster_id WHERE f.url_hash=? AND m.feed_item_id=f.id ORDER BY m.is_primary DESC,m.cluster_id LIMIT 5`;
 const sql=`SELECT json_group_array(json_array(feed_item_id,cluster_id,publication_status,title)) AS value FROM (${hashes.map(()=>`SELECT * FROM (${probe})`).join(' UNION ALL ')} ORDER BY feed_item_id,cluster_id)`,row=await db.prepare(sql).bind(...hashes).first<{value:string}>(),value=row?.value??'[]';return {sql,parameters:hashes,value,rows:JSON.parse(value)};
}
function relationship(rows:any[][]){return classifySourceRelationship(rows.map(r=>({feedItemId:r[0],clusterId:r[1],publicationStatus:r[2],title:r[3]})));}
async function existingReceipt(db:D1Database,id:string,hash:string){const old=await db.prepare('SELECT bundle_hash,receipt_json FROM news_import_packages WHERE package_id=? LIMIT 1').bind(id).first<{bundle_hash:string;receipt_json:string}>();if(!old)return null;if(old.bundle_hash!==hash)throw new NewsImportError('conflicting_package_identity');return {...JSON.parse(old.receipt_json),replayed:true,writes:0,batch_statements:0};}

async function certifiedMutationTriggers(db:D1Database){
 const triggers=await snapshot(db,['name','sql'],'sqlite_master',"type='trigger' AND tbl_name IN ('editorial_candidates','admin_audit_log','admin_request_nonces','news_import_packages','news_import_versions','news_import_deliveries','news_import_proposals','news_import_events','news_import_version_links')",[],'name',33);
 if(canonical(triggers.rows.map(([name,sql])=>({name,sql:String(sql).trim().replace(/\s+/g,' ')})))!==canonical(EXPECTED_IMPORT_TRIGGERS))throw new NewsImportError('uncertified_mutation_triggers');
 return triggers;
}

/** No feed_items or clusters are created here. Frozen source bodies live in the
 * immutable package; proposals enter the existing Desk as held, never approved. */
export async function importNewsPackage(db:D1Database,value:unknown,expectedHash:string,actor:Actor,dryRun=false,writeLimit=64){
 if(!Number.isInteger(writeLimit)||writeLimit<1||writeLimit>64)throw new NewsImportError('invalid_write_budget',400);
 publisher(actor);const {bundle,payload}=validateBundle(value,expectedHash);
 if(payload.candidates.length<1)throw new NewsImportError('empty_package',400);
 const replay=await existingReceipt(db,bundle.package_id,expectedHash);if(replay)return replay;
 const candidates=payload.candidates as any[],hashes=[...new Set<string>(candidates.map(c=>c.duplicate_identity.url_hash))];
 for(const c of candidates)if(canonicalSourceUrl(c.canonical_url)!==c.canonical_url||await sourceUrlHash(c.canonical_url)!==c.duplicate_identity.url_hash)throw new NewsImportError('current_source_identity_mismatch');
 const registrations=[...new Set<string>(candidates.map(c=>c.source.id))].map(registration);
 const sources=await snapshot(db,['id','name','url','feed_url'],'sources',`id IN (${registrations.map(()=>'?')})`,registrations.map(r=>r.editorial_id),'id',11);
 for(const r of registrations){const row=sources.rows.find(x=>x[0]===r.editorial_id);if(!row||row[1]!==r.name||row[2]!==r.home||row[3]!==r.source.feed_url)throw new NewsImportError('source_registry_binding_mismatch');}
 const triggers=await certifiedMutationTriggers(db);
 const cs=await candidateSnapshot(db,hashes),fs=await feedSnapshot(db,hashes),ms=await membershipSnapshot(db,hashes);
 if(cs.rows.length>50)throw new NewsImportError('bounded_identity_backfill_required');if(ms.rows.some(r=>ms.rows.filter(x=>x[0]===r[0]).length>4))throw new NewsImportError('membership_ambiguity_exceeds_bound');
 for(const f of fs.rows)if(await sourceUrlHash(f[1])!==f[2])throw new NewsImportError('inconsistent_existing_feed_hash');
 const owners=new Map<string,any[][]>();for(const row of cs.rows){if(typeof row[1]!=='string'||row[1].length>4096||typeof row[4]==='string'&&row[4].length>8192)throw new NewsImportError('historical_candidate_exceeds_bound');const hash=await sourceUrlHash(row[1]);if(row[3]!==null&&row[3]!==hash)throw new NewsImportError('inconsistent_candidate_url_index');if(hashes.includes(hash))owners.set(hash,[...(owners.get(hash)??[]),row]);}
 const statements:D1PreparedStatement[]=[db.prepare(`SELECT json(CASE WHEN NOT EXISTS(SELECT 1 FROM news_import_packages WHERE package_id=?) THEN '{}' ELSE 'concurrent_news_import' END)`).bind(bundle.package_id),...([triggers,sources,cs,fs,ms].map(s=>guard(db,s))),...nonceStatement(db,actor)];
 const history=await snapshot(db,['v.version_id','v.url_hash','v.candidate_id','p.review_state','p.revision'],'news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id',`v.url_hash IN (${hashes.map(()=>'?')})`,hashes,'v.url_hash,v.version_id',201);
 if(history.rows.length>200||hashes.some(h=>history.rows.filter(r=>r[1]===h).length>20))throw new NewsImportError('version_history_bound');
 statements.push(guard(db,history));
 const operations:any[]=[];const mutations:D1PreparedStatement[]=[];const plannedVersions=new Map<string,string[]>();let newCandidates=0,newVersions=0;

 for(const c of candidates){
  const h=c.duplicate_identity.url_hash,existing=owners.get(h)??[],lead=c.title+'\n\n'+c.excerpt;
  const old=await db.prepare('SELECT v.version_id,v.item_id,v.content_hash,v.url_hash,v.candidate_id,p.review_state FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id WHERE v.version_id=? LIMIT 1').bind(c.candidate_id).first<any>();
  if(old&&(old.item_id!==c.item_id||old.content_hash!==c.content_hash||old.url_hash!==h))throw new NewsImportError('immutable_version_conflict');
  const id=old?.candidate_id??'local-news-p4:'+c.candidate_id,feed=fs.rows.find(r=>r[2]===h),relation=relationship(ms.rows.filter(r=>r[0]===feed?.[0]));
  const related=[...history.rows.filter(r=>r[1]===h&&r[0]!==c.candidate_id).map(r=>r[0]),...(plannedVersions.get(h)??[])];
  const reasons={policy:'version_owned_review_p4_r2',version_relationship:'same_canonical_url_order_unverified',related_versions:related,relationship:relation,source_identity_conflict:!!feed&&feed[3]!==registration(c.source.id).editorial_id,related_candidates:existing.map(r=>({id:r[0],state:r[5],hash_compatible:compatibleHash(r,h),same_lead:[c.title,c.excerpt,lead].includes(r[4])})),differing_leads_preserved:existing.some(r=>![c.title,c.excerpt,lead].includes(r[4]))};
  if(!old){newCandidates++;mutations.push(db.prepare(`INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,source_url_hash,state,urgency,created_by) VALUES (?,'manual_url',?,?,?,?,'held','normal',?)`).bind(id,c.canonical_url,lead,h,h,actor.email));}
  if(!old)plannedVersions.set(h,[...(plannedVersions.get(h)??[]),c.candidate_id]);
  if(!old){newVersions++;mutations.push(db.prepare(`INSERT INTO news_import_versions(version_id,item_id,source_key,content_hash,url_hash,source_hash,candidate_id,retrieved_at,proposal_json) VALUES (?,?,?,?,?,?,?,?,?)`).bind(c.candidate_id,c.item_id,c.source.id,c.content_hash,h,c.source_hash,id,c.retrieved_at,canonical(c)),db.prepare(`INSERT INTO news_import_proposals(version_id,hold_reason) VALUES (?,?)`).bind(c.candidate_id,canonical(reasons)));}
  if(!old)for(const relatedId of related)mutations.push(db.prepare("INSERT INTO news_import_version_links(version_id,related_version_id,relationship) VALUES (?,?,'same_canonical_url_order_unverified')").bind(c.candidate_id,relatedId));
  mutations.push(db.prepare('INSERT INTO news_import_deliveries(package_id,version_id) VALUES (?,?)').bind(bundle.package_id,c.candidate_id),db.prepare(`INSERT INTO news_import_events(event_id,version_id,operator_email,operator_role,action,reason,request_id) VALUES (?,?,?,'publisher',?,?,?)`).bind(expectedHash+':'+c.candidate_id,c.candidate_id,actor.email,old?'import_existing':'import_held',canonical(reasons),actor.requestId),audit(db,actor,expectedHash+':'+c.candidate_id,old?'news_import_existing':'news_import_held',id,'unverified:'+c.candidate_id));
  operations.push({version_id:c.candidate_id,item_id:c.item_id,url_hash:h,candidate_id:id,reused_candidate:!!old,review_state:old?.review_state??'held',reason:reasons});
 }
 const receipt={importer:IMPORT_VERSION,identity_reference:IDENTITY_REFERENCE,package_id:bundle.package_id,bundle_sha256:expectedHash,item_count:candidates.length,candidates_created:newCandidates,candidates_reused:candidates.length-newCandidates,source_versions_created:newVersions,feed_items_created:0,cluster_writes:0,publication_writes:0,canonical_admissions:0,operations,replayed:false};
 const recordBytes=Buffer.byteLength(canonical(bundle))+Buffer.byteLength(canonical(receipt));
 if(recordBytes>1048576)throw new NewsImportError('import_record_byte_bound');
 statements.push(db.prepare('INSERT INTO news_import_packages(package_id,bundle_hash,payload_hash,bundle_json,receipt_json,imported_by,request_id) VALUES (?,?,?,?,?,?,?)').bind(bundle.package_id,expectedHash,bundle.payload_sha256,canonical(bundle),canonical(receipt),actor.email,actor.requestId),...mutations);
 const bounds={batch_statements:statements.length,maximum_expected_row_writes:1+mutations.length+(actor.nonce?1:0),maximum_bound_parameters:Math.max(9,...[sources,cs,fs,ms,history].map(s=>s.parameters.length+1)),package_record_bytes:recordBytes,maximum_package_record_bytes:1048576};
 if(bounds.maximum_expected_row_writes>writeLimit)throw new NewsImportError('write_budget_exceeded');
 if(dryRun)return {...receipt,...bounds,dry_run:true,writes:0};
 let results:D1Result[];
 try{results=await db.batch(statements);}catch(error){const concurrent=await existingReceipt(db,bundle.package_id,expectedHash);if(concurrent)throw new NewsImportError('batch_error_receipt_present_inspect_before_replay');throw error;}
 if(results.length!==statements.length||results.some(r=>!r.success||!Number.isSafeInteger(r.meta?.changes)||r.meta.changes<0))throw new NewsImportError('committed_accounting_unavailable');
 const writes=results.reduce((n,r)=>n+r.meta.changes,0);
 if(writes>writeLimit)throw new NewsImportError('committed_write_bound_exceeded');
 return {...receipt,...bounds,writes};
}

export type ReviewState='held'|'needs_review'|'rejected';
export async function listNewsProposalPage(db:D1Database,actor:Actor,options:{state?:string;after?:string;limit?:number;focus?:string}={}){
 publisher(actor);const state=options.state??'held',after=options.after??'',limit=options.limit??10;
 if(!['held','needs_review','rejected'].includes(state)||!Number.isInteger(limit)||limit<1||limit>20||after!==''&&!/^[a-f0-9]{64}$/.test(after)||options.focus&&!/^[a-f0-9]{64}$/.test(options.focus))throw new NewsImportError('invalid_review_page',400);
 if(!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_import_proposals'").first())return {items:[] as any[],nextCursor:null as string|null,state};
 const select=`SELECT v.version_id,v.url_hash,v.candidate_id,v.proposal_json,p.review_state,p.revision,p.hold_reason,c.state AS candidate_state FROM news_import_proposals p INDEXED BY news_import_proposals_review JOIN news_import_versions v ON v.version_id=p.version_id JOIN editorial_candidates c ON c.id=v.candidate_id`;
 const query=options.focus?db.prepare(select.replace(' INDEXED BY news_import_proposals_review','')+' WHERE p.version_id=? LIMIT 1').bind(options.focus):db.prepare(select+' WHERE p.review_state=? AND p.version_id>? ORDER BY p.version_id LIMIT ?').bind(state,after,limit+1);
 const {results}=await query.all<any>(),items=results.slice(0,limit).map(r=>({...r,proposal:JSON.parse(r.proposal_json),hold_reason:JSON.parse(r.hold_reason),review_required:true,verification_status:'unverified'}));
 return {items,nextCursor:!options.focus&&results.length>limit?items.at(-1)!.version_id as string:null,state};
}
/** Compatibility wrapper; UI uses the explicit keyset page and navigation. */
export async function listNewsProposals(db:D1Database,actor:Actor,limit=10){return (await listNewsProposalPage(db,actor,{limit})).items;}
export async function governedNewsOwners(db:D1Database,ids:string[]){
 if(ids.length>50)throw new NewsImportError('owner_lookup_bound');const owners=new Map<string,{version_id:string;review_state:string}>();
 if(!ids.length||!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_import_proposals'").first())return owners;
 const {results}=await db.prepare(`SELECT v.candidate_id,v.version_id,p.review_state FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id WHERE v.candidate_id IN (${ids.map(()=>'?')})`).bind(...ids).all<{candidate_id:string;version_id:string;review_state:string}>();
 for(const row of results)owners.set(row.candidate_id,row);return owners;
}

export async function resolveNewsProposal(db:D1Database,input:{versionId:string;revision:number;action:'release'|'reject';reason:string},actor:Actor){
 publisher(actor);if(!/^[a-f0-9]{64}$/.test(input.versionId)||!Number.isSafeInteger(input.revision)||input.revision<0||!['release','reject'].includes(input.action)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw new NewsImportError('invalid_resolution',400);
 const row=await db.prepare(`SELECT p.review_state,p.revision,v.candidate_id,v.url_hash,v.source_key,c.state,c.submitted_url,c.lead_text FROM news_import_proposals p JOIN news_import_versions v ON v.version_id=p.version_id JOIN editorial_candidates c ON c.id=v.candidate_id WHERE p.version_id=? LIMIT 1`).bind(input.versionId).first<any>();
 if(!row||row.review_state!=='held'||row.revision!==input.revision)throw new NewsImportError('stale_review_transition');
 const fs=await feedSnapshot(db,[row.url_hash]),ms=await membershipSnapshot(db,[row.url_hash]);
 const registered=registration(row.source_key),binding=await snapshot(db,['id','name','url','feed_url'],'sources','id=?',[registered.editorial_id],'id',1);
 if(input.action==='release'&&(!binding.rows.length||binding.rows[0][1]!==registered.name||binding.rows[0][2]!==registered.home||binding.rows[0][3]!==registered.source.feed_url||fs.rows.some(f=>f[3]!==registered.editorial_id)))throw new NewsImportError('unsafe_release_source_registry_conflict');
 if(input.action==='release'&&(relationship(ms.rows).kind!=='new'||!['held','new','needs_review'].includes(row.state)))throw new NewsImportError('unsafe_release_existing_cluster_or_state');
 if(input.action==='release'&&await sourceUrlHash(row.submitted_url)!==row.url_hash)throw new NewsImportError('source_identity_changed');
 const state=input.action==='release'?'needs_review':'rejected';
 const statements=[guard(db,binding),guard(db,fs),guard(db,ms),db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM news_import_proposals p JOIN news_import_versions v ON v.version_id=p.version_id JOIN editorial_candidates c ON c.id=v.candidate_id WHERE p.version_id=? AND p.review_state='held' AND p.revision=? AND c.state=? AND c.submitted_url=? AND c.lead_text IS ?) THEN '{}' ELSE 'stale_review' END)`).bind(input.versionId,input.revision,row.state,row.submitted_url,row.lead_text),...nonceStatement(db,actor),db.prepare(`UPDATE news_import_proposals SET review_state=?,revision=revision+1,reviewed_by=?,review_reason=?,reviewed_at=datetime('now') WHERE version_id=? AND revision=? AND review_state='held'`).bind(state,actor.email,input.reason,input.versionId,input.revision)];
 // One immutable version owns this candidate; other versions and external
 // Desk/Capture identities retain their own independent decisions.
 statements.push(db.prepare(`INSERT INTO news_import_events(event_id,version_id,operator_email,operator_role,action,reason,request_id) VALUES (?,?,?,'publisher',?,?,?)`).bind(actor.requestId+':review',input.versionId,actor.email,input.action,input.reason,actor.requestId),audit(db,actor,actor.requestId+':news-review','news_import_'+input.action,row.candidate_id,input.reason));
 const results=await db.batch(statements);return {state,revision:input.revision+1,writes:results.reduce((n,r)=>n+Number(r.meta.changes??0),0),publication_writes:0,cluster_writes:0};
}

/** Read-only indexed probe. It reports a lower bound, never scans all rows. */
export async function inspectCandidateIdentities(db:D1Database,actor:Actor,after='',limit=25){
 publisher(actor);if(!Number.isInteger(limit)||limit<1||limit>25||after.length>200)throw new NewsImportError('backfill_bound',400);
 const {results}=await db.prepare("SELECT id,substr(submitted_url,1,4097) AS submitted_url,length(submitted_url) AS url_length,substr(source_hash,1,257) AS source_hash FROM editorial_candidates INDEXED BY idx_editorial_candidate_unindexed_url WHERE id>? AND submitted_url IS NOT NULL AND source_url_hash IS NULL AND source_url_identity_issue IS NULL ORDER BY id LIMIT ?").bind(after,limit+1).all<{id:string;submitted_url:string;url_length:number;source_hash:string}>();
 const rows=[];for(const row of results.slice(0,limit)){const identity=row.url_length>4096?{hash:null,issue:'oversize_url' as const}:await candidateUrlIdentity(row.submitted_url);rows.push({...row,canonical_hash:identity.hash,issue:identity.issue});}
 return {rows,has_more:results.length>limit,next_cursor:rows.at(-1)?.id??null,maximum_writes:rows.length?rows.length+1:0,requires_maintenance:!!rows.length,scan_bound:limit+1};
}
/** Explicit local maintenance; each bounded batch has its own attributed audit.
 * It never writes source_hash, lead, state or a source-version record. */
export async function prepareCandidateIdentityBackfill(db:D1Database,actor:Actor,after='',limit=25,maximumWrites=26){
 const page=await inspectCandidateIdentities(db,actor,after,limit);
 if(!Number.isInteger(maximumWrites)||maximumWrites<0||maximumWrites>26||page.maximum_writes>maximumWrites)throw new NewsImportError('identity_write_budget');
 if(!page.rows.length)return {statements:[] as D1PreparedStatement[],page,result:{indexed:0,deferred:0,next_cursor:null as string|null,writes:0,has_more:false,decisions:[] as unknown[]}};
 const triggers=await certifiedMutationTriggers(db);const statements:D1PreparedStatement[]=[guard(db,triggers)];
 for(const row of page.rows){statements.push(db.prepare("UPDATE editorial_candidates SET source_url_hash=?,source_url_identity_issue=? WHERE id=? AND substr(submitted_url,1,4097)=? AND length(submitted_url)=? AND source_url_hash IS NULL AND source_url_identity_issue IS NULL AND substr(source_hash,1,257)=? ").bind(row.canonical_hash,row.issue,row.id,row.submitted_url,row.url_length,row.source_hash),db.prepare("SELECT json(CASE WHEN changes()=1 THEN '{}' ELSE 'stale_identity_maintenance' END)"));}
 const decisions=page.rows.map(r=>({id:r.id,url_fingerprint:sha256(r.submitted_url+':'+r.url_length),original_hash_prefix_fingerprint:sha256(r.source_hash),canonical_hash:r.canonical_hash,issue:r.issue}));
 const detail=canonical({parser:'pr11-canonical-url/maintenance-r2.1',after,decisions});if(Buffer.byteLength(detail)>16384)throw new NewsImportError('identity_audit_bound');
 statements.push(audit(db,actor,actor.requestId+':identity-backfill','news_identity_backfill',page.rows.at(-1)!.id,detail));
 return {statements,page,result:{indexed:page.rows.filter(r=>r.canonical_hash).length,deferred:page.rows.filter(r=>r.issue).length,next_cursor:page.next_cursor,writes:page.maximum_writes,has_more:page.has_more,decisions}};
}
export async function backfillCandidateIdentities(db:D1Database,actor:Actor,after='',limit=25,maximumWrites=26){
 const plan=await prepareCandidateIdentityBackfill(db,actor,after,limit,maximumWrites);
 if(!plan.statements.length)return plan.result;
 const results=await db.batch(plan.statements);const writes=results.reduce((n,r)=>n+Number(r.meta.changes??0),0);if(writes>maximumWrites)throw new NewsImportError('identity_write_budget_exceeded_after_commit');
 return {...plan.result,writes};
}

/** Resolve attribution from reviewed immutable evidence, never a browser field. */
export async function releasedNewsSource(db:D1Database,candidateId:string){const {results}=await db.prepare(`SELECT v.source_key,v.proposal_json FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id WHERE v.candidate_id=? AND p.review_state='needs_review' ORDER BY v.version_id LIMIT 2`).bind(candidateId).all<{source_key:string;proposal_json:string}>();if(results.length!==1)throw new NewsImportError('reviewed_source_attribution_required');const r=registration(results[0].source_key);const row=await db.prepare('SELECT id FROM sources WHERE id=? AND name=? AND url=? AND feed_url=? LIMIT 1').bind(r.editorial_id,r.name,r.home,r.source.feed_url).first<{id:number}>();if(!row)throw new NewsImportError('reviewed_source_registry_changed');const proposal=JSON.parse(results[0].proposal_json);return {sourceId:row.id,title:proposal.title as string,excerpt:proposal.excerpt as string,publishedAt:proposal.published_at as string|null,retrievedAt:proposal.retrieved_at as string};}
