import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixtureBundle,database,actor,counts} from './fixtures/news-import/helpers';
import {importNewsPackage,listNewsProposals,listNewsProposalPage,resolveNewsProposal,backfillCandidateIdentities,inspectCandidateIdentities,governedNewsOwners} from '../src/lib/server/news-import/service';
import {transitionCandidate,promoteCandidate,recordCandidate} from '../src/lib/server/admin-page-writes';
import {canonical,sha256} from '../src/lib/server/news-import/runtime/primitives';
import {bundleHash,validateBundle} from '../src/lib/server/news-import/runtime/bundle';
import {parseP3,registration} from '../src/lib/server/news-import/runtime/registry';
const run=(db:ReturnType<typeof database>,b=fixtureBundle())=>importNewsPackage(db.asD1(),b,b.bundle_sha256,actor(),false,40);
const resolve=(db:ReturnType<typeof database>,versionId:string,action:'release'|'reject'='release',revision=0,reason='Publisher reviewed the original fictional source span')=>resolveNewsProposal(db.asD1(),{versionId,action,revision,reason},actor());

test('CI package, exact source/provenance, schema, malicious XML and unchanged deterministic fixture',()=>{
 const b=fixtureBundle(),fixed=JSON.parse(readFileSync('tests/fixtures/news-import/identities.json','utf8'));assert.equal(b.bundle_sha256,fixed.bundle_sha256);assert.equal(b.payload_sha256,fixed.payload_sha256);assert.equal(sha256(readFileSync('tests/fixtures/news-import/rss-template.xml')),fixed.xml_sha256);assert.equal(JSON.parse(b.payload_json).candidates.length,3);assert.equal(canonical(b),canonical(fixtureBundle()));
 for(const change of [(v:any)=>v.schema='future-schema',(v:any)=>v.snapshots[0].xml+=' ',(v:any)=>{const p=JSON.parse(v.payload_json);p.candidates[0].provenance.locator='/rss/channel/item[99]';v.payload_json=canonical(p)+'\n';v.payload_sha256=sha256(v.payload_json);const env=JSON.parse(v.envelope_json);env.payload_sha256=v.payload_sha256;env.bytes=Buffer.byteLength(v.payload_json);v.envelope_json=canonical(env)+'\n';}]){const v=JSON.parse(canonical(b));change(v);v.bundle_sha256=bundleHash(v);assert.throws(()=>validateBundle(v,v.bundle_sha256));}
 assert.throws(()=>parseP3('<!DOCTYPE rss [<!ENTITY e SYSTEM "https://blocked.invalid">]><rss/>',registration('fixture-alpha').source),/DTD/);
 const atom=fixtureBundle(90,{xml:readFileSync('tests/fixtures/news-import/atom.xml','utf8'),source:'fixture-beta'});assert.ok(JSON.parse(atom.payload_json).candidates.length>0);
});

