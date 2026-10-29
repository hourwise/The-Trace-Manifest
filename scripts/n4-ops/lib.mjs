// N4-OPS-01 shared offline primitives. Local files only: this module never imports
// network, process-spawning or provider modules, and nothing here can approve or send.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,statSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Mirrors src/lib/server/identity-maintenance/contract.ts; tests/n4-ops-01.test.ts pins each value.
export const N4_VERSION='trace-preview-identity-n4.1';
export const PREVIEW_DATABASE_ID='f312f662-2252-4005-8103-1a40d546e16b';
export const PREVIEW_DATABASE_NAME='trace-manifest-db-preview';
export const IDENTITY_MIGRATION_SHA256='3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be';
export const PLAN_SCHEMA='trace-preview-identity-readiness-n4.1';
export const MAX_PAGE=25,MAX_SLOTS=10,MAX_PROFILE_BYTES=4096,MAX_WINDOW_MS=3600000,CLOSING_MARGIN_MS=15000;
export const MAX_ROW_CHANGES=27,MAX_WRITE_UNITS=133,MAX_INPUT_BYTES=262144;
export const DEFAULT_MAX_EVIDENCE_AGE_MINUTES=240,HARD_MAX_EVIDENCE_AGE_MINUTES=1440;
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const APPROVAL_REF=/^[-A-Za-z0-9_]{1,100}$/;
export const SCHEMA={
 target:'trace-n4-ops-target-evidence.1',inventory:'trace-n4-ops-inventory-capture.1',
 package:'trace-n4-ops-approval-package.1',approval:'trace-n4-ops-owner-approval.1',
 readback:'trace-n4-ops-deployment-readback.1',verification:'trace-n4-ops-deployment-verification.1',
 request:'trace-n4-ops-request-record.1',lookup:'trace-n4-ops-receipt-lookup.1',
 audit:'trace-n4-ops-audit-evidence.1',reconciliation:'trace-n4-ops-reconciliation.1',
};
export const PROFILE_KEYS=['schema','approval_ref','owner_approval','environment','database_id','target_attestation_sha256','implementation_sha256','migration_sha256','publisher_email','from_utc','until_utc','requests'];
export const SLOT_KEYS=['request_id','after','limit','selection_sha256','maximum_row_changes','maximum_write_units'];
export const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');

export class OpsError extends Error{constructor(code,detail=''){super(detail?`${code}: ${detail}`:code);this.code=code;}}
export const fail=(code,detail)=>{throw new OpsError(code,detail);};
export const sha256=v=>createHash('sha256').update(v).digest('hex');

/** Byte-compatible with src/lib/server/news-import/runtime/primitives.ts canonical(). */
export function canonical(value){
 const walk=v=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return v.map(walk);
  if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,walk(v[k])]));
  throw new OpsError('non_canonical_value');
 };
 return JSON.stringify(walk(value));
}
export function exactKeys(value,keys,where){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('malformed_input',`${where} must be an object`);
 const have=Object.keys(value).sort().join(','),want=[...keys].sort().join(',');
 if(have!==want)fail('malformed_input',`${where} keys must be exactly [${want}], found [${have}]`);
}
export function isoUtc(value,where){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))fail('malformed_time',`${where} must be canonical UTC like 2026-10-30T09:00:00.000Z`);
 const ms=Date.parse(value);if(!Number.isFinite(ms)||new Date(ms).toISOString()!==value)fail('malformed_time',`${where} is not a real UTC instant`);
 return ms;
}
export const email=(v,where)=>{if(typeof v!=='string'||v.length>200||!/^\S+@\S+\.\S+$/.test(v)||v!==v.toLowerCase())fail('malformed_input',`${where} must be a lowercase email of at most 200 characters`);return v;};
export const hash=(v,where)=>{if(typeof v!=='string'||!HASH.test(v))fail('malformed_hash',`${where} must be a lowercase SHA-256`);return v;};
export const cursorText=(v,where)=>{if(typeof v!=='string'||v.length>200||/[\u0000-\u001f\u007f]/.test(v))fail('malformed_cursor',`${where} must be a cursor of at most 200 characters`);return v;};
/** SQLite's BINARY collation compares UTF-8 bytes; JavaScript string order would differ for astral characters. */
export const byteOrder=(a,b)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));

