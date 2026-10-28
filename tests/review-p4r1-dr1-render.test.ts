// R2 runs the independent DR1 render probe; owner discovery now uses explicit stable queue-row identity. Original Claude worktree is untouched.
// TRACE-LOCAL-NEWS-P4-R1-DR1: the BUILT integrated Desk (P4-R1 + PR #19)
// with the real three-item import. Local review branch only. Run after build.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {experimental_AstroContainer as AstroContainer} from 'astro/container';
import {SQLiteD1} from './sqlite-d1';
import {realEvidence} from './real-news/evidence';
import {importNewsPackage} from '../src/lib/server/news-import/service';
import {registration} from '../src/lib/server/news-import/runtime/registry';

const DESK=resolve('dist/_worker.js/pages/admin/desk.astro.mjs');
assert.ok(existsSync(DESK),'Build before this probe');
const e=realEvidence(),payload=JSON.parse(e.subset.payload_json),db=new SQLiteD1();db.countTriggerChanges=true;
try{
 db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));
 for(const id of new Set<string>(payload.candidates.map((c:any)=>c.source.id))){const r=registration(id);db.sqlite.prepare(`INSERT INTO sources(id,name,url,feed_url,section,tier,treatment,ingestion_type,active) VALUES (?,?,?,?,'A','A','test-only','rss',0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,feed_url=excluded.feed_url`).run(r.editorial_id,r.name,r.home,r.source.feed_url);}
 await importNewsPackage(db.asD1(),e.subset,e.subset.bundle_sha256,{email:'publisher@example.test',role:'publisher',requestId:'dr1-render-seed'});
 const insert=db.sqlite.prepare("INSERT INTO editorial_candidates(id,intake_type,submitted_url,lead_text,source_hash,state,created_by,created_at) VALUES (?,'manual_url',?,'Newer intake',?,'new','e',datetime('now','+1 day'))");
 for(let i=0;i<120;i++)insert.run(crypto.randomUUID(),'https://newer.example/'+i,'n'+i);
 const imported=db.sqlite.prepare("SELECT id FROM editorial_candidates WHERE id GLOB 'local-news-p4:*' ORDER BY id").all().map((r:any)=>String(r.id));
 const container=await AstroContainer.create(),page=(await import(pathToFileURL(DESK).href)).page;
 const render=async(query='',role:'publisher'|'reader'='publisher',init?:RequestInit)=>{const p=await page();const res=await container.renderToResponse(p.default,{locals:{operator:{email:role+'@example.test',role,subject:role,expiresAt:Math.floor(Date.now()/1000)+600},runtime:{env:{DB:db.asD1(),TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_ENABLED:'false',TRACE_AI_EDITORIAL_ENABLED:'false'}}} as unknown as App.Locals,request:new Request('https://preview.example/admin/desk'+query,init)});return {status:res.status,html:res.status===200?(await res.text()).replace(/ data-astro-cid-[a-z0-9]+/g,''):''};};
 const before=db.totalChanges();
 const desk=await render();
 const listed=[...desk.html.matchAll(/data-candidate-id="(local-news-p4:[a-f0-9]{64})"/g)].map(m=>m[1]);
 const genericForms=imported.filter(id=>new RegExp(`name="candidate_id" value="${id}"\\s*/?>\\s*<input type="hidden" name="state"`).test(desk.html));
 const result={
  default_filter_current:/data-desk-filter="decide" aria-current="page"/.test(desk.html),
  decide_count:/data-desk-filter="decide"[^>]*>\s*Needs a decision <span class="count">(\d+)</.exec(desk.html)?.[1],
  held_count:/data-desk-filter="held"[^>]*>\s*Held <span class="count">(\d+)</.exec(desk.html)?.[1],
  new_count:/data-desk-filter="new"[^>]*>\s*New <span class="count">(\d+)</.exec(desk.html)?.[1],
  imported_in_queue:imported.filter(id=>desk.html.includes(`id="source-${id}"`)||desk.html.includes(id)).length,
  governed_notes:(desk.html.match(/Resolve this imported proposal using the source controls above/g)??[]).length,
  generic_transition_forms_for_imports:genericForms.length,
  panel_resolution_forms:(desk.html.match(/class="news-import-resolution"/g)??[]).length,
  new_filter_has_next:/class="desk-pages"[\s\S]*Next page/.test((await render('?filter=new')).html),
  reader_status:(await render('','reader')).status,
  get_writes:db.totalChanges()-before,
 };
 const postBefore=db.totalChanges();
 const post=await render('?filter=decide','publisher',{method:'POST',body:new URLSearchParams({_action:'transition',candidate_id:imported[0],state:'needs_review'})});
 const postResult={status:post.status,error_shown:/<p style="margin:0;color:var\(--ev-disputed\);">([^<]*)</.exec(post.html)?.[1]??null,writes:db.totalChanges()-postBefore,state:(db.sqlite.prepare('SELECT state FROM editorial_candidates WHERE id=?').get(imported[0]) as any).state,stays_on_filter:/data-desk-filter="decide" aria-current="page"/.test(post.html)};
 console.log('DR1 render '+JSON.stringify({...result,listed_unique:new Set(listed).size,post:postResult}));
 assert.equal(result.decide_count,'3');assert.equal(result.imported_in_queue,3);assert.equal(new Set(listed).size,3);assert.equal(result.generic_transition_forms_for_imports,0);assert.equal(result.get_writes,0);assert.equal(result.reader_status,403);assert.equal(postResult.writes,0);assert.equal(postResult.state,'held');
}finally{db.close();}
