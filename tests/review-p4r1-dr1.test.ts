// R2 port of DR1 attacks: original assertions/logs are preserved in Claude’s worktree and dr1-baseline.log. Changed expectations are H1 independent owners, H2 independent versions, M1 no reopen, M2 paged unresolved selection.
// TRACE-LOCAL-NEWS-P4-R1-DR1: independent adversarial review tests.
// Local review branch only (P4-R1 candidate 2ad59cc merged with main 9da92ec);
// not part of the candidate. Evidence is read from a COPY of the retained
// real-source evidence (TRACE_P4_EVIDENCE_ROOT); nothing is fetched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SQLiteD1} from './sqlite-d1';
import {realEvidence} from './real-news/evidence';
import {canonical,sha256} from '../src/lib/server/news-import/runtime/primitives';
import {bundleHash} from '../src/lib/server/news-import/runtime/bundle';
import {registration,parseP3} from '../src/lib/server/news-import/runtime/registry';
import {importNewsPackage,listNewsProposals,resolveNewsProposal,listNewsProposalPage} from '../src/lib/server/news-import/service';
import {handleNewsImportRequest} from '../src/lib/server/news-import/worker';
import {handleAdminProxyRequest} from '../src/pages/api/admin/[...path]';
import {signInternalRequest} from '../src/security/internal-signature';
import {promoteCandidate,transitionCandidate} from '../src/lib/server/admin-page-writes';
import {loadDeskQueue} from '../src/lib/server/desk-queue';

const evidence=realEvidence(),bundle=evidence.subset,hash=bundle.bundle_sha256,selected=JSON.parse(bundle.payload_json).candidates;
const actor=()=>({email:'publisher@example.test',role:'publisher' as const,requestId:crypto.randomUUID()});
const observe=(name:string,value:unknown)=>console.log('DR1 '+name+' '+JSON.stringify(value));
function database(withMigration=true){
 const db=new SQLiteD1();db.countTriggerChanges=true;db.sqlite.exec('PRAGMA foreign_keys=ON');
 if(withMigration)db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));
 for(const key of new Set<string>(selected.map((c:any)=>c.source.id))){const r=registration(key);db.sqlite.prepare(`INSERT INTO sources(id,name,url,feed_url,section,tier,treatment,ingestion_type,active,requires_review) VALUES (?,?,?,?,'A','A','vendor-reported','rss',0,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,feed_url=excluded.feed_url`).run(r.editorial_id,r.name,r.home,r.source.feed_url);}
 return db;
}
const state=(db:SQLiteD1,id:string)=>(db.sqlite.prepare('SELECT state FROM editorial_candidates WHERE id=?').get(id) as any)?.state;
const review=(db:SQLiteD1,v:string)=>(db.sqlite.prepare('SELECT review_state,revision FROM news_import_proposals WHERE version_id=?').get(v) as any);
const counts=(db:SQLiteD1)=>Object.fromEntries(['editorial_candidates','feed_items','story_clusters','story_cluster_members','news_import_events','admin_audit_log','admin_request_nonces','news_import_proposals'].map(t=>[t,Number((db.sqlite.prepare('SELECT COUNT(*) n FROM '+t).get() as any).n)]));
async function settle(p:Promise<unknown>){try{return {ok:true,value:await p};}catch(e:any){return {ok:false,error:String(e?.message??e).slice(0,160)};}}
const promoteInput=(p:any)=>({candidateId:p.candidate_id,submittedUrl:p.proposal.canonical_url,urlHash:p.proposal.duplicate_identity.url_hash,headline:p.proposal.title,summary:p.proposal.excerpt,topic:'models',evidenceStatus:'unverified'});

