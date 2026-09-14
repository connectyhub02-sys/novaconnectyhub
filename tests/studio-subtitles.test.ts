import {expect,it} from 'vitest';
import {studioSubtitles} from '../src/lib/voice-api/studio-subtitles';
it('exports measured words into timed SRT and VTT cues without markup',()=>{
 const data={words:[{text:'Olá',start:0,end:.5},{text:'<mundo>',start:.6,end:1},{text:'Outra fala',start:3,end:4}]};
 expect(studioSubtitles(data,'srt')).toBe('1\n00:00:00,000 --> 00:00:01,000\nOlá mundo\n\n2\n00:00:03,000 --> 00:00:04,000\nOutra fala\n');
 expect(studioSubtitles(data,'vtt')).toContain('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000');
});
it('rejects missing, backwards, non-finite or out-of-bounds timing',()=>{
 for(const words of [[],[{text:'x',start:2,end:1}],[{text:'x',start:0,end:Infinity}],[{text:'x',start:0,end:1801}]])expect(()=>studioSubtitles({words},'srt')).toThrow();
});