test('CI held lifecycle, exact accounting, one immutable receipt and zero-write replay',async()=>{const db=database();try{
 const b=fixtureBundle(),before=counts(db),pre=await importNewsPackage(db.asD1(),b,b.bundle_sha256,actor(),true,40);assert.equal(pre.writes,0);assert.deepEqual(counts(db),before);
 const start=db.totalChanges(),result=await run(db,b);assert.equal(result.writes,db.totalChanges()-start);assert.ok(result.writes<=40);assert.equal(result.candidates_created,3);assert.equal(counts(db).story_clusters,0);assert.equal(counts(db).feed_items,0);
 for(const p of await listNewsProposals(db.asD1(),actor())){assert.equal(p.review_state,'held');assert.equal(p.candidate_state,'held');assert.equal(p.verification_status,'unverified');}
 const after=db.totalChanges();assert.equal((await run(db,b)).writes,0);assert.equal(db.totalChanges(),after);assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{db.close();}});

test('CI governance tripwire: generic service, direct UPDATE and REPLACE cannot release held or reopen rejected imports',async()=>{const db=database();try{
 await run(db);const p=(await listNewsProposals(db.asD1(),actor()))[0];const before=counts(db);
 if(process.env.TRACE_NEWS_CI_MUTATION==='drop-state-guard')db.sqlite.exec('DROP TRIGGER news_import_candidate_state_guard');
 await assert.rejects(()=>transitionCandidate(db.asD1(),actor(),p.candidate_id,'held','needs_review'));assert.throws(()=>db.sqlite.prepare("UPDATE editorial_candidates SET state='needs_review' WHERE id=?").run(p.candidate_id));
 assert.throws(()=>db.sqlite.prepare("INSERT OR REPLACE INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by) SELECT id,intake_type,submitted_url,lead_text,source_hash,'needs_review',created_by FROM editorial_candidates WHERE id=?").run(p.candidate_id));assert.deepEqual(counts(db),before);
 await assert.rejects(()=>resolve(db,p.version_id,'release',0,''));await assert.rejects(()=>resolve(db,p.version_id,'release',9));await assert.rejects(()=>resolveNewsProposal(db.asD1(),{versionId:p.version_id,revision:0,action:'release',reason:'x'},{...actor(),role:'reader'}));
 await resolve(db,p.version_id,'reject');const rejected=counts(db);for(const state of ['new','drafting','needs_review','published']){await assert.rejects(()=>transitionCandidate(db.asD1(),actor(),p.candidate_id,'rejected',state));assert.throws(()=>db.sqlite.prepare('UPDATE editorial_candidates SET state=? WHERE id=?').run(state,p.candidate_id));}await assert.rejects(()=>resolve(db,p.version_id));assert.deepEqual(counts(db),rejected);
 assert.equal(db.sqlite.prepare('SELECT state FROM editorial_candidates WHERE id=?').get(p.candidate_id)!.state,'rejected');assert.equal(db.sqlite.prepare("SELECT count(*) n FROM news_import_events WHERE version_id=? AND action='reject'").get(p.version_id)!.n,1);
}finally{db.close();}});

test('CI reused Desk/Capture identity stays independent; imported proposal can be released or rejected without freezing its source',async()=>{
 for(const decision of ['release','reject'] as const){const db=database();try{const b=fixtureBundle(),c=JSON.parse(b.payload_json).candidates[0],id=crypto.randomUUID(),sourceHash=sha256('manual_url\n'+c.canonical_url+'\n'+c.title);
 db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by) VALUES (?,'manual_url',?,?,?,'new','original')").run(id,c.canonical_url,c.title,sourceHash);const original=db.sqlite.prepare('SELECT * FROM editorial_candidates WHERE id=?').get(id);const result=await run(db,b);assert.equal(result.candidates_reused,0);
 const p=(await listNewsProposals(db.asD1(),actor())).find(p=>p.version_id===c.candidate_id)!;assert.notEqual(p.candidate_id,id);assert.ok(p.hold_reason.related_candidates.some((r:any)=>r.id===id));await resolve(db,p.version_id,decision);assert.deepEqual(db.sqlite.prepare('SELECT * FROM editorial_candidates WHERE id=?').get(id),original);assert.equal(await transitionCandidate(db.asD1(),actor(),id,'new','drafting'),true);
 }finally{db.close();}}
});

test('CI independently owned source versions preserve decisions, explicit unordered links and review obligation',async()=>{
 for(const oldDecision of ['pending','release','reject'] as const){const db=database();try{const first=fixtureBundle(1,{count:1}),second=fixtureBundle(2,{count:1,revision:' [SIMULATED correction fixture]'}),oldId=JSON.parse(first.payload_json).candidates[0].candidate_id,newId=JSON.parse(second.payload_json).candidates[0].candidate_id;
 await run(db,first);if(oldDecision!=='pending')await resolve(db,oldId,oldDecision);const before=db.sqlite.prepare('SELECT * FROM news_import_proposals WHERE version_id=?').get(oldId);await run(db,second);assert.deepEqual(db.sqlite.prepare('SELECT * FROM news_import_proposals WHERE version_id=?').get(oldId),before);
 const versions=db.sqlite.prepare('SELECT candidate_id FROM news_import_versions').all();assert.equal(new Set(versions.map(v=>v.candidate_id)).size,2);const link=db.sqlite.prepare('SELECT * FROM news_import_version_links').get()!;assert.equal(link.version_id,newId);assert.equal(link.related_version_id,oldId);assert.equal(link.relationship,'same_canonical_url_order_unverified');
 const both=await Promise.allSettled([resolve(db,newId,'release'),resolve(db,newId,'reject')]);assert.equal(both.filter(x=>x.status==='fulfilled').length,1);if(oldDecision==='pending')await resolve(db,oldId,'reject');assert.equal(db.sqlite.prepare("SELECT count(*) n FROM news_import_proposals WHERE review_state='held'").get()!.n,0);
 const changes=db.totalChanges();assert.equal((await run(db,second)).writes,0);assert.equal(db.totalChanges(),changes);const finalOldDecision=db.sqlite.prepare('SELECT * FROM news_import_proposals WHERE version_id=?').get(oldId);await run(db,fixtureBundle(3,{count:1}));assert.deepEqual(db.sqlite.prepare('SELECT * FROM news_import_proposals WHERE version_id=?').get(oldId),finalOldDecision);
 }finally{db.close();}}
});

