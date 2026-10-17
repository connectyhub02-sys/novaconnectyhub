'use client';
import {useEffect,useRef,useState} from 'react';
import type {SpeechScript} from '../../lib/voice-api/performance';

// JSONB does not preserve key order; opening a saved draft must not count as an edit.
const snapshotOf=(script:SpeechScript)=>JSON.stringify(script,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);

export function useVoiceDraft(project:string,script:SpeechScript,restore:(script:SpeechScript)=>void){
  const [ready,setReady]=useState(false),[status,setStatus]=useState('Recuperando rascunho…');
  const [savedSnapshot,setSavedSnapshot]=useState('');
  const version=useRef(0),saved=useRef(''),restoreRef=useRef(restore),scriptRef=useRef(script),failed=useRef(false);
  const queue=useRef(Promise.resolve());
  const hydrated=useRef(false);
  useEffect(()=>{restoreRef.current=restore;scriptRef.current=script;});
  useEffect(()=>{
    let active=true;
    fetch(`/api/dashboard/voice/draft?project=${encodeURIComponent(project)}`,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{
      if(!active)return;
      version.current=data.draft?.version??0;
      if(data.draft?.script){saved.current=snapshotOf(data.draft.script);restoreRef.current(data.draft.script);}
      else saved.current=snapshotOf(scriptRef.current);
      setSavedSnapshot(saved.current);
      hydrated.current=true;
      setStatus(data.draft?'Rascunho recuperado':'Rascunho vazio');setReady(true);
    }).catch(()=>{if(active){failed.current=true;setStatus('Não foi possível recuperar o rascunho. Recarregue antes de editar para evitar sobrescrever.');}});
    return()=>{active=false;};
  },[project]);
  const serialized=snapshotOf(script);
  useEffect(()=>{
    if(!ready||failed.current||serialized===saved.current)return;
    let active=true;
    const timer=window.setTimeout(()=>{
      setStatus('Salvando rascunho…');
      queue.current=queue.current.then(async()=>{
        if(!active||failed.current)return;
        try{
          const response=await fetch(`/api/dashboard/voice/draft?project=${encodeURIComponent(project)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:version.current,script:JSON.parse(serialized)})});
          const data=await response.json();
          if(!response.ok){if(response.status===409)failed.current=true;throw new Error(data.error?.message??'Falha ao salvar rascunho.');}
          version.current=data.version;saved.current=serialized;
          if(active){setSavedSnapshot(serialized);setStatus('Rascunho salvo');}
        }catch(e){if(active)setStatus((e as Error).message+' Edite para tentar novamente; mantenha uma cópia do texto.');}
      });
    },600);
    return()=>{active=false;window.clearTimeout(timer);};
  },[project,ready,serialized]);
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(ready&&serialized!==saved.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[ready,serialized]);
  // Project/navigation changes can unmount before the debounce expires.
  useEffect(()=>()=>{
    if(!hydrated.current||failed.current)return;
    const snapshot=snapshotOf(scriptRef.current);
    queue.current=queue.current.then(async()=>{
      if(snapshot===saved.current||failed.current)return;
      try{
        const body=JSON.stringify({version:version.current,script:JSON.parse(snapshot)});
        const response=await fetch(`/api/dashboard/voice/draft?project=${encodeURIComponent(project)}`,{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:new TextEncoder().encode(body).length<60000});
        if(response.ok){const data=await response.json();version.current=data.version;saved.current=snapshot;}
      }catch{/* The beforeunload warning protects unsaved document navigation. */}
    });
  },[project]);
  return {ready,status,dirty:ready&&serialized!==savedSnapshot};
}
