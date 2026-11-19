import React from 'react';
import {ClientAutomationsCenter} from '../../src/components/connectyhub-os/client-automations-center';
import {PlatformAutomationsCenter} from '../../src/components/connectyhub-os/platform-automations-center';
import {createDefaultSalesCatalogCommerceSettings} from '../../src/lib/sales-catalog/shared';
import {defaultPlatformBillingRenewalPolicy} from '../../src/lib/billing/renewal-policy';
import {panelColorGrid} from '../../src/lib/ui/panel-theme';
import {Panel, NeonBadge, StatusBadge, CommandButton} from '../../src/components/connectyhub-os/panel-primitives';
import {createRoot} from 'react-dom/client';
import {ConnectyShell} from '../../src/components/connectyhub-os/connecty-shell';
import {ClientDashboard} from '../../src/components/connectyhub-os/client-dashboard';
import {AdminConsole} from '../../src/components/connectyhub-os/admin-console';
import {LeadCrmConsole} from '../../src/components/connectyhub-os/leads-crm-console';
import {AdminWhatsappAtendimentoConsole} from '../../src/components/connectyhub-os/admin-whatsapp-atendimento-console';
import {SocialAccountsConsole} from '../../src/components/connectyhub-os/social-accounts-console';

// Dedicated local fixture host. No production service, permission or credential is used.
Object.defineProperty(window, 'Notification', {value: undefined, configurable: true});
const now='2026-11-07T17:00:00Z';
const humanIntervention={active:false,pausedUntil:null,reason:null,source:null,updatedAt:null};
const company={id:'demo-org',name:'Empresa de demonstração',slug:'demo',planCode:'pro',planLabel:'Pro',status:'active',role:'owner'};
const leads=['Ana · demonstração','Bruno · demonstração','Carla · demonstração','Diego · demonstração'].map((name,i)=>{
 const messages=Array.from({length:8},(_,n)=>({id:`msg-${i}-${n}`,direction:n%2?'outbound':'inbound',author:n%2?'ai':'lead',authorLabel:n%2?'Assistente':name,authorSource:'fixture',channel:'whatsapp',surface:null,originSource:'fixture',originDevice:null,originConfidence:'high',agentRunId:null,agentId:'agent',provider:'fixture',providerMessageId:null,providerChatId:null,type:'text',text:n===7?'Vou verificar e já retorno.':n%2?'Posso ajudar com isso.':'Olá! Gostaria de saber mais sobre as opções.',quotedMessage:null,mediaKind:null,mediaUrl:null,mediaMimeType:null,mediaFileName:null,mediaCaption:null,deliveryStatus:null,edited:false,occurredAt:now}));
 const conversation={id:`conversation-${i}`,whatsappInstanceId:'demo-instance',whatsappInstanceName:'Atendimento',whatsappInstancePhone:null,whatsappInstanceStatus:'connected',agentId:'agent',agentName:'Assistente',agentAvatarUrl:null,channel:'whatsapp',provider:'fixture',providerChatId:null,status:'open',preview:'Gostaria de saber mais.',messageCount:8,messages,humanIntervention,createdAt:now,updatedAt:now,lastMessageAt:now};
 return {id:`lead-${i}`,companyId:company.id,companyName:company.name,companyPlan:'Pro',agentName:'Assistente',agentAvatarUrl:null,avatarUrl:null,name,phone:null,email:null,status:i===1?'qualified':'active',score:50,channel:'whatsapp',source:'WhatsApp',summary:'Conversa fictícia para avaliar a interface.',qualification:{purpose:null,budget:null,timeframe:null,objections:null,mainPain:null,volumeOrContext:null,decisionAuthority:null,nextStepAcceptance:null,temperature:null,nextBestQuestion:null,nextBestAction:null,answeredQuestionIds:[],missingQuestionIds:[],updatedAt:null,fields:[]},technical:{origin:'WhatsApp',device:null,browser:null,os:null,location:null,ipAddress:null,lastClick:null,deliveryAddress:null,deliveryCep:null,customerDocument:null},conversation,leadFile:{conversationCount:1,messageCount:8,trackingEventCount:0,intelligenceEventCount:0,firstSeenAt:now,lastSeenAt:now,conversations:[conversation],trackingEvents:[],intelligenceEvents:[]},activities:[],createdAt:now,updatedAt:now,lastMessageAt:now};
});
const workspace={companies:[company],attendanceQueues:[],leads,stats:{total:4,new:0,active:3,qualified:1,converted:0,archived:0},warnings:[]};
const client={generatedAt:now,company,companies:[company],warnings:[],metrics:{leads:{total:24,new:3,active:12,qualified:5,won:4,lost:0,archived:0,today:3,last7d:12},conversations:{total:24,open:4,today:8},messages:{today:42,inboundToday:20,outboundToday:22},agents:{total:2,online:2,warning:0},whatsapp:{total:2,connected:2,disconnected:0},credits:{available:1000,reserved:0,usedLifetime:300,used30d:100},sales:{orders30d:10,paidOrders30d:8,revenue30dBrl:800,approvedPayments30dBrl:800,rejectedPayments30d:0},automation:{runs30d:40,completed30d:40,failed30d:0,successRate:100}},summaryCards:[],funnel:[],leadSeries:[],recentLeads:[],recentConversations:leads.map(l=>({id:l.conversation.id,leadId:l.id,leadName:l.name,channel:'WhatsApp',status:'open',summary:l.summary,score:l.score,lastMessageAt:now})),activeAgents:[],campaigns:[],storage:null};
const admin={generatedAt:now,warnings:[],platformHealth:[{name:'Mensagens',status:'online',latency:'120 ms',detail:'Demonstração'}],hero:{totalClients:'28',activeClients:'24',newClients7d:'3',series:[2,3,4]},activationSeries:[],leadSeries:[],revenue:{value:'R$ 2.400',trend:'+5%',series:[]},retention:{value:'90%',trend:'+2%',series:[]},metrics:[],clientStatus:[],ceoActivity:[],clients:[{id:'company',company:'Empresa de demonstração',owner:'Conta fictícia',plan:'Pro',health:'online',mrr:'R$ 247',tokens:'100',agents:2,status:'Ativo'}],internalAgents:[],ceoInsight:{recommendations:[],headline:'Operação demonstrativa',autonomyLabel:'Supervisionada',title:'Resumo da operação',summary:'Dados fictícios',recommendation:'Acompanhar atendimento',kpis:[],actions:[]},approvals:[],maintenanceItems:[],auditEvents:[],infraStats:[]};

