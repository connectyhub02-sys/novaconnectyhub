vi.mock('server-only',()=>({}));
import {describe,it,expect,vi} from 'vitest';
import {prepareSpeech,previewExcerpt,splitSpeechText,defaultPerformance} from '../src/lib/voice-api/performance';
import {parseVoiceInput} from '../src/lib/voice-api/contract';
import {parseStudioInput,studioInputUnits} from '../src/lib/voice-api/studio-contract';
import {studioHistoryJobs} from '../src/lib/voice-api/studio-history';

describe('speech direction contract',()=>{
  it('compiles Portuguese pause markers without changing the script or paragraphs',()=>{
    const input=parseVoiceInput({voice_id:'andre',text:'Primeiro. ⟦Pausa · 2 s⟧\n\nSegundo.'});
    expect(input.text).toBe('Primeiro. <break time="2s" />\n\nSegundo.');
    expect(input.script.text).toContain('⟦Pausa · 2 s⟧');
  });
  it('rejects timed breaks on v3, including direct API and pasted SSML',()=>{
    for(const text of ['Olá ⟦Pausa · 1 s⟧','Olá <break time="1s" />'])expect(()=>parseVoiceInput({voice_id:'v',model_id:'eleven_v3',text})).toThrow('pausas expressivas');
    expect(()=>parseVoiceInput({voice_id:'v',text:'Olá <break time="4s" />'})).toThrow('3 segundos');
    expect(()=>parseVoiceInput({voice_id:'v',text:'Olá <break time="1s"'})).toThrow('incompleta');
  });
  it('rejects emotions on the wrong model and incomplete markers',()=>{
    expect(()=>prepareSpeech('Olá ⟦Rir⟧','eleven_flash_v2_5')).toThrow('colchetes');
    expect(()=>prepareSpeech('Olá ⟦Rir','eleven_v3')).toThrow('incompleta');
    expect(()=>prepareSpeech('⟦Rir⟧','eleven_v3')).toThrow('trecho de fala');
  });
  it('preserves cloned identity and configures a deterministic performance preset',()=>{
    const result=parseVoiceInput({voice_id:'andre_clone',model_id:'eleven_v3',text:'Uma história.',performance:{style:'story',intensity:'strong',preview:false}});
    expect(result.voice_id).toBe('andre_clone');expect(result.text).toBe('[storytelling] Uma história.');
    expect(result.voice_settings.stability).toBe(0);expect(result.voice_settings).not.toHaveProperty('use_speaker_boost');
    expect(result.script.performance.style).toBe('story');
    expect(()=>parseVoiceInput({voice_id:'v',text:'Olá',performance:{style:'story',intensity:'strong',preview:false}})).toThrow('Voz Expressiva');
  });
  it('validates preview length server-side and does not offer a free-generation path',()=>{
    const input=parseVoiceInput({voice_id:'v',text:'Ouvir.',performance:{...defaultPerformance,preview:true}});
    expect(input.script.performance.preview).toBe(true);expect(input.text.length).toBe(6);
    expect(()=>parseVoiceInput({voice_id:'v',text:'a'.repeat(601),performance:{...defaultPerformance,preview:true}})).toThrow('600');
  });
  it('preserves paragraph punctuation and rejects unknown performance properties',()=>{
    expect(prepareSpeech('A...\n\nB!','eleven_v3').text).toBe('A...\n\nB!');
    expect(()=>prepareSpeech('Olá','eleven_v3',{}, {...defaultPerformance,free:true})).toThrow('inválida');
  });
});
describe('preview and audiobook boundaries',()=>{
  it('previews a selection without destroying the original script',()=>{
    const source='Antes. Este trecho. Depois.';
    expect(previewExcerpt(source,7,19)).toBe('Este trecho.');expect(source).toContain('Depois.');
    expect(()=>previewExcerpt('a'.repeat(700),0,700)).toThrow('600');
  });
  it('does not cut an editor marker or an SSML tag in a preview',()=>{
    const source='a '.repeat(290)+'⟦Pausa · 2 s⟧ Depois';
    const excerpt=previewExcerpt(source,0,0,585);expect(excerpt).not.toContain('⟦');
    expect(()=>previewExcerpt('Oi ⟦Pausa · 2 s⟧ fim',5,18)).toThrow('inteira');
  });
  it('keeps decimal breaks and reaction tags atomic across long-text chunks',()=>{
    const text=('Um texto longo <break time="1.5s" /> e uma frase. ').repeat(50);
    const parts=splitSpeechText(text,100);
    expect(parts.every(p=>p.length<=100)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g,' ').trim()).toBe(text.trim());
    expect(parts.flatMap(p=>p.match(/<break time="1.5s" \/>/g)??[])).toHaveLength(50);
  });
  it('repeats a global style per part and quotes exactly those provider inputs',()=>{
    const input=parseStudioInput({operation:'long_tts',model_id:'eleven_v3',voice_id:'andre',text:'Uma frase completa. '.repeat(500),performance:{style:'cinematic',intensity:'balanced',preview:false}});
    const parts=splitSpeechText(input.text!,2400,'[dramatic]');
    expect(parts.length).toBeGreaterThan(2);expect(parts.every(p=>p.startsWith('[dramatic] '))).toBe(true);
    expect(studioInputUnits(input).characters).toBe(parts.reduce((n,p)=>n+p.length,0));
    expect(input.script?.text).not.toContain('[dramatic]');
  });
  it('restores complete new scripts while leaving legacy audio playable without invented text',()=>{
    const script=parseVoiceInput({text:'Oi ⟦Pausa · 1 s⟧',voice_id:'andre'}).script;
    const jobs=studioHistoryJobs('project',[{id:'new',operation:'text_to_speech',status:'completed',model_id:script.model_id,created_at:new Date().toISOString(),usage:{credits:1,reserved_credits:0},audio:{},script},{id:'old',operation:'text_to_speech',status:'completed',model_id:'eleven_v3',created_at:new Date().toISOString(),usage:{credits:1,reserved_credits:0},audio:{}}]);
    expect(jobs[0].script).toEqual(script);expect(jobs[0].text).toBe(script.text);expect(jobs[1].script).toBeUndefined();expect(jobs[1].audioUrl).toContain('/audio?project=project');
  });
});

