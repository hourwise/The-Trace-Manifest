// Generated compatibility projection of tools/news-import/parser-source/bundle.ts; source SHA-256 baf67dd8f6ab7ada4a1424c3f21fde9644ec42baf91db709dfccdd9a3304590f.
// Run node scripts/generate-news-import-runtime.mjs; do not edit by hand.
import {canonical,sha256,object,digest} from './primitives';
import {NEWS_VERSION,parseFeed,sourceById} from './feed';
import {validatePayload,parseP3,registration} from './registry';
export interface Bundle {schema:'trace-news-import-bundle-p3.1';package_id:string;payload_sha256:string;payload_json:string;envelope_json:string;snapshots:{sha256:string;xml:string}[];bundle_sha256:string}
export function bundleHash(b:Omit<Bundle,'bundle_sha256'>|Bundle):string{const {bundle_sha256,...rest}=b as Bundle;return sha256(canonical(rest));}
export function validateBundle(value:unknown,expectedHash:string):{bundle:Bundle;payload:any}{
 digest(expectedHash);const b=object(value) as Bundle;
 if(Object.keys(b).sort().join(',')!=='bundle_sha256,envelope_json,package_id,payload_json,payload_sha256,schema,snapshots'||b.schema!=='trace-news-import-bundle-p3.1'||Buffer.byteLength(canonical(b))>2*1024*1024||!/^TRACE-NEWS-P[23]-\d{6}$/.test(b.package_id)||b.bundle_sha256!==expectedHash||bundleHash(b)!==expectedHash)throw new Error('Import bundle identity/size mismatch');
 if(typeof b.payload_json!=='string'||typeof b.envelope_json!=='string'||sha256(b.payload_json)!==b.payload_sha256||!Array.isArray(b.snapshots)||b.snapshots.length>10)throw new Error('Package checksum/bound mismatch');
 const p=JSON.parse(b.payload_json);validatePayload(p);if(p.candidates.length>10)throw new Error('Importer cap is ten version proposals; export a bounded page');
 if(canonical(p)+'\n'!==b.payload_json)throw new Error('Noncanonical payload bytes');
 const env={schema:'trace-news-envelope-p2.1',package_id:b.package_id,payload_sha256:b.payload_sha256,bytes:Buffer.byteLength(b.payload_json),candidate_count:p.candidates.length,next_cursor:p.pagination.next_cursor};
 if(canonical(env)+'\n'!==b.envelope_json||!b.package_id.startsWith(p.schema.endsWith('p2.1')?'TRACE-NEWS-P2-':'TRACE-NEWS-P3-'))throw new Error('Package envelope mismatch');
 const snapshots=new Map<string,string>();for(const s of b.snapshots){if(Object.keys(s).sort().join(',')!=='sha256,xml'||typeof s.xml!=='string'||sha256(s.xml)!==s.sha256||snapshots.has(s.sha256))throw new Error('Corrupt/duplicate snapshot');snapshots.set(s.sha256,s.xml);}
 for(const c of p.candidates){const xml=snapshots.get(c.source_hash);if(!xml)throw new Error('Missing exact source snapshot');
  const source=p.schema.endsWith('p2.1')?sourceById(c.source.id):registration(c.source.id).source;
  const extracted=p.schema.endsWith('p2.1')?parseFeed(xml,source):parseP3(xml,source);
  const i=extracted.items.find(i=>i.item_id===c.item_id&&i.content_hash===c.content_hash&&i.locator===c.provenance.locator);
  if(!i||c.candidate_id!==sha256(canonical({schema:NEWS_VERSION,item_id:i.item_id,content_hash:i.content_hash}))||c.title!==i.title||c.excerpt!==i.excerpt||c.canonical_url!==i.canonical_url||c.original_publication_date!==i.published_raw||c.published_at!==i.published_at||c.updated_at!==i.updated_at||c.provenance.reported_url!==i.reported_url||canonical(c.quality_flags)!==canonical(i.quality_flags)||canonical(c.declared_related_urls)!==canonical(i.declared_related_urls)||c.declared_canonical_url!==i.declared_canonical_url)throw new Error('Package source-span/content provenance mismatch');
 }
 if(snapshots.size!==new Set(p.candidates.map((c:any)=>c.source_hash)).size)throw new Error('Unreferenced evidence snapshot');
 return {bundle:b,payload:p};
}
