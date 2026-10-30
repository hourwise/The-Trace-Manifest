#!/usr/bin/env node
// Offline release identity for the N4-OPS tooling. Reads exact Git blobs at an immutable commit,
// confirms the frozen N4 instrument is untouched, and writes a null-approval manifest. It runs only
// local `git`; it never contacts Cloudflare or GitHub and authorises nothing.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {REPO_ROOT,sha256,canonical,fail,parseArgs,main,isEntry} from './lib.mjs';

const N4_PLAN='docs/audit/local-news-p4-n4-preview-plan.json',N4_PLAN_SHA256='9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9';
const OPS_ROOTS=['scripts/n4-ops','tests/n4-ops-01.test.ts','.github/workflows/n4-ops.yml','docs/runbooks/n4-ops-01-single-operator.md','docs/audit/n4-ops-01-examples'];

export function manifest(argv){
 const a=parseArgs(argv,{'source-commit':{type:'string',required:true},'output':{type:'string',required:true}});
 const commit=a['source-commit'],output=resolve(a.output);
 if(!/^[a-f0-9]{40}$/.test(commit))fail('malformed_input','an immutable 40-hex source commit is required');
 if(process.platform==='win32'&&!/^D:\\/i.test(output))fail('output_not_on_d','TRACE-managed output must reside on D:');
 const git=(...v)=>execFileSync('git',['-C',REPO_ROOT,...v],{maxBuffer:64*1024*1024});
 const blob=path=>git('show',`${commit}:${path}`);
 const planBytes=blob(N4_PLAN);if(sha256(planBytes)!==N4_PLAN_SHA256)fail('n4_plan_changed','the frozen N4 plan differs at this commit');
 const plan=JSON.parse(planBytes);
 const changed=plan.implementation_files.filter(f=>sha256(blob(f.path))!==f.sha256).map(f=>f.path);
 if(changed.length)fail('n4_bound_file_changed',changed.join(', '));
 const paths=git('ls-tree','-r','--name-only',commit,'--',...OPS_ROOTS).toString().trim().split('\n').filter(Boolean).sort();
 if(paths.some(p=>plan.implementation_files.some(f=>f.path===p)))fail('ops_overlaps_n4','an OPS path is also N4-bound');
 const files=paths.map(path=>({path,sha256:sha256(blob(path))}));
 const body={schema:'trace-n4-ops-revision-manifest.1',source_commit:commit,
  n4:{plan_path:N4_PLAN,plan_sha256:N4_PLAN_SHA256,implementation_sha256:plan.implementation_sha256,bound_files:plan.implementation_files.length,bound_files_unchanged:true,
   covers_ops_tooling:false},
  ops_identity_semantics:'sha256(canonical JSON of sorted path / exact Git blob sha256 records)',ops_identity_sha256:sha256(canonical(files)),ops_files:files,
  required_status_check:'N4 OPS / n4-ops (GitHub branch protection is an owner setting and is not configured by this manifest)',
  owner_approval:null,execution_window:null,remote_operations_authorised:false,remote_operations_performed:0,
  notice:'Identity of local OPS tooling only. It is not an approval, does not cover the N4 Worker implementation, and authorises no push, deployment, inventory, maintenance or import.'};
 const bytes=Buffer.from(canonical(body)+'\n');
 if(existsSync(output)){if(!readFileSync(output).equals(bytes))fail('refusing_overwrite','a different manifest already exists at the output path');}else writeFileSync(output,bytes,{flag:'wx'});
 return {path:output,source_commit:commit,ops_files:files.length,ops_identity_sha256:body.ops_identity_sha256,manifest_sha256:sha256(bytes),owner_approval:null};
}

if(isEntry(import.meta.url))main(manifest);
