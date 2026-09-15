import {telemetryGateway,telemetryRestSink} from '../../services/managed-worker/telemetry-gateway.mjs';
import {telemetryLoop} from '../../services/managed-worker/telemetry-loop.mjs';
export async function realTelemetry({key,serviceKey,check}){
 const server=telemetryGateway({key,persist:telemetryRestSink({root:'http://127.0.0.1:18301/',key:serviceKey})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/api/managed-telemetry`;
 let index=0,confirmed=0;const now=Date.now();
 const sample=()=>({measured_at:new Date(now+index++).toISOString(),cpu_percent:99,memory_total:100,memory_available:80,disk_total:100,disk_used:30,network_rx_bytes:100,network_tx_bytes:200,services:[{name:'supabase-db',status:'healthy'}],discarded_secret:'must-not-persist'});
 const send=(body,credential=key)=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  check((await send(sample(),'invalid')).status===401,'private collector rejects wrong key');
  await telemetryLoop({iterations:3,intervalMs:1000,collect:async()=>sample(),publish:async s=>{const response=await send(s);check(response.ok,'collector persisted to real REST');},pause:async()=>{},onState:s=>{if(s.state==='sample_confirmed')confirmed++;}});
  check(confirmed===3,'three serialized samples confirmed');
  check((await send({...sample(),memory_available:101})).status===400,'invalid measurement rejected');
 }finally{await new Promise(r=>server.close(r));}
}
