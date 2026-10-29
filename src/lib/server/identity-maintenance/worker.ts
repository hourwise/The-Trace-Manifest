import {verifyInternalRequestSignature} from '../../../security/internal-signature';
import {NewsImportError,type Actor} from '../news-import/service';
import {applyIdentityBatch,inspectIdentityPage,readIdentityReceipt} from './service';
import {IdentityError,MAX_IDENTITY_BODY_BYTES,MAX_IDENTITY_RESPONSE_BYTES,UUID,IDENTITY_MIGRATION_SHA256,exact,cursor,pageLimit,assertTarget,approvedProfile,type IdentityEnvironment} from './contract';
import {meterIdentityDatabase} from './meter';

function response(value:unknown,status=200){const body=JSON.stringify(value);if(new TextEncoder().encode(body).length>MAX_IDENTITY_RESPONSE_BYTES)throw new IdentityError('identity_response_byte_bound',503);return new Response(body,{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
async function bounded(request:Request){
 const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_IDENTITY_BODY_BYTES))throw new IdentityError('identity_request_too_large',413);
 if(!request.body)return '';const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_IDENTITY_BODY_BYTES){await reader.cancel();throw new IdentityError('identity_request_too_large',413);}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
export async function handleIdentityRequest(request:Request,env:IdentityEnvironment):Promise<Response>{
 if(env.TRACE_ENVIRONMENT!=='preview')return response({error:'identity_preview_only'},503);
 let meter:ReturnType<typeof meterIdentityDatabase>|undefined;
 try{
  const url=new URL(request.url);if(request.method!=='POST'||url.pathname!=='/admin/identity-maintenance'||url.search)throw new IdentityError('identity_route_contract',404);
  const body=await bounded(request),h=request.headers,operator=h.get('X-Trace-Operator')??'',role=h.get('X-Trace-Role')??'',timestamp=h.get('X-Trace-Timestamp')??'',nonce=h.get('X-Trace-Nonce')??'',secret=env.TRACE_INTERNAL_SERVICE_SECRET??'';
  if(secret.length<32||h.get('X-Trace-Internal-Version')!=='v1'||role!=='publisher'||!/^\S+@\S+\.\S+$/.test(operator)||operator.length>200||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60000||!UUID.test(nonce)||!await verifyInternalRequestSignature(secret,'POST',url.pathname,body,{operator,role,timestamp,nonce},h.get('X-Trace-Signature')??''))throw new IdentityError('identity_signed_publisher_required',401);
  let input:any;try{input=JSON.parse(body);}catch{throw new IdentityError('identity_invalid_json',400);}
  const base=['operation','environment','database_id','target_attestation_sha256'];
  if(input?.operation==='inspect'){exact(input,[...base,'after','limit']);cursor(input.after);pageLimit(input.limit);}
  else if(input?.operation==='receipt'){exact(input,[...base,'request_id']);if(!UUID.test(input.request_id??''))throw new IdentityError('identity_request_id',400);}
  else if(input?.operation==='apply'){exact(input,[...base,'approval_ref','request_id','after','selection_sha256']);cursor(input.after);if(!UUID.test(input.request_id??''))throw new IdentityError('identity_request_id',400);}
  else throw new IdentityError('identity_operation_contract',400);
  assertTarget(env,input);
  const actor:Actor={email:operator.toLowerCase(),role,requestId:input.request_id??nonce,nonce};
  if(input.operation==='apply')approvedProfile(env,actor.email);else if(env.TRACE_IDENTITY_INVENTORY_ENABLED!=='true')throw new IdentityError('identity_inventory_disabled',503);
  meter=meterIdentityDatabase(env.DB);const db=meter.db,finish=(value:object,status=200)=>response({...value,accounting:meter!.summary()},status);
  if(await db.prepare('SELECT nonce FROM admin_request_nonces WHERE nonce=? LIMIT 1').bind(nonce).first())throw new IdentityError('identity_nonce_replayed');
  if(input.operation==='inspect')return finish({...await inspectIdentityPage(db,actor,input.after,input.limit),environment:'preview',database_id:env.TRACE_IDENTITY_DATABASE_ID,target_attestation_sha256:env.TRACE_IDENTITY_TARGET_ATTESTATION_SHA256,implementation_sha256:env.TRACE_IDENTITY_IMPLEMENTATION_SHA256,migration_sha256:IDENTITY_MIGRATION_SHA256,database_identity_status:'DEPLOYMENT_ATTESTATION_REQUIRES_PROVIDER_PREFLIGHT'});
  if(input.operation==='receipt'){const receipt=await readIdentityReceipt(db,actor,input.request_id);return receipt?finish({receipt,inspection_writes:0}):finish({error:'identity_receipt_not_found'},404);}
  const {approval_ref,request_id,after,selection_sha256}=input;return finish(await applyIdentityBatch({...env,DB:db},actor,{approval_ref,request_id,after,selection_sha256}));
 }catch(error){const known=error instanceof IdentityError||error instanceof NewsImportError,code=known?error.code:'identity_validation_or_atomicity_failure',status=known?error.status:409;console.warn(JSON.stringify({event:'identity_maintenance_refused',code,status}));return response({error:code,...(meter?{accounting:meter.summary()}:{})},status);}
}
