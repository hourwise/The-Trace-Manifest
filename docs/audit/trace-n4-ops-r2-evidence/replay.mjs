// N4-OPS-R2 replay of Codex's DR2 evidence against the reviewed R1 code and the R2 code.
//   node docs/audit/trace-n4-ops-r2-evidence/replay.mjs <Codex DR2 probes folder> <new external D: output folder>
// Codex's saved files are only read. R1 is rebuilt from exact Git blobs at 56ab1e3; R2 is this checkout.
// Every approval, response and measurement here is SYNTHETIC; nothing contacts Cloudflare or grants consent.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),codex=resolve(process.argv[2]),out=resolve(process.argv[3]);mkdirSync(out,{recursive:true});
const R1_COMMIT='56ab1e34253d175829ac202ff31b1a23f96e2d92',read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(dir,name,v)=>{const p=join(dir,name);writeFileSync(p,JSON.stringify(v,null,1)+'\n');return p;};
const r1Root=join(out,'r1-snapshot');
for(const f of ['scripts/n4-ops/lib.mjs','scripts/n4-ops/profile-builder.mjs','scripts/n4-ops/reconcile.mjs','scripts/n4-ops/synthetic-examples.mjs','docs/audit/local-news-p4-n4-preview-plan.json']){const p=join(r1Root,f);mkdirSync(resolve(p,'..'),{recursive:true});writeFileSync(p,execFileSync('git',['-C',root,'show',`${R1_COMMIT}:${f}`]));}
writeFileSync(join(r1Root,'package.json'),'{"type":"module"}');
const load=async base=>Object.fromEntries(await Promise.all(['lib','profile-builder','reconcile','synthetic-examples'].map(async n=>[n,await import(pathToFileURL(join(base,'scripts/n4-ops',n+'.mjs')).href)])));
const V={R1:await load(r1Root),R2:await load(root)};
// Fresh example campaign folders for each version (identical package, approval and profile bytes).
const ex={};for(const v of ['R1','R2']){const d=join(out,v.toLowerCase()+'-examples');mkdirSync(d,{recursive:true});V[v]['synthetic-examples'].generate(['--out-dir',d]);const w=join(d,'work');ex[v]={d,w,pkg:join(w,readdirSync(w).find(n=>n.startsWith('n4-approval-package-'))),profile:join(w,readdirSync(w).find(n=>n.startsWith('n4-profile-'))),approval:join(w,'owner-approval.SYNTHETIC.json')};}
const results=[];
function attempt(finding,name,version,input,fn){
 let r;try{const v=fn();r={accepted:true,...v};}catch(e){r={accepted:false,code:e.code??e.name,detail:String(e.message).slice(0,240)};}
 results.push({finding,case:name,version,input,...r});return r;
}
const sha=p=>V.R2.lib.sha256(readFileSync(p));

