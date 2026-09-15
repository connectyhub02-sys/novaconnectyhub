import Link from 'next/link';
import type {SourceConnection,SourceRow} from '@portal/lib/connected-source';

function Table({rows,columns}:{rows:SourceRow[];columns:[string,string][]}){
 if(!rows.length)return <p>Nenhum registro nesta consulta. Isso não comprova consumo zero fora do escopo informado.</p>;
 return <div style={{overflowX:'auto'}}><table><thead><tr>{columns.map(([k,v])=><th key={k}>{v}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={String(r.id??i)}>{columns.map(([k])=><td key={k}>{r[k]===null||r[k]===undefined?'Não informado':String(r[k])}</td>)}</tr>)}</tbody></table></div>;
}
export function BetelProject({connection,path}:{connection:SourceConnection;path:string[]}){
 const s=connection.snapshot,base=`/infraestrutura/projetos/${connection.project_id}`,tab=path[2]==='automacoes'?'automacoes':path[3]??'overview';
 const preparing=connection.migration_state!=='operational';
 const stale=!connection.collected_at||Date.now()-Date.parse(connection.collected_at)>180000;
 return <main className="portal-shell" style={{maxWidth:1440}}>
  <nav><Link href="/infraestrutura">Projetos</Link><Link href="/clientes">Clientes</Link><Link href="/infraestrutura/vps">Infraestrutura global</Link></nav>
  <section className="portal-card"><span className="portal-badge">{preparing?'EM PREPARAÇÃO':'PROJETO CONECTADO'} · CONSULTA EM LEITURA</span><h1>Betel Leilões</h1>
   <p>Empresa vinculada: {connection.source_name}. Os acessos administrativos deste portal permanecem separados das contas da aplicação Betel.</p>
   {preparing&&<p role="status">A migração definitiva ainda não foi concluída. O banco exibido é a cópia de preparação na VPS; a coleta não comprova a troca da produção nem o funcionamento dos 12 fluxos.</p>}
   <p>Última coleta: {connection.collected_at?new Date(connection.collected_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Pendente'}.</p>
   {(stale||connection.collection_status!=='ok')&&<p role="alert">A coleta está pendente, desatualizada ou falhou. Os números anteriores não comprovam o estado atual.</p>}
  </section>
  <nav><Link href={`${base}/banco`}>Visão geral</Link><Link href={`${base}/banco/tabelas`}>Banco</Link><Link href={`${base}/banco/arquivos`}>Arquivos</Link><Link href={`${base}/banco/consumo`}>Consumo e créditos</Link><Link href={`${base}/automacoes`}>Automações</Link></nav>
  {!s?<section className="portal-card"><h2>Coleta pendente</h2><p>Não há dados verificados para apresentar.</p></section>:<section className="portal-card">
   {tab==='tabelas'?<><h2>Estrutura do banco {preparing?'em preparação':'conectado'}</h2><p>{s.database.table_count} tabelas. Tamanho total: {Number(s.database.bytes).toLocaleString('pt-BR')} bytes. Linhas estimadas são estatísticas; não há conteúdo privado das tabelas ou editor SQL nesta consulta.</p><Table rows={s.database.tables} columns={[["schema","Esquema"],["name","Tabela"],["estimated_rows","Linhas estimadas"],["bytes","Bytes com índices"]]}/></>
   :tab==='consumo'?<><h2>Consumo da Betel na ConnectyHub</h2><p>Últimos 30 dias, somente eventos atribuídos à organização Betel. Valores registrados na ConnectyHub; não são faturas conciliadas dos fornecedores. Não incluem chamadas diretas feitas fora da ConnectyHub, Contabo ou Vercel. Créditos e custos em moeda têm unidades diferentes.</p><Table rows={s.consumption} columns={[["currency","Moeda"],["billing_mode","Modo"],["status","Estado"],["events","Eventos"],["recorded_provider_cost","Custo registrado"],["missing_cost_events","Sem custo informado"],["recorded_credits","Créditos registrados"],["input_tokens","Tokens entrada"],["output_tokens","Tokens saída"]]}/><h3>Carteira própria da Betel</h3>{s.wallet?<Table rows={[s.wallet]} columns={[["balance_credits","Saldo em créditos"],["reserved_credits","Reservado"],["updated_at","Atualizado na origem"]]}/>:<p>Carteira não encontrada nesta coleta; não inferimos saldo zero.</p>}</>
   :tab==='automacoes'?<><h2>Automações registradas · execução retida</h2><p>As funções estão registradas no Inngest da VPS. O broker e os handlers continuam pausados para impedir a retomada de tarefas antigas sem conciliação. Registro não comprova funcionamento comercial dos 12 fluxos.</p>{s.inngest?.status==='ok'?<><p>{s.inngest.function_count} funções; consulta do aplicativo Betel, sem dados de outras empresas. Chamadas agendadas podem aparecer recusadas enquanto a execução está retida.</p><Table rows={s.inngest.functions??[]} columns={[["name","Função"],["triggers","Gatilhos registrados"]]}/></>:<p>A coleta do Inngest está pendente ou falhou.</p>}</>
   :tab==='arquivos'?<><h2>Arquivos da Betel</h2><p>O armazenamento produtivo R2 continua separado. O inventário e a cópia de migração não ativam downloads pelo portal. Acesso aos objetos e contabilização ainda não estão conectados nesta tela.</p></>
   :<><h2>Projeto e destinos</h2><p>{preparing?'Aplicação e banco em preparação na VPS; a troca da origem ainda não está concluída.':'Aplicação, banco e autenticação na VPS. A origem antiga permanece preservada para recuperação; as automações continuam retidas.'}</p><p>Aplicação: betel.connectyhub.com.br. API do banco: betel-supabase.connectyhub.com.br.</p><p>{s.database.table_count} tabelas inventariadas; {s.counts.usage_events_30d} eventos de consumo da Betel registrados na ConnectyHub nos últimos 30 dias.</p><h3>Projetos de API da Betel</h3><Table rows={s.resources} columns={[["name","Projeto"],["kind","API"],["status","Estado"]]}/><p>Identidade e consumo são consultados na fonte; nenhuma chave, cobrança ou permissão de cliente é criada por essa coleta.</p></>}
  </section>}
 </main>;
}