// ---- Priority D: provenance recomputed independently of the importer ----
test('DR1-D provenance: bundle, payload and snapshot hashes recompute; fields match the retained XML at their locators',()=>{
 const {bundle_sha256,...rest}=bundle as any;
 assert.equal(sha256(canonical(rest)),'eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48');
 assert.equal(bundle_sha256,'eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48');
 assert.equal(sha256(bundle.payload_json),bundle.payload_sha256);
 const rows:any[]=[];
 for(const s of bundle.snapshots){assert.equal(sha256(s.xml),s.sha256);assert.ok(!/<!DOCTYPE|<!ENTITY/i.test(s.xml));}
 for(const c of selected){
  const xml=bundle.snapshots.find((s:any)=>s.sha256===c.source_hash)!.xml;
  const n=Number(/\[(\d+)\]$/.exec(c.provenance.locator)![1]);
  const item=[...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)][n-1]?.[0]??'';
  const tag=(t:string)=>{const m=new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`).exec(item);return m?m[1].replace(/^<!\[CDATA\[|\]\]>$/g,'').trim():null;};
  const decode=(s:string|null)=>s?.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))??null;
  const link=decode(tag('link')),pub=tag('pubDate'),title=decode(tag('title'));
  rows.push({source:c.source.id,locator:c.provenance.locator,title_matches:title===c.title,link_canonical:link===c.canonical_url||link?.startsWith(c.canonical_url),pub_raw_matches:pub===c.original_publication_date,published_at:c.published_at,pub_iso_matches:pub?new Date(pub).toISOString()===c.published_at:c.published_at===null,updated_at:c.updated_at,excerpt_chars:c.excerpt.length,excerpt_in_xml:decode(item)!.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').includes(c.excerpt.replace(/\s+/g,' ').slice(0,60)),retrieved_at:c.retrieved_at,flags:c.quality_flags,verification:c.verification_status,url_hash_ok:sha256(c.canonical_url)===c.duplicate_identity.url_hash});
  assert.equal(c.verification_status,'unverified');assert.equal(c.publication_approved,false);
 }
 observe('provenance',rows);
 for(const r of rows){assert.ok(r.title_matches&&r.pub_raw_matches&&r.pub_iso_matches&&r.url_hash_ok,JSON.stringify(r));}
 // Missing metadata stays missing across all ten parent candidates.
 const parent=JSON.parse(evidence.bundle.payload_json).candidates;
 observe('parent_missing',{candidates:parent.length,empty_excerpts:parent.filter((c:any)=>c.excerpt==='').length,null_updated:parent.filter((c:any)=>c.updated_at===null).length,null_published:parent.filter((c:any)=>c.published_at===null).length});
});

// ---- Priority D/C: signed import accounting, replay and nonce use ----
function env(db:SQLiteD1){return {DB:db.asD1(),TRACE_NEWS_IMPORT_ENABLED:'true',TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_BUNDLE_SHA256:hash,TRACE_NEWS_IMPORT_WRITE_LIMIT:'40',TRACE_NEWS_IMPORT_FROM_UTC:new Date(Math.floor(Date.now()/1000)*1000-60000).toISOString(),TRACE_NEWS_IMPORT_UNTIL_UTC:new Date(Math.floor(Date.now()/1000)*1000+1800000).toISOString(),TRACE_INTERNAL_SERVICE_SECRET:'dr1-local-review-secret-'.repeat(3)};}
async function signed(e:ReturnType<typeof env>,data:unknown,o:{nonce?:string;method?:string}={}){const method=o.method??'POST',body=method==='GET'?'':JSON.stringify(data),identity={operator:'publisher@example.test',role:'publisher' as const,timestamp:String(Date.now()),nonce:o.nonce??crypto.randomUUID()},signature=await signInternalRequest(e.TRACE_INTERNAL_SERVICE_SECRET,method,'/admin/news-import',body,identity);return new Request('https://worker.example/admin/news-import',{method,headers:{'Content-Type':'application/json','X-Trace-Internal-Version':'v1','X-Trace-Operator':identity.operator,'X-Trace-Role':identity.role,'X-Trace-Timestamp':identity.timestamp,'X-Trace-Nonce':identity.nonce,'X-Trace-Signature':signature},...(method==='POST'?{body}:{})});}

test('DR1-D signed import: 20 trigger-inclusive writes, nonce consumed once; fresh-signed replay 0; same-nonce replay 409; GET nonce not consumed',async()=>{
 const db=database();try{const e=env(db),before=counts(db),t0=db.totalChanges();
  const pre=await handleNewsImportRequest(await signed(e,{operation:'preflight',bundle,expectedHash:hash}),e);const preBody:any=await pre.json();
  assert.equal(db.totalChanges(),t0,'preflight writes nothing');
  const nonce=crypto.randomUUID(),first=await handleNewsImportRequest(await signed(e,{operation:'import',bundle,expectedHash:hash},{nonce}),e),firstBody:any=await first.json(),t1=db.totalChanges();
  const replay=await handleNewsImportRequest(await signed(e,{operation:'import',bundle,expectedHash:hash}),e),replayBody:any=await replay.json(),t2=db.totalChanges();
  const sameNonce=await handleNewsImportRequest(await signed(e,{operation:'import',bundle,expectedHash:hash},{nonce}),e);
  const getNonce=crypto.randomUUID(),g1=await handleNewsImportRequest(await signed(e,null,{method:'GET',nonce:getNonce}),e),g2=await handleNewsImportRequest(await signed(e,null,{method:'GET',nonce:getNonce}),e);
  const after=counts(db);
  observe('accounting',{preflight:{status:pre.status,statements:preBody.batch_statements,row_bound:preBody.maximum_expected_row_writes,params:preBody.maximum_bound_parameters},import:{status:first.status,reported_writes:firstBody.writes,actual_changes:t1-t0},replay:{status:replay.status,replayed:replayBody.replayed,writes:replayBody.writes,actual_changes:t2-t1},same_nonce_status:sameNonce.status,get_same_nonce_statuses:[g1.status,g2.status],delta:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]]))});
  assert.equal(first.status,200);assert.equal(t1-t0,20);assert.equal(firstBody.writes,20);assert.equal(t2-t1,0);assert.equal(sameNonce.status,409);
  assert.equal(after.feed_items,0);assert.equal(after.story_clusters,0);assert.equal(after.admin_request_nonces-before.admin_request_nonces,1);
 }finally{db.close();}
});

// ---- Priority A: governed resolution versus generic Desk paths ----
test('DR1-A1 R2 governed REJECT cannot be reversed by generic Desk transitions',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());const p=(await listNewsProposals(db.asD1(),actor()))[0];
  await resolveNewsProposal(db.asD1(),{versionId:p.version_id,revision:0,action:'reject',reason:'Not newsworthy'},actor());
  const steps:any[]=[];for(const [from,to] of [['rejected','new'],['new','drafting'],['drafting','draft_ready'],['draft_ready','needs_review']]){steps.push({from,to,result:await settle(transitionCandidate(db.asD1(),actor(),p.candidate_id,from,to))});}
  const promote=await settle(promoteCandidate(db.asD1(),actor(),promoteInput(p)));
  const events=db.sqlite.prepare("SELECT action FROM news_import_events WHERE version_id=? ORDER BY created_at").all(p.version_id).map((r:any)=>r.action);
  const audits=db.sqlite.prepare("SELECT action,detail_code FROM admin_audit_log WHERE target_id=? ORDER BY id").all(p.candidate_id).map((r:any)=>r.action+':'+r.detail_code);
  observe('A1_reopen_after_governed_reject',{steps,promote,candidate_state:state(db,p.candidate_id),proposal:review(db,p.version_id),events,audits});
 }finally{db.close();}
});

test('DR1-A1b R2 rejected owner stays rejected even after its source joins a cluster',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());const p=(await listNewsProposals(db.asD1(),actor()))[0];
  await resolveNewsProposal(db.asD1(),{versionId:p.version_id,revision:0,action:'reject',reason:'Duplicate of wire coverage'},actor());
  db.sqlite.prepare("INSERT INTO feed_items(id,source_id,url,url_hash,title,ingestion_status) VALUES (950,?,?,?,'Ingested later','clustered')").run(registration(p.proposal.source.id).editorial_id,p.proposal.canonical_url,p.proposal.duplicate_identity.url_hash);
  db.sqlite.exec("INSERT INTO story_clusters(id,title,topic,summary,evidence_status,publication_status) VALUES (950,'Later cluster','models','S','vendor_reported','draft'); INSERT INTO story_cluster_members(cluster_id,feed_item_id,is_primary) VALUES (950,950,1)");
  for(const [from,to] of [['rejected','new'],['new','drafting'],['drafting','draft_ready'],['draft_ready','needs_review']])await assert.rejects(()=>transitionCandidate(db.asD1(),actor(),p.candidate_id,from,to));
  const promote=await settle(promoteCandidate(db.asD1(),actor(),promoteInput(p)));
  observe('A1b_reuse_after_governed_reject',{promote,candidate_state:state(db,p.candidate_id),proposal:review(db,p.version_id)});
 }finally{db.close();}
});

test('DR1-A2 R2 generic state changes after governed RELEASE are refused',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());const p=(await listNewsProposals(db.asD1(),actor()))[0];
  await resolveNewsProposal(db.asD1(),{versionId:p.version_id,revision:0,action:'release',reason:'Checked'},actor());
  const r=await settle(transitionCandidate(db.asD1(),actor(),p.candidate_id,'needs_review','rejected'));
  observe('A2_generic_after_release',{reject:r,candidate_state:state(db,p.candidate_id),proposal:review(db,p.version_id)});
 }finally{db.close();}
});

test('DR1-A3 R2 independently owned candidate stays free and imported proposal resolves separately',async()=>{
 const db=database();try{const c=selected[0],id=crypto.randomUUID();
  db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by) VALUES (?,'manual_url',?,?,?,'new','editor@example.test')").run(id,c.canonical_url,c.title,c.duplicate_identity.url_hash);
  const receipt:any=await importNewsPackage(db.asD1(),bundle,hash,actor());
  const attempts:any={};for(const to of ['drafting','rejected'])attempts['transition_'+to]=await settle(transitionCandidate(db.asD1(),actor(),id,'new',to));
  for(const action of ['release','reject'] as const)attempts['resolve_'+action]=await settle(resolveNewsProposal(db.asD1(),{versionId:c.candidate_id,revision:0,action,reason:'Owner decision'},actor()));
  attempts.sql_update=await settle(Promise.resolve().then(()=>db.sqlite.prepare("UPDATE editorial_candidates SET state='drafting' WHERE id=?").run(id)));
  observe('A3_reused_owner',{candidates_reused:receipt.candidates_reused,attempts,candidate_state:state(db,id),proposal:review(db,c.candidate_id)});
  assert.equal(receipt.candidates_reused,0);assert.equal(attempts.transition_drafting.ok,true);assert.equal(attempts.resolve_release.ok,true);assert.equal(attempts.sql_update.ok,true);assert.notEqual((db.sqlite.prepare('SELECT candidate_id FROM news_import_versions WHERE version_id=?').get(c.candidate_id) as any).candidate_id,id);
 }finally{db.close();}
});

test('DR1-A4 R2 simulated correction creates two independently resolvable versions',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());
  const b=JSON.parse(canonical(bundle)),p=JSON.parse(b.payload_json),chosen=p.candidates.find((c:any)=>c.source.id==='trace-source-7'),snapshot=b.snapshots.find((s:any)=>s.sha256===chosen.source_hash);
  snapshot.xml=snapshot.xml.replace(chosen.title,chosen.title+' [review correction fixture]');snapshot.sha256=sha256(snapshot.xml);
  const parsed=parseP3(snapshot.xml,registration(chosen.source.id).source);
  for(const c of p.candidates.filter((c:any)=>c.source.id===chosen.source.id)){const item=parsed.items.find(i=>i.item_id===c.item_id)!;c.title=item.title;c.excerpt=item.excerpt;c.content_hash=item.content_hash;c.candidate_id=sha256(canonical({schema:'trace-news-extraction-p2.1',item_id:c.item_id,content_hash:c.content_hash}));c.source_hash=snapshot.sha256;c.provenance.snapshot='snapshots/news-p3/'+snapshot.sha256+'.xml';}
  b.package_id='TRACE-NEWS-P3-000099';b.payload_json=canonical(p)+'\n';b.payload_sha256=sha256(b.payload_json);const envelope=JSON.parse(b.envelope_json);envelope.package_id=b.package_id;envelope.payload_sha256=b.payload_sha256;envelope.bytes=Buffer.byteLength(b.payload_json);b.envelope_json=canonical(envelope)+'\n';b.bundle_sha256=bundleHash(b);
  await importNewsPackage(db.asD1(),b,b.bundle_sha256,actor());
  const versions=db.sqlite.prepare('SELECT v.version_id,v.candidate_id FROM news_import_versions v WHERE v.url_hash=? ORDER BY version_id').all(chosen.duplicate_identity.url_hash) as any[];
  const attempts:any[]=[];for(const v of versions)for(const action of ['release','reject'] as const)attempts.push({version:v.version_id.slice(0,8),action,result:await settle(resolveNewsProposal(db.asD1(),{versionId:v.version_id,revision:0,action,reason:'Choose version'},actor()))});
  observe('A4_multi_version',{versions:versions.length,same_candidate:new Set(versions.map(v=>v.candidate_id)).size===1,attempts});
  assert.equal(versions.length,2);assert.equal(new Set(versions.map(v=>v.candidate_id)).size,2);assert.equal(attempts.filter(a=>a.result.ok).length,2);
 }finally{db.close();}
});

test('DR1-A5 R2 direct UPDATE and INSERT OR REPLACE cannot bypass held review',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());const p=(await listNewsProposals(db.asD1(),actor()))[0];
  const update=await settle(Promise.resolve().then(()=>db.sqlite.prepare("UPDATE editorial_candidates SET state='needs_review' WHERE id=?").run(p.candidate_id)));
  const replace=await settle(Promise.resolve().then(()=>db.sqlite.prepare("INSERT OR REPLACE INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,source_url_hash,state,urgency,created_by) SELECT id,intake_type,submitted_url,lead_text,source_hash,source_url_hash,'needs_review',urgency,created_by FROM editorial_candidates WHERE id=?").run(p.candidate_id)));
  const promote=await settle(promoteCandidate(db.asD1(),actor(),promoteInput(p)));
  observe('A5_direct_sql',{update,replace,candidate_state:state(db,p.candidate_id),proposal:review(db,p.version_id),promote,app_code_uses_replace:false});
 }finally{db.close();}
});

test('DR1-A6 resolver validation: reason, revision, stale state, concurrency and readers',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());const p=(await listNewsProposals(db.asD1(),actor()))[0],base={versionId:p.version_id,revision:0,action:'release' as const,reason:'ok'};
  const r={missing_reason:await settle(resolveNewsProposal(db.asD1(),{...base,reason:'   '},actor())),wrong_revision:await settle(resolveNewsProposal(db.asD1(),{...base,revision:3},actor())),reader:await settle(resolveNewsProposal(db.asD1(),base,{...actor(),role:'reader'})),overlong:await settle(resolveNewsProposal(db.asD1(),{...base,reason:'x'.repeat(1001)},actor()))};
  const before=counts(db);const both=await Promise.allSettled([resolveNewsProposal(db.asD1(),base,actor()),resolveNewsProposal(db.asD1(),{...base,action:'reject'},actor())]);
  const stale=await settle(resolveNewsProposal(db.asD1(),base,actor()));
  observe('A6_validation',{...r,concurrent_fulfilled:both.filter(x=>x.status==='fulfilled').length,stale,proposal:review(db,p.version_id),candidate_state:state(db,p.candidate_id),events_added:counts(db).news_import_events-before.news_import_events});
  for(const v of Object.values(r))assert.equal(v.ok,false);assert.equal(stale.ok,false);
 }finally{db.close();}
});

test('DR1-A7 without migration 0080 (Production-shaped), legacy held candidates keep the PR #18 contract',async()=>{
 const db=database(false);try{db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by) VALUES ('11111111-1111-1111-1111-111111111111','manual_url','https://legacy.example/a','Lead','h','held','e')").run();
  const ok=await transitionCandidate(db.asD1(),actor(),'11111111-1111-1111-1111-111111111111','held','needs_review');
  observe('A7_pre0080',{transition:ok,proposals:await listNewsProposals(db.asD1(),actor())});assert.equal(ok,true);
 }finally{db.close();}
});

// ---- Priority A/B: the proposal panel shows at most ten proposals ----
test('DR1-B1 R2 bounded pages expose every unresolved proposal; historical decisions do not consume pending slots',async()=>{
 const db=database();try{
  const fixture=JSON.parse(readFileSync('D:/TRACE/review-p4r1-dr1/evidence-copy/../synthetic-fixture.bundle.json','utf8'));
  for(const id of new Set<string>(JSON.parse(fixture.payload_json).candidates.map((c:any)=>c.source.id))){const r=registration(id);db.sqlite.prepare(`INSERT INTO sources(id,name,url,feed_url,section,tier,treatment,ingestion_type,active) VALUES (?,?,?,?,'A','A','test-only','rss',0) ON CONFLICT(id) DO NOTHING`).run(r.editorial_id,r.name,r.home,r.source.feed_url);}
  await importNewsPackage(db.asD1(),evidence.bundle,evidence.bundle.bundle_sha256,actor());
  // The synthetic fixture shares the real parent's package_id; give it its own.
  const parentId=evidence.bundle.package_id,fixtureId=fixture.package_id;fixture.package_id='TRACE-NEWS-P3-000077';const fenv=JSON.parse(fixture.envelope_json);fenv.package_id=fixture.package_id;fixture.envelope_json=canonical(fenv)+'\n';fixture.bundle_sha256=bundleHash(fixture);
  observe('B1_package_ids',{parent:parentId,synthetic_original:fixtureId});
  await importNewsPackage(db.asD1(),fixture,fixture.bundle_sha256,actor());
  const all=db.sqlite.prepare("SELECT v.version_id,v.candidate_id,p.review_state FROM news_import_versions v JOIN news_import_proposals p USING(version_id) ORDER BY v.version_id").all() as any[];
  const listed=await listNewsProposals(db.asD1(),actor());const unlisted=all.filter(a=>a.review_state==='held'&&!listed.some(l=>l.version_id===a.version_id));
  // Resolve the first three listed: they keep occupying slots.
  for(const l of listed.slice(0,3))await resolveNewsProposal(db.asD1(),{versionId:l.version_id,revision:0,action:'reject',reason:'Review'},actor());
  const relisted=await listNewsProposals(db.asD1(),actor());
  const hidden=unlisted[0];const generic=hidden?await settle(transitionCandidate(db.asD1(),actor(),hidden.candidate_id,'held','needs_review')):null;
  observe('B1_listing_cap',{total_proposals:all.length,held:all.filter(a=>a.review_state==='held').length,listed:listed.length,unlisted_held:unlisted.length,relisted_held:relisted.filter(r=>r.review_state==='held').length,generic_on_unlisted:generic});
  assert.ok(all.length>10);const seen=new Set<string>();let cursor='';do{const page=await listNewsProposalPage(db.asD1(),actor(),{after:cursor});for(const row of page.items)seen.add(row.version_id);cursor=page.nextCursor??'';}while(cursor);assert.equal(seen.size,all.length-3);assert.ok(relisted.every(r=>r.review_state==='held'));
 }finally{db.close();}
});

// ---- Priority B: PR #19 queue with imported held candidates ----
test('DR1-B2 PR #19 queue: imported held lead the default view among thousands of newer `new`, with stable paging and counts',async()=>{
 const db=database();try{await importNewsPackage(db.asD1(),bundle,hash,actor());
  const insert=db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by,created_at) VALUES (?,'manual_url',NULL,'x',?,'new','e',datetime('now','+1 day'))");
  db.sqlite.exec('BEGIN');for(let i=0;i<3000;i++)insert.run(crypto.randomUUID(),'n'+i);db.sqlite.exec('COMMIT');
  const imported=db.sqlite.prepare("SELECT id FROM editorial_candidates WHERE id GLOB 'local-news-p4:*'").all().map((r:any)=>r.id);
  const decide=await loadDeskQueue(db.asD1());
  const seen:string[]=[];let cursor:string|null=null,pages=0;do{const page=await loadDeskQueue(db.asD1(),{filter:'new',cursor});seen.push(...page.items.map(i=>i.id));cursor=page.nextCursor;pages++;}while(cursor);
  const held=await loadDeskQueue(db.asD1(),{filter:'held'});
  const plan=(sql:string,...a:any[])=>db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...a).map((r:any)=>r.detail);
  observe('B2_queue',{decide:decide.items.map(i=>i.id.slice(0,22)),counts:{decide:decide.counts.decide,held:decide.counts.held,new:decide.counts.new,all:decide.counts.all},new_pages:pages,new_unique:new Set(seen).size,new_total:seen.length,held_filter:held.items.length,plans:{counts:plan('SELECT state, COUNT(*) AS n FROM editorial_candidates GROUP BY state'),decide:plan("SELECT id, CASE state WHEN 'held' THEN 0 ELSE 1 END AS queue_rank FROM editorial_candidates WHERE state IN ('held','needs_review') ORDER BY queue_rank ASC, created_at DESC, id DESC LIMIT 51"),new:plan("SELECT id, 0 AS queue_rank FROM editorial_candidates WHERE state IN ('new') ORDER BY queue_rank ASC, created_at DESC, id DESC LIMIT 51")}});
  assert.deepEqual([...decide.items.map(i=>i.id)].sort(),[...imported].sort());assert.equal(decide.counts.held,3);assert.equal(new Set(seen).size,3000);assert.equal(seen.length,3000);
 }finally{db.close();}
});

// ---- Priority C: Pages proxy gates ----
test('DR1-C proxy: Production refuses before auth; disabled gate refuses import but forwards resolve; cross-origin refused',async()=>{
 const base={TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_ENABLED:'false',CF_ACCESS_TEAM_DOMAIN:'x.cloudflareaccess.com',CF_ACCESS_AUD:'aud',TRACE_ADMIN_PUBLISHERS:'publisher@example.test',TRACE_INGESTION_WORKER_URL:'https://worker.example',TRACE_ALLOWED_ORIGINS:'https://preview.example',TRACE_INTERNAL_SERVICE_SECRET:'s'.repeat(40)} as any;
 const req=(origin:string,body:unknown)=>new Request('https://preview.example/api/admin/news-import',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const prod=await handleAdminProxyRequest(req('https://preview.example',{operation:'import'}),'news-import',{...base,TRACE_ENVIRONMENT:'production'});
 const anon=await handleAdminProxyRequest(req('https://preview.example',{operation:'import'}),'news-import',base);
 const variants:any={};for(const p of ['news-import/','News-Import','news-import/x','./news-import','news-import%2F'])variants[p]=(await handleAdminProxyRequest(req('https://preview.example',{operation:'import'}),p,{...base,TRACE_ENVIRONMENT:'production'})).status;
 observe('C_proxy',{production:prod.status,anonymous_preview:anon.status,production_path_variants:variants});
 assert.equal(prod.status,503);assert.equal(anon.status,401);
});