// DR2-M1: Codex's edited priors, read directly; then the same edits on each version's own example prior.
const priorEdits={PASS_slot_finding:r=>r.slots[0].findings.push({class:'UNEXPECTED_WRITE_CONSUMPTION',code:'receipt_reports_other_mutation'}),PASS_storage_invalid:r=>r.slots[0].storage_writes={status:'INVALID',provider_rows_written:-1,basis:'synthetic_fixture'},PASS_deployment_STOP:r=>{r.deployment.open.disposition='STOP';r.deployment.open.failed_checks=['import_gate_closed'];},PASS_missing_closure:r=>r.deployment.closure=null,PASS_foreign_campaign:r=>r.target.database_id='00000000-0000-0000-0000-000000000000',PASS_chain_erased:r=>r.chain={approval_refs:[],request_ids:[]}};
for(const name of [...Object.keys(priorEdits),'STOP_relabelled']){
 const file=join(codex,`prior-${name}.json`);
 for(const v of ['R1','R2'])attempt('DR2-M1',`validatePrior ${name}`,v,`Codex file prior-${name}.json (sha256 ${sha(file)})`,()=>({prior:V[v]['profile-builder'].validatePrior(V[v].lib.readEvidence(file,'prior')).disposition}));
}
// Successor preparation exactly as Codex's supplement: his capture edit, his arguments, his edits per prior.
const successor=(v,priorPath,ref)=>{const w=ex[v].w,cap=read(join(w,'capture-1.json'));cap.captured_at_utc='2026-11-02T10:55:00.000Z';cap.request.after=cap.response.body.after='cand-0006';cap.response.body.next_cursor='cand-0009';cap.response.body.selection_sha256='b'.repeat(64);cap.response.body.rows.forEach((r,i)=>r.id='cand-000'+(i+7));
 const cp=save(w,'successor-capture.json',cap);
 return V[v]['profile-builder'].prepare(['--plan',join(v==='R1'?r1Root:root,'docs/audit/local-news-p4-n4-preview-plan.json'),'--plan-sha256','9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9','--target-evidence',join(w,'target.json'),'--inventory',cp,'--approval-ref',ref,'--from-utc','2026-11-02T11:00:00.000Z','--until-utc','2026-11-02T11:45:00.000Z','--now','2026-11-02T10:56:00.000Z','--out-dir',w,'--prior-reconciliation',priorPath]);};
const successorCases={valid:[()=>{},'DR2-SUCCESSOR'],contradictory_slot_finding:[priorEdits.PASS_slot_finding,'DR2-SUCCESSOR'],missing_closure:[priorEdits.PASS_missing_closure,'DR2-SUCCESSOR'],invalid_storage:[priorEdits.PASS_storage_invalid,'DR2-SUCCESSOR'],failed_deployment:[priorEdits.PASS_deployment_STOP,'DR2-SUCCESSOR'],foreign_target:[priorEdits.PASS_foreign_campaign,'DR2-SUCCESSOR'],erased_chain_spent_ref:[priorEdits.PASS_chain_erased,'N4-EXAMPLE-P01']};
for(const [name,[edit,ref]] of Object.entries(successorCases)){
 for(const v of ['R1','R2']){
  const completed=readFileSync(join(ex[v].d,'example-reconciliation-completed.json')),retained=join(ex[v].w,`n4-reconciliation-${V[v].lib.sha256(completed)}.json`),prior=read(retained);edit(prior);
  const path=name==='valid'?retained:save(ex[v].w,`successor-prior-${name}.json`,prior);
  attempt('DR2-M1',`prepare successor ${name} (ref ${ref})`,v,name==='valid'?'unaltered retained example prior':`example prior with Codex's ${name} edit`,()=>{const r=successor(v,path,ref);return {owner_approval:r.owner_approval,package_sha256:r.package_sha256};});
 }
}

// DR2-M2 and DR2-M3: Codex's exact saved request, lookup, readback and final-inventory files.
const reconcileCase=(v,folder,extra=[])=>{const f=join(codex,folder),args=['--package',ex[v].pkg,'--approval-record',ex[v].approval,'--profile',ex[v].profile,'--readback-open',join(f,'open.json'),'--readback-closure',join(f,'closure.json'),'--request',join(f,'request-0.json'),'--request',join(f,'request-1.json'),'--receipt-lookup',join(f,'lookup-0.json'),'--receipt-lookup',join(f,'lookup-1.json'),...extra,'--out-dir',join(out,v.toLowerCase()+'-reconciliations')];
 mkdirSync(join(out,v.toLowerCase()+'-reconciliations'),{recursive:true});
 const r=V[v].reconcile.reconcile(v==='R2'?[...args.slice(0,-2),'--now','2026-11-02T11:00:00.000Z',...args.slice(-2)]:args),j=read(r.reconciliation);
 return {disposition:j.disposition,storage:j.slots.map(s=>s.storage_writes.status),certifies_provider_consumption:j.evidence_basis.certifies_provider_consumption,synthetic:j.evidence_basis.synthetic,stop_reasons:j.stop_reasons,final_inventory:j.final_inventory?{pending:j.final_inventory.known_pending_lower_bound,rows:j.final_inventory.rows_in_first_page}:null,campaign_closure:j.campaign_closure?.status??null};};