test('CI late cluster, published/withdrawn/ambiguous history and membership races never release or overwrite review decisions',async()=>{
 for(const status of ['published','withdrawn','ambiguous','race']){const db=database();try{const b=fixtureBundle(1,{count:1});await run(db,b);const p=(await listNewsProposals(db.asD1(),actor()))[0],c=p.proposal;
 const add=()=>{db.sqlite.prepare("INSERT INTO feed_items(id,source_id,url,url_hash,title,ingestion_status) VALUES (900,9901,?,?,'Existing','clustered')").run(c.canonical_url,c.duplicate_identity.url_hash);db.sqlite.prepare("INSERT INTO story_clusters(id,title,topic,summary,evidence_status,publication_status) VALUES (900,'Existing','models','S','unverified',?)").run(status==='race'||status==='ambiguous'?'review':status);db.sqlite.exec('INSERT INTO story_cluster_members(cluster_id,feed_item_id,is_primary) VALUES (900,900,1)');if(status==='ambiguous')db.sqlite.exec("INSERT INTO story_clusters(id,title,topic,summary,evidence_status,publication_status) VALUES (901,'Other','models','S','unverified','review');INSERT INTO story_cluster_members(cluster_id,feed_item_id,is_primary) VALUES (901,900,0)");};
 if(status==='race'){const batch=db.batch.bind(db);db.batch=(async(stmts:any)=>{add();return batch(stmts);}) as typeof db.batch;}else add();await assert.rejects(()=>resolve(db,p.version_id));assert.equal(db.sqlite.prepare('SELECT review_state FROM news_import_proposals WHERE version_id=?').get(p.version_id)!.review_state,'held');
 if(status!=='race'){await resolve(db,p.version_id,'reject');await assert.rejects(()=>transitionCandidate(db.asD1(),actor(),p.candidate_id,'rejected','new'));const promoted=await promoteCandidate(db.asD1(),actor(),{candidateId:p.candidate_id,submittedUrl:c.canonical_url,urlHash:c.duplicate_identity.url_hash,headline:c.title,summary:c.excerpt,topic:'models',evidenceStatus:'unverified'}).catch(()=>({kind:'blocked'}));assert.notEqual(promoted.kind,'created');assert.notEqual(promoted.kind,'reused');}
 }finally{db.close();}}
});

test('CI indexed proposal paging exposes >15 unresolved versions among thousands of unrelated candidates',async()=>{const db=database();try{
 for(let n=0;n<6;n++)await run(db,fixtureBundle(n+1,{offset:n*3}));const insert=db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,source_hash,state,created_by) VALUES (?,'lead','legacy','new','legacy')");db.sqlite.exec('BEGIN');for(let n=0;n<3750;n++)insert.run('ordinary-'+n);db.sqlite.exec('COMMIT');
 for(const p of (await listNewsProposalPage(db.asD1(),actor())).items.slice(0,3))await resolve(db,p.version_id,'reject');const ids:string[]=[];let after='';do{const page=await listNewsProposalPage(db.asD1(),actor(),{after,limit:4});ids.push(...page.items.map(p=>p.version_id));after=page.nextCursor??'';}while(after);assert.equal(ids.length,15);assert.equal(new Set(ids).size,15);
 const owned=await governedNewsOwners(db.asD1(),db.sqlite.prepare("SELECT candidate_id FROM news_import_versions ORDER BY version_id LIMIT 18").all().map(r=>String(r.candidate_id)));assert.equal(owned.size,18);
 const sql=db.statementLog.find(q=>q.sql.includes('INDEXED BY news_import_proposals_review')&&q.sql.includes('LIMIT'))!.sql;const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all('held','',5);assert.ok(plan.some(r=>String(r.detail).includes('news_import_proposals_review')));assert.ok(!plan.some(r=>String(r.detail).includes('SCAN editorial_candidates')));
 await assert.rejects(()=>listNewsProposalPage(db.asD1(),actor(),{after:'../../'}));
}finally{db.close();}});

