'use client';
import {useEffect,useState} from 'react';
export function VoiceDictionarySelect({project,value,onChange,revision=0}:{project:string;value:string;onChange:(value:string)=>void;revision?:number}){
 const [items,setItems]=useState<Array<{id:string;name:string;kind:string}>>([]);
 useEffect(()=>{let active=true;fetch(`/api/dashboard/voice/resources?project=${encodeURIComponent(project)}`).then(async r=>r.ok?r.json():{resources:[]}).then(d=>{if(active)setItems(d.resources??[]);}).catch(()=>{});return()=>{active=false;};},[project,revision]);
 const dictionaries=items.filter(r=>r.kind==='dictionary');if(!dictionaries.length)return null;
 return <label className="mt-4 block text-sm">Dicionário de pronúncia (opcional)<select className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3" value={value} onChange={e=>onChange(e.target.value)}><option value="">Sem dicionário</option>{dictionaries.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><span className="mt-1 block text-xs text-slate-500">A compatibilidade dos fonemas depende do modelo e idioma; substituições por texto são mais abrangentes.</span></label>;
}
