import {createServer} from 'node:http';
import {verifyObjectCapability} from './protocol.mjs';
export function objectServer(store,secret){
 let active=0;
 const server=createServer(async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  let claim;try{claim=verifyObjectCapability(req.headers.authorization?.replace(/^Bearer /,''),secret,req.method,req.url);}catch{return send(403,{error:'Access denied'});}
  if(active>=2)return send(503,{error:'Storage busy'});active++;let released=false;const release=()=>{if(!released){released=true;active--;}};res.once('finish',release);res.once('close',release);
  try{
   if(claim.method==='PUT'){let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>claim.bytes)return send(413,{error:'Object too large'});chunks.push(chunk);}if(length!==claim.bytes)return send(400,{error:'Invalid length'});return send(200,await store.put(claim.project,claim.object,Buffer.concat(chunks),claim.sha256));}
   if(claim.method==='DELETE')return send(200,{deleted:await store.delete(claim.project,claim.object)});
   const bytes=await store.get(claim.project,claim.object,claim.sha256,claim.bytes);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
  }catch{return send(409,{error:'Object unavailable or integrity check failed'});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;return server;
}
