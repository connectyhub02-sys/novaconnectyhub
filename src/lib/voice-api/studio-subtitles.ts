import {VoiceError} from './contract';
type Cue={text:string;start:number;end:number};
export function studioSubtitles(raw:unknown,format:'srt'|'vtt'){
 const source=raw as {words?:unknown[]};
 if(!source||!Array.isArray(source.words)||!source.words.length||source.words.length>30000)throw new VoiceError('subtitles_unavailable',422,'O resultado não contém palavras com tempos válidos.');
 const words:Cue[]=[];let previous=0;
 for(const item of source.words){
  const w=item as {text?:unknown;start?:unknown;end?:unknown;type?:unknown};
  if(w.type&&w.type!=='word')continue;
  if(typeof w.text!=='string'||typeof w.start!=='number'||typeof w.end!=='number'||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<previous||w.end<=w.start||w.end>1800)throw new VoiceError('subtitles_unavailable',422,'Tempos inválidos no resultado.');
  const text=w.text.replace(/[\r\n\x00-\x1f]/g,' ').replace(/[<>]/g,'').trim();
  if(text)words.push({text,start:w.start,end:w.end});previous=w.start;
 }
 if(!words.length)throw new VoiceError('subtitles_unavailable',422,'O resultado não contém fala alinhada.');
 const cues:Cue[]=[];
 for(const word of words){const last=cues.at(-1);
  if(last&&word.start>=last.end&&word.start-last.end<1&&word.end-last.start<=5&&last.text.length+word.text.length+1<=80){last.text+=' '+word.text;last.end=word.end;}
  else cues.push({...word});
 }
 const clock=(seconds:number)=>{const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${format==='vtt'?'.':','}${String(ms%1000).padStart(3,'0')}`;};
 return (format==='vtt'?'WEBVTT\n\n':'')+cues.map((c,i)=>`${i+1}\n${clock(c.start)} --> ${clock(c.end)}\n${c.text}\n`).join('\n');
}
