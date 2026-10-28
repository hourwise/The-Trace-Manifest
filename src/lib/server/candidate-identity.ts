import {sourceUrlHash} from './source-identity';

/** Optional schema capability; legacy deployments never acquire a migration. */
export async function hasCandidateIdentityIndex(db:D1Database):Promise<boolean>{
 const row=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='editorial_candidates'").first<{sql:string}>();
 return !!row&&/\bsource_url_hash\b/.test(row.sql);
}
export async function candidateUrlIdentity(value:string|null):Promise<{hash:string|null;issue:'invalid_url'|'oversize_url'|null}>{
 if(!value)return {hash:null,issue:null};
 if(value.length>4096)return {hash:null,issue:'oversize_url'};
 try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('URL');}
 catch{return {hash:null,issue:'invalid_url'};}
 return {hash:await sourceUrlHash(value),issue:null};
}
