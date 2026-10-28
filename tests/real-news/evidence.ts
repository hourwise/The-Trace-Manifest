import {readFileSync,mkdirSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {canonical,sha256} from '../../src/lib/server/news-import/runtime/primitives';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const baseline=process.env.TRACE_ACQUISITION_BASELINE??'D:/Users/fleur/The Trace Manifest/.worktrees/trace-local-news-p4-r1-release/local/acquisition';
const load=(file:string)=>import(pathToFileURL(resolve(baseline,file)).href);
const {Storage}=await load('p1/storage.ts');
import {parseP3,registration} from '../../src/lib/server/news-import/runtime/registry';
import {validateBundle,bundleHash,type Bundle} from '../../src/lib/server/news-import/runtime/bundle';
import {validateBundle as validateHosted} from '../../src/lib/server/news-import/runtime/bundle';
const {ByteLedger}=await load('news/p3/r2/ledger.ts');
const {replayEvidence}=await load('news/p3/r2/collector.ts');

export const LIVE_BUNDLE='6adc79b4f0e8fa187fd59f9ea1e7513241c26c6915cde3cf4bf9846f0f0ac05b';
export const LIVE_FILE_HASH='d88ecb6cdeec55508ce912ba5b244187a1a0b7f583794698f9ca97dc6582c38f';
export const LIVE_AUDIT='a18fa20255b8085dbe1e420e344af7d7bcb9686191deca050c72ac2c043f4219';
/** Input evidence is read-only: no mkdir or process cache/TEMP redirection. */
function evidenceLocation(input:string){
 const root=realpathSync.native(resolve(input)),fold=(s:string)=>process.platform==='win32'?s.toLowerCase():s;
 if(process.platform==='win32'?!/^D:[\\/]/i.test(root):!root.startsWith('/mnt/d/'))throw new Error('Evidence must remain on D:');
 return {path:(relative:string)=>{const path=realpathSync.native(resolve(root,relative));if(!fold(path).startsWith(fold(root+sep)))throw new Error('Evidence path escapes root');return path;}};
}
export function realEvidence(){
 const root=process.env.TRACE_P4_EVIDENCE_ROOT??'D:\\TRACE\\local-acquisition\\news-p3-r2-final',s=evidenceLocation(root);
 const bytes=readFileSync(s.path(`reports/news-p3-r2/${LIVE_BUNDLE}.live-review.bundle.json`));if(sha256(bytes)!==LIVE_FILE_HASH)throw new Error('Actual live bundle bytes changed');
 const bundle=JSON.parse(bytes.toString('utf8')) as Bundle,{payload}=validateBundle(bundle,LIVE_BUNDLE);validateHosted(bundle,LIVE_BUNDLE);
 const auditBytes=readFileSync(s.path(`reports/news-p3-r2/real-pilot-audit-${LIVE_AUDIT}.json`));if(sha256(auditBytes)!==LIVE_AUDIT)throw new Error('Live audit bytes changed');
 const db=new DatabaseSync(s.path('state/news-p3/catalogue.sqlite'),{readOnly:true});const tables=['captures','versions','items','observations','runs','exports'],state=()=>Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
 let history:any,feeds:any[];
 try{history=state();feeds=history.captures.map((row:any)=>{const raw=readFileSync(s.path(`snapshots/news-p3/${row.source_hash}.xml`),'utf8'),parsed=parseP3(raw,registration(row.source_id).source),normal=canonical(parsed)+'\n';if(sha256(raw)!==row.source_hash||sha256(normal)!==row.normalized_hash||readFileSync(s.path(`snapshots/news-p3/${row.normalized_hash}.json`),'utf8')!==normal)throw new Error('Live capture mismatch');return {row,parsed};});
  for(const v of history.versions){const item=feeds.flatMap(f=>f.parsed.items).find(i=>i.item_id===v.item_id&&i.content_hash===v.content_hash);if(!item||v.id!==sha256(canonical({schema:'trace-news-extraction-p2.1',item_id:v.item_id,content_hash:v.content_hash}))||canonical(item)!==v.json)throw new Error('Stored live version mismatch');}
  if(history.versions.length!==110||feeds.reduce((n,f)=>n+f.parsed.entries_seen,0)!==110||canonical(history)!==canonical(state()))throw new Error('Unexpected live catalogue or replay write');
 }finally{db.close();}
 const l=new ByteLedger(s.path('state/news-p3-r2/pilot.sqlite'),'live',true);let replay;try{replay=replayEvidence(s,l);if(canonical(replay)!==canonical(replayEvidence(s,l))||replay.totals.attempts!==4||replay.totals.observed_body_bytes!==79074||replay.attempts.map((a:any)=>a.transport?.status).join(',')!=='200,200,304,304')throw new Error('Live accounting differs');}finally{l.close();}
 const inventory=payload.candidates.map((c:any)=>({candidate_id:c.candidate_id,item_id:c.item_id,source_organisation:registration(c.source.id).name,source_id:c.source.id,feed_url:c.source.feed_url,title:c.title,canonical_url:c.canonical_url,published_at:c.published_at,original_publication_date:c.original_publication_date,retrieved_at:c.retrieved_at,excerpt:c.excerpt,excerpt_missing:c.excerpt.length===0,snapshot_sha256:c.source_hash,content_sha256:c.content_hash,provenance_locator:c.provenance.locator,duplicate_identity:c.duplicate_identity,review_sufficiency:c.excerpt.length>=80?'feed_summary_sufficient_for_preview_workflow_test':'limited_text_requires_article_investigation',limitations:[...(c.excerpt?'':['missing_excerpt']),...(!c.updated_at?['no_item_update_timestamp']:[]),...(!c.published_at?['missing_publication_date']:[]),'publisher_claims_unverified','article_not_retrieved'],article_verification_required:true,review_required:true,verification_status:'unverified'}));
 const rank=(a:any,b:any)=>(b.published_at??'').localeCompare(a.published_at??'')||a.item_id.localeCompare(b.item_id);
 const eligible=inventory.filter((c:any)=>c.review_sufficiency==='feed_summary_sufficient_for_preview_workflow_test').sort(rank),chosen:any[]=[];
 for(const id of ['trace-source-20','trace-source-7']){const c=eligible.find((c:any)=>c.source_id===id);if(c)chosen.push(c);}
 for(const c of eligible)if(chosen.length<3&&!chosen.some(v=>v.item_id===c.item_id))chosen.push(c);
 if(chosen.length!==3)throw new Error('Three supported bounded candidates unavailable');
 const ids=new Set(chosen.map(c=>c.item_id)),selected=payload.candidates.filter((c:any)=>ids.has(c.item_id));
 const nextPayload={...payload,candidates:selected,pagination:{after:'',limit:3,next_cursor:null}},payload_json=canonical(nextPayload)+'\n',package_id='TRACE-NEWS-P3-000002',payload_sha256=sha256(payload_json),envelope_json=canonical({schema:'trace-news-envelope-p2.1',package_id,payload_sha256,bytes:Buffer.byteLength(payload_json),candidate_count:3,next_cursor:null})+'\n';
 const subsetWithoutHash={schema:bundle.schema,package_id,payload_sha256,payload_json,envelope_json,snapshots:bundle.snapshots.filter(s=>selected.some((c:any)=>c.source_hash===s.sha256))};const subset={...subsetWithoutHash,bundle_sha256:bundleHash(subsetWithoutHash)};validateBundle(subset,subset.bundle_sha256);validateHosted(subset,subset.bundle_sha256);
 const manifest={schema:'trace-news-p4-subset-v1',selection_rule:'one newest summary-bearing candidate from each publisher, then newest remaining; 80-character minimum excerpt; date descending, item identity tie-break; preserve original item order',parent_bundle_sha256:LIVE_BUNDLE,parent_file_sha256:LIVE_FILE_HASH,package_id,subset_bundle_sha256:subset.bundle_sha256,payload_sha256,selected:chosen.map(c=>({candidate_id:c.candidate_id,item_id:c.item_id,source_id:c.source_id,source_hash:c.snapshot_sha256,content_hash:c.content_sha256,canonical_url:c.canonical_url})),selection_is_not_approval:true};
 return {bundle,payload,subset,manifest,inventory,feeds:feeds.map(f=>({source_id:f.row.source_id,source_hash:f.row.source_hash,normalized_hash:f.row.normalized_hash,retrieved_at:f.row.first_retrieved_at,entries:f.parsed.entries_seen,missing_excerpts:f.parsed.items.filter((i:any)=>!i.excerpt).length,missing_update_timestamps:f.parsed.items.filter((i:any)=>!i.updated_at).length})),replay,source_state_sha256:sha256(canonical(history)),audit:JSON.parse(auditBytes.toString('utf8'))};
}
export function writeEvidence(root='D:\\TRACE\\local-acquisition\\news-p4-r2'){
 const e=realEvidence(),s=new Storage(root);mkdirSync(s.path('reports'),{recursive:true});
 const artifacts:any={};for(const [name,value] of Object.entries({inventory:{schema:'trace-news-p4-quality-v1',parent_bundle_sha256:LIVE_BUNDLE,candidates:e.inventory,feeds:e.feeds},subset:e.subset,manifest:e.manifest})){const bytes=canonical(value)+'\n',hash=sha256(bytes),path=s.path(`reports/${name}-${hash}.json`);if(existsSync(path)){if(readFileSync(path,'utf8')!==bytes)throw new Error('Immutable P4 evidence mismatch');}else writeFileSync(path,bytes,{flag:'wx'});artifacts[name]={path,sha256:hash};}
 const md=['# P4 deterministic real-candidate quality inventory','',`Parent bundle: ${LIVE_BUNDLE}. All ten candidates remain intact. Selected subset: ${e.manifest.subset_bundle_sha256}. Selection is workflow testing, not publication approval. No inference, article fetch or remote import.`,...e.inventory.flatMap((c:any,n:number)=>['',`## ${n+1}. ${c.title}`,'',`Publisher: ${c.source_organisation} (${c.source_id}). URL: ${c.canonical_url}.`, '',`Source publication: ${c.original_publication_date??'missing'}; parsed: ${c.published_at??'unknown'}. Retrieval: ${c.retrieved_at}.`, '',`Excerpt (retained verbatim): ${c.excerpt||'[MISSING — not fabricated]'}`, '',`Snapshot: ${c.snapshot_sha256}. Locator: ${c.provenance_locator}. Item: ${c.item_id}. Version: ${c.candidate_id}. Content: ${c.content_sha256}.`, '',`Duplicate key: ${c.duplicate_identity.editorial_primary_source_key}. Sufficiency: ${c.review_sufficiency}. Selected: ${e.manifest.selected.some(x=>x.item_id===c.item_id)}.`, '',`Limitations: ${c.limitations.join(', ')}. Additional article-level factual verification is required.`])].join('\n')+'\n';const path=s.path(`reports/candidate-quality-${sha256(md)}.md`);if(!existsSync(path))writeFileSync(path,md,{flag:'wx'});return {artifacts,quality_report:path,subset_bundle_sha256:e.subset.bundle_sha256,source_state_sha256:e.source_state_sha256};
}
