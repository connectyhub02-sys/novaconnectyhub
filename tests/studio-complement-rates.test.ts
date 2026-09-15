import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import table from '../docs/studio-tarifas-complementares-2026-09-14.json';
import {calculateMeteredUsageCharge,type MeteredRate} from '../src/lib/billing/metered-usage';
import {confirmedStudioRates} from '../src/lib/voice-api/studio-pricing';
const rates=(item:typeof table.rates[number]):MeteredRate[]=>Object.entries(item.credits_per_unit).map(([unit,price])=>({id:item.model_id+unit,unit:unit as MeteredRate['unit'],providerCostPerUnit:Number(item.provider_usd_per_unit[unit as keyof typeof item.provider_usd_per_unit])*table.usd_brl,connectyPricePerUnit:price,minimumChargeCredits:item.minimum_credits}));
it('bills a dictionary version once at the provisional rate and does not bill zero operations',()=>{
 const item=table.rates[0],r=rates(item);
 expect(item.status).toBe('provisional');
 expect(confirmedStudioRates(r,r,'dictionary_create')).toEqual(r);
 expect(calculateMeteredUsageCharge({rates:r,units:{requests:1}})).toMatchObject({chargeCredits:5,providerCost:0});
 expect(calculateMeteredUsageCharge({rates:r,units:{requests:0}}).chargeCredits).toBe(0);
});
it('meters each Gemini variant separately with one minimum across input and output',()=>{
 for(const item of table.rates.slice(1)){
  const r=rates(item);expect(confirmedStudioRates(r,r,'gemini_tts')).toEqual(r);
  expect(calculateMeteredUsageCharge({rates:r,units:{inputTokens:1,outputTokens:1}}).chargeCredits).toBe(5);
  const output=calculateMeteredUsageCharge({rates:r,units:{inputTokens:100,outputTokens:1000}});
  expect(output.chargeCredits).toBe(item.model_id.includes('flash')?24.12:48.24);
  expect(output.providerCost).toBeCloseTo(item.model_id.includes('flash')?.0603:.1206,6);
 }
});
