import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {serverModuleHarness} from './helpers/server-module-harness';
const {publicAiPriceCard}=serverModuleHarness<typeof import('../src/lib/ai-api/public-pricing')>('src/lib/ai-api/public-pricing.ts',{'node:crypto':{createHash}});
describe('Integrator price contract',()=>{
  it('versions the charged rates independently of private cost or ordering',()=>{
    const a=publicAiPriceCard({output:{id:'1',cost:1,credits:2},input:{id:'2',cost:3,credits:4}});
    const b=publicAiPriceCard({input:{id:'other',cost:99,credits:4},output:{id:'1',cost:100,credits:2}});
    expect(a.version).toBe(b.version);expect(JSON.stringify(a)).not.toMatch(/cost|rate_id|provider/);
    expect(publicAiPriceCard({output:{id:'1',cost:1,credits:3},input:{id:'2',cost:3,credits:4}}).version).not.toBe(a.version);
    expect(a).toMatchObject({minimum_credits_per_operation:1,rounding:'ceil_6_decimals'});
  });
});
