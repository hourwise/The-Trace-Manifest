// Offline local validation only. Vite/workerd may use loopback IPC. Resolve
// localhost locally without DNS; every non-loopback DNS/socket/HTTP is blocked.
'use strict';
const {syncBuiltinESMExports}=require('node:module');
const deny=kind=>{process.stderr.write('TRACE_P4_NETWORK_BLOCKED:'+kind+'\n');throw Error('P4 prohibits external network access');};
const local=host=>['localhost','127.0.0.1','::1','[::1]'].includes(host);
const dns=require('node:dns'),promises=require('node:dns/promises');
const lookupResult=(host,options)=>options?.all?[{address:host==='localhost'?'127.0.0.1':host,family:host.includes(':')?6:4}]:{address:host==='localhost'?'127.0.0.1':host,family:host.includes(':')?6:4};
dns.lookup=(host,options,cb)=>{if(!local(host))return deny('dns.lookup');if(typeof options==='function'){cb=options;options={};}const result=lookupResult(host,options);queueMicrotask(()=>Array.isArray(result)?cb(null,result):cb(null,result.address,result.family));};
promises.lookup=async(host,options)=>{if(!local(host))return deny('dns.promises.lookup');return lookupResult(host,options);};
for(const mod of [dns,promises])for(const key of ['resolve','resolve4','resolve6','resolveAny','reverse'])mod[key]=()=>deny('dns.'+key);
const net=require('node:net'),connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const first=Array.isArray(args[0])?args[0][0]:args[0],pipe=typeof first==='string'?first:first?.path;if(typeof pipe==='string'&&/^\\\\[.?]\\pipe\\/i.test(pipe))return connect.apply(this,args);const host=typeof first==='object'?first.host??first.hostname??'localhost':typeof args[1]==='string'?args[1]:'localhost';if(!local(host))return deny('net.connect');return connect.apply(this,args);};
for(const name of ['node:http','node:https']){const mod=require(name);for(const key of ['request','get']){const original=mod[key];mod[key]=function(...args){const input=args[0],host=input instanceof URL?input.hostname:typeof input==='string'?new URL(input).hostname:input.hostname??input.host??'localhost';if(!local(host))return deny(name+'.'+key);return original.apply(this,args);};}}
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const host=new URL(typeof input==='string'||input instanceof URL?input:input.url).hostname;if(!local(host))return deny('fetch');return originalFetch(input,init);};
syncBuiltinESMExports();
