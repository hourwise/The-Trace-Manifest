// N4-OPS-R2 mutation runner. Run against a DISPOSABLE checkout only:
//   node mutations.mjs <disposable checkout> <jsonl log>
// One mutation at a time: apply exact edits (each must occur exactly once), syntax-check the mutated
// files, run the tests, record which tests fail, then `git checkout -- .` to restore every byte.
// R2 entries name the regression that must fail; R1 entries (re-expressed against R2 code) count any failure.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const root=process.argv[2],log=process.argv[3];
if(!root||!log)throw new Error('usage: node mutations.mjs <disposable checkout> <jsonl log>');
const B='scripts/n4-ops/profile-builder.mjs',R='scripts/n4-ops/reconcile.mjs',L='scripts/n4-ops/lib.mjs',C='scripts/n4-ops/chain.mjs';
const M1P='^OPS-R2 DR2-M1 a prior PASS',M1H='^OPS-R2 DR2-M1 a successor needs',M2='^OPS-R2 DR2-M2 missing',M2C='^OPS-R2 DR2-M2 positive',M3F='^OPS-R2 DR2-M3 a final inventory',M3C='^OPS-R2 DR2-M3 the same',M5='^OPS-R2 DR2-M5',H1='^OPS-R2 H-1';
const R2=[
 // DR2-M1: prior re-derivation and history continuity.
 ['C01','M1','validatePrior does not re-derive the prior',[[B," checkReconciliation(r);\n if(r.disposition==='NOT_VERIFIED')"," if(r.disposition==='NOT_VERIFIED')"]],M1P],
 ['C02','M1','slot class need not follow from its findings',[[C,"if(blocking?s.class!==blocking:BLOCKING.includes(s.class))bad(","if(false)bad("]],M1P],
 ['C03','M1','a STOP deployment verdict needs no campaign finding',[[C,"for(const phase of ['open','closure'])need(dep[phase]?.disposition==='STOP',`deployment_${phase}_verification_stop`);",""]],M1P],
 ['C04','M1','prior outcome uses its recorded not-verified reasons, which are not re-derived',[[C,"const o=deriveOutcome(r.slots,codes,nv);","const o=deriveOutcome(r.slots,codes,r.not_verified_reasons);"],[C,"if(canonical(nv)!==canonical(r.not_verified_reasons))bad(","if(false)bad("],[C,"else if(role('readback_'+phase).length)bad(","else if(false)bad("]],M1P],
 ['C05','M1','prior target database not checked',[[C,"if(t.environment!=='preview'||t.database_id!==PREVIEW_DATABASE_ID||","if(t.environment!=='preview'||"]],M1P],
 ['C06','M1','prior chain need not close with its own profile',[[C,"||c.approval_refs.at(-1)!==r.approval_ref)bad(",")bad("],[C,"if(!Array.isArray(c.approval_refs)||!c.approval_refs.length||","if(!Array.isArray(c.approval_refs)||"],[C,"||canonical(c.request_ids.slice(-r.slots.length))!==canonical(r.slots.map(s=>s.request_id)))bad(",")bad("]],M1P],
 ['C07','M1','history walk does not compare a record chain with its package',[[B,"||canonical(r.chain)!==canonical(p.chain)",""]],M1H],
 ['C08','M1','prepare does not walk the retained history',[[B,"if(prior)continuation(dir,priorEv.sha256,{target:targetOf(target),publisher_email:publisher});",""]],M1H],
 ['C09','M1','an approval reference used in the campaign folder can be reused',[[B,"if(used.some(s=>s!==sha256(bytes)))fail(","if(false)fail("]],M1P],
 ['C10','M1','a reloaded continuation does not walk its history',[[B,"const history=continuation(dir,pkg.prior.reconciliation_sha256,{target:targetOf(pkg.profile_without_approval),publisher_email:pkg.publisher_email});","const history={profiles:0};"]],M1H],
 ['C11','M5','a reloaded prior summary is not compared with the retained prior',[[B,"if(canonical(summary)!==canonical(pkg.prior))fail('history_inconsistent','the package","if(false)fail('history_inconsistent','the package"]],M5],
 // DR2-M2: accounting validation.
 ['C20','M2','a measurement claimed in one field is accepted without the others',[[R,"if(!claims.every(Boolean))return invalid(","if(false)return invalid("],[R,"if(shape.written!==top)","if(shape&&shape.written!==top)"]],M2],
 ['C21','M2','accounting object fields not checked',[[L,"if(Object.keys(a).sort().join(',')!==[...ACCOUNTING_KEYS].sort().join(','))return {ok:false,code:'storage_accounting_malformed'};",""]],M2],
 ['C22','M2','synthetic marker under a saved response accepted',[[R,"if(marker!==undefined&&source!=='synthetic_fixture')return invalid('storage_source_contradiction');",""]],M2],
 ['C23','M2','a declared observation time certifies',[[R,"&&observationSource==='system_clock'&&","&&"],[C,"&&eb.observation_time_source==='system_clock'&&","&&"]],M2],
 ['C24','M2','a synthetic marker does not make the record synthetic',[[R,"synthetic=evidenceSources.includes('synthetic_fixture')||markers>0","synthetic=evidenceSources.includes('synthetic_fixture')"],[C,"eb.synthetic!==(src.includes('synthetic_fixture')||eb.synthetic_markers>0)","eb.synthetic!==src.includes('synthetic_fixture')"],[R,"if(marker!==undefined&&source!=='synthetic_fixture')return invalid('storage_source_contradiction');",""]],M2],
 ['C25','M2','apply response shape not checked',[[R,"if(keys.some(k=>!APPLY_KEYS.includes(k))||","if(false&&"]],M2],
 // DR2-M3: inventory consistency and observation time.
 ['C30','M3','exact first-page count need not match the page and has_more',[[B,"if(q.after===''&&b.pending_count_exact&&(n!==Math.min(q.limit,pending)||b.has_more!==(pending>q.limit)))fail(","if(false)fail("],[C,"if(p<51?n!==Math.min(fi.limit,p)||fi.has_more!==(p>fi.limit):n!==fi.limit||fi.has_more!==true)bad(","if(false)bad("]],M3F],
 ['C31','M3','lower-bound first page need not be full with more',[[B,"if(q.after===''&&!b.pending_count_exact&&(n!==q.limit||b.has_more!==true))fail(","if(false)fail("],[C,"if(p<51?n!==Math.min(fi.limit,p)||fi.has_more!==(p>fi.limit):n!==fi.limit||fi.has_more!==true)bad(","if(false)bad("]],M3F],
 ['C32','M3','exact count from a later cursor need not cover the page',[[B,"if(q.after!==''&&b.pending_count_exact&&pending<n+(b.has_more?1:0))fail(","if(false)fail("]],M3C],
 ['C33','M3','inspect body fields not checked exactly',[[B,"exactKeys(b,INVENTORY_BODY_KEYS,`${where} response body`);",""]],M3F],
 ['C34','M3','final inventory after the observation time accepted',[[R,"if(at>observed)fail('stale_or_future_evidence','the final inventory is dated after the observation time');",""],[C,"[latest,openAt,closeAt,fi?Date.parse(fi.captured_at_utc):null].some(","[latest,openAt,closeAt].some("]],M3F],
 ['C35','M3','records after the observation time accepted',[[R,"if(future.some(t=>t>observed))fail(","if(false)fail("]],M3F],
 ['C36','M3','one final page treated as campaign closure',[[C,":finalInventory.pending_count_kind==='EXACT'&&finalInventory.known_pending_lower_bound===0?",":!finalInventory.has_more?"]],M3F],
 // DR2-M5: shared freshness on reload.
 ['C40','M5','reload skips the capture-time contract',[[B,"packageTimeline(loaded,now);retainedCaptures(dir,loaded);","retainedCaptures(dir,loaded);"]],M5],
 ['C41','M5','reload skips the retained captures',[[B,"packageTimeline(loaded,now);retainedCaptures(dir,loaded);","packageTimeline(loaded,now);"]],M5],
 ['C42','M5','prior closure boundary not enforced on captures',[[L,"if(priorFreshMs!==null&&t<=priorFreshMs)fail(","if(false)fail("]],M5],
 ['C43','M5','recorded freshness boundary not checked',[[B,"if(ep.captures_after_utc!==boundary)bad(","if(false)bad("]],M5],
 ['C44','M5','finalize does not pass its observation time',[[B,"const loaded=loadPackage(a.package,{now}),approval=","const loaded=loadPackage(a.package),approval="]],M5],
 ['C45','M5','captures need not be in page order in time',[[L,"if(i>0&&t<times[i-1])fail(","if(false)fail("]],M5],
 // H-1 preservation.
 ['C50','H1','approval fields not compared with the facts of the emitted profile',[[B,"if(r[k]!==v)fail('approval_mismatch',`approval ${k} does not match the profile that would be deployed`);","if(false)fail('approval_mismatch','');"]],H1],
];
// R1's forty protections, re-expressed where R2 moved the code; any failing test counts.
const R1=[
 ['T01','absence accepted without a post-window lookup',[[R,"&&l.at>=untilMs);",");"]]],
 ['T02','receipt request_hash not compared',[[R,"if(receipt.request_hash!==sha256(canonical({input,profile})))add('CONFLICTING_OR_DUPLICATE','receipt_from_a_different_profile');",""]]],
 ['T03','receipt rows not compared',[[R,"||x.issue!==pkgSlot.rows[i].issue",""]]],
 ['T04','unmeasured storage not reported',[[R,"if(s.class==='COMPLETED_MATCHED'&&s.storage_writes.status!=='MEASURED')notVerified.push(`slot_${s.index}_storage_writes_not_measured`);",""],[C,"if(s.class==='COMPLETED_MATCHED'&&s.storage_writes.status!=='MEASURED')nv.push(`slot_${s.index}_storage_writes_not_measured`);",""]]],
 ['T05','apply response alone counts as completed',[[R,"else if(receipt){cls=durable.length?'COMPLETED_MATCHED':'MISSING_OR_UNCERTAIN';","else if(receipt){cls='COMPLETED_MATCHED';"]]],
 ['T06','NOT_VERIFIED reported as PASS',[[L,"stopReasons.length?'STOP':notVerified.length?'NOT_VERIFIED':'PASS'","stopReasons.length?'STOP':'PASS'"]]],
 ['T07','manual ordering not checked',[[R,"if(!ordered)addCampaign('CONFLICTING_OR_DUPLICATE','slots_not_executed_in_order');",""]]],
 ['T08','receipt write count not checked',[[R,"if(receipt.writes!==n+2||receipt.reserved_write_units!==5*n+8||receipt.writes>slot.maximum_row_changes)add('UNEXPECTED_WRITE_CONSUMPTION','receipt_logical_changes');",""]]],
 ['T09','lookup target not checked',[[R,"for(const l of lookups)if(l.request.environment!=='preview'||l.request.database_id!==target.database_id||l.request.target_attestation_sha256!==target.target_attestation_sha256)add('STALE_OR_MISMATCHED_TARGET','lookup_target_differs');",""]]],
 ['T10','capture cursor chain not checked',[[B,"if(slots[i].after!==slots[i-1].next_cursor)fail('cursor_chain',`capture ${i+1} does not start at the previous page's next_cursor; missing pages are never assumed`);",""]]],
 ['T11','evidence age not checked',[[B,"if(now-oldest>maxAge*60000)fail(","if(false)fail("],[L,"if(fromMs-oldest>maxAgeMinutes*60000)fail(","if(false)fail("]]],
 ['T12','owner statement need not quote the hash',[[B,"||!r.statement.includes(facts.deployable_profile_sha256)",""]]],
 ['T13','4 KiB profile limit not enforced at prepare',[[B,"if(deployable.length>MAX_PROFILE_BYTES)fail(","if(false)fail("]]],
 ['T14','STOP prior accepted without acknowledgement',[[B,"if(acknowledge!==ev.sha256)fail(","if(false)fail("]]],
 ['T15','approval after window start accepted',[[B,"if(at>Date.parse(facts.from_utc))fail(","if(false)fail("]]],
 ['T16','conflict rows accepted',[[B,"if(r.conflict!==null&&!allowConflicts)fail(","if(false)fail("]]],
 ['T17','unknown CLI options ignored',[[L,"const name=raw.slice(2),s=spec[name];if(!s)fail('unknown_argument',raw);","const name=raw.slice(2),s=spec[name];if(!s){i++;continue;}"]]],
 ['T18','deployed implementation not compared with plan',[[B,"if(t.implementation_sha256!==plan.implementation_sha256)fail(","if(false)fail("]]],
 ['T19','NOT_VERIFIED prior accepted',[[B,"if(r.disposition==='NOT_VERIFIED')fail(","if(false)fail("]]],
 ['T20','package owner_approval not required null',[[B,"||p.owner_approval!==null||p.approved_at_utc!==null)fail('malformed_input','approval package status')",")fail('malformed_input','approval package status')"]]],
 ['R01','H-1 package window summary not checked',[[B,"bad('window summary differs from the profile');","{}"]]],
 ['R02','H-1 package totals not checked',[[B,"bad('totals differ from the profile');","{}"]]],
 ['R03','H-1 slot rows not checked against reservation',[[B,"bad(`slot ${i} rows do not match its reservation`);","{}"]]],
 ['R04','M-1 prior label not re-derived',[[C,"if(o.disposition!==r.disposition||canonical(o.stop_reasons)!==canonical(r.stop_reasons)||o.stop_continuable!==r.stop_continuable||o.resume_after!==r.resume_after)bad(","if(false)bad("]]],
 ['R05','M-1 response before request accepted',[[R,"if(r.received!==null&&r.received<r.sent)add('CONFLICTING_OR_DUPLICATE','response_recorded_before_request');",""]]],
 ['R06','M-1 receipt before request accepted',[[R,"if(firstSent!==null&&durable.some(l=>l.at<firstSent))add('CONFLICTING_OR_DUPLICATE','receipt_seen_before_request');",""]]],
 ['R07','M-1 closure before execution accepted',[[R,"if(closeAt!==null&&latest!==null&&closeAt<latest)addCampaign('CONFLICTING_OR_DUPLICATE','closure_recorded_before_execution_finished');",""],[C,"need(closeAt!==null&&latest!==null&&closeAt<latest,'closure_recorded_before_execution_finished');",""]]],
 ['R08','M-1 recorded time order not checked',[[R,"if(mine.length&&before.length&&Math.min(...mine.map(r=>r.sent))<Math.min(...before.map(r=>r.received??r.sent)))ordered=false;",""]]],
 ['R09','M-1 completed slot without request record accepted',[[R,"if(s.class==='COMPLETED_MATCHED'&&!s.attempts)notVerified.push(`slot_${s.index}_request_record_missing`);",""],[C,"if(s.class==='COMPLETED_MATCHED'&&!s.attempts)nv.push(`slot_${s.index}_request_record_missing`);",""]]],
 ['R10','M-2 negative or fractional storage accepted',[[R,"if(top!==undefined&&top!==null&&(!Number.isSafeInteger(top)||top<0))return invalid('storage_measurement_invalid');",""]]],
 ['R11','M-2 contradictory storage accepted',[[R,"if(shape.written!==top)return invalid('storage_measurements_contradict');",""]]],
 ['R12','M-2 synthetic evidence certifies consumption',[[R,"const certifies=disposition==='PASS'&&!synthetic&&","const certifies=disposition==='PASS'&&"],[C,"const certifies=r.disposition==='PASS'&&!eb.synthetic&&","const certifies=r.disposition==='PASS'&&"]]],
 ['R13','M-3 stale final inventory accepted',[[R,"if(at<after)fail('stale_or_future_evidence'","if(false)fail('stale_or_future_evidence'"],[C,"if(at<Math.max(from,latest??from,closeAt??from))bad(","if(false)bad("]]],
 ['R14','M-3 incoherent pending counts accepted',[[B,"if(!Number.isInteger(pending)||pending<0||pending>51||b.pending_count_exact!==(pending<51)||b.missing_identity_guard_blocked!==(pending>50))fail(","if(false)fail("]]],
 ['R15','M-4 prefix-based containment',[[L,"const outside=isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep);","const outside=isAbsolute(rel)||rel.startsWith('..');"]]],
 ['R16','M-5 capture before target verification accepted',[[L,"if(t<verifiedMs)fail(","if(false)fail("]]],
 ['R17','M-5 pre-failure capture reused',[[L,"if(priorFreshMs!==null&&t<=priorFreshMs)fail(","if(false)fail("]]],
 ['R18','L-1 restart after an unfinished walk',[[B,"if(r.disposition!=='PASS'||r.campaign_reported_more_rows!==false)fail(","if(false)fail("]]],
 ['R19','L-2 lone surrogate id accepted',[[L,"||!v.isWellFormed())fail('inventory_contract'",")fail('inventory_contract'"]]],
 ['R20','recomputed readback STOP ignored',[[R,"if(v.disposition!=='PASS')addCampaign('STALE_OR_MISMATCHED_TARGET',`deployment_${phase}_verification_stop`);",""],[C,"for(const phase of ['open','closure'])need(dep[phase]?.disposition==='STOP',`deployment_${phase}_verification_stop`);",""]]],
];
// The four R1 protections that R2 duplicates: each re-run with R2's extra layer also removed, to show the
// surviving R1 mutation is masked by that layer rather than untested.
const R1X=[
 ['X03','R03 plus reload retained-capture check',[[B,"bad(`slot ${i} rows do not match its reservation`);","{}"],[B,"packageTimeline(loaded,now);retainedCaptures(dir,loaded);","packageTimeline(loaded,now);"]]],
 ['X10','R10 plus accounting count check',[[R,"if(top!==undefined&&top!==null&&(!Number.isSafeInteger(top)||top<0))return invalid('storage_measurement_invalid');",""],[L,"for(const k of ['provider_rows_read','provider_rows_written'])if(a[k]!==null&&(!Number.isSafeInteger(a[k])||a[k]<0))return {ok:false,code:'storage_measurement_invalid'};",""]]],
 ['X12','R12 plus saved-response basis requirement',[[R,"const certifies=disposition==='PASS'&&!synthetic&&","const certifies=disposition==='PASS'&&"],[C,"const certifies=r.disposition==='PASS'&&!eb.synthetic&&","const certifies=r.disposition==='PASS'&&"],[R,"s.storage_writes.status==='MEASURED'&&s.storage_writes.basis==='saved_worker_response');","s.storage_writes.status==='MEASURED');"],[C,"s.storage_writes.status==='MEASURED'&&s.storage_writes.basis==='saved_worker_response');","s.storage_writes.status==='MEASURED');"]]],
 ['X14','R14 plus first-page lower-bound rule',[[B,"if(!Number.isInteger(pending)||pending<0||pending>51||b.pending_count_exact!==(pending<51)||b.missing_identity_guard_blocked!==(pending>50))fail(","if(false)fail("],[B,"if(q.after===''&&!b.pending_count_exact&&(n!==q.limit||b.has_more!==true))fail(","if(false)fail("],[C,"if(p<51?n!==Math.min(fi.limit,p)||fi.has_more!==(p>fi.limit):n!==fi.limit||fi.has_more!==true)bad(","if(false)bad("]]],
];
const git=(...a)=>execFileSync('git',['-C',root,...a]).toString();
const only=process.env.ONLY?new RegExp(process.env.ONLY):null;
function run(id,group,name,edits,pattern){
 git('checkout','--','.');
 const files=new Map();
 for(const [file,from,to] of edits){const t=files.get(file)??readFileSync(root+'/'+file,'utf8');if(t.split(from).length!==2){appendFileSync(log,JSON.stringify({id,group,name,applied:false,missing:from.slice(0,80)})+'\n');console.log(id,'NOT APPLIED');git('checkout','--','.');return;}files.set(file,t.replace(from,()=>to));}
 for(const [file,t] of files)writeFileSync(root+'/'+file,t);
 const syntax=[...files.keys()].every(f=>spawnSync(process.execPath,['--check',root+'/'+f]).status===0);
 const args=[root+'/node_modules/tsx/dist/cli.mjs','--test',...(pattern?['--test-name-pattern='+pattern]:[]),'tests/n4-ops-01.test.ts'];
 const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:900000,env:process.env});
 const out=(r.stdout??'')+(r.stderr??''),failing=[...new Set([...out.matchAll(/^✖ (.+?) \(\d/gm)].map(m=>m[1]))],ran=Number(/ℹ tests (\d+)/.exec(out)?.[1]??0);
 const detected=pattern?failing.some(f=>new RegExp(pattern).test(f)):r.status!==0&&failing.length>0;
 appendFileSync(log,JSON.stringify({id,group,name,applied:true,syntax_valid:syntax,files:[...files.keys()],intended:pattern??'any test',tests_run:ran,exit:r.status,detected,failing:failing.map(f=>f.slice(0,90))})+'\n');
 console.log(id,detected?'DETECTED':'NOT DETECTED',failing.length);
}
try{
 for(const [id,group,name,edits,pattern] of R2)if(!only||only.test(id))run(id,group,name,edits.map(([f,a,b])=>[f,a,b]),pattern);
 for(const [id,name,edits] of R1)if(!only||only.test(id))run(id,'R1',name,edits,null);
 for(const [id,name,edits] of R1X)if(!only||only.test(id))run(id,'R1-unmasked',name,edits,null);
}finally{git('checkout','--','.');}
