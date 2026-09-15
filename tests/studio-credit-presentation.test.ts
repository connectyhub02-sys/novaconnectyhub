import {afterEach,expect,it,vi} from 'vitest';
import {studioQuoteLabel,studioFormReady,scheduleStudioQuote} from '../src/lib/voice-api/studio-presentation';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('distinguishes a fractional generation ceiling from a thousand-credit balance',()=>{
 expect(studioQuoteLabel(393.9696,true)).toBe('Custo máximo deste áudio: até 394 créditos ConnectyHub');
 expect(studioQuoteLabel(393969.6,true)).toContain('393.970');
 expect(studioQuoteLabel(8.2944,false)).toBe('Custo desta operação: 8,29 créditos ConnectyHub');
});
it('waits for text, selected voice and the required audio fields',()=>{
 expect(studioFormReady(JSON.stringify({operation:'gemini_tts',text:'Olá',voice_id:''}))).toBe(false);
 expect(studioFormReady(JSON.stringify({operation:'gemini_tts',text:'Olá',voice_id:'gemini:kore'}))).toBe(true);
 expect(studioFormReady(JSON.stringify({operation:'dubbing',asset_id:'asset',target_language:''}))).toBe(false);
});
it('debounces quotes and ignores stale responses after a project or input change without generating',async()=>{
 vi.useFakeTimers();let resolveOld:(r:Response)=>void=()=>{};
 const fetch=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue(Response.json({credits:8.2944,reservation_only:false}));vi.stubGlobal('fetch',fetch);
 const quote=vi.fn(),error=vi.fn();
 const cancelBefore=scheduleStudioQuote('/quote?project=a','old',quote,error);cancelBefore();await vi.advanceTimersByTimeAsync(600);expect(fetch).not.toHaveBeenCalled();
 const cancelOld=scheduleStudioQuote('/quote?project=a','old',quote,error);await vi.advanceTimersByTimeAsync(600);cancelOld();
 scheduleStudioQuote('/quote?project=b','new',quote,error);await vi.advanceTimersByTimeAsync(600);
 resolveOld(Response.json({credits:393.9696,reservation_only:true}));await vi.advanceTimersByTimeAsync(1);
 expect(quote).toHaveBeenCalledTimes(1);expect(quote).toHaveBeenCalledWith({credits:8.2944,reservation_only:false});expect(error).not.toHaveBeenCalled();
 expect(fetch.mock.calls.map(c=>c[0])).toEqual(['/quote?project=a','/quote?project=b']);
});
it('keeps quote failures visible and rejects invalid amounts',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{message:'Tarifa indisponível'}},{status:503})));const quote=vi.fn(),error=vi.fn();
 scheduleStudioQuote('/quote','{}',quote,error);await vi.advanceTimersByTimeAsync(600);expect(error).toHaveBeenCalledWith('Tarifa indisponível');expect(quote).not.toHaveBeenCalled();
});
