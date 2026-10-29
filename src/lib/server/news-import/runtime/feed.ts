// Generated compatibility projection of tools/news-import/parser-source/feed.ts; source SHA-256 0b32c1c09f431bad77dbbef751e56b78922fbd3b8705d2c7a9f4dedfbd09221e.
// Run node scripts/generate-news-import-runtime.mjs; do not edit by hand.
import saxModule from 'sax';
import { canonical, sha256 } from './primitives';

export const NEWS_VERSION = 'trace-news-extraction-p2.1';
export const FEED_LIMITS = Object.freeze({ bytes: 262144, entries: 200, nodes: 10000, depth: 32, excerpt: 4096 });
export const EDITORIAL_REFERENCE = Object.freeze({
  commit: 'f2ff849ce487cc0fb4c86cd5583545689f866cfe',
  path: 'src/lib/server/source-identity.ts',
  policy: 'trace-editorial-dedupe-r1/canonicalSourceUrl',
});
export interface NewsSource {
  id: string; feed_url: string; origins: string[]; category: 'synthetic_fixture'|'registered_public_feed';
  purpose: string; processing: 'feed-excerpt-only'; retention: 'preserve-evidence';
}
export const NEWS_SOURCES: readonly NewsSource[] = Object.freeze([
  { id: 'fixture-alpha', feed_url: 'https://alpha.trace.test/feed.xml', origins: ['https://alpha.trace.test'], category: 'synthetic_fixture', purpose: 'Offline RSS news intake evaluation; fictional stories', processing: 'feed-excerpt-only', retention: 'preserve-evidence' },
  { id: 'fixture-beta', feed_url: 'https://beta.trace.test/atom.xml', origins: ['https://beta.trace.test', 'https://alpha.trace.test'], category: 'synthetic_fixture', purpose: 'Offline Atom and cross-source URL dedup evaluation; fictional stories', processing: 'feed-excerpt-only', retention: 'preserve-evidence' },
]);
export function sourceById(id: string): NewsSource {
  const found = NEWS_SOURCES.find(s => s.id === id);
  if (!found) throw new Error('Unknown fixture source; live sources are not enabled');
  return found;
}
// Deliberately identical to the pinned committed editorial policy. Do not widen
// it (fragment removal, query sorting, www, protocol or trailing-slash changes).
export function canonicalNewsUrl(url: string): string {
  const parsed = new URL(url);
  for (const param of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','source','fbclid','gclid']) parsed.searchParams.delete(param);
  let normalized = parsed.toString();
  if (normalized.endsWith('/') && !parsed.pathname.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}
export function eligibleUrl(value: string, source: NewsSource): string {
  const url = new URL(value, source.feed_url);
  if (!source.origins.includes(url.origin) || url.username || url.password || !['http:','https:'].includes(url.protocol) || source.category==='synthetic_fixture'&&url.protocol!=='https:') throw new Error('URL outside fixture registry');
  return url.href;
}
export function plainText(value: string, maximum: number = FEED_LIMITS.excerpt): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, s => ({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[s]!))
    .replace(/&#(x[\da-f]+|\d+);/gi, (s,n:string) => {const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<=0x10ffff&&!(x>=0xd800&&x<=0xdfff)?String.fromCodePoint(x):s;})
    .normalize('NFC').replace(/\s+/g,' ').trim().slice(0,maximum);
}
function timestamp(raw: string): string | null {
  if (!raw || !/(Z|[+-]\d\d:?\d\d|GMT|UTC)\s*$/i.test(raw)) return null;
  const millis = Date.parse(raw); return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}
interface Node {name: string; namespace:string; attributes: Record<string,string>; children: (Node|string)[]}
interface Tag {local: string; uri:string; attributes: Record<string,{name:string;value:string}>}
interface SaxParser {onopentag: (tag:Tag)=>void; onclosetag:()=>void; ontext:(s:string)=>void; oncdata:(s:string)=>void; onerror:(e:Error)=>void; write(s:string):SaxParser;close():void}
const sax = saxModule as unknown as {parser(strict:boolean,options:{xmlns:boolean}):SaxParser};
const elements = (n:Node,name:string):Node[] => n.children.filter((c):c is Node => typeof c !== 'string' && c.name === name);
const content = (n:Node|undefined):string => !n?'':n.children.map(c=>typeof c==='string'?c:content(c)).join('');
const field = (n:Node,name:string):string => content(elements(n,name)[0]).trim();
export interface NewsItem {
  item_id: string; url_hash: string; canonical_url: string; reported_url: string;
  external_id: string|null; title: string; excerpt: string;
  published_raw: string|null; published_at: string|null; updated_raw: string|null; updated_at: string|null;
  declared_canonical_url: string|null; declared_related_urls: string[];
  quality_flags: string[]; content_hash: string; locator: string;
}
export interface ParsedFeed {schema:string;source_id:string;format:'rss'|'atom';source_hash:string;items:NewsItem[];deferred:{locator:string;reason:string}[];entries_seen:number}
export function parseFeed(xml: string, source: NewsSource): ParsedFeed {
  if (sourceById(source.id) !== source) throw new Error('Registry source object required');
  return parseRegisteredFeed(xml,source,[source]);
}
/** Explicit caller-owned registry extension; legacy parseFeed retains its guard. */
export function parseRegisteredFeed(xml:string,source:NewsSource,registry:readonly NewsSource[],requireAbsolute=false):ParsedFeed {
  if(registry.find(s=>s.id===source.id)!==source)throw new Error('Registry source object required');
  if (Buffer.byteLength(xml)>FEED_LIMITS.bytes) throw new Error('Feed byte limit exceeded');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD/entities forbidden');
  const parser=sax.parser(true,{xmlns:true}), stack:Node[]=[], root:Node={name:'document',namespace:'',attributes:{},children:[]};let count=0;
  stack.push(root);
  parser.onopentag=tag=>{if(++count>FEED_LIMITS.nodes||stack.length>FEED_LIMITS.depth)throw new Error('XML structure limit');const attributes=Object.fromEntries(Object.values(tag.attributes).map(a=>[a.name.toLowerCase(),a.value]));if('xml:base' in attributes)throw new Error('xml:base is not supported by this fixture contract');const n:Node={name:tag.local.toLowerCase(),namespace:tag.uri,attributes,children:[]};stack.at(-1)!.children.push(n);stack.push(n);};
  parser.onclosetag=()=>{stack.pop();};parser.ontext=parser.oncdata=s=>{stack.at(-1)!.children.push(s);};parser.onerror=()=>{throw new Error('Malformed XML feed');};
  parser.write(xml).close();
  const rss=elements(root,'rss')[0],atom=elements(root,'feed')[0];
  if ((!rss&&!atom)||elements(root,rss?'rss':'feed').length!==1) throw new Error('RSS 2.0 or Atom root required');
  if(rss&&(rss.namespace!==''||rss.attributes.version!=='2.0')||atom&&atom.namespace!=='http://www.w3.org/2005/Atom')throw new Error('Unsupported feed version/namespace');
  const format=rss?'rss':'atom',channel=rss?elements(rss,'channel')[0]:atom;
  if(!channel)throw new Error('RSS channel missing');
  const entries=elements(channel,rss?'item':'entry');
  if(entries.length>FEED_LIMITS.entries)throw new Error('Feed entry limit exceeded; no truncated checkpoint');
  const items:NewsItem[]=[],deferred:ParsedFeed['deferred']=[];
  for(const [index,e] of entries.entries()) {
    const locator=`/${format==='rss'?'rss/channel/item':'feed/entry'}[${index+1}]`;
    try {
      const links=elements(e,'link'),alternate=links.find(l=>!l.attributes.rel||l.attributes.rel==='alternate');
      const rawUrl=rss?field(e,'link'):alternate?.attributes.href??'';
      if(!rawUrl)throw new Error('Missing item URL');
      if(requireAbsolute&&!/^https?:\/\//i.test(rawUrl))throw new Error('Absolute item URL required for multi-route collection');
      const reported_url=eligibleUrl(rawUrl,source),canonical_url=canonicalNewsUrl(reported_url),url_hash=sha256(canonical_url);
      const title=plainText(field(e,'title'),1024);if(!title)throw new Error('Missing item title');
      const excerpt=plainText(field(e,'description')||field(e,'summary')||field(e,'content')||field(e,'encoded'));
      const published_raw=field(e,rss?'pubdate':'published')||null,updated_raw=field(e,'updated')||null;
      const published_at=timestamp(published_raw??''),updated_at=timestamp(updated_raw??'');
      const canon=links.find(l=>l.attributes.rel==='canonical');
      const declared_canonical_url=canon?.attributes.href?eligibleUrl(canon.attributes.href,source):null;
      const declared_related_urls=links.filter(l=>l.attributes.rel==='related'&&l.attributes.href).map(l=>eligibleUrl(l.attributes.href,source)).sort();
      const quality_flags=[source.category==='synthetic_fixture'?'synthetic_fixture':'registered_source_unverified','source_claim_unverified',...(!published_at?['missing_or_invalid_publication_time']:[]),...(updated_raw&&!updated_at?['invalid_update_time']:[]),...(declared_canonical_url?['canonical_declaration_unverified']:[])];
      const data={canonical_url,url_hash,external_id:field(e,rss?'guid':'id')||null,title,excerpt,published_raw,published_at,updated_raw,updated_at,declared_canonical_url,declared_related_urls,quality_flags};
      items.push({...data,item_id:sha256(canonical({schema:'news-item-p2.1',source_id:source.id,url_hash})),reported_url,locator,content_hash:sha256(canonical(data))});
    } catch(error) {deferred.push({locator,reason:error instanceof Error?error.message:'Invalid feed entry'});}
  }
  return {schema:NEWS_VERSION,source_id:source.id,format,source_hash:sha256(xml),items,deferred,entries_seen:entries.length};
}
