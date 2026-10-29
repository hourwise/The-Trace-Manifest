/** Shared constants/validation only: safe for the Pages import graph. */
export const N4_VERSION='trace-preview-identity-n4.1';
export const PREVIEW_DATABASE_ID='f312f662-2252-4005-8103-1a40d546e16b';
export const IDENTITY_MIGRATION_SHA256='3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be';
export const MAX_IDENTITY_BODY_BYTES=4096;
export const MAX_IDENTITY_RESPONSE_BYTES=32768;
export const MAX_IDENTITY_PAGE=25;
export const MAX_IDENTITY_REQUESTS=10;
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export class IdentityError extends Error {constructor(public code:string,public status=409){super(code);}}
export interface IdentityEnvironment {
 DB:D1Database; TRACE_ENVIRONMENT?:string; TRACE_INTERNAL_SERVICE_SECRET?:string;
 TRACE_IDENTITY_INVENTORY_ENABLED?:string; TRACE_IDENTITY_MAINTENANCE_ENABLED?:string;
 TRACE_IDENTITY_DATABASE_ID?:string; TRACE_IDENTITY_TARGET_ATTESTATION_SHA256?:string;
 TRACE_IDENTITY_IMPLEMENTATION_SHA256?:string; TRACE_IDENTITY_MAINTENANCE_PROFILE?:string;
}
export interface BatchApproval {request_id:string;after:string;limit:number;selection_sha256:string;maximum_row_changes:number;maximum_write_units:number}
export interface MaintenanceProfile {
 schema:typeof N4_VERSION;approval_ref:string;owner_approval:string;environment:'preview';database_id:string;
 target_attestation_sha256:string;implementation_sha256:string;migration_sha256:string;publisher_email:string;
 from_utc:string;until_utc:string;requests:BatchApproval[];
}
export function exact(value:unknown,keys:string[]):void{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw new IdentityError('identity_request_contract',400);
}
export function cursor(value:unknown):asserts value is string {if(typeof value!=='string'||value.length>200||/[\u0000-\u001f\u007f]/.test(value))throw new IdentityError('identity_cursor',400);}
export function pageLimit(value:unknown):asserts value is number {if(!Number.isInteger(value)||Number(value)<1||Number(value)>MAX_IDENTITY_PAGE)throw new IdentityError('identity_page_bound',400);}
export function assertTarget(env:IdentityEnvironment,input:Record<string,unknown>){
 if(env.TRACE_ENVIRONMENT!=='preview'||env.TRACE_IDENTITY_DATABASE_ID!==PREVIEW_DATABASE_ID||!HASH.test(env.TRACE_IDENTITY_TARGET_ATTESTATION_SHA256??'')||!HASH.test(env.TRACE_IDENTITY_IMPLEMENTATION_SHA256??''))throw new IdentityError('identity_verified_preview_target_required',503);
 if(input.environment!=='preview'||input.database_id!==env.TRACE_IDENTITY_DATABASE_ID||input.target_attestation_sha256!==env.TRACE_IDENTITY_TARGET_ATTESTATION_SHA256)throw new IdentityError('identity_target_mismatch',403);
}
export function approvedProfile(env:IdentityEnvironment,email:string,now=Date.now()):MaintenanceProfile{
 assertTarget(env,{environment:'preview',database_id:env.TRACE_IDENTITY_DATABASE_ID,target_attestation_sha256:env.TRACE_IDENTITY_TARGET_ATTESTATION_SHA256});
 if(env.TRACE_IDENTITY_MAINTENANCE_ENABLED!=='true')throw new IdentityError('identity_maintenance_disabled',503);
 if(!env.TRACE_IDENTITY_MAINTENANCE_PROFILE||new TextEncoder().encode(env.TRACE_IDENTITY_MAINTENANCE_PROFILE).length>4096)throw new IdentityError('identity_approval_required',503);
 let p:any;try{p=JSON.parse(env.TRACE_IDENTITY_MAINTENANCE_PROFILE);}catch{throw new IdentityError('identity_approval_required',503);}
 exact(p,['schema','approval_ref','owner_approval','environment','database_id','target_attestation_sha256','implementation_sha256','migration_sha256','publisher_email','from_utc','until_utc','requests']);
 const from=Date.parse(p.from_utc),until=Date.parse(p.until_utc);
 if(p.schema!==N4_VERSION||typeof p.approval_ref!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(p.approval_ref)||p.owner_approval!==p.approval_ref||p.environment!=='preview'||p.database_id!==env.TRACE_IDENTITY_DATABASE_ID||p.target_attestation_sha256!==env.TRACE_IDENTITY_TARGET_ATTESTATION_SHA256||p.implementation_sha256!==env.TRACE_IDENTITY_IMPLEMENTATION_SHA256||p.migration_sha256!==IDENTITY_MIGRATION_SHA256||p.publisher_email!==email||!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>3600000||new Date(from).toISOString()!==p.from_utc||new Date(until).toISOString()!==p.until_utc)throw new IdentityError('identity_approval_mismatch',403);
 if(now<from||now+15000>=until)throw new IdentityError('identity_outside_maintenance_window');
 if(!Array.isArray(p.requests)||p.requests.length<1||p.requests.length>MAX_IDENTITY_REQUESTS)throw new IdentityError('identity_campaign_bound',400);
 const ids=new Set<string>();for(const r of p.requests){exact(r,['request_id','after','limit','selection_sha256','maximum_row_changes','maximum_write_units']);cursor(r.after);pageLimit(r.limit);if(typeof r.request_id!=='string'||!UUID.test(r.request_id)||ids.has(r.request_id)||typeof r.selection_sha256!=='string'||!HASH.test(r.selection_sha256)||!Number.isInteger(r.maximum_row_changes)||Number(r.maximum_row_changes)<1||Number(r.maximum_row_changes)>27||!Number.isInteger(r.maximum_write_units)||Number(r.maximum_write_units)<1||Number(r.maximum_write_units)>133)throw new IdentityError('identity_batch_approval_bound',400);ids.add(r.request_id);}
 return p;
}
