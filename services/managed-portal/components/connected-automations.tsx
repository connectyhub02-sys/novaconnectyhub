import type {SourceSnapshot,SourceRow} from '@portal/lib/connected-source';
const time=(v:unknown)=>v?new Date(String(v)).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
function Runs({rows}:{rows:SourceRow[]}){return rows.length?<div style={{overflowX:'auto'}}><table><thead><tr><th>Função</th><th>Execução</th><th>Estado no Inngest</th><th>Agendada</th><th>Finalizada</th></tr></thead><tbody>{rows.map(r=><tr key={String(r.id)}><td>{r.name}</td><td>{r.id}</td><td>{r.status}</td><td>{time(r.queued_at)}</td><td>{time(r.ended_at)}</td></tr>)}</tbody></table></div>:<p>Nenhuma execução encontrada neste recorte.</p>;}
export function ConnectedAutomations({engine}:{engine:SourceSnapshot['inngest']}){
 const stale=!engine?.collected_at||Date.now()-Date.parse(engine.collected_at)>180000;
 return <section className="portal-card"><h2>Execuções reais do Inngest</h2><p>Fonte: Inngest existente na VPS · aplicativo connectyhub · visão administrativa global desse aplicativo. Os handlers continuam na Vercel. Última consulta: {time(engine?.collected_at)}.</p>
 {(stale||engine?.status!=='ok')&&<p role="alert" className="portal-alert">A consulta ao Inngest está pendente, falhou ou está desatualizada. Resultados anteriores não comprovam o estado atual.</p>}
 <p>Consultamos funções e execuções reais, sem registrar, cancelar ou repetir tarefas. COMPLETED indica encerramento técnico; pode incluir fila vazia ou falha tratada pela aplicação e não comprova entrega ou cobrança.</p>
 <h3>Execuções recentes · últimas 24 horas</h3><p>Até 100 mais recentes. {engine?.has_more_runs?'Há mais execuções no período; esta lista é uma amostra.':'Não há indicação de página adicional na última consulta.'}</p><Runs rows={engine?.runs??[]}/>
 <h3>Falhas técnicas · últimas 24 horas</h3><p>Até 20. {engine?.has_more_failures?'Há outras falhas fora desta amostra.':''}</p><Runs rows={engine?.failures??[]}/>
 <details><summary>Funções e gatilhos registrados ({engine?.function_count??'não informado'})</summary><div style={{overflowX:'auto'}}><table><thead><tr><th>Função</th><th>Gatilhos</th></tr></thead><tbody>{engine?.functions?.map(f=><tr key={String(f.id)}><td>{f.name}</td><td>{f.triggers}</td></tr>)}</tbody></table></div></details>
 <p><a href="https://inngest.connectyhub.com.br" target="_blank" rel="noreferrer">Abrir painel próprio do Inngest</a> para diagnóstico detalhado com seu acesso administrativo.</p></section>;
}
