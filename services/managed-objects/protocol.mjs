import {createHmac,timingSafeEqual} from 'node:crypto';
export const MAX_OBJECT_BYTES=20*1024*1024;
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export function objectIds(project,object){if(!uuid.test(project)||!uuid.test(object))throw Error('invalid_object_id');return `${project}/${object}`;}
function valid(claim,now){
 objectIds(claim.project,claim.object);
 if(!['PUT','GET','DELETE'].includes(claim.method)||!Number.isSafeInteger(claim.bytes)||claim.bytes<0||claim.bytes>MAX_OBJECT_BYTES||!/^[a-f0-9]{64}$/.test(claim.sha256)||!Number.isSafeInteger(claim.expires)||claim.expires<now||claim.expires>now+60000)throw Error('invalid_capability');
}
function signature(body,secret){if(typeof secret!=='string'||secret.length<32)throw Error('invalid_server_secret');return createHmac('sha256',secret).update(body).digest();}
export function signObjectCapability(claim,secret,now=Date.now()){valid(claim,now);const body=Buffer.from(JSON.stringify(claim)).toString('base64url');return `${body}.${signature(body,secret).toString('base64url')}`;}
export function verifyObjectCapability(token,secret,method,path,now=Date.now()){
 if(typeof token!=='string'||token.length>2048)throw Error('invalid_capability');const parts=token.split('.');if(parts.length!==2)throw Error('invalid_capability');
 const actual=Buffer.from(parts[1],'base64url'),expected=signature(parts[0],secret);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('invalid_capability');
 const claim=JSON.parse(Buffer.from(parts[0],'base64url').toString());valid(claim,now);if(claim.method!==method||path!==`/objects/${objectIds(claim.project,claim.object)}`)throw Error('invalid_capability');return claim;
}
