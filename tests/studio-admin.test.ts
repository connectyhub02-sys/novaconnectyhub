import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
const rateSource=vi.hoisted(()=>({resolve:vi.fn()}));
vi.mock('../src/lib/billing/metered-usage',async importOriginal=>({...await importOriginal<object>(),resolveActiveBillingRates:rateSource.resolve}));
import {updateStudioCapability} from '../src/lib/voice-api/studio-admin';
import {voiceHash} from '../src/lib/voice-api/auth';
const rates=[{id:'rate-1',unit:'minute',providerCostPerUnit:.022,connectyPricePerUnit:8.8,minimumChargeCredits:5}];
function fixture(model=true){
 const update=vi.fn();
 const chain=(data:unknown)=>{const q={select:vi.fn(),eq:vi.fn(),update,maybeSingle:vi.fn(async()=>({data,error:null})),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);update.mockReturnValue(q);return q;};
 const cap=chain({operation:'transcription'}),modelQ=chain(model?{id:'model'}:null);update.mockReturnValue(cap);
 const from=vi.fn((name:string)=>name==='studio_capabilities'?cap:modelQ);
 return {client:{from} as unknown as SupabaseClient,update,from};
}
const body=()=>({operation:'transcription',model_id:'scribe_v2',enabled:true,cost_evidence:'Tabela contratada conferida pelo administrador.',rate_hash:voiceHash(JSON.stringify(rates))});
beforeEach(()=>{vi.clearAllMocks();rateSource.resolve.mockResolvedValue(rates);});
it('does not enable a capability with stale prices, no cost evidence or disabled model',async()=>{
 const {client,update}=fixture();
 await expect(updateStudioCapability(client,{...body(),rate_hash:'stale'},'admin')).rejects.toMatchObject({code:'pricing_changed'});
 await expect(updateStudioCapability(client,{...body(),cost_evidence:''},'admin')).rejects.toMatchObject({code:'cost_evidence_required'});
 await expect(updateStudioCapability(fixture(false).client,body(),'admin')).rejects.toMatchObject({code:'model_unavailable'});
 expect(update).not.toHaveBeenCalled();
});
it('saves the confirmed snapshot and actor without editing tariffs',async()=>{
 const {client,update,from}=fixture();
 await expect(updateStudioCapability(client,body(),'admin')).resolves.toEqual({ok:true});
 expect(update).toHaveBeenCalledWith(expect.objectContaining({enabled:true,updated_by:'admin',confirmed_rates:rates,cost_evidence:body().cost_evidence}));
 expect(from.mock.calls.every(([name])=>['studio_capabilities','provider_models'].includes(name))).toBe(true);
});
it('allows immediate disable without a cost lookup and rejects price injection',async()=>{
 const {client,update}=fixture();
 await updateStudioCapability(client,{operation:'transcription',model_id:'scribe_v2',enabled:false},'admin');
 expect(rateSource.resolve).not.toHaveBeenCalled();expect(update).toHaveBeenCalledWith(expect.objectContaining({enabled:false}));
 await expect(updateStudioCapability(client,{...body(),price:0},'admin')).rejects.toMatchObject({code:'invalid_input'});
});