for(const folder of ['baseline','accounting_missing','accounting_null','accounting_string','accounting_array','metadata_incomplete','saved_response_missing_accounting','saved_response_malformed_accounting','synthetic_masquerade_in_body','storage_missing','storage_null','storage_negative','storage_fractional','storage_string','storage_object','storage_contradiction'])
 for(const v of ['R1','R2'])attempt('DR2-M2',`reconcile ${folder}`,v,`Codex folder ${folder}/ (request-0 sha256 ${sha(join(codex,folder,'request-0.json'))})`,()=>reconcileCase(v,folder));
for(const name of ['valid','incomplete_exact_count','contradictory_has_more','future','stale','contradiction','incomplete','cursor','foreign','db','implementation','migration','publisher'])
 for(const v of ['R1','R2'])attempt('DR2-M3',`reconcile final ${name}`,v,`Codex final-${name}.json (sha256 ${sha(join(codex,`final-${name}.json`))})`,()=>reconcileCase(v,`final_${name}`,['--final-inventory',join(codex,`final-${name}.json`)]));

// DR2-M5: Codex's exact stale successor package and his synthetic approval quoting its hash.
const stale=join(codex,'successor-package-stale-capture.json'),staleApproval=join(codex,'stale-approval.SYNTHETIC.json');
for(const v of ['R1','R2']){
 const dir=join(out,v.toLowerCase()+'-stale');mkdirSync(dir,{recursive:true});
 attempt('DR2-M5','approval-template on the re-dated successor package',v,`Codex successor-package-stale-capture.json (sha256 ${sha(stale)})`,()=>({template_package_sha256:V[v]['profile-builder'].approvalTemplate(['--package',stale]).package_sha256}));
 attempt('DR2-M5','finalize the re-dated successor package with an approval quoting its hash',v,`Codex stale-approval.SYNTHETIC.json (sha256 ${sha(staleApproval)})`,()=>{const r=V[v]['profile-builder'].finalize(['--package',stale,'--approval-record',staleApproval,'--out-dir',dir,'--now','2026-11-02T10:57:00.000Z']);return {deployable_profile_sha256:r.deployable_profile_sha256};});
}
// Positive control for M5 on R2: the unaltered successor (prepared above) templates and finalizes.
const r2Successor=results.find(r=>r.version==='R2'&&r.case.startsWith('prepare successor valid'));
if(r2Successor?.accepted){const pkg=join(ex.R2.w,`n4-approval-package-${r2Successor.package_sha256}.json`),t=V.R2['profile-builder'].approvalTemplate(['--package',pkg]),p=read(pkg);
 const a=save(ex.R2.w,'successor-approval.SYNTHETIC.json',{...t,decision:'APPROVED',owner_email:'owner@example.test',approved_at_utc:'2026-11-02T10:56:00.000Z',statement:'SYNTHETIC REPLAY ONLY '+p.deployable_profile_sha256_if_approved});
 attempt('DR2-M5','positive control: unaltered successor templates and finalizes','R2','R2 successor package',()=>({deployable_profile_sha256:V.R2['profile-builder'].finalize(['--package',pkg,'--approval-record',a,'--out-dir',ex.R2.w,'--now','2026-11-02T10:57:00.000Z']).deployable_profile_sha256}));}

save(out,'replay-results.json',results);
const table=results.map(r=>({finding:r.finding,case:r.case,version:r.version,accepted:r.accepted,code:r.code??null,disposition:r.disposition??null,certifies:r.certifies_provider_consumption??null}));
console.log(JSON.stringify(table,null,1));
