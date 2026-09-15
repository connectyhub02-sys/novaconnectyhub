import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
type Row=Record<string, unknown>;
export type AuditUnit={unit:string; quantity:number; costPerThousand:number|null; rateId:string|null; sourceRateId:string|null};
export type AuditOperation={id:string; at:string; organization:string; organizationId:string; provider:string; model:string; feature:string; source:string; agent:string|null; project:string|null; status:string; cost:number|null; costBasis:string; debit:number; refund:number; reserved:number; released:number; nominalRevenue:number; margin:number|null; units:AuditUnit[]; fx:number|null; pending:boolean; ledgerLinked:boolean};
export type OperationAudit={at:string; days:number; rows:AuditOperation[]; warnings:string[]; truncated:boolean; creditPackRange:{min:number;max:number}|null};
const record=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const array=(v:unknown):Row[]=>Array.isArray(v)?v.map(record):[];
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const str=(v:unknown)=>typeof v==='string'?v:'';
const round=(v:number)=>Math.round(v*1e8)/1e8;

// Never expose raw metadata, prompts, credentials, object paths or provider responses to the UI.
export function projectAuditOperation(u:Row, voice:Row|undefined, transactions:Row[], names:Map<string,string>, projectNames:Map<string,string>):AuditOperation {
 const m=record(u.metadata),meter=record(m.metering),units=record(m.units);
 const snapshot=array(m.rate_snapshot??meter.matchedRates??voice?.rate_snapshot);
 const unitValues:Record<string,number>={input_token:n(u.input_tokens),output_token:n(u.output_tokens),character:n(units.characters??m.characters??voice?.characters),minute:n(units.minutes),request:n(units.requests),message:n(units.messages),media:n(units.media),megabyte:n(units.megabytes)};
 const projected=snapshot.map(r=>({unit:str(r.unit),quantity:n(r.units??unitValues[str(r.unit)]),costPerThousand:r.providerCostPerUnit==null?null:n(r.providerCostPerUnit)*1000,rateId:str(r.id)||null,sourceRateId:str(r.providerCostSourceRateId)||null}));
 if(!projected.length)for(const b of array(meter.breakdown)){const key=str(b.meter);projected.push({unit:key==='input'?'input_token':key==='output'?'output_token':key,quantity:n(b.units),costPerThousand:n(b.units)>0&&b.cost!=null?n(b.cost)/n(b.units)*1000:null,rateId:str(b.rate_id)||null,sourceRateId:null});}
 if(!projected.length){if(n(u.input_tokens))projected.push({unit:'input_token',quantity:n(u.input_tokens),costPerThousand:null,rateId:null,sourceRateId:null});if(n(u.output_tokens))projected.push({unit:'output_token',quantity:n(u.output_tokens),costPerThousand:null,rateId:null,sourceRateId:null});}
 const debit=transactions.filter(t=>t.transaction_type==='debit').reduce((s,t)=>s+Math.abs(n(t.amount_credits)),0);
 const refund=transactions.filter(t=>t.transaction_type==='refund').reduce((s,t)=>s+Math.abs(n(t.amount_credits)),0);
 const pending=Boolean(u.pending_receipt),cost=pending?null:(u.provider_cost==null?null:n(u.provider_cost));
 const revenue=round((debit-refund)*.01),org=str(m.organization_id??u.organization_id),project=str(m.project_id??voice?.project_id);
 return {id:str(u.id),at:str(u.occurred_at??u.created_at),organization:names.get(org)??org,organizationId:org,provider:str(u.provider),model:str(u.model_id)||'Não informado',feature:str(m.operation??u.feature_code)||'Não informado',source:m.source==='voice_studio'?'Estúdio/API':m.source==='voice_api'?'Voz API':m.source==='external_ai'?'API IA':u.agent_id?'Agente':str(m.source)||'Outros',agent:str(u.agent_id)||null,project:projectNames.get(project)??(project||null),status:str(u.status),cost,costBasis:pending?'Custo final pendente':cost===null?'Custo não registrado':cost===0&&projected.some(x=>x.quantity>0)?'Zero registrado: conferir tarifa':'Estimativa histórica registrada',debit,refund,reserved:n(voice?.reserved_credits),released:voice?Math.max(0,n(voice.quoted_credits)-n(voice.charged_credits)-n(voice.reserved_credits)):0,nominalRevenue:revenue,margin:cost===null?null:round(revenue-cost),units:projected,fx:n(m.usd_brl??record(m.pricing).usd_brl??snapshot.find(r=>r.costFxUsdBrl)?.costFxUsdBrl)||null,pending,ledgerLinked:transactions.length>0};
}