test('CI 3750-row identity backlog uses explicit audited pages, preserves original hashes and handles malformed data',async()=>{const db=database();try{
 const insert=db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by) VALUES (?,'manual_url',?,'Original lead',?,'new','legacy')");db.sqlite.exec('BEGIN');for(let n=0;n<3750;n++)insert.run('legacy-'+String(n).padStart(4,'0'),'https://legacy.trace.test/'+n+'?utm_source=old','original-'+n);insert.run('malformed','javascript:alert(1)','preserve-malformed');db.sqlite.exec('COMMIT');
 const original=db.sqlite.prepare('SELECT id,source_hash,lead_text,state FROM editorial_candidates ORDER BY id').all();await assert.rejects(()=>run(db),/backfill/);const before=db.totalChanges(),probe=await inspectCandidateIdentities(db.asD1(),actor());assert.equal(db.totalChanges(),before);assert.equal(probe.scan_bound,26);assert.equal(probe.has_more,true);await assert.rejects(()=>backfillCandidateIdentities(db.asD1(),actor(),'',25,1));
 let cursor='',batches=0,writes=0,deferred=0;while(true){const result=await backfillCandidateIdentities(db.asD1(),actor(),cursor);if(!result.next_cursor)break;cursor=result.next_cursor;batches++;writes+=result.writes;deferred+=result.deferred;assert.ok(result.writes<=26);}
 assert.equal(batches,151);assert.equal(deferred,1);assert.equal(writes,3902);assert.deepEqual(db.sqlite.prepare('SELECT id,source_hash,lead_text,state FROM editorial_candidates ORDER BY id').all(),original);assert.equal(db.sqlite.prepare("SELECT source_url_identity_issue FROM editorial_candidates WHERE id='malformed'").get()!.source_url_identity_issue,'invalid_url');assert.equal((await inspectCandidateIdentities(db.asD1(),actor())).requires_maintenance,false);await run(db);
 const id=await recordCandidate(db.asD1(),actor(),{intakeType:'manual_url',submittedUrl:'https://legacy.trace.test/new?utm_source=fresh',leadText:'New lead',sourceHash:'original-capture-hash',section:null,urgency:'normal',sourceLanguage:null});const row=db.sqlite.prepare('SELECT source_hash,source_url_hash FROM editorial_candidates WHERE id=?').get(id)!;assert.equal(row.source_hash,'original-capture-hash');assert.equal(row.source_url_hash,sha256('https://legacy.trace.test/new'));assert.equal((await inspectCandidateIdentities(db.asD1(),actor())).requires_maintenance,false);
 console.log('R2_BACKLOG '+JSON.stringify({rows:3751,batches,writes,deferred,maximum_batch_writes:26}));
}finally{db.close();}});

test('CI rollback, concurrent import, unknown triggers, immutable records and receipt recovery never redispatch automatically',async()=>{const db=database();try{
 const b=fixtureBundle();const pair=await Promise.allSettled([run(db,b),run(db,b)]);assert.equal(pair.filter(r=>r.status==='fulfilled').length,1);assert.equal(counts(db).news_import_packages,1);
 for(const table of ['news_import_packages','news_import_versions','news_import_deliveries','news_import_proposals','news_import_events']){assert.throws(()=>db.sqlite.exec('DELETE FROM '+table));assert.throws(()=>db.sqlite.exec('INSERT OR REPLACE INTO '+table+' SELECT * FROM '+table));}
 const originalBatch=db.batch.bind(db);db.batch=(async(stmts:any[])=>originalBatch([...stmts.slice(0,12),db.prepare("SELECT json('forced-partial-error')"),...stmts.slice(12)])) as typeof db.batch;const before=counts(db);await assert.rejects(()=>run(db,fixtureBundle(2,{offset:50})));assert.deepEqual(counts(db),before);db.batch=originalBatch;
 db.sqlite.exec("CREATE TRIGGER unknown_cost AFTER INSERT ON news_import_packages BEGIN UPDATE editorial_candidates SET urgency='high';END");await assert.rejects(()=>run(db,fixtureBundle(3,{offset:60})),/uncertified/);assert.deepEqual(counts(db),before);
}finally{db.close();}});

test('CI pre-0080 schema retains ordinary held transitions and candidate submission',async()=>{const db=database(false);try{const id=await recordCandidate(db.asD1(),actor(),{intakeType:'lead',submittedUrl:null,leadText:'Legacy',sourceHash:'legacy',section:null,urgency:'normal',sourceLanguage:null});db.sqlite.prepare("UPDATE editorial_candidates SET state='held' WHERE id=?").run(id);assert.equal(await transitionCandidate(db.asD1(),actor(),id,'held','needs_review'),true);assert.equal((await listNewsProposals(db.asD1(),actor())).length,0);}finally{db.close();}});

