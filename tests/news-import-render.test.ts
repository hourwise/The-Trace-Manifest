import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {experimental_AstroContainer as AstroContainer} from 'astro/container';
import {SQLiteD1} from './sqlite-d1';
import {realEvidence} from './real-news/evidence';
import {importNewsPackage,resolveNewsProposal} from '../src/lib/server/news-import/service';
import {registration} from '../src/lib/server/news-import/runtime/registry';
const db=new SQLiteD1(),e=realEvidence(),payload=JSON.parse(e.subset.payload_json);
try{
 db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));
 for(const id of new Set<string>(payload.candidates.map((c:any)=>c.source.id))){const r=registration(id);db.sqlite.prepare(`INSERT INTO sources(id,name,url,feed_url,section,tier,treatment,ingestion_type,active) VALUES (?,?,?,?,'A','A','test-only','rss',0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,feed_url=excluded.feed_url`).run(r.editorial_id,r.name,r.home,r.source.feed_url);}
 await importNewsPackage(db.asD1(),e.subset,e.subset.bundle_sha256,{email:'publisher@example.test',role:'publisher',requestId:'local-render-seed'});
 const container=await AstroContainer.create(),before=db.totalChanges();
 for(const name of ['desk','review']){
  const path=resolve('dist/_worker.js/pages/admin/'+name+'.astro.mjs');assert.ok(existsSync(path),'Build locally before rendered UI tests');const page=await(await import(pathToFileURL(path).href)).page();
  for(const role of ['publisher','reader'] as const){const response=await container.renderToResponse(page.default,{locals:{operator:{email:role+'@example.test',role,subject:role,expiresAt:Math.floor(Date.now()/1000)+600},runtime:{env:{DB:db.asD1(),TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_ENABLED:'true',TRACE_AI_EDITORIAL_ENABLED:'false'}}} as App.Locals,request:new Request('https://preview.example/admin/'+name)});
   if(name==='desk'&&role==='reader'){assert.equal(response.status,403);continue;}
   assert.equal(response.status,200);const html=await response.text();if(role==='reader'){assert.ok(!html.includes('Imported source proposals'));assert.ok(!html.includes('news-import-resolution'));}else{for(const c of payload.candidates){assert.ok(html.includes(c.title.replaceAll('&','&amp;')),'Real attributed title is visible to publisher');assert.ok(html.includes(c.source_hash),'Snapshot identity is visible');}assert.ok(html.includes('Google DeepMind Blog'));assert.ok(html.includes('Apple ML Research'));assert.ok(html.includes('Release to Needs review'));assert.ok(html.includes('No source excerpt')===false);assert.ok(html.includes('news-import-resolution'));}
  }
 }
 // Astro inlines this small controller into its manifest rather than emitting
 // a separate filename. Execute the built code against a minimal DOM fixture.
 const manifest=readFileSync(resolve('dist/_worker.js',readdirSync('dist/_worker.js').find(n=>n.startsWith('manifest_'))!),'utf8');
 const match=manifest.match(/\["[^"]*ImportedNewsProposals[^\"]*","((?:[^"\\]|\\.)*)"\]/);
 assert.ok(match,'Resolution controller exists in the actual build manifest');
 const controller=JSON.parse('"'+match[1]+'"');let submit:(event:any)=>Promise<void>=async()=>{throw new Error('No handler installed');};let request:any,reloaded=0;
 const form={dataset:{version:payload.candidates[0].candidate_id,revision:'0'},addEventListener:(type:string,handler:typeof submit)=>{assert.equal(type,'submit');submit=handler;},querySelector:()=>({textContent:''})};
 runInNewContext(controller,{document:{querySelectorAll:()=>[form]},FormData:class{get(){return 'Editor reviewed the retained source';}},fetch:async(url:string,options:any)=>{request={url,...options};return {ok:true,json:async()=>({state:'needs_review'})};},window:{location:{reload:()=>{reloaded++;}}}});
 await submit({preventDefault(){},submitter:{value:'release'}});
 assert.equal(request.url,'/api/admin/news-import');assert.deepEqual(JSON.parse(request.body),{operation:'resolve',resolution:{versionId:payload.candidates[0].candidate_id,revision:0,action:'release',reason:'Editor reviewed the retained source'}});assert.equal(reloaded,1);
 assert.equal(db.totalChanges(),before,'Rendering held news items never writes D1');
 const first=db.sqlite.prepare('SELECT version_id,candidate_id FROM news_import_versions ORDER BY version_id LIMIT 1').get()!;
 const heldDesk=await(await import(pathToFileURL(resolve('dist/_worker.js/pages/admin/desk.astro.mjs')).href)).page();
 const locals={operator:{email:'publisher@example.test',role:'publisher',subject:'publisher',expiresAt:Math.floor(Date.now()/1000)+600},runtime:{env:{DB:db.asD1(),TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_ENABLED:'false'}}} as App.Locals;
 for(const state of ['needs_review','rejected']){
  const beforePost=db.totalChanges();const denied=await container.renderToResponse(heldDesk.default,{locals,request:new Request('https://preview.example/admin/desk',{method:'POST',body:new URLSearchParams({_action:'transition',candidate_id:String(first.candidate_id),state})})});
  assert.equal(denied.status,200);assert.equal(db.totalChanges(),beforePost,'Generic held POST rolls back its candidate and audit writes');assert.equal(db.sqlite.prepare('SELECT state FROM editorial_candidates WHERE id=?').get(first.candidate_id)!.state,'held');
 }
 for(const name of ['desk','review']){const page=await(await import(pathToFileURL(resolve('dist/_worker.js/pages/admin/'+name+'.astro.mjs')).href)).page();const response=await container.renderToResponse(page.default,{locals,request:new Request('https://preview.example/admin/'+name)});assert.match(await response.text(),/news-import-resolution/,'Committed proposals remain reviewable after import gate closes');}
 await resolveNewsProposal(db.asD1(),{versionId:String(first.version_id),revision:0,action:'release',reason:'Local publisher approved source investigation'},{email:'publisher@example.test',role:'publisher',requestId:'local-render-release'});
 const deskPage=await(await import(pathToFileURL(resolve('dist/_worker.js/pages/admin/desk.astro.mjs')).href)).page();
 const transitionBody=new URLSearchParams({_action:'transition',candidate_id:String(first.candidate_id),state:'rejected'});
 const post=await container.renderToResponse(deskPage.default,{locals:{operator:{email:'publisher@example.test',role:'publisher',subject:'publisher',expiresAt:Math.floor(Date.now()/1000)+600},runtime:{env:{DB:db.asD1(),TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_ENABLED:'true'}}} as App.Locals,request:new Request('https://preview.example/admin/desk',{method:'POST',body:transitionBody})});
 assert.equal(post.status,200);assert.equal(db.sqlite.prepare('SELECT state FROM editorial_candidates WHERE id=?').get(first.candidate_id)!.state,'needs_review','Imported decisions cannot be replaced through a generic Desk state transition');assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM story_clusters').get()!.n,0);
 console.log('P4 rendered Desk and Review Queue tests passed: real evidence, publisher visibility, reader denial and zero GET writes.');
}finally{db.close();}
