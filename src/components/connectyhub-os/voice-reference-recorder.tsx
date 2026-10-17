'use client';
import {useEffect,useRef,useState} from 'react';
export function VoiceReferenceRecorder({file,onFile,disabled}:{file:File|null;onFile:(f:File|null)=>void;disabled:boolean}){
 const [recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState('');
 const audio=useRef<HTMLAudioElement>(null);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const callback=useRef(onFile);useEffect(()=>{callback.current=onFile;},[onFile]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{if(!file)return;const next=URL.createObjectURL(file);if(audio.current)audio.current.src=next;return()=>URL.revokeObjectURL(next);},[file]);
 async function start(){
  setError('');setStarting(true);
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Este navegador não permite gravar. Envie um arquivo de áudio.');
   const media=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=rec;let chunks:Blob[]=[];let size=0;let tooLarge=false;
   rec.ondataavailable=e=>{if(e.data.size){size+=e.data.size;if(size>20_000_000){tooLarge=true;chunks=[];if(rec.state==='recording')rec.stop();}else chunks.push(e.data);}};
   rec.onstop=()=>{media.getTracks().forEach(t=>t.stop());if(timer.current)clearTimeout(timer.current);if(!alive.current)return;setRecording(false);if(tooLarge){setError('Gravação acima de 20 MB. Grave um trecho menor.');return;}const type=rec.mimeType.split(';')[0];const blob=new Blob(chunks,{type});if(!blob.size){setError('Não foi possível capturar o áudio.');return;}callback.current(new File([blob],`interpretacao.${type==='audio/mp4'?'m4a':type==='audio/ogg'?'ogg':'webm'}`,{type}));};
   rec.onerror=()=>{if(alive.current)setError('Falha ao gravar. Confira o microfone e tente novamente.');if(rec.state==='recording')rec.stop();media.getTracks().forEach(t=>t.stop());};
   callback.current(null);rec.start(1000);setRecording(true);timer.current=setTimeout(()=>{if(rec.state==='recording')rec.stop();},300000);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());if(alive.current)setError((e as Error).name==='NotAllowedError'?'Permita o microfone ou envie um arquivo.':(e as Error).message);}
  finally{if(alive.current)setStarting(false);}
 }
 return <div className="space-y-3 rounded-xl border border-slate-200 p-4">
  <p className="text-sm">Grave a frase com o ritmo, as pausas e a emoção desejados. Depois escolha a voz que vai interpretar esse áudio.</p>
  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"><button type="button" className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm" disabled={disabled||starting} onClick={()=>recording?recorder.current?.stop():void start()}>{recording?'Parar gravação':starting?'Abrindo microfone…':'Gravar minha interpretação'}</button><label className="min-w-0 flex-1 text-sm">Ou enviar áudio<input aria-label="Áudio de referência" type="file" accept="audio/*" disabled={disabled||recording||starting} className="mt-2 w-full min-w-0" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>20_000_000){setError('Envie um áudio de até 20 MB.');return;}setError('');onFile(f??null);}}/></label></div>
  {recording&&<p role="status" className="text-sm text-red-700">Gravando… limite de 5 minutos. O áudio ainda está apenas neste dispositivo.</p>}
  {file&&<div><p className="break-all text-sm">{file.name}</p><audio controls ref={audio} className="mt-2 w-full"/><button type="button" disabled={disabled||recording} onClick={()=>onFile(null)} className="mt-2 text-xs text-blue-700 underline">Remover seleção</button></div>}
  {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
 </div>;
}
