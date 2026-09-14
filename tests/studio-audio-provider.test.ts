import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {requestStudioAudio,readStudioAudioResult,studioAudioProviderRequest} from '../src/lib/voice-api/audio-provider';
const audio = () => new Blob(['synthetic audio'],{type:'audio/wav'});
afterEach(()=>vi.unstubAllGlobals());
it('constructs transcription without remote URLs, callbacks or public credentials',()=>{
  const r=studioAudioProviderRequest({operation:'transcription',audio:audio(),language:'pt',diarize:true});
  expect(r.url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
  expect(r.body.get('file')).toBeInstanceOf(Blob);
  expect(r.body.get('model_id')).toBe('scribe_v2');
  expect(r.body.get('diarize')).toBe('true');
  expect(r.body.has('cloud_storage_url')).toBe(false);
  expect(r.body.has('webhook')).toBe(false);
});
it('keeps voice change separate from an extra isolation operation',()=>{
  const r=studioAudioProviderRequest({operation:'voice_change',audio:audio(),voiceId:'private_voice'});
  expect(r.body.get('model_id')).toBe('eleven_multilingual_sts_v2');
  expect(r.body.get('remove_background_noise')).toBe('false');
  expect(r.url).toContain('/private_voice?output_format=mp3_44100_128');
  expect(()=>studioAudioProviderRequest({operation:'voice_change',audio:audio(),voiceId:'../../other?x=1'})).toThrow();
});
it('does not normalize away text used for alignment',()=>{
  const text='Olá,\n  mundo!';
  const r=studioAudioProviderRequest({operation:'forced_alignment',audio:audio(),text});
  expect(r.body.get('text')).toBe(text);
  expect(r.url).toBe('https://api.elevenlabs.io/v1/forced-alignment');
});
it('rejects oversized or non-audio input before dispatch',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  for(const file of [new Blob([],{type:'audio/wav'}),new Blob(['x'],{type:'text/html'}),new Blob([new Uint8Array(20_000_001)],{type:'audio/wav'})]) {
    await expect(requestStudioAudio('synthetic',{operation:'audio_isolation',audio:file})).rejects.toThrow();
  }
  expect(fetch).not.toHaveBeenCalled();
});
it('does not retry after an uncertain provider result',async()=>{
  const fetch=vi.fn().mockRejectedValue(new Error('timeout'));vi.stubGlobal('fetch',fetch);
  await expect(requestStudioAudio('synthetic',{operation:'audio_isolation',audio:audio()})).rejects.toThrow('timeout');
  expect(fetch).toHaveBeenCalledTimes(1);
  const init=fetch.mock.calls[0][1];
  expect(init.redirect).toBe('error');
  expect(init.headers['Content-Type']).toBeUndefined();
});
it('accepts private JSON/audio results and rejects HTML or unbounded JSON',async()=>{
  expect((await readStudioAudioResult(Response.json({text:'test'}),false)).contentType).toBe('application/json');
  expect((await readStudioAudioResult(new Response('audio',{headers:{'content-type':'audio/mpeg'}}),true)).bytes.toString()).toBe('audio');
  await expect(readStudioAudioResult(new Response('<html>',{headers:{'content-type':'text/html'}}),false)).rejects.toThrow();
  await expect(readStudioAudioResult(new Response(new Uint8Array(4_000_001),{headers:{'content-type':'application/json'}}),false)).rejects.toThrow('limite');
});
