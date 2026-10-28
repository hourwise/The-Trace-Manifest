import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=process.env.TRACE_P4_OUTPUT_ROOT??'D:/TRACE/local-acquisition/news-p4-r2';
if(!/^[dD]:[\\/]/.test(root))throw new Error('D: output required');
mkdirSync(root+'/reports',{recursive:true});
const rows=[];
for(const [name,entry] of [['ingestion-worker','workers/ingestion/index.ts'],['news-import-service','src/lib/server/news-import/service.ts']]){
 const start=performance.now();
 const output=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],metafile:true,minify:true,target:'es2022'});
 const bytes=output.outputFiles[0].contents,hash=createHash('sha256').update(bytes).digest('hex');
 writeFileSync(root+'/reports/'+name+'-'+hash+'.mjs',bytes,{flag:'w'});
 const externals=[...new Set(Object.values(output.metafile.outputs).flatMap(o=>o.imports.filter(i=>i.external).map(i=>i.path)))];
 if(name==='news-import-service'&&externals.some(x=>/fs|sqlite|child_process|module/.test(x)))throw new Error('Acquisition dependency escaped into hosted service');
 rows.push({name,entry,sha256:hash,bytes:bytes.length,gzip_bytes:gzipSync(bytes).length,build_duration_ms:performance.now()-start,input_modules:Object.keys(output.metafile.inputs).length,externals});
}
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const report={schema:'trace-p4-r2-local-bundle-measurement-v1',node:process.version,measurements:rows,sax:{declared:JSON.parse(readFileSync('package.json','utf8')).dependencies.sax,locked:lock.packages['node_modules/sax'],installed:JSON.parse(readFileSync(require.resolve('sax/package.json'),'utf8')).version},limitations:['Local esbuild measurement; not a Wrangler upload or remote Worker CPU/memory measurement.','CPU/wall time in tests includes real Node SQLite and parser work; not a Cloudflare billing estimate.']};
console.log(JSON.stringify(report));
writeFileSync(root+'/reports/bundle-measurements.json',JSON.stringify(report,null,2)+'\n');
