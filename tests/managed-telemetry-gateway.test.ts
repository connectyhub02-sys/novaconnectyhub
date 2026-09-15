import {it,expect} from 'vitest';
import {normalizeHostSample,telemetryRestSink} from '../services/managed-worker/telemetry-gateway.mjs';
it('projects only measured fields and refuses invalid host or time',()=>{
 const sample={measured_at:new Date().toISOString(),cpu_percent:null,memory_total:100,memory_available:50,disk_total:100,disk_used:10,network_rx_bytes:null,network_tx_bytes:null,services:[{name:'supabase-db',status:'healthy',env:'private'}],secret:'private'};
 expect(JSON.stringify(normalizeHostSample(sample))).not.toContain('private');
 expect(()=>normalizeHostSample({...sample,memory_available:101})).toThrow();
 expect(()=>normalizeHostSample({...sample,measured_at:'2000-01-01'})).toThrow();
 expect(()=>normalizeHostSample({...sample,services:[{name:'other-client-container',status:'healthy'}]})).toThrow();
});
it('does not report success when atomic persistence fails',async()=>{
 let calls=0;const sink=telemetryRestSink({root:'http://127.0.0.1:18301/',key:'fictional-service-key-at-least-32-characters',request:async()=>new Response('',{status:(calls++,503)})});
 await expect(sink({measured_at:new Date().toISOString()})).rejects.toThrow('sample_not_persisted');expect(calls).toBe(1);
});
