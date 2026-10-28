import { canonical, digest, object, sha256, text } from './primitives';
import { canonicalNewsUrl, EDITORIAL_REFERENCE, eligibleUrl, NEWS_VERSION, sourceById } from './feed';

export const EXPORT_SCHEMA='trace-editorial-news-candidates-p2.1';
function fields(value:unknown,names:string[]):Record<string,any>{const v=object(value);if(canonical(Object.keys(v).sort())!==canonical([...names].sort()))throw new Error('Handoff keys do not match the versioned contract');return v;}
function date(v:unknown,nullable=false):void{if(nullable&&v===null)return;if(typeof v!=='string'||new Date(v).toISOString()!==v)throw new Error('Invalid handoff UTC date');}
/** Local candidate contract only. No remote importer or publication authority. */
export interface HandoffPolicy {schema:string;reference:Record<string,string>;registry_version:string;namespace:string;status:string;source:(id:string)=>ReturnType<typeof sourceById>}
export const P2_HANDOFF:HandoffPolicy={schema:EXPORT_SCHEMA,reference:EDITORIAL_REFERENCE,registry_version:'news-fixtures-p2.1',namespace:'news-p2',status:'provisional-local-handoff-no-importer',source:sourceById};
export function validateNewsHandoff(value:unknown,policy:HandoffPolicy=P2_HANDOFF):void {
  const p=fields(value,['schema','editorial_reference','adapter_status','registry_version','candidates','pagination']);
  if(p.schema!==policy.schema||canonical(p.editorial_reference)!==canonical(policy.reference)||p.adapter_status!==policy.status||p.registry_version!==policy.registry_version)throw new Error('Unknown news handoff version or editorial policy');
  if(Buffer.byteLength(canonical(p))>2*1024*1024||!Array.isArray(p.candidates)||p.candidates.length>100)throw new Error('Handoff size bound');
  const page=fields(p.pagination,['after','limit','next_cursor']);if(page.after!=='')digest(page.after);if(page.next_cursor!==null)digest(page.next_cursor);
  if(!Number.isInteger(page.limit)||page.limit<1||page.limit>100||p.candidates.length>page.limit)throw new Error('Handoff pagination bound');
  const seen=new Set<string>();let previous=page.after;
  for(const value of p.candidates){
    const c=fields(value,['candidate_id','item_id','source','canonical_url','title','original_publication_date','published_at','updated_at','excerpt','retrieved_at','source_hash','content_hash','provenance','duplicate_identity','declared_canonical_url','declared_related_urls','quality_flags','review_required','verification_status','admission_state','publication_approved']);
    const source=policy.source(object(c.source).id);if(canonical(c.source)!==canonical(source))throw new Error('Unregistered handoff source');
    for(const key of ['candidate_id','item_id','source_hash','content_hash'])digest(c[key]);
    if(seen.has(c.item_id)||c.item_id<=previous)throw new Error('Duplicate or unordered handoff item');seen.add(c.item_id);previous=c.item_id;
    if(eligibleUrl(c.canonical_url,source)!==c.canonical_url||canonicalNewsUrl(c.canonical_url)!==c.canonical_url)throw new Error('Invalid canonical URL');
    text(c.title,1024);if(typeof c.excerpt!=='string'||c.excerpt.length>4096)throw new Error('Excerpt bound');
    if(c.original_publication_date!==null)text(c.original_publication_date,262144);
    date(c.published_at,true);date(c.updated_at,true);date(c.retrieved_at);
    const d=fields(c.duplicate_identity,['url_hash','editorial_primary_source_key','policy','scope']);digest(d.url_hash);
    if(d.url_hash!==sha256(c.canonical_url)||d.editorial_primary_source_key!==`src:${d.url_hash}`||d.policy!==EDITORIAL_REFERENCE.policy||d.scope!=='exact-canonical-url-only')throw new Error('Invalid duplicate identity');
    if(c.item_id!==sha256(canonical({schema:'news-item-p2.1',source_id:source.id,url_hash:d.url_hash}))||c.candidate_id!==sha256(canonical({schema:NEWS_VERSION,item_id:c.item_id,content_hash:c.content_hash})))throw new Error('Invalid candidate identity');
    const provenance=fields(c.provenance,['schema','source_id','snapshot','locator','reported_url']);
    if(provenance.schema!==NEWS_VERSION||provenance.source_id!==source.id||provenance.snapshot!==`snapshots/${policy.namespace}/${c.source_hash}.xml`||!/^\/(rss\/channel\/item|feed\/entry)\[[1-9]\d*\]$/.test(provenance.locator)||canonicalNewsUrl(eligibleUrl(provenance.reported_url,source))!==c.canonical_url)throw new Error('Invalid provenance locator');
    if(c.declared_canonical_url!==null)eligibleUrl(c.declared_canonical_url,source);
    if(!Array.isArray(c.declared_related_urls)||c.declared_related_urls.length>200)throw new Error('Related URL bound');for(const u of c.declared_related_urls)eligibleUrl(u,source);
    if(!Array.isArray(c.quality_flags)||c.quality_flags.length>20||!c.quality_flags.includes(source.category==='synthetic_fixture'?'synthetic_fixture':'registered_source_unverified')||!c.quality_flags.includes('source_claim_unverified'))throw new Error('Missing uncertainty flags');for(const q of c.quality_flags)text(q,128);
    if(c.review_required!==true||c.verification_status!=='unverified'||c.admission_state!=='unadmitted'||c.publication_approved!==false)throw new Error('News candidate cannot grant admission or publication');
  }
  if(page.next_cursor!==null&&(p.candidates.length!==page.limit||page.next_cursor!==previous))throw new Error('Invalid next cursor');
}
