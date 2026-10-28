import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SQLiteD1} from './sqlite-d1';
import {EXPECTED_IMPORT_TRIGGERS} from '../src/lib/server/news-import/expected-triggers';
import {transitionCandidate} from '../src/lib/server/admin-page-writes';
import {realEvidence} from './real-news/evidence';
import {registration} from '../src/lib/server/news-import/runtime/registry';
import {importNewsPackage,resolveNewsProposal} from '../src/lib/server/news-import/service';
import {parseP3 as localParse,registration as localRegistration} from '../tools/news-import/parser-source/registry';
import {parseP3 as hostedParse} from '../src/lib/server/news-import/runtime/registry';
const actor={email:'publisher@example.test',role:'publisher' as const,requestId:'r1-migration'};
const e=realEvidence();

for(const newsletters of [false,true])test('0080 integrity and isolation on 0077'+(newsletters?'+0078+0079':''),async()=>{
 const db=new SQLiteD1();try{
 db.countTriggerChanges=true;db.sqlite.exec('PRAGMA foreign_keys=ON');
 if(newsletters)for(const file of ['0078-newsletter-subscriptions.sql','0079-newsletter-issues.sql'])db.sqlite.exec(readFileSync('tests/fixtures/news-import/'+file,'utf8'));
 db.sqlite.exec("INSERT INTO editorial_candidates(id,intake_type,source_hash,lead_text,state,created_by) VALUES ('legacy-held','lead','historical-hash','Original bytes','held','legacy')");
 const legacy=db.sqlite.prepare('SELECT * FROM editorial_candidates').all().map(row=>({...row}));
 const unrelated=()=>db.sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'news_import_%' AND name<>'editorial_candidates' ORDER BY name").all();const before=unrelated();
 db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));assert.deepEqual(unrelated(),before);
 const after=db.sqlite.prepare('SELECT * FROM editorial_candidates').all().map(({source_url_hash,source_url_identity_issue,...row})=>row);assert.deepEqual(after,legacy);
 assert.equal(await transitionCandidate(db.asD1(),actor,'legacy-held','held','needs_review'),true);
 const expected=db.sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'news_import_%' ORDER BY name").all().map(r=>({name:r.name,sql:String(r.sql).trim().replace(/\s+/g,' ')}));assert.deepEqual(expected,EXPECTED_IMPORT_TRIGGERS);
 for(const c of JSON.parse(e.subset.payload_json).candidates){const r=registration(c.source.id);db.sqlite.prepare("INSERT OR REPLACE INTO sources(id,name,url,feed_url,section,tier,treatment,ingestion_type,active) VALUES (?,?,?,?,'A','A','fixture-only','rss',0)").run(r.editorial_id,r.name,r.home,r.source.feed_url);}
 const imported=await importNewsPackage(db.asD1(),e.subset,e.subset.bundle_sha256,{...actor,requestId:'r1-import'});assert.equal(imported.candidates_created,3);
 assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 const p=db.sqlite.prepare('SELECT version_id FROM news_import_proposals ORDER BY version_id LIMIT 1').get()!;
 for(const sql of ["UPDATE news_import_proposals SET revision=2,review_state='needs_review',review_reason='x',reviewed_by='x',reviewed_at='now' WHERE version_id=?","UPDATE news_import_proposals SET revision=1,review_state='needs_review',review_reason=NULL,reviewed_by='x',reviewed_at='now' WHERE version_id=?"]){assert.throws(()=>db.sqlite.prepare(sql).run(p.version_id),/transition/);}
 assert.throws(()=>db.sqlite.prepare('INSERT INTO news_import_deliveries(package_id,version_id) VALUES (?,?)').run('missing','0'.repeat(64)),/FOREIGN KEY/);
 assert.throws(()=>db.sqlite.exec('INSERT INTO news_import_deliveries SELECT * FROM news_import_deliveries'),/immutable/);
 for(const table of ['news_import_packages','news_import_versions','news_import_deliveries','news_import_proposals','news_import_events'])assert.throws(()=>db.sqlite.exec('INSERT OR REPLACE INTO '+table+' SELECT * FROM '+table),/immutable/);
 assert.throws(()=>db.sqlite.prepare("UPDATE news_import_proposals SET revision=0.5 WHERE version_id=?").run(p.version_id),/transition|CHECK/);
 assert.throws(()=>db.sqlite.exec('DELETE FROM news_import_proposals'),/immutable/);
 await resolveNewsProposal(db.asD1(),{versionId:String(p.version_id),revision:0,action:'reject',reason:'Local rejection tests atomic ownership'}, {...actor,requestId:'r1-reject'});
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id JOIN editorial_candidates c ON c.id=v.candidate_id WHERE p.review_state<>c.state').get()!.n,0);
 const changes=db.totalChanges();assert.equal((await importNewsPackage(db.asD1(),e.subset,e.subset.bundle_sha256,{...actor,requestId:'r1-replay'})).writes,0);assert.equal(db.totalChanges(),changes);
 for(const [sql,args,index] of [
  ['SELECT id FROM editorial_candidates WHERE source_url_hash=?',['0'.repeat(64)],'idx_editorial_candidate_url_hash'],
  ['SELECT version_id FROM news_import_versions WHERE candidate_id=?',['owner'],'news_import_versions_candidate'],
  ["SELECT id FROM editorial_candidates INDEXED BY idx_editorial_candidate_unindexed_url WHERE source_url_hash IS NULL AND submitted_url IS NOT NULL AND source_url_identity_issue IS NULL AND id>? ORDER BY id LIMIT 25",[''],'idx_editorial_candidate_unindexed_url'],
 ] as const){const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...args);assert.ok(plan.some(r=>String(r.detail).includes(index)||(index==='news_import_versions_candidate'&&String(r.detail).includes('SEARCH news_import_versions USING INDEX')&&String(r.detail).includes('candidate_id=?'))),JSON.stringify({index,plan}));}
 }finally{db.close();}
});

