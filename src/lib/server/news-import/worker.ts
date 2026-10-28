import {verifyInternalRequestSignature} from '../../../security/internal-signature';
import {importNewsPackage,listNewsProposals,resolveNewsProposal,NewsImportError,IMPORT_VERSION,type Actor} from './service';
export interface NewsEnvironment {DB:D1Database;TRACE_INTERNAL_SERVICE_SECRET?:string;TRACE_ENVIRONMENT?:string;TRACE_NEWS_IMPORT_ENABLED?:string;TRACE_NEWS_IMPORT_BUNDLE_SHA256?:string;TRACE_NEWS_IMPORT_WRITE_LIMIT?:string;TRACE_NEWS_IMPORT_FROM_UTC?:string;TRACE_NEWS_IMPORT_UNTIL_UTC?:string}
export const MAX_NEWS_BODY_BYTES=2*1024*1024;
export const newsEnabled=(env:Pick<NewsEnvironment,'TRACE_ENVIRONMENT'|'TRACE_NEWS_IMPORT_ENABLED'>)=>env.TRACE_ENVIRONMENT==='preview'&&env.TRACE_NEWS_IMPORT_ENABLED==='true';
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function readNewsBody(request:Request){
 const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_NEWS_BODY_BYTES))throw new NewsImportError('body_too_large',413);
 if(!request.body)return '';const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_NEWS_BODY_BYTES){await reader.cancel();throw new NewsImportError('body_too_large',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
function exact(value:Record<string,unknown>,keys:string[]){if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))throw new NewsImportError('operation_contract',400);}
/** Uses the existing proxy HMAC format. Nonce consumption is in the same
 * atomic batch as the mutation, allowing a true zero-write package replay. */
export async function handleNewsImportRequest(request:Request,env:NewsEnvironment):Promise<Response>{
 if(env.TRACE_ENVIRONMENT!=='preview')return respond({error:'news_import_disabled'},503);
 try{
  const url=new URL(request.url);if(url.pathname!=='/admin/news-import'||url.search||!['GET','POST'].includes(request.method))throw new NewsImportError('unsupported_news_route',404);
  const body=await readNewsBody(request),h=request.headers,secret=env.TRACE_INTERNAL_SERVICE_SECRET??'',operator=h.get('X-Trace-Operator')??'',role=h.get('X-Trace-Role')??'',timestamp=h.get('X-Trace-Timestamp')??'',nonce=h.get('X-Trace-Nonce')??'',signature=h.get('X-Trace-Signature')??'';
  if(secret.length<32||h.get('X-Trace-Internal-Version')!=='v1'||role!=='publisher'||!/^\S+@\S+\.\S+$/.test(operator)||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60000||!/^[-a-f0-9]{36}$/i.test(nonce)||!await verifyInternalRequestSignature(secret,request.method,url.pathname,body,{operator,role,timestamp,nonce},signature))throw new NewsImportError('signed_publisher_proxy_required',401);
  const actor:Actor={email:operator.toLowerCase(),role,requestId:nonce,nonce};
  const checkNonce=async()=>{if(await env.DB.prepare('SELECT nonce FROM admin_request_nonces WHERE nonce=? LIMIT 1').bind(nonce).first())throw new NewsImportError('request_nonce_replayed',409);};
  if(request.method==='GET'){await checkNonce();return respond({proposals:await listNewsProposals(env.DB,actor)});}
  let input:any;try{input=JSON.parse(body);}catch{throw new NewsImportError('invalid_json',400);}
  if(input?.operation==='resolve'){exact(input,['operation','resolution']);exact(input.resolution,['versionId','revision','action','reason']);await checkNonce();return respond(await resolveNewsProposal(env.DB,input.resolution,actor));}
  if(!newsEnabled(env))throw new NewsImportError('news_import_disabled',503);
  await checkNonce();
  if(!['preflight','import'].includes(input?.operation))throw new NewsImportError('unsupported_operation',400);exact(input,['operation','bundle','expectedHash']);
  const limit=Number(env.TRACE_NEWS_IMPORT_WRITE_LIMIT),from=Date.parse(env.TRACE_NEWS_IMPORT_FROM_UTC??''),until=Date.parse(env.TRACE_NEWS_IMPORT_UNTIL_UTC??'');
  if(!/^[a-f0-9]{64}$/.test(env.TRACE_NEWS_IMPORT_BUNDLE_SHA256??'')||!Number.isInteger(limit)||limit<1||limit>40||!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>3600000||new Date(from).toISOString()!==env.TRACE_NEWS_IMPORT_FROM_UTC||new Date(until).toISOString()!==env.TRACE_NEWS_IMPORT_UNTIL_UTC)throw new NewsImportError('approved_import_profile_required',503);
  if(input.expectedHash!==env.TRACE_NEWS_IMPORT_BUNDLE_SHA256)throw new NewsImportError('package_not_approved');
  if(input.operation==='import'&&(Date.now()<from||Date.now()+15000>=until))throw new NewsImportError('outside_import_window');
  return respond(await importNewsPackage(env.DB,input.bundle,input.expectedHash,actor,input.operation==='preflight',limit));
 }catch(error){const code=error instanceof NewsImportError?error.code:'news_import_validation_or_atomicity_failure',status=error instanceof NewsImportError?error.status:409;console.warn(JSON.stringify({event:'news_import_rejected',contract:IMPORT_VERSION,code,status}));return respond({error:code},status);}
}
