/** Per-request accounting only; no additional SQL or shared mutable state. */
export function meterIdentityDatabase(original:D1Database){
 const raw=new WeakMap<object,D1PreparedStatement>();let statements=0,roundTrips=0,rowsRead=0,rowsWritten=0,complete=true;
 const record=(r:D1Result)=>{if(Number.isSafeInteger(r.meta?.rows_read)&&Number.isSafeInteger(r.meta?.rows_written)){rowsRead+=r.meta.rows_read;rowsWritten+=r.meta.rows_written;}else complete=false;};
 const wrap=(s:D1PreparedStatement):D1PreparedStatement=>{
  const proxy=new Proxy(s,{get(target,key){
   if(key==='bind')return(...args:unknown[])=>wrap(target.bind(...args));
   if(key==='first')return async(column?:string)=>{statements++;roundTrips++;const r=await target.all<Record<string,unknown>>();record(r);const row=r.results[0];return row?(column===undefined?row:row[column]??null):null;};
   if(key==='all'||key==='run')return async()=>{statements++;roundTrips++;const r=key==='all'?await target.all():await target.run();record(r);return r;};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});raw.set(proxy,s);return proxy;
 };
 const db=new Proxy(original,{get(target,key){
  if(key==='prepare')return(sql:string)=>wrap(target.prepare(sql));
  if(key==='batch')return async(list:D1PreparedStatement[])=>{statements+=list.length;roundTrips++;try{const results=await target.batch(list.map(s=>raw.get(s)??s));for(const r of results)record(r);return results;}catch(error){complete=false;throw error;}};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return {db,summary:()=>({sql_statements_sent:statements,database_round_trips:roundTrips,provider_rows_read:complete?rowsRead:null,provider_rows_written:complete?rowsWritten:null,provider_metadata_complete:complete})};
}
