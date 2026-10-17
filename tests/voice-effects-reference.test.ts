import {it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {parseVoiceInput,VoiceError,voiceBody} from '../src/lib/voice-api/contract';
import {parseStudioInput,studioInputUnits,parseVoiceSettings} from '../src/lib/voice-api/studio-contract';
import {requestVoiceAudio} from '../src/lib/voice-api/provider';
import {studioAudioProviderRequest} from '../src/lib/voice-api/audio-provider';
import type * as LongText from '../src/lib/voice-api/studio-long-tts';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Effects from '../src/lib/voice-api/speech-effects';
import type * as Editor from '../src/lib/voice-api/studio-editor';
import type {VoiceAuth} from '../src/lib/voice-api/auth';
const {longTextRequestBody}=serverModuleHarness<typeof LongText>('src/lib/voice-api/studio-long-tts.ts');
const effects={filter_preset_id:'phone',environment_id:'hall',send_level:.4,distance:.2,background_noise_id:'cafe',pan:-.2};
afterEach(()=>vi.unstubAllGlobals());
it('preserves effects and explicit quality in the script and provider body without changing character billing',async()=>{
 const input=parseVoiceInput({text:'Olá, mundo.',voice_id:'clone',audio_effects:effects,output_format:'mp3_44100_64'});
 expect(input.script.audio_effects).toEqual(effects);expect(input.script.output_format).toBe('mp3_44100_64');expect(input.text).toBe('Olá, mundo.');
 const fetch=vi.fn().mockResolvedValue(new Response('audio'));vi.stubGlobal('fetch',fetch);
 await requestVoiceAudio('synthetic',input);
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toContain('output_format=mp3_44100_64');expect(JSON.parse(fetch.mock.calls[0][1].body).audio_effects).toEqual(effects);
});
it('rejects unsafe effects, out-of-range controls and stereo/raw combinations before dispatch',()=>{
 for(const audio_effects of [{url:'https://other'},{filter_preset_id:'../x'},{distance:2},{pan:-2},{send_level:NaN},[]])expect(()=>parseVoiceInput({text:'Olá',voice_id:'v',audio_effects})).toThrow();
 for(const output_format of ['pcm_16000','ulaw_8000'])expect(()=>parseVoiceInput({text:'Olá',voice_id:'v',audio_effects:effects,output_format})).toThrow(/estéreo/);
 expect(parseVoiceInput({text:'Olá',voice_id:'v',audio_effects:{filter_preset_id:'phone'},output_format:'pcm_16000'}).audio_effects).toEqual({filter_preset_id:'phone'});
});
it('applies effects on each long part and rejects unsupported assembly formats or oversized 128kbps volumes',()=>{
 const input=parseStudioInput({operation:'long_tts',text:'Primeira. Segunda.',voice_id:'v',audio_effects:effects,output_format:'mp3_44100_128'});
 expect(input.script?.audio_effects).toEqual(effects);expect(longTextRequestBody(input,['Primeira.','Segunda.'],1).audio_effects).toEqual(effects);
 expect(()=>parseStudioInput({operation:'long_tts',text:'a'.repeat(120001),voice_id:'v',output_format:'mp3_44100_128'})).toThrow(/120.000/);
 expect(()=>parseStudioInput({operation:'long_tts',text:'Olá',voice_id:'v',output_format:'opus_48000_64'})).toThrow(/MP3/);
});
it('voice conversion sends the reference and compatible settings once, without enabling extra isolation or text effects',()=>{
 const input=parseStudioInput({operation:'voice_change',asset_id:'11111111-1111-4111-8111-111111111111',voice_id:'clone',voice_settings:{stability:.3,similarity_boost:.8},output_format:'mp3_22050_32'});
 expect(studioInputUnits(input,30)).toEqual({minutes:.5});
 const r=studioAudioProviderRequest({operation:'voice_change',audio:new Blob(['reference'],{type:'audio/wav'}),voiceId:input.voice_id!,voiceSettings:input.voice_settings,outputFormat:input.output_format});
 expect(r.url).toContain('output_format=mp3_22050_32');expect(r.body.get('remove_background_noise')).toBe('false');expect(JSON.parse(String(r.body.get('voice_settings')))).toEqual(input.voice_settings);
 for(const extra of [{audio_effects:effects},{voice_settings:{speed:1.2}},{output_format:'wav_44100'}])expect(()=>parseStudioInput({...input,...extra})).toThrow();
});
it('checks effect IDs against a bounded authenticated catalog and never generates audio to validate',async()=>{
 const fetch=vi.fn().mockResolvedValue(Response.json({filter_presets:[{filter_preset_id:'phone',name:'Phone'}],environments:[],background_noises:[]}));
 const m=serverModuleHarness<typeof Effects>('src/lib/voice-api/speech-effects.ts',{'./contract':{VoiceError,voiceBody},'@/lib/elevenlabs/credentials':{loadElevenLabsCredentials:async()=>({apiKey:'synthetic'})}},[],{fetch,TextDecoder});
 const auth={client:{}} as VoiceAuth;
 await m.validateSpeechEffects(auth,{filter_preset_id:'phone'});await expect(m.validateSpeechEffects(auth,{filter_preset_id:'missing'})).rejects.toMatchObject({code:'invalid_effect'});
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/audio-effects/catalog');expect(fetch.mock.calls[0][1].method).toBeUndefined();
});
it('restores output choices in drafts without rejecting temporarily unavailable catalogs',()=>{
 const m=serverModuleHarness<typeof Editor>('src/lib/voice-api/studio-editor.ts',{'./contract':{VoiceError,voiceBody,isVoiceFormat:(f:string)=>f==='mp3_44100_64'},'./studio-contract':{parseVoiceSettings}});
 const draft=m.parseDraft({text:'Olá',voice_id:'clone',model_id:'eleven_v3',audio_effects:effects,output_format:'mp3_44100_64'});
 expect(draft.audio_effects).toEqual(effects);expect(draft.output_format).toBe('mp3_44100_64');
});