test('Production-shaped schema without 0080 retains PR18 ordinary held transitions',async()=>{
 const db=new SQLiteD1(true,true,true,true,true,false);try{db.sqlite.exec("INSERT INTO editorial_candidates(id,intake_type,source_hash,state,created_by) VALUES ('legacy-production','lead','preserved','held','legacy')");assert.equal(await transitionCandidate(db.asD1(),actor,'legacy-production','held','needs_review'),true);assert.equal(db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='news_import_proposals'").get(),undefined);}finally{db.close();}
});

test('Legacy published/withdrawn memberships survive local 0077 then 0080 upgrade byte-for-byte',()=>{
 const db=new SQLiteD1(true,true,true,true,true,false);try{
 db.sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO feed_items(id,source_id,url,url_hash,title,ingestion_status) VALUES (991,1,'https://legacy.example/article','legacy-hash','Legacy','published'); INSERT INTO story_clusters(id,title,topic,summary,evidence_status,publication_status) VALUES (991,'Published legacy','models','Original','vendor_reported','published'),(992,'Withdrawn legacy','models','Original','vendor_reported','withdrawn'); INSERT INTO story_cluster_members(cluster_id,feed_item_id,is_primary) VALUES (991,991,1),(992,991,0)");
 const memberships=db.sqlite.prepare('SELECT * FROM story_cluster_members ORDER BY cluster_id').all(),stories=db.sqlite.prepare('SELECT id,title,summary,publication_status FROM story_clusters ORDER BY id').all(),feed=db.sqlite.prepare('SELECT * FROM feed_items').all();
 db.sqlite.exec(readFileSync('db/migration-0077-editorial-source-identity.sql','utf8'));db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM story_cluster_members ORDER BY cluster_id').all(),memberships);assert.deepEqual(db.sqlite.prepare('SELECT id,title,summary,publication_status FROM story_clusters ORDER BY id').all(),stories);assert.deepEqual(db.sqlite.prepare('SELECT * FROM feed_items').all(),feed);assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('Generated SAX projection matches accepted parser on every real feed and hostile fixture',()=>{
 // Determine ownership from the immutable candidate-to-snapshot binding, not text heuristics.
 for(const c of JSON.parse(e.subset.payload_json).candidates){const s=e.subset.snapshots.find(s=>s.sha256===c.source_hash)!;assert.deepEqual(hostedParse(s.xml,registration(c.source.id).source),localParse(s.xml,localRegistration(c.source.id).source));}
 const source=registration('trace-source-7').source;
 for(const xml of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "https://blocked.invalid">]><rss/>','<rss><channel><item></channel></rss>','<rss>'+('a'.repeat(524289))+'</rss>','<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>&lt;script&gt;x&lt;/script&gt;</title><id>x</id><link href="javascript:alert(1)"/></entry></feed>']){
  const attempt=(fn:typeof localParse)=>{try{return {ok:fn(xml,fn===localParse?localRegistration(source.id).source:source)};}catch(error){return {error:(error as Error).message};}};assert.deepEqual(attempt(hostedParse),attempt(localParse));
 }
 assert.equal(e.subset.snapshots.length,2);
});