const automationSettingsKey='connecty-preview-automation-settings-v1';
const initialAutomationSettings={id:'demo-settings',companyId:company.id,configured:true,businessType:'simple',categories:['Demonstração'],attributes:[],storefront:{heroTitle:'Loja de demonstração',primaryColor:'#123456'},trackInventory:true,variationMedia:false,...createDefaultSalesCatalogCommerceSettings(),createdAt:now,updatedAt:now};
function loadAutomationSettings(companyId=company.id){const fallback=companyId===company.id?initialAutomationSettings:{...initialAutomationSettings,id:'demo-settings-2',companyId,updatedAt:null};try{return JSON.parse(localStorage.getItem(automationSettingsKey+':'+companyId))||fallback;}catch{return fallback;}}
const demoSettings=loadAutomationSettings();
const demoAgent={id:'agent',companyId:company.id,name:'Assistente de demonstração',personaName:'Assistente',roleTitle:'Atendimento',status:'active',avatarUrl:null};
const autoCatalog={schemaReady:true,flows:[],agents:[],notifications:[],eventDefinitions:[{eventType:'trial_started',label:'Boas-vindas',description:'Mensagem após cadastro',category:'trial',revenueGoal:'Ativação'}],renewalPolicy:{...defaultPlatformBillingRenewalPolicy,cardChargeAttemptEnabled:false},variables:['nome','empresa'],stats:{totalFlows:0,activeFlows:0,pausedFlows:0,connectedAgents:0,sent24h:0,pendingNotifications:0,failedNotifications:0},warnings:[]};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);const body=init.body&&typeof init.body==='string'?JSON.parse(init.body):{};
 const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}));
 if(url.pathname==='/api/dashboard/sales-catalog'){
  if(init.method==='POST'){
   if(body.action!=='save_automation_settings')return json({error:'Operação não disponível na prévia.'},422);
   const latest=loadAutomationSettings(body.companyId);
   if(body.expectedUpdatedAt!==latest.updatedAt)return json({error:'Estas configurações mudaram em outra tela. Recarregue para revisar a versão atual antes de salvar. Seu rascunho foi mantido.'},409);
   const settings={...latest,messageTemplates:body.messageTemplates,automationSettings:body.automationSettings,updatedAt:new Date().toISOString()};
   localStorage.setItem(automationSettingsKey+':'+body.companyId,JSON.stringify(settings));return json({settings});
  }
  return json({settings:[loadAutomationSettings()],products:[],items:[]});
 }
 if(url.pathname==='/api/dashboard/automations')return json({policy:{follow_up_enabled:false,returns_enabled:true,timezone:'America/Sao_Paulo',window_start:'09:00',window_end:'20:00'},activity:[],results:null,giftProducts:[]});
 if(url.pathname.includes('comment-automations'))return json({config:{rules:[],followUp:{enabled:false,delayMinutes:30,platform:'both'}}});
 if(url.pathname.startsWith('/api/admin/automations'))return json({policy:body.policy||autoCatalog.renewalPolicy,flow:body});
 return originalFetch(input,init);
};
const path=location.pathname;
const isAdmin=path.startsWith('/admin');
const attending=path.endsWith('/atendimento');
const supported=attending||path==='/admin'||path==='/dashboard';
const socialOverview={schemaReady:true,canManage:true,meta:{available:true,connected:true,account:'Empresa de demonstração',publishingScopes:true},connections:[{provider:'youtube',configured:true,connected:true,status:'connected',accounts:[{id:'demo',name:'Canal de demonstração'}],selectedAccountId:'demo',checkedAt:null},{provider:'tiktok',configured:false,connected:false,status:'disconnected',accounts:[],selectedAccountId:null,checkedAt:null}]};
function Palette(){return <ConnectyShell mode="admin"><h1 className="mb-3 text-2xl font-bold">Sistema de cores · ConnectyHub</h1><p className="mb-5 text-sm text-slate-600">Base compartilhada dos dois painéis. Dados e ações desta prévia são simulados.</p><div className="mb-6 grid gap-3 sm:grid-cols-3">{panelColorGrid.map(item=><div key={item.role} className="overflow-hidden rounded-xl border border-slate-200"><div style={{background:item.color,color:item.foreground,padding:20,minHeight:95}}><strong>{item.role}</strong><p style={{fontSize:12,marginTop:8}}>{item.usage}</p></div><p className="bg-white p-3 text-xs text-slate-600">{item.color} / {item.foreground}</p></div>)}</div><Panel title="Componentes compartilhados" eyebrow="Mesmo padrão em todos os módulos"><div className="flex flex-wrap gap-3"><StatusBadge status="online"/><StatusBadge status="warning"/><StatusBadge status="critical"/><StatusBadge status="idle"/><NeonBadge tone="cyan">Informação</NeonBadge><NeonBadge tone="violet">Automação</NeonBadge><CommandButton>Consultar</CommandButton></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm">Nome da empresa<input className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="Exemplo de formulário"/></label><label className="text-sm">Mensagem<textarea className="mt-2 w-full rounded-lg border border-input bg-background p-3" placeholder="Exemplo de campo"/></label></div><p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Conectado — sincronização concluída.</p><p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-700">Atenção — revisão necessária.</p><p className="mt-3 rounded-lg bg-rose-100 p-3 text-sm text-rose-700">Falha — tente novamente.</p></Panel></ConnectyShell>}
function App(){
if(path==='/dashboard/automacoes')return <ConnectyShell mode="client" userLabel="demo" workspaceName={company.name}><ClientAutomationsCenter agents={[demoAgent]} companies={[company,{...company,id:'demo-org-2',name:'Segunda empresa de demonstração'}]} initialCompanyId={company.id} initialSettings={[demoSettings]} products={[]} whatsappInstances={[]} /></ConnectyShell>;
if(path==='/admin/automacoes')return <PlatformAutomationsCenter catalog={autoCatalog} userLabel="demo-admin" />;
if(path.endsWith('/redes-sociais/contas'))return <ConnectyShell mode={isAdmin?'admin':'client'} workspaceName={company.name}><SocialAccountsConsole overview={socialOverview} shell={isAdmin?'admin':'client'} companyId='demo-org'/></ConnectyShell>;if(path==='/paleta')return <Palette/>;return <>{!supported?<ConnectyShell mode={isAdmin?'admin':'client'} workspaceName={company.name}><p>Área original preservada. Nesta prévia você pode testar os novos menus, atalhos por contexto, início, atendimento e os editores de automações. Os demais módulos serão exercitados no aplicativo completo antes da publicação.</p><a href={isAdmin?'/admin':'/dashboard'}>Voltar ao início</a></ConnectyShell>:attending?<ConnectyShell mode={isAdmin?'admin':'client'} isPlatformAdmin={isAdmin} workspaceName={company.name}>{isAdmin?<AdminWhatsappAtendimentoConsole leadWorkspace={workspace}/>:<LeadCrmConsole mode="atendimento" workspace={workspace} liveEndpoint={null}/>}</ConnectyShell>:isAdmin?<AdminConsole overview={admin}/>:<ClientDashboard overview={client} workspaceName={company.name}/>}</>}
createRoot(document.getElementById('root')).render(<App/>);
