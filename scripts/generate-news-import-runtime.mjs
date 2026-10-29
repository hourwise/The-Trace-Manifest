import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const checking=process.argv.includes('--check');
function output(path,bytes){if(checking){if(!existsSync(path)||readFileSync(path,'utf8').replace(/\r\n/g,'\n')!==bytes)throw new Error('Generated runtime drift: '+path);}else writeFileSync(path,bytes);}
const destination='src/lib/server/news-import/runtime';mkdirSync(destination,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
function emit(name,source,transform){const raw=readFileSync(source,'utf8').replace(/\r\n/g,'\n');const body=transform(raw);output(destination+'/'+name,'// Generated compatibility projection of '+source+'; source SHA-256 '+hash(raw)+'.\n// Run node scripts/generate-news-import-runtime.mjs; do not edit by hand.\n'+body);}
for(const name of ['primitives','feed','handoff','registry','bundle'])emit(name+'.ts','tools/news-import/parser-source/'+name+'.ts',s=>s);
console.log('Generated five runtime-only projections; no catalogue, filesystem, transport or credentials in the Worker import graph.');
// This is a schema certificate, not a claim that an unknown remote schema is safe.
const migration=readFileSync('db/migration-0080-local-news-import.sql','utf8');
const {DatabaseSync}=await import('node:sqlite');
const certificateDb=new DatabaseSync(':memory:');
certificateDb.exec('CREATE TABLE editorial_candidates(id TEXT PRIMARY KEY,state TEXT,submitted_url TEXT,reviewed_by TEXT,reviewed_at TEXT,updated_at TEXT)');
certificateDb.exec(migration);
const triggers=certificateDb.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all().map(r=>({name:r.name,sql:r.sql.trim().replace(/\s+/g,' ')}));
certificateDb.close();
output('src/lib/server/news-import/expected-triggers.ts','// Generated from migration 0080; unknown mutation triggers fail closed.\nexport const EXPECTED_IMPORT_TRIGGERS = '+JSON.stringify(triggers,null,2)+' as const;\n');