export function readEvidence(path,where){
 const file=resolve(path);if(!existsSync(file)||!statSync(file).isFile())fail('missing_input',`${where}: ${path}`);
 const bytes=readFileSync(file);if(bytes.length>MAX_INPUT_BYTES)fail('input_too_large',`${where} exceeds ${MAX_INPUT_BYTES} bytes`);
 if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)fail('malformed_input',`${where} must not start with a byte-order mark`);
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('malformed_input',`${where} is not UTF-8`);}
 let value;try{value=JSON.parse(text);}catch{fail('malformed_input',`${where} is not JSON`);}
 return {path:file,bytes,sha256:sha256(bytes),value};
}

/** Strict argument parser: an unknown option (for example --approve or --execute) is refused, never ignored. */
export function parseArgs(argv,spec){
 const out={};for(const [k,s] of Object.entries(spec))if(s.type==='list')out[k]=[];
 for(let i=0;i<argv.length;i++){
  const raw=argv[i];if(!raw.startsWith('--'))fail('unknown_argument',raw);
  const name=raw.slice(2),s=spec[name];if(!s)fail('unknown_argument',raw);
  const value=argv[++i];if(value===undefined||value.startsWith('--'))fail('missing_argument_value',raw);
  if(s.type==='list')out[name].push(value);else{if(name in out)fail('duplicate_argument',raw);out[name]=value;}
 }
 for(const [k,s] of Object.entries(spec))if(s.required&&(s.type==='list'?!out[k].length:out[k]===undefined))fail('missing_argument',`--${k}`);
 return out;
}

/** Evidence stays outside the public repository, and on D: when run on the Windows workstation. */
export function outputDirectory(path){
 const dir=resolve(path);if(!existsSync(dir)||!statSync(dir).isDirectory())fail('missing_output_directory',path);
 const real=realpathSync(dir),rel=relative(realpathSync(REPO_ROOT),real);
 if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))fail('output_inside_repository','write evidence to a TRACE-managed folder outside the repository');
 if(process.platform==='win32'&&!/^D:\\/i.test(real))fail('output_not_on_d','TRACE-managed evidence must reside on D:');
 return real;
}
/** Immutable, content-addressed write: an existing file is accepted only if byte-identical. */
export function writeAddressed(dir,prefix,ext,bytes){
 const digest=sha256(bytes),file=join(dir,`${prefix}-${digest}.${ext}`);
 if(existsSync(file)){if(!readFileSync(file).equals(bytes))fail('content_address_collision',file);}else writeFileSync(file,bytes,{flag:'wx'});
 return {path:file,sha256:digest};
}
export const jsonBytes=v=>Buffer.from(JSON.stringify(v,null,1)+'\n');

/** Profile in the exact key order and value shape that approvedProfile() accepts. */
export function profileObject(p,ownerApproval){
 return {schema:N4_VERSION,approval_ref:p.approval_ref,owner_approval:ownerApproval,environment:'preview',database_id:p.database_id,target_attestation_sha256:p.target_attestation_sha256,implementation_sha256:p.implementation_sha256,migration_sha256:p.migration_sha256,publisher_email:p.publisher_email,from_utc:p.from_utc,until_utc:p.until_utc,
  requests:p.requests.map(r=>({request_id:r.request_id,after:r.after,limit:r.limit,selection_sha256:r.selection_sha256,maximum_row_changes:r.maximum_row_changes,maximum_write_units:r.maximum_write_units}))};
}
/** Exact bytes of the Worker variable value the owner would deploy if, and only if, they approve. */
export const deployableBytes=p=>Buffer.from(JSON.stringify(profileObject(p,p.approval_ref)),'utf8');

/** Deterministic request UUID-shaped id, unique per approval reference, slot and selection. */
export function requestId(approvalRef,index,after,selection){
 const h=sha256(canonical({schema:'trace-n4-ops-request-id.1',approval_ref:approvalRef,slot:index,after,selection_sha256:selection}));
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
export const reservation=n=>({maximum_row_changes:n+2,maximum_write_units:5*n+8});

export const isEntry=url=>!!process.argv[1]&&url===pathToFileURL(resolve(process.argv[1])).href;
export function main(run){
 try{const result=run(process.argv.slice(2));process.stdout.write(JSON.stringify(result,null,1)+'\n');}
 catch(error){const code=error instanceof OpsError?error.code:'internal_error';process.stderr.write(JSON.stringify({refused:code,detail:error.message})+'\n');process.exitCode=2;}
}
