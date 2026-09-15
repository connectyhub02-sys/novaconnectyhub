// No scheduler is installed by this module. The owner starts/stops the process explicitly.
/**
 * @template T
 * @param {{collect:()=>Promise<T>,publish:(sample:T)=>Promise<void>,pause:(ms:number,signal?:AbortSignal)=>Promise<void>,intervalMs?:number,iterations?:number,signal?:AbortSignal,onState?:(state:{state:string})=>void}} options
 */
export async function telemetryLoop({collect,publish,pause,intervalMs=60000,iterations=Infinity,signal=undefined,onState=state=>{void state;}}){
 if(!Number.isFinite(intervalMs)||intervalMs<1000||intervalMs>3600000)throw Error('Invalid collection interval');
 for(let i=0;i<iterations&&!signal?.aborted;i++){
  try{const sample=await collect();if(signal?.aborted)break;await publish(sample);onState({state:'sample_confirmed'});}
  catch{onState({state:'collection_or_delivery_failed'});}
  if(i+1<iterations&&!signal?.aborted)await pause(intervalMs,signal);
 }
}
export function sustainedAlert({threshold,recoveryThreshold=threshold-5,requiredSamples=3,cooldownMs=300000}){
 if(!Number.isFinite(threshold)||!Number.isFinite(recoveryThreshold)||recoveryThreshold>=threshold||!Number.isInteger(requiredSamples)||requiredSamples<1||cooldownMs<0)throw Error('Invalid alert policy');
 let count=0,active=false,lastEmission=-Infinity;
 return (value,now=Date.now())=>{if(value===null||!Number.isFinite(value)){count=0;return {state:'unknown',event:null};}
  if(active&&value<=recoveryThreshold){active=false;count=0;lastEmission=now;return {state:'normal',event:'recovered'};}
  if(!active){count=value>=threshold?count+1:0;if(count>=requiredSamples){active=true;lastEmission=now;return {state:'alert',event:'opened'};}}
  if(active&&now-lastEmission>=cooldownMs){lastEmission=now;return {state:'alert',event:'reminder'};}
  return {state:active?'alert':'normal',event:null};
 };
}
