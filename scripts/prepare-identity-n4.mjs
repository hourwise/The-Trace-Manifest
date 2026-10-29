// Offline release preparation only. Never imports provider SDKs or invokes Wrangler.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--source-commit'||args[2]!=='--output')throw Error('Usage: node scripts/prepare-identity-n4.mjs --source-commit <40-hex> --output <new file>');
const commit=args[1],output=resolve(args[3]);
if(!/^[a-f0-9]{40}$/.test(commit))throw Error('An immutable source commit is required');
if(process.platform==='win32'&&!/^D:\\/i.test(output))throw Error('TRACE-managed output must reside on D:');
const git=(...v)=>execFileSync('git',['-C',root,...v],{maxBuffer:16*1024*1024});
const blob=(ref,path)=>git('show',`${ref}:${path}`);
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(Array.isArray(v)?v.map(normal):normal(v));
function normal(v){if(Array.isArray(v))return v.map(normal);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normal(v[k])]));return v;}
const base='70c75229c8f2013552ff4ec74a39c47a8891c365';
git('merge-base','--is-ancestor',base,commit);
const oldPath='docs/audit/local-news-p4-r2-1-preview-proposal.json',oldBytes=blob(base,oldPath),old=JSON.parse(oldBytes);
if(hash(oldBytes)!=='021a957713cc70dca2dd5e97e93be7b50c5248d38716063501dc982c60af7a3a')throw Error('Historical proposal changed');
const extra=['src/lib/server/identity-maintenance/contract.ts','src/lib/server/identity-maintenance/index-certificate.ts','src/lib/server/identity-maintenance/service.ts','src/lib/server/identity-maintenance/meter.ts','src/lib/server/identity-maintenance/worker.ts','tests/identity-maintenance.test.ts','tests/identity-maintenance-runtime.test.ts','scripts/prepare-identity-n4.mjs','docs/adr/TRACE-N4-INVENTORY-CONTRACT.md','docs/runbooks/local-news-p4-n4.md'];
const paths=[...new Set([...old.implementation_files.map(f=>f.path),...extra])].sort();
const files=paths.map(path=>({path,sha256:hash(blob(commit,path))}));
const migration=files.find(f=>f.path==='db/migration-0080-local-news-import.sql');
if(migration.sha256!=='3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be')throw Error('Frozen migration changed');
for(const path of ['wrangler.toml','wrangler.worker.toml','package-lock.json']){
  if(!blob(commit,path).equals(blob(base,path)))throw Error('Protected deployment/lock file changed: '+path);
}
for(const path of git('ls-tree','-r','--name-only',base,'db').toString().trim().split('\n').filter(p=>p.includes('0072'))){if(!blob(commit,path).equals(blob(base,path)))throw Error('Protected 0072 changed');}
const implementation=hash(canonical(files));
const profile={schema:'trace-preview-identity-n4.1',approval_ref:null,owner_approval:null,environment:'preview',database_id:old.target.database_id,target_attestation_sha256:null,implementation_sha256:implementation,migration_sha256:migration.sha256,publisher_email:null,from_utc:null,until_utc:null,requests:[{request_id:null,after:'',limit:25,selection_sha256:null,maximum_row_changes:27,maximum_write_units:133}]};
const plan={schema:'trace-preview-identity-readiness-n4.1',source_commit:commit,frozen_importer_commit:base,implementation_hash_semantics:'sha256(canonical JSON of sorted path/exact Git blob sha256 records); no worktree normalization',implementation_sha256:implementation,implementation_files:files,owner_approval:null,execution_window:null,remote_operations_authorised:false,remote_operations_performed:0,target:{...old.target,identity_status:'RECORDED_ONLY_PROVIDER_AND_BINDING_VERIFICATION_REQUIRED',target_attestation_sha256:null},migration:{path:migration.path,sha256:migration.sha256,new_migration_required:false,remote_applied:false},historical_import_proposal:{path:oldPath,sha256:hash(oldBytes),authorises_combined_n4:false},preserved_evidence:{package_id:old.package_id,bundle_sha256:old.bundle_sha256,bundle_file_sha256:old.bundle_file_sha256,payload_sha256:old.payload_sha256,item_count:old.item_count,items:old.items,source_bindings:old.source_bindings,separate_import_row_change_limit:old.budget.maximum_data_writes,original_measurements:old.local_measurement},limits:{request_bytes:4096,response_bytes:32768,page_rows:25,page_snapshot_rows:26,pending_probe_rows:51,profile_explicit_requests:10,window_max_ms:3600000,closing_margin_ms:15000,batch_statements:56,success_sql_statements:89,aborted_reconciliation_sql_statements:91,maximum_row_changes:27,maximum_reserved_write_units:133,provider_billing_guaranteed:false,automatic_requests:0},maintenance_profile_template:profile,phases:[{id:'A0',action:'Separately approved provider identity/binding/schema inspection; do not run indexed backlog queries before 0080',approval:null},{id:'C',action:'Separately approve compatible Pages/Worker code deployment with inventory, maintenance and new-import gates closed, before 0080',approval:null},{id:'B',action:'Separately approve 0080 under current TRACE-OPS-01 manifest; do not alter migration or assume migration atomicity',approval:null},{id:'A1',action:'Separately approve bounded publisher inventory and freeze actual target attestation, selection digests and cost limits',approval:null},{id:'D',action:'Separately approve finite profile, then submit each fixed request manually; stop on any ambiguity',approval:null},{id:'E',action:'Separately approved receipt/backlog and exact-package reconciliation',approval:null},{id:'F',action:'Generate and separately approve new combined-code three-item import instrument; historical proposal cannot authorise it',approval:null}],stop_conditions:['target, schema, implementation or source identity differs','missing independent target attestation or owner approval','stale selection, conflicting peer, uncertified index/trigger','insufficient precommit budget or provider limit','missing accounting or uncertain request outcome; reconcile, never auto-retry'],activation_state:'ALL_GATES_ABSENT_OR_DISABLED'};
const bytes=Buffer.from(canonical(plan)+'\n');
if(existsSync(output)){if(!readFileSync(output).equals(bytes))throw Error('Refusing to overwrite a different frozen proposal');}else writeFileSync(output,bytes,{flag:'wx'});
console.log(JSON.stringify({path:output,source_commit:commit,implementation_sha256:implementation,proposal_sha256:hash(bytes),bound_files:files.length,owner_approval:null,execution_window:null}));
