type Json=Record<string,unknown>;
const record=(v:unknown):Json=>v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
export function publicUsageCalculation(metadata:unknown){
 const m=record(record(metadata).metering);
 const rates=Array.isArray(m.matchedRates)?m.matchedRates.map(record):[];
 return {rates:rates.map(r=>({id:String(r.id??""),unit:String(r.unit??""),units:Number(r.units??0),price:Number(r.connectyPricePerUnit??0),minimum:Number(r.minimumChargeCredits??0)})),minimum:Number(m.minimumChargeCredits??Math.max(0,...rates.map(r=>Number(r.minimumChargeCredits??0)))),adjusted:Number(m.absorbedCredits??0)>0||Number(m.wallet_shortfall_absorbed??0)>0,version:typeof m.version==="string"?m.version:null};
}
