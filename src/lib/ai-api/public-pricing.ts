import 'server-only';
import {createHash} from 'node:crypto';
import type {AiPriceCard} from './operation-pricing';
export function publicAiPriceCard(card:AiPriceCard) {
  const rates=Object.entries(card).sort(([a],[b])=>a.localeCompare(b)).map(([meter,price])=>({meter,
    unit:meter==='song'?'song':meter==='audio_second'||/^video_(720p|1080p|4k)/.test(meter)?'second':meter==='search'||meter==='maps'?'call':meter.endsWith('cache_hour')?'token_hour':'token',
    credits_per_unit:price.credits}));
  return {version:createHash('sha256').update(JSON.stringify(rates)).digest('hex').slice(0,24),rates,
    minimum_credits_per_operation:1,rounding:'ceil_6_decimals',currency:'ConnectyHub credits'};
}
