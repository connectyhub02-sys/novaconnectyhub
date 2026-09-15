export type ManagedProject = {id:string; organization_id:string; name:string; slug:string; status:'draft'|'active'|'paused'; concurrency_limit:number; queue_limit:number; storage_limit_bytes:number; created_at:string};
export type Row = Record<string, unknown>;
export type ProjectSnapshot = {project:ManagedProject; records:Row[]; files:Row[]; jobs:Row[]; logs:Row[]; usage:Row[]; members:Row[]; resources:Row[]; truncated:boolean};
export type HostSample = {measured_at:string;cpu_percent:number|null;memory_total:number;memory_available:number;disk_total:number;disk_used:number;network_rx_bytes:number|null;network_tx_bytes:number|null;services:{name:string;status:string}[]};
export type AlertSettings = {cpu_percent:number;memory_percent:number;disk_percent:number;stale_seconds:number};
export const defaultAlerts:AlertSettings={cpu_percent:85,memory_percent:85,disk_percent:80,stale_seconds:300};
export function evaluateAlerts(sample:HostSample|undefined, settings:AlertSettings, now=Date.now()) {
 if(!sample) return ['Ainda não há amostras da infraestrutura.'];
 const alerts:string[]=[];
 if(now-Date.parse(sample.measured_at)>settings.stale_seconds*1000) alerts.push('Coleta desatualizada.');
 if(sample.cpu_percent!==null&&sample.cpu_percent>=settings.cpu_percent) alerts.push('CPU acima do limite configurado.');
 if((1-sample.memory_available/sample.memory_total)*100>=settings.memory_percent) alerts.push('Memória acima do limite configurado.');
 if(sample.disk_used/sample.disk_total*100>=settings.disk_percent) alerts.push('Disco acima do limite configurado.');
 if(sample.services.some(s=>s.status!=='healthy'&&s.status!=='running')) alerts.push('Há serviços que precisam de atenção.');
 return alerts;
}
export function networkRate(previous:HostSample,current:HostSample) {
 const seconds=(Date.parse(current.measured_at)-Date.parse(previous.measured_at))/1000;
 function rate(a:number|null,b:number|null){return seconds>0&&a!==null&&b!==null&&b>=a?(b-a)/seconds:null;}
 return {rx:rate(previous.network_rx_bytes,current.network_rx_bytes),tx:rate(previous.network_tx_bytes,current.network_tx_bytes)};
}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
