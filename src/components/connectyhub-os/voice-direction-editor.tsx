'use client';
import {useRef, type RefObject} from 'react';
import {directionMarkers,markerText,speechCapabilities} from '../../lib/voice-api/performance';

export function VoiceDirectionEditor({text,onChange,model,area,disabled,onPreview}: {
  text:string;onChange:(text:string)=>void;model:string;area:RefObject<HTMLTextAreaElement|null>;disabled:boolean;onPreview:()=>void;
}) {
  const undo=useRef<string[]>([]),redo=useRef<string[]>([]);
  const selection=useRef({start:0,end:0});
  const capability=speechCapabilities[model as keyof typeof speechCapabilities];
  function change(next:string){undo.current.push(text);if(undo.current.length>100)undo.current.shift();redo.current=[];onChange(next);}
  function insert(value:string){
    const start=area.current?.selectionStart??selection.current.start;
    // Preserve selected text: direction is inserted before it.
    change(text.slice(0,start)+value+' '+text.slice(start));
    requestAnimationFrame(()=>{area.current?.focus();area.current?.setSelectionRange(start+value.length+1,start+value.length+1);selection.current={start:start+value.length+1,end:start+value.length+1};});
  }
  function travel(back:boolean){const from=back?undo:redo,to=back?redo:undo;const value=from.current.pop();if(value===undefined)return;to.current.push(text);onChange(value);}
  const markers=[...text.matchAll(/⟦([^⟦⟧]+)⟧/g)];
  return <>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
      {(['Pausas','Emoções','Reações'] as const).map((label,index)=><label key={label} className="text-xs font-medium text-slate-600">
        <span className="sr-only">{label}</span><select aria-label={label} disabled={disabled||(index>0&&!capability?.emotions)} value="" className="min-h-9 max-w-44 rounded-lg border border-slate-200 bg-white px-2 disabled:opacity-50" onChange={e=>insert(e.target.value)}>
          <option value="" disabled>{label}</option>
          {directionMarkers.filter(m=>index===0?(capability?.timedPauses?m.kind==='timed':m.kind==='pause'):m.kind===(index===1?'emotion':'reaction')).map(m=><option key={m.label} value={markerText(m.label)}>{m.label}</option>)}
          {index===0&&<option value="...">Reticências · hesitação</option>}
        </select>
      </label>)}
      <button type="button" disabled={disabled} onClick={()=>travel(true)} className="min-h-9 px-2 text-xs text-slate-600">Desfazer</button>
      <button type="button" disabled={disabled} onClick={()=>travel(false)} className="min-h-9 px-2 text-xs text-slate-600">Refazer</button>
      <button type="button" disabled={disabled||!text.trim()} onClick={onPreview} className="ml-auto min-h-9 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-blue-700 disabled:opacity-50">Ouvir trecho</button>
    </div>
    <p className="px-5 pt-3 text-xs text-slate-500">Posicione o cursor para inserir. {capability?.emotions?'Emoções dependem da voz; pausas expressivas não têm duração exata.':'Pausas de até 3 s. Para emoções e estilos, escolha Voz Expressiva v3.'}</p>
    <textarea ref={area} aria-label="Texto para transformar em voz" disabled={disabled} value={text} maxLength={240000}
      onSelect={e=>{selection.current={start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd};}}
      onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();travel(e.key.toLowerCase()==='z'&&!e.shiftKey);}}}
      onChange={e=>change(e.target.value)} className="h-[clamp(16rem,36dvh,30rem)] min-h-48 w-full resize-y border-0 bg-transparent px-6 py-5 text-base leading-8 text-slate-900 placeholder:text-slate-400 focus:outline-none"
      placeholder="Digite ou cole seu roteiro. Use os botões para inserir pausas e interpretação no ponto desejado." />
    {!!markers.length&&<details className="border-t border-slate-100 px-5 py-2 text-xs"><summary className="cursor-pointer text-slate-600">Editar marcações ({markers.length})</summary>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto py-2">{markers.map((match,i)=><span key={`${match.index}-${i}`} className="flex items-center gap-1 rounded-lg bg-blue-50 p-1">
        <select aria-label={`Editar marcação ${i+1}`} value={match[1]} className="max-w-44 bg-transparent p-1" onChange={e=>change(text.slice(0,match.index)+markerText(e.target.value)+text.slice(match.index!+match[0].length))}>
          <option value={match[1]}>{match[1]}</option>{directionMarkers.filter(m=>m.label!==match[1]&&(m.kind==='timed'?capability?.timedPauses:capability?.emotions)).map(m=><option key={m.label}>{m.label}</option>)}
        </select><button type="button" aria-label={`Remover marcação ${i+1}`} className="p-2" onClick={()=>change(text.slice(0,match.index)+text.slice(match.index!+match[0].length))}>×</button>
      </span>)}</div>
    </details>}
  </>;
}