/** Called only after the existing admin page authorization. Bounded, explicitly labelled window. */
export async function getOperationAudit(client:SupabaseClient,days=1):Promise<OperationAudit>{
 const result:OperationAudit={at:new Date().toISOString(),days,rows:[],warnings:[],truncated:false,creditPackRange:null};
 const since=new Date(Date.now()-days*86400000).toISOString(),events:Row[]=[];
 try {
  for(let offset=0;offset<2000;offset+=500){const r=await client.from('usage_events').select('id,organization_id,provider,feature_code,model_id,agent_id,status,input_tokens,output_tokens,provider_cost,connecty_charge_credits,billing_mode,metadata,occurred_at').gte('occurred_at',since).in('provider',['gemini','elevenlabs']).order('occurred_at',{ascending:false}).order('id').range(offset,offset+499);if(r.error)throw Error('Falha ao ler consumo.');events.push(...r.data);if(r.data.length<500)break;if(offset===1500)result.truncated=true;}
 const voiceFields='id,project_id,organization_id,model_id,operation,status,characters,reserved_credits,quoted_credits,charged_credits,rate_snapshot,usage_event_id,created_at';
 const aiFields='id,project_id,organization_id,model_id,status,reserved_credits,charged_credits,rate_snapshot,usage_event_id,created_at';
  const voices:Row[]=[],tx:Row[]=[];
  for(let i=0;i<events.length;i+=100){const ids=events.slice(i,i+100).map(x=>x.id);const [v,a,t]=await Promise.all([client.from('voice_generations').select(voiceFields).in('usage_event_id',ids),client.from('ai_requests').select(aiFields).in('usage_event_id',ids),client.from('credit_transactions').select('usage_event_id,transaction_type,amount_credits').in('usage_event_id',ids).in('transaction_type',['debit','refund'])]);if(v.error||a.error||t.error)throw Error('Falha ao conferir recibos e movimentos da carteira.');voices.push(...v.data,...a.data.map(r=>({...r,is_ai:true})));tx.push(...t.data);if(t.data.length>=1000){result.truncated=true;result.warnings.push('Movimentos da carteira atingiram o limite de leitura; valores vinculados podem estar incompletos.');}}
  const [pending,pendingAi,packs]=await Promise.all([client.from('voice_generations').select(voiceFields).is('usage_event_id',null).in('status',['reserved','processing','uncertain']).order('created_at',{ascending:false}).limit(200),client.from('ai_requests').select(aiFields).is('usage_event_id',null).in('status',['preparing','reserved','processing','uncertain']).order('created_at',{ascending:false}).limit(200),client.from('billing_credit_packs').select('price_brl,credit_amount').eq('status','active')]);if(pending.error||pendingAi.error||packs.error)throw Error('Falha ao conferir reservas e pacotes.');
  if(pending.data.length===200){result.truncated=true;result.warnings.push('Reservas limitadas às 200 mais recentes.');}
  if(pendingAi.data.length===200)result.truncated=true;
  const pendingInPeriod:Row[]=[...pending.data,...pendingAi.data.map(r=>({...r,is_ai:true}))].filter(v=>String(v.created_at)>=since);
  const orgIds=[...new Set([...events.map(e=>str(record(e.metadata).organization_id??e.organization_id)),...pendingInPeriod.map(v=>v.organization_id)])].filter(Boolean),projectIds=[...new Set([...voices,...pendingInPeriod].map(v=>str(v.project_id)))].filter(Boolean);
  const names=new Map<string,string>(),projects=new Map<string,string>();
  for(let i=0;i<orgIds.length;i+=100){const q=await client.from('organizations').select('id,name').in('id',orgIds.slice(i,i+100));if(q.error)throw Error('Falha ao identificar clientes.');for(const row of q.data)names.set(row.id,row.name);}
  for(let i=0;i<projectIds.length;i+=100)for(const table of ['voice_projects','ai_projects']){const q=await client.from(table).select('id,name').in('id',projectIds.slice(i,i+100));if(q.error)throw Error('Falha ao identificar projetos.');for(const row of q.data)projects.set(row.id,row.name);}
  const seen=new Set<string>();
  for(const u of events){const id=str(u.id);if(seen.has(id))continue;seen.add(id);result.rows.push(projectAuditOperation(u,voices.find(v=>v.usage_event_id===id),tx.filter(t=>t.usage_event_id===id),names,projects));}
  for(const v of pendingInPeriod)result.rows.push(projectAuditOperation({id:v.id,created_at:v.created_at,organization_id:v.organization_id,provider:v.is_ai||String(v.model_id).startsWith('gemini')?'gemini':'elevenlabs',model_id:v.model_id,feature_code:v.is_ai?'external_ai':v.operation,status:v.status,pending_receipt:true,metadata:{source:v.is_ai?'external_ai':v.operation==='studio'?'voice_studio':'voice_api'}},v,[],names,projects));
  const prices=packs.data.filter(p=>n(p.price_brl)>0&&n(p.credit_amount)>0).map(p=>n(p.price_brl)/n(p.credit_amount));if(prices.length)result.creditPackRange={min:Math.min(...prices),max:Math.max(...prices)};
  if(result.truncated)result.warnings.push('Recorte limitado: até 2.000 registros recentes. Totais e filtros representam somente as operações carregadas.');
  result.warnings.push('Receita nominal = débitos menos estornos vinculados × R$0,01. Não é recebimento de caixa; créditos inclusos, gratuitos, bônus, descontos e contratos não são atribuídos a cada uso pelo ledger atual.','Custos usam o registro histórico/snapshot, sem reprecificação retroativa. Tarifa confirmada não equivale a fatura do fornecedor. Câmbio ausente no snapshot é exibido como não registrado.','Reservas pendentes são separadas dos custos liquidados. Liberação de reserva não é estorno. Reservas anteriores ao período selecionado não entram neste recorte.');
 }catch(e){result.rows=[];result.warnings=[e instanceof Error?e.message:'Falha na consulta.'];}
 result.at=new Date().toISOString();
 return result;
}
