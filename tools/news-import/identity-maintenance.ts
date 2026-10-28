/** Local FILES only. No remote driver, credential lookup, migration or network. */
import {DatabaseSync} from 'node:sqlite';
import {existsSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectCandidateIdentities,backfillCandidateIdentities} from '../../src/lib/server/news-import/service';
import {sha256} from '../../src/lib/server/news-import/runtime/primitives';

const args=process.argv.slice(2),mode=args.shift(),options=new Map<string,string>();
for(let n=0;n<args.length;n+=2){if(!/^--[a-z-]+$/.test(args[n])||!args[n+1]||options.has(args[n]))throw new Error('Explicit paired arguments required');options.set(args[n],args[n+1]);}
if(!['status','apply'].includes(mode??'')||[...options.keys()].some(k=>!['--database','--operator','--after','--limit','--approval-id','--maximum-writes'].includes(k)))throw new Error('Use status|apply --database <existing D: SQLite file> --operator <email> [--after <id>] [--limit 25]');
const path=resolve(options.get('--database')??'');
if(!/^[dD]:[\\/]/.test(path)||!existsSync(path)||!/^D:[\\/]/i.test(realpathSync.native(path)))throw new Error('Existing direct D: database required; no fallback or remote connection');
const limit=Number(options.get('--limit')??25),after=options.get('--after')??'',approval=options.get('--approval-id');
if(mode==='apply'&&(!approval||!/^[-A-Za-z0-9_]{1,50}$/.test(approval)||!options.has('--maximum-writes')))throw new Error('Apply requires explicit local approval identity and maximum writes (0–26)');
const db=new DatabaseSync(path,{readOnly:mode==='status'});db.exec('PRAGMA foreign_keys=ON');
function statement(sql:string,parameters:any[]=[]):any{
 const prepared=db.prepare(sql);return {bind:(...p:any[])=>statement(sql,p),first:async()=>prepared.get(...parameters)??null,all:async()=>({success:true,results:prepared.all(...parameters),meta:{}}),run:async()=>{const before=Number(db.prepare('SELECT total_changes() n').get()!.n);prepared.run(...parameters);return {success:true,results:[],meta:{changes:Number(db.prepare('SELECT total_changes() n').get()!.n)-before}};}};
}
const d1={prepare:statement,batch:async(statements:any[])=>{db.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
try{
 const actor={email:options.get('--operator')??'',role:'publisher',requestId:(approval??'readonly')+'-'+crypto.randomUUID()};
 const result=mode==='status'?await inspectCandidateIdentities(d1,actor,after,limit):await backfillCandidateIdentities(d1,actor,after,limit,Number(options.get('--maximum-writes')));
 // Never echo legacy URLs (which may contain private query strings) or raw hashes.
 const safe=mode==='status'&&'rows' in result?{...result,rows:result.rows.map(r=>({id:r.id,url_length:r.url_length,canonical_hash:r.canonical_hash,issue:r.issue,url_fingerprint:sha256(r.submitted_url+':'+r.url_length)}))}:result;
 console.log(JSON.stringify({mode,database:path,approval_id:approval??null,remote_operations:0,...safe}));
}finally{db.close();}
