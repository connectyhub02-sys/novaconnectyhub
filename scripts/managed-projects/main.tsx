/* Standalone Vite pilot, not a Next router. */
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ManagedPortal,type PortalProps} from '../../src/components/managed-projects/portal';
async function main(){const r=await fetch('/__pilot/state?path='+encodeURIComponent(location.pathname));const props=await r.json();createRoot(document.getElementById('root')!).render(<><div style={{padding:8,background:'#26372c',color:'white',font:'12px Arial'}}><strong>Piloto fictício: </strong><select aria-label="Identidade do piloto" defaultValue={props.identity??'admin'} onChange={e=>{document.cookie=`pilot_identity=${e.target.value}; Path=/; SameSite=Strict`;location.href='/infraestrutura';}}>{['admin','produto','connectyhub','betel','leitura'].map(id=><option key={id}>{id}</option>)}</select> · banco em memória, apagado ao encerrar o processo</div>{r.ok?<ManagedPortal {...props as PortalProps} pilot/>:<main style={{padding:40,color:'white'}}><h1>Acesso não permitido</h1><p>{props.error}</p><a href="/infraestrutura">Voltar aos projetos</a></main>}</>);}
void main();
