// Generated compatibility projection of tools/news-import/parser-source/registry.ts; source SHA-256 df55c6210498ff9775e8a8624f5ed0ed499737e119ab647d75ebb23ccc913710.
// Run node scripts/generate-news-import-runtime.mjs; do not edit by hand.
import { canonical } from './primitives';
import { NEWS_SOURCES, parseRegisteredFeed, type NewsSource } from './feed';
import { validateNewsHandoff, type HandoffPolicy } from './handoff';

export const EDITORIAL_COMMIT='7dfff69ff92a037fdce86ee105263397ffa81f10';
export const REVIEW_COMMIT='331391a1aba49a493a388a2e99b9ce4cb349446c';
export const REGISTRY_VERSION='trace-news-registry-p3.1';
export interface Registration {source:NewsSource;editorial_id:number;name:string;home:string;feed_urls:string[];live:'proposed-not-approved'|'fixture-only';registry_evidence:string}
export const REGISTRATIONS:readonly Registration[]=[
 ...NEWS_SOURCES.map((source,n)=>({source,editorial_id:9901+n,name:`TRACE synthetic ${source.id}`,home:source.origins[0]+'/',feed_urls:[source.feed_url],live:'fixture-only' as const,registry_evidence:'P2 synthetic fixtures, not real publishers'})),
 {source:{id:'trace-source-7',feed_url:'https://deepmind.google/blog/rss.xml',origins:['https://deepmind.google'],category:'registered_public_feed',purpose:'Official DeepMind announcements; candidate claims only',processing:'feed-excerpt-only',retention:'preserve-evidence'},editorial_id:7,name:'Google DeepMind Blog',home:'https://deepmind.google/discover/blog/',feed_urls:['https://deepmind.google/blog/rss.xml'],live:'proposed-not-approved',registry_evidence:'db/seed.sql source 7; db/migration-0021-verified-rss-source-feeds.sql'},
 {source:{id:'trace-source-20',feed_url:'https://machinelearning.apple.com/rss.xml',origins:['https://machinelearning.apple.com'],category:'registered_public_feed',purpose:'Official Apple ML research announcements; candidate claims only',processing:'feed-excerpt-only',retention:'preserve-evidence'},editorial_id:20,name:'Apple ML Research',home:'https://machinelearning.apple.com/',feed_urls:['https://machinelearning.apple.com/rss.xml'],live:'proposed-not-approved',registry_evidence:'db/seed.sql source 20; db/migration-0021-verified-rss-source-feeds.sql'},
 {source:{id:'recorded-transformers',feed_url:'https://github.com/huggingface/transformers/releases.atom',origins:['https://github.com'],category:'synthetic_fixture',purpose:'Synthetic Atom wrapper over an existing recorded public release; never a live feed capture',processing:'feed-excerpt-only',retention:'preserve-evidence'},editorial_id:9903,name:'TRACE recorded release bridge fixture',home:'https://github.com/huggingface/transformers',feed_urls:['https://github.com/huggingface/transformers/releases.atom'],live:'fixture-only',registry_evidence:'local/acquisition/fixtures/recorded.json; source JSON hash retained in bridge receipt'},
];
export const SOURCES=REGISTRATIONS.map(r=>r.source);
export function registration(id:string):Registration{const r=REGISTRATIONS.find(r=>r.source.id===id);if(!r)throw new Error('Unknown P3 registry source');return r;}
export const POLICY:HandoffPolicy={schema:'trace-editorial-news-candidates-p3.1',reference:{commit:EDITORIAL_COMMIT,path:'src/lib/server/source-identity.ts',policy:'trace-editorial-dedupe-r1/canonicalSourceUrl'},registry_version:REGISTRY_VERSION,namespace:'news-p3',status:'provisional-local-import-only',source:id=>registration(id).source};
export const parseP3=(xml:string,source:NewsSource)=>{
 const parsed=parseRegisteredFeed(xml,source,SOURCES,true);
 // Multiple approved feed URLs may have different bases. The first pilot only
 // accepts explicit article URLs; it never silently resolves against the wrong base.
 for(const item of parsed.items)if(!/^https?:\/\//i.test(item.reported_url))throw new Error('Absolute article URL required');
 return parsed;
};
export function validatePayload(value:any):void{validateNewsHandoff(value,value?.schema==='trace-editorial-news-candidates-p2.1'?undefined:POLICY);}
export function registryIdentity():string{return canonical({version:REGISTRY_VERSION,registrations:REGISTRATIONS});}
