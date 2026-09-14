import {it,expect} from 'vitest';
import {parseVoiceInput,voiceIdempotency} from '../src/lib/voice-api/contract';
it('keeps explicit voice/model/settings and rejects unapproved ownership fields',()=>{
 const v=parseVoiceInput({text:' Olá   mundo ',voice_id:'private_123',model_id:'eleven_multilingual_v2',voice_settings:{stability:.45,similarity_boost:.8,style:.2,use_speaker_boost:true}});
 expect(v.text).toBe('Olá mundo');expect(v.voice_settings.stability).toBe(.45);
 for(const extra of [{organizationId:'other'},{publicOwnerId:'other'},{output_format:'pcm_44100'}]) expect(()=>parseVoiceInput({text:'ok',voice_id:'id',...extra})).toThrow('Parâmetro');
 expect(()=>parseVoiceInput({text:'a'.repeat(4801),voice_id:'id'})).toThrow('4800');
 expect(()=>parseVoiceInput({text:'ok',voice_id:'../../',voice_settings:{style:NaN}})).toThrow();
});
it('requires explicit safe idempotency keys',()=>{
 expect(()=>voiceIdempotency(new Request('https://example.com'))).toThrow('Idempotency');
 expect(voiceIdempotency(new Request('https://example.com',{headers:{'Idempotency-Key':'client-order-123'}}))).toBe('client-order-123');
});
