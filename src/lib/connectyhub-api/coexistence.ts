import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {type GatewayAuthContext,GatewayHttpError,requireGatewayInstance,refreshGatewayInstanceStatus} from './gateway';
import {officialSettings,cloudRequest} from '@/lib/meta/whatsapp-cloud';
import {encryptCredentialValue,decryptCredentialValue} from '@/lib/security/credentials-crypto';
import {coexistenceCallback,coexistenceFields,coexistenceGraphPath,ownBusinessPhone,verifiedBusinessPhone} from './coexistence-policy';

export const coexistenceTable='connectyhub_meta_coexistence';
export type CoexistenceConnection={id:string;client_id:string;organization_id:string;instance_id:string;public_instance_id:string;owner_phone:string;state:string;callback_url:string;callback_secret_encrypted:string;nonce_hash:string|null;nonce_key_id:string|null;nonce_expires_at:string|null;nonce_consumed_at:string|null;app_id:string;config_id:string;waba_id:string|null;phone_number_id:string|null;token_encrypted:string|null;token_expires_at:string|null;linked_at:string|null;webhook_subscribed:boolean;campaigns_enabled:boolean;history_sync_state:string|null;contacts_sync_state:string|null};
type MetaPhone=Record<string,unknown>;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function enabled(auth:GatewayAuthContext){if(auth.apiClient.metadata?.meta_coexistence_enabled!==true)throw new GatewayHttpError(403,'coexistence_not_enabled','Coexistência ainda não habilitada para este cliente API.');}
async function context(auth:GatewayAuthContext,instanceId:string){
 enabled(auth);
 if(!Array.isArray(auth.apiClient.metadata?.meta_coexistence_instances)||!auth.apiClient.metadata.meta_coexistence_instances.includes(instanceId))throw new GatewayHttpError(403,'coexistence_not_enabled','Este número ainda não está habilitado para coexistência.');
 const instance=await requireGatewayInstance(auth,instanceId);
 if(instance.organization_id!==auth.apiClient.organization_id||!ownBusinessPhone(instance.phone_number))throw new GatewayHttpError(409,'invalid_instance','Conecte o número deste cliente antes de cadastrar a coexistência.');
 const result=await auth.client.from(coexistenceTable).select('*').eq('client_id',auth.apiClient.id).eq('instance_id',instance.id).maybeSingle<CoexistenceConnection>();
 if(result.error)throw Error('Não foi possível consultar a coexistência.');
 if(result.data&&ownBusinessPhone(result.data.owner_phone)!==ownBusinessPhone(instance.phone_number))throw Error('O número do canal mudou. Revise a coexistência anterior.');
 return {instance,connection:result.data};
}
async function config(auth:GatewayAuthContext){
 const settings=await officialSettings(auth.client);
 const configId=String(auth.apiClient.metadata?.meta_coexistence_config_id||settings.signupConfigId||'');
 if(!/^\d{5,30}$/.test(settings.appId)||!/^\d{5,30}$/.test(configId)||!settings.appSecret)throw Error('Configuração de coexistência pendente no provedor.');
 return {...settings,configId};
}
async function webhookReady(auth:GatewayAuthContext){
 const settings=await config(auth);
 const subscriptions=await cloudRequest<{data:Array<{object:string;active:boolean;callback_url:string;fields:Array<{name:string}>}>}>(settings,`${settings.appId}|${settings.appSecret}`,`${settings.appId}/subscriptions`);
 const hook=subscriptions.data?.find(s=>s.object==='whatsapp_business_account');
 const expected=new URL('/api/webhooks/meta',process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||'https://www.connectyhub.com.br').toString();
 return !!hook?.active&&hook.callback_url===expected&&coexistenceFields.every(field=>hook.fields.some(f=>f.name===field));
}
async function phones(auth:GatewayAuthContext,token:string,waba:string){
 const settings=await config(auth),all:MetaPhone[]=[];let after='';
 for(let page=0;page<20;page++){
  const result=await cloudRequest<{data:MetaPhone[];paging?:{next?:string;cursors?:{after?:string}}}>(settings,token,`${waba}/phone_numbers`,undefined,{fields:'id,display_phone_number,verified_name,is_on_biz_app,platform_type',limit:'100',...(after?{after}:{})});
  all.push(...result.data);if(!result.paging?.next)return all;
  const cursor=result.paging.cursors?.after;if(!cursor||cursor===after)throw Error('Paginação de números inválida.');after=cursor;
 }
 throw Error('Lista de números excedeu o limite de consulta.');
}
function publicState(connection:CoexistenceConnection|null){return connection?{linked:connection.state==='linked',wabaId:connection.waba_id,phoneNumberId:connection.phone_number_id,phone:connection.owner_phone,linkedAt:connection.linked_at,tokenExpiresAt:connection.token_expires_at,webhookSubscribed:connection.webhook_subscribed,campaignsEnabled:connection.campaigns_enabled,contactsSync:connection.contacts_sync_state,historySync:connection.history_sync_state}:{linked:false,campaignsEnabled:false};}
export async function getCoexistenceStatus(auth:GatewayAuthContext,instanceId:string,inspect=false){
 const {instance,connection}=await context(auth,instanceId),settings=await config(auth);
 let phoneVerified=false;
 if(inspect&&connection?.token_encrypted&&connection.waba_id){const phone=verifiedBusinessPhone(await phones(auth,decryptCredentialValue(connection.token_encrypted),connection.waba_id),instance.phone_number!);phoneVerified=String(phone.id)===connection.phone_number_id;}
 return {provider:'connectyhub',appId:settings.appId,configId:settings.configId,apiVersion:settings.graphVersion,configured:true,globalConnected:instance.status==='connected',webhookReady:inspect?await webhookReady(auth):undefined,phoneVerified:inspect?phoneVerified:undefined,...publicState(connection)};
}
export async function startCoexistence(auth:GatewayAuthContext,instanceId:string,body:Record<string,unknown>){
 const {instance,connection}=await context(auth,instanceId),settings=await config(auth);
 if(connection?.waba_id)throw Error('Número já cadastrado. Confira a conexão em vez de iniciar outro cadastro.');
 const live=await refreshGatewayInstanceStatus(auth,instanceId);
 if(live.status!=='connected'||ownBusinessPhone(live.phoneNumber)!==ownBusinessPhone(instance.phone_number))throw Error('Confirme a conexão atual do número antes de cadastrar.');
 if(!await webhookReady(auth))throw Error('O webhook de coexistência ainda precisa ser preparado no provedor.');
 const endpoints=await auth.client.from('connectyhub_webhook_endpoints').select('url').eq('client_id',auth.apiClient.id).eq('status','active');
 if(endpoints.error)throw Error('Não foi possível conferir o destino autorizado.');
 const callback=coexistenceCallback(body.callbackUrl,auth.apiClient.metadata?.meta_coexistence_callback_origin,(endpoints.data||[]).map(e=>e.url));
 if(!/^[a-f0-9]{64}$/.test(String(body.callbackSecret||'')))throw Error('Assinatura do destino inválida.');
 if(connection&&(connection.callback_url!==callback||decryptCredentialValue(connection.callback_secret_encrypted)!==body.callbackSecret))throw Error('O destino mudou. Revise a preparação existente.');
 const seed=await auth.client.from(coexistenceTable).upsert({client_id:auth.apiClient.id,organization_id:auth.apiClient.organization_id,instance_id:instance.id,public_instance_id:instanceId,owner_phone:instance.phone_number,callback_url:callback,callback_secret_encrypted:encryptCredentialValue(String(body.callbackSecret)),app_id:settings.appId,config_id:settings.configId},{onConflict:'instance_id',ignoreDuplicates:true});
 if(seed.error)throw Error('Não foi possível preparar o vínculo do número.');
 const reloaded=await context(auth,instanceId);
 if(reloaded.connection?.callback_url!==callback||decryptCredentialValue(reloaded.connection.callback_secret_encrypted)!==body.callbackSecret)throw Error('O destino mudou durante a preparação.');
 const nonce=randomBytes(32).toString('hex');
 const saved=await auth.client.from(coexistenceTable).update({nonce_hash:digest(nonce),nonce_expires_at:new Date(Date.now()+20*60*1000).toISOString(),nonce_key_id:auth.apiKey.id,nonce_consumed_at:null,app_id:settings.appId,config_id:settings.configId,updated_at:new Date().toISOString()}).eq('client_id',auth.apiClient.id).eq('instance_id',instance.id).eq('state','prepared').is('waba_id',null).select('id').maybeSingle();
 if(saved.error||!saved.data)throw Error('O cadastro mudou. Confira o vínculo antes de continuar.');
 return {nonce,appId:settings.appId,configId:settings.configId,apiVersion:settings.graphVersion};
}
export async function finishCoexistence(auth:GatewayAuthContext,instanceId:string,body:Record<string,unknown>){
 const {instance,connection}=await context(auth,instanceId),settings=await config(auth);
 if(typeof body.code!=='string'||!body.code||body.code.length>8192||!/^\d{5,30}$/.test(String(body.wabaId))||!/^[a-f0-9]{64}$/.test(String(body.nonce)))throw Error('Retorno do cadastro inválido.');
 if(!connection||connection.nonce_consumed_at||connection.nonce_hash!==digest(String(body.nonce))||connection.nonce_key_id!==auth.apiKey.id||!(Date.parse(connection.nonce_expires_at||'')>Date.now())||connection.app_id!==settings.appId||connection.config_id!==settings.configId)throw Error('Cadastro expirado ou incompatível com o cliente API.');
 const claimed=await auth.client.from(coexistenceTable).update({nonce_consumed_at:new Date().toISOString()}).eq('id',connection.id).eq('client_id',auth.apiClient.id).eq('nonce_hash',connection.nonce_hash).is('nonce_consumed_at',null).gt('nonce_expires_at',new Date().toISOString()).select('id').maybeSingle();
 if(claimed.error||!claimed.data)throw Error('Retorno já utilizado.');
 const token=await cloudRequest<{access_token:string}>(settings,`${settings.appId}|${settings.appSecret}`,'oauth/access_token',undefined,{client_id:settings.appId,client_secret:settings.appSecret,code:body.code});
 if(!token.access_token)throw Error('Autorização não recebida.');
 const debug=await cloudRequest<{data:{app_id:string;is_valid:boolean;scopes:string[];expires_at?:number}}>(settings,`${settings.appId}|${settings.appSecret}`,'debug_token',undefined,{input_token:token.access_token});
 if(!debug.data?.is_valid||String(debug.data.app_id)!==settings.appId||!['whatsapp_business_management','whatsapp_business_messaging'].every(scope=>debug.data.scopes?.includes(scope)))throw Error('Autorização incompatível com o aplicativo WhatsApp.');
 const phone=verifiedBusinessPhone(await phones(auth,token.access_token,String(body.wabaId)),instance.phone_number!);
 const existing=await auth.client.from('meta_whatsapp_connections').select('phone_number_id').eq('phone_number_id',String(phone.id)).maybeSingle();
 if(existing.error||existing.data)throw Error('Número já registrado em outro fluxo oficial. Revise o vínculo antes de continuar.');
 const latest=await context(auth,instanceId);
 if(ownBusinessPhone(latest.instance.phone_number)!==ownBusinessPhone(instance.phone_number))throw Error('O número mudou durante o cadastro.');
 const saved=await auth.client.from(coexistenceTable).update({state:'linked',waba_id:String(body.wabaId),phone_number_id:String(phone.id),token_encrypted:encryptCredentialValue(token.access_token),token_expires_at:debug.data.expires_at?new Date(debug.data.expires_at*1000).toISOString():null,linked_at:new Date().toISOString(),webhook_subscribed:false,campaigns_enabled:false,updated_at:new Date().toISOString()}).eq('id',connection.id).eq('client_id',auth.apiClient.id).eq('nonce_hash',connection.nonce_hash).eq('state','prepared').select('id').maybeSingle();
 if(saved.error||!saved.data)throw Error('Não foi possível salvar: o número ou a conta já pode pertencer a outra integração.');
 // No /register, QR disconnect, or ordinary official-number separation bypass.
 await resumeCoexistence(auth,instanceId);
 return getCoexistenceStatus(auth,instanceId);
}
export async function resumeCoexistence(auth:GatewayAuthContext,instanceId:string){
 const {connection}=await context(auth,instanceId),settings=await config(auth);
 if(connection?.state!=='linked'||!connection.token_encrypted||!connection.waba_id)throw Error('Conclua o cadastro antes de associar o webhook.');
 const status=await getCoexistenceStatus(auth,instanceId,true);
 if(!status.phoneVerified||!status.webhookReady)throw Error('Confirme o número e o webhook antes de continuar.');
 const result=await cloudRequest<{success:boolean}>(settings,decryptCredentialValue(connection.token_encrypted),`${connection.waba_id}/subscribed_apps`,{});
 if(!result.success)throw Error('A Meta não confirmou a assinatura do webhook.');
 const saved=await auth.client.from(coexistenceTable).update({webhook_subscribed:true,updated_at:new Date().toISOString()}).eq('id',connection.id).eq('client_id',auth.apiClient.id);
 if(saved.error)throw Error('Não foi possível registrar a assinatura.');
 return getCoexistenceStatus(auth,instanceId);
}
export async function enableCoexistenceSending(auth:GatewayAuthContext,instanceId:string){
 const {connection}=await context(auth,instanceId);
 if(connection?.state!=='linked'||!connection.webhook_subscribed)throw Error('Conclua o vínculo oficial e o recebimento antes de liberar envios.');
 const status=await getCoexistenceStatus(auth,instanceId,true);
 const live=await refreshGatewayInstanceStatus(auth,instanceId);
 if(!status.phoneVerified||!status.webhookReady||live.status!=='connected'||ownBusinessPhone(live.phoneNumber)!==ownBusinessPhone(connection.owner_phone))throw Error('Confirme o mesmo número conectado nos dois caminhos antes de liberar.');
 const saved=await auth.client.from(coexistenceTable).update({campaigns_enabled:true,updated_at:new Date().toISOString()}).eq('id',connection.id).eq('client_id',auth.apiClient.id).eq('state','linked').eq('phone_number_id',connection.phone_number_id).select('id').maybeSingle();
 if(saved.error||!saved.data)throw Error('Não foi possível registrar a liberação deste número.');
 return getCoexistenceStatus(auth,instanceId);
}
export async function proxyCoexistenceGraph(auth:GatewayAuthContext,instanceId:string,body:Record<string,unknown>){
 const {connection}=await context(auth,instanceId),settings=await config(auth);
 if(connection?.state!=='linked'||!connection.token_encrypted||!connection.phone_number_id||!connection.waba_id)throw Error('Coexistência ainda não vinculada.');
 const method=String(body.method||'GET'),path=coexistenceGraphPath(body.path,connection.waba_id,connection.phone_number_id,method);
 const payload=body.body&&typeof body.body==='object'&&!Array.isArray(body.body)?body.body as Record<string,unknown>:{};
 const params=body.params&&typeof body.params==='object'&&!Array.isArray(body.params)?body.params as Record<string,string>:{};
 if(Object.keys(params).some(key=>!['fields','limit','after','before'].includes(key))||Object.values(params).some(v=>typeof v!=='string'||v.length>2000)||/[{}]/.test(params.fields||'')||'access_token' in payload||'appsecret_proof' in payload)throw Error('Parâmetros Meta inválidos.');
 if(path.endsWith('/messages')){
  if(!connection.campaigns_enabled||!connection.webhook_subscribed)throw Error('Campanhas deste número aguardam o teste real de coexistência e liberação específica.');
  if(connection.token_expires_at&&!(Date.parse(connection.token_expires_at)>Date.now()))throw Error('Autorização Meta expirada. Reconecte antes de enviar.');
  if(payload.messaging_product!=='whatsapp')throw Error('Produto de mensagem inválido.');
  if(payload.status==='read'){
   if(typeof payload.message_id!=='string'||!payload.message_id)throw Error('Mensagem de leitura inválida.');
  }else{
   if(!/^[1-9]\d{9,14}$/.test(String(payload.to||''))||!['text','template','audio'].includes(String(payload.type)))throw Error('Destinatário ou tipo de mensagem inválido.');
   if(payload.recipient_type&&payload.recipient_type!=='individual')throw Error('Somente destinatários individuais.');
  }
 }
 if(path.endsWith('/smb_app_data')){
  if(method!=='POST'||!['history','smb_app_state_sync'].includes(String(payload.sync_type))||payload.messaging_product!=='whatsapp'||!(Date.parse(connection.linked_at||'')>Date.now()-24*3600000))throw Error('Sincronização inicial fora da janela autorizada.');
  const field=payload.sync_type==='history'?'history_sync_state':'contacts_sync_state';
  const claimed=await auth.client.from(coexistenceTable).update({[field]:'requesting'}).eq('id',connection.id).is(field,null).select('id').maybeSingle();
  if(claimed.error||!claimed.data)throw Error('Esta sincronização já foi solicitada. Não será repetida automaticamente.');
  try{const response=await cloudRequest<Record<string,unknown>>(settings,decryptCredentialValue(connection.token_encrypted),path,payload);const saved=await auth.client.from(coexistenceTable).update({[field]:'requested'}).eq('id',connection.id);if(saved.error)throw Error('Registro pendente.');return response;}
  catch(error){await auth.client.from(coexistenceTable).update({[field]:'uncertain'}).eq('id',connection.id);throw error;}
 }
 const response=await cloudRequest<Record<string,unknown>>(settings,decryptCredentialValue(connection.token_encrypted),path,method==='POST'?payload:undefined,params);
 if(path===`${connection.waba_id}/phone_numbers`&&Array.isArray(response.data))response.data=response.data.filter(phone=>String((phone as Record<string,unknown>).id)===connection.phone_number_id);
 // Meta pagination URLs can contain access tokens; only opaque cursors leave the provider.
 if(response.paging&&typeof response.paging==='object'){const paging=response.paging as Record<string,unknown>;response.paging={cursors:paging.cursors,has_next:!!paging.next};}
 return response;
}