test('CI migration matrix preserves legacy source history with optional 0078/0079 and enforces FK/revision immutability',async()=>{
 for(const extras of [false,true]){const db=database(false);try{
 db.sqlite.exec("INSERT INTO feed_items(id,source_id,url,url_hash,title,ingestion_status) VALUES (999,9901,'https://alpha.trace.test/historical','old-hash','Historical','published');INSERT INTO story_clusters(id,title,topic,summary,evidence_status,publication_status) VALUES (998,'Published','models','Original','unverified','published'),(999,'Withdrawn','models','Original','unverified','withdrawn');INSERT INTO story_cluster_members(cluster_id,feed_item_id,is_primary) VALUES (998,999,1),(999,999,0)");
 const original=db.sqlite.prepare('SELECT * FROM story_cluster_members ORDER BY cluster_id').all();if(extras)for(const file of ['0078-newsletter-subscriptions.sql','0079-newsletter-issues.sql'])db.sqlite.exec(readFileSync('tests/fixtures/news-import/'+file,'utf8'));
 db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));assert.deepEqual(db.sqlite.prepare('SELECT * FROM story_cluster_members ORDER BY cluster_id').all(),original);await run(db);
 const distinct=db.sqlite.prepare('SELECT version_id FROM news_import_versions ORDER BY version_id LIMIT 2').all();assert.throws(()=>db.sqlite.prepare("INSERT INTO news_import_version_links VALUES (?,?,'same_canonical_url_order_unverified')").run(distinct[0].version_id,distinct[1].version_id),/same canonical URL/);assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);assert.throws(()=>db.sqlite.prepare("INSERT INTO news_import_version_links VALUES (?,?,'same_canonical_url_order_unverified')").run('a'.repeat(64),'b'.repeat(64)),/FOREIGN KEY/);
 assert.throws(()=>db.sqlite.exec("UPDATE news_import_proposals SET review_state='needs_review',revision=99,reviewed_by='x',review_reason='x',reviewed_at='now'"),/transition/);assert.throws(()=>db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8')));
 }finally{db.close();}}
});

test('CI two reviewed versions of one URL promote through PR11 to one review cluster only',async()=>{const db=database();try{
 await run(db,fixtureBundle(1,{count:1}));await run(db,fixtureBundle(2,{count:1,revision:' [SIMULATED wording correction]'}));const items=await listNewsProposals(db.asD1(),actor());for(const p of items)await resolve(db,p.version_id);
 const outcomes=[];for(const p of items)outcomes.push(await promoteCandidate(db.asD1(),actor(),{candidateId:p.candidate_id,submittedUrl:p.proposal.canonical_url,urlHash:p.proposal.duplicate_identity.url_hash,headline:p.proposal.title,summary:p.proposal.excerpt,topic:'models',evidenceStatus:'unverified'}));
 assert.deepEqual(outcomes.map(o=>o.kind),['created','reused']);assert.equal(counts(db).story_clusters,1);assert.equal(db.sqlite.prepare('SELECT publication_status FROM story_clusters').get()!.publication_status,'review');
}finally{db.close();}});

test('CI interrupted correction rolls back its link and owner; concurrent decisions on different versions remain independent',async()=>{const db=database();try{
 const first=fixtureBundle(1,{count:1}),second=fixtureBundle(2,{count:1,revision:' [SIMULATED new wording]'});await run(db,first);const before=counts(db),batch=db.batch.bind(db);
 db.batch=(async(stmts:any[])=>batch([...stmts.slice(0,-1),db.prepare("SELECT json('injected-last-audit-failure')"),stmts.at(-1)!])) as typeof db.batch;await assert.rejects(()=>run(db,second));assert.deepEqual(counts(db),before);db.batch=batch;await run(db,second);
 const one=JSON.parse(first.payload_json).candidates[0].candidate_id,two=JSON.parse(second.payload_json).candidates[0].candidate_id;const decisions=await Promise.all([resolve(db,one,'release'),resolve(db,two,'reject')]);assert.deepEqual(decisions.map(r=>r.state),['needs_review','rejected']);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id JOIN editorial_candidates c ON c.id=v.candidate_id WHERE c.state<>p.review_state').get()!.n,0);
 assert.throws(()=>db.sqlite.exec('DELETE FROM news_import_version_links'),/immutable/);assert.throws(()=>db.sqlite.exec('INSERT OR REPLACE INTO news_import_version_links SELECT * FROM news_import_version_links'),/immutable/);
}finally{db.close();}});
