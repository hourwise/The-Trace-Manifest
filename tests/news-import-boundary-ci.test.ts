import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SQLiteD1} from './sqlite-d1';
import {handleAdminProxyRequest} from '../src/pages/api/admin/[...path]';
import worker from '../workers/ingestion/index';
import {fixtureBundle} from './fixtures/news-import/helpers';
import {registration} from '../src/lib/server/news-import/runtime/registry';

test('CI actual Access/Pages/Worker boundary rejects invalid claims and preserves signed authority after import gate closes',async()=>{
 const db=new SQLiteD1(),savedFetch=globalThis.fetch,evidence={subset:fixtureBundle()};try{
 db.countTriggerChanges=true;db.sqlite.exec('PRAGMA foreign_keys=ON');db.sqlite.exec(readFileSync('db/migration-0080-local-news-import.sql','utf8'));
 const candidates=JSON.parse(evidence.subset.payload_json).candidates;
 for(const id of new Set<string>(candidates.map((c:any)=>c.source.id))){const r=registration(id);db.sqlite.prepare("INSERT OR REPLACE INTO sources(id,name,url,feed_url,section,tier,treatment,ingestion_type,active) VALUES (?,?,?,?,'A','A','fixture','rss',0)").run(r.editorial_id,r.name,r.home,r.source.feed_url);}
 const seededChanges=db.totalChanges();
 const env={DB:db.asD1(),TRACE_ENVIRONMENT:'preview',TRACE_NEWS_IMPORT_ENABLED:'true',TRACE_NEWS_IMPORT_BUNDLE_SHA256:evidence.subset.bundle_sha256,TRACE_NEWS_IMPORT_WRITE_LIMIT:'40',TRACE_NEWS_IMPORT_FROM_UTC:new Date(Date.now()-60000).toISOString(),TRACE_NEWS_IMPORT_UNTIL_UTC:new Date(Date.now()+1800000).toISOString(),TRACE_INTERNAL_SERVICE_SECRET:'r1-local-only-never-deployed-'.repeat(3),CF_ACCESS_TEAM_DOMAIN:'r1-offline.cloudflareaccess.com',CF_ACCESS_AUD:'r1-aud',TRACE_ADMIN_PUBLISHERS:'publisher@example.test',TRACE_ADMIN_READERS:'reader@example.test',TRACE_INGESTION_WORKER_URL:'https://worker.example',TRACE_ALLOWED_ORIGINS:'https://preview.example'};
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',key.publicKey),kid:'r1-local-key'};
 async function token(changes:Record<string,unknown>={},badSignature=false){const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url'),body=enc({alg:'RS256',kid:jwk.kid})+'.'+enc({iss:'https://'+env.CF_ACCESS_TEAM_DOMAIN,aud:env.CF_ACCESS_AUD,exp:Math.floor(Date.now()/1000)+600,email:'publisher@example.test',sub:'local',...changes});return body+'.'+(badSignature?Buffer.alloc(256).toString('base64url'):Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(body))).toString('base64url'));}
 let calls=0;globalThis.fetch=(async(input:any,init?:any)=>{const request=new Request(input,init);if(request.url==='https://'+env.CF_ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});assert.equal(new URL(request.url).origin,'https://worker.example');calls++;assert.equal(request.headers.get('X-Trace-Operator'),'publisher@example.test');assert.equal(request.headers.get('X-Trace-Role'),'publisher');assert.notEqual(request.headers.get('X-Trace-Nonce'),'forged');return worker.fetch(request,env as any,{} as ExecutionContext);}) as typeof fetch;
 const data={operation:'import',bundle:evidence.subset,expectedHash:evidence.subset.bundle_sha256};
 async function send(jwt:string,body:unknown=data,origin='https://preview.example',overrides:Record<string,unknown>={}){return handleAdminProxyRequest(new Request('https://preview.example/api/admin/news-import',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Cf-Access-Jwt-Assertion':jwt,'X-Trace-Role':'publisher','X-Trace-Operator':'attacker@example.test','X-Trace-Nonce':'forged'},body:JSON.stringify(body)}),'news-import',{...env,...overrides});}
 for(const changes of [{aud:'wrong'},{iss:'https://wrong.cloudflareaccess.com'},{exp:1},{nbf:Math.floor(Date.now()/1000)+600},{email:'unknown@example.test'}])assert.equal((await send(await token(changes))).status,401);
 assert.equal((await send(await token({},true))).status,401);assert.equal((await send(await token({email:'reader@example.test'}))).status,403);assert.equal((await send(await token(),data,'https://evil.example')).status,403);assert.equal((await send(await token(),data,'https://preview.example',{TRACE_INTERNAL_SERVICE_SECRET:undefined})).status,503);assert.equal((await send(await token(),data,'https://preview.example',{TRACE_ENVIRONMENT:'production'})).status,503);assert.equal((await send(await token(),data,'https://preview.example',{TRACE_NEWS_IMPORT_ENABLED:undefined})).status,503);assert.equal(calls,0);assert.equal(db.totalChanges(),seededChanges);
 const result=await send(await token());assert.equal(result.status,200,await result.clone().text());const receipt=await result.json() as any;assert.equal(receipt.writes,20);assert.equal(receipt.item_count,3);
 const after=db.totalChanges();assert.equal((await send(await token())).status,200);assert.equal(db.totalChanges(),after);
 const beforeClose=calls;env.TRACE_NEWS_IMPORT_ENABLED='false';assert.equal((await send(await token())).status,503);assert.equal(calls,beforeClose);
 const get=await handleAdminProxyRequest(new Request('https://preview.example/api/admin/news-import',{headers:{'Cf-Access-Jwt-Assertion':await token()}}),'news-import',env);assert.equal(get.status,200);const p=(await get.json() as any).proposals[0];assert.equal(p.review_state,'held');
 const resolution={operation:'resolve',resolution:{versionId:p.version_id,revision:0,action:'release',reason:'Local authenticated review after closing intake'}};assert.equal((await send(await token(),resolution)).status,200);
 const row=db.sqlite.prepare('SELECT p.review_state,c.state FROM news_import_proposals p JOIN news_import_versions v ON v.version_id=p.version_id JOIN editorial_candidates c ON c.id=v.candidate_id WHERE p.version_id=?').get(p.version_id)!;assert.equal(row.state,'needs_review');assert.equal(row.review_state,row.state);
 assert.equal((await send(await token(),resolution)).status,409);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM story_clusters').get()!.n,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM feed_items').get()!.n,0);
 console.log('R1_SIGNED_LIFECYCLE '+JSON.stringify({receipt,after_import_total_changes:after,worker_calls:calls,statement_count:db.statementLog.length,max_parameters:Math.max(...db.statementLog.map(s=>s.parameterCount)),note:'All Access keys and fetches are offline fixtures; source evidence is a committed fictional fixture.'}));
 }finally{globalThis.fetch=savedFetch;db.close();}
});
