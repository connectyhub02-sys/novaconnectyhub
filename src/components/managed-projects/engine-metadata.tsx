'use client';
import {useEffect,useState} from 'react';
import styles from './portal.module.css';
type Metadata={configured:boolean;app?:{name:string};functions?:{id:string;name:string}[];runs?:{id:string;functionId:string;status:string;queuedAt:string}[];truncated?:boolean};
export function EngineMetadata({projectId}:{projectId:string}){
 const [result,setResult]=useState<{projectId:string;data?:Metadata;error?:string}|null>(null);
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/managed-projects/${projectId}/engine`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error??'Motor indisponível.');if(!controller.signal.aborted)setResult({projectId,data});}).catch(()=>{if(!controller.signal.aborted)setResult({projectId,error:'Não foi possível consultar o motor deste projeto.'});});return()=>controller.abort();},[projectId]);
 if(result?.projectId!==projectId)return <p role="status">Consultando integração do motor...</p>;
 if(result.error)return <p role="status" className={styles.notice}>{result.error}</p>;
 if(!result.data?.configured)return <p className={styles.muted}>Este projeto ainda não tem um aplicativo exclusivo do Inngest vinculado. As execuções de diagnóstico abaixo pertencem ao piloto.</p>;
 const data=result.data;
 return <section><h2>Inngest · {data.app?.name}</h2><p>Metadados do aplicativo exclusivo deste projeto. Uma execução concluída não comprova, sozinha, a entrega ao cliente.</p><h3>Funções</h3><ul>{data.functions?.map(f=><li key={f.id}>{f.name}</li>)}</ul><h3>Execuções · últimas 24 horas</h3>{data.runs?.length?<div className={styles.tableWrap}><table><thead><tr><th>Execução</th><th>Função</th><th>Estado</th></tr></thead><tbody>{data.runs.map(r=><tr key={r.id}><td>{r.id}</td><td>{data.functions?.find(f=>f.id===r.functionId)?.name??r.functionId}</td><td>{r.status}</td></tr>)}</tbody></table></div>:<p>Nenhuma execução retornada nesta consulta.</p>}{data.truncated&&<p>Exibindo as 50 execuções mais recentes.</p>}</section>;
}
