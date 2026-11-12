export const coexistenceFields = ['messages','history','smb_app_state_sync','smb_message_echoes','account_update'];
export function ownBusinessPhone(value: unknown) {
  let phone=String(value??'').replace(/\D/g,'');
  if(phone.startsWith('55')&&phone.length===13&&phone[4]==='9')phone=phone.slice(0,4)+phone.slice(5);
  return /^[1-9]\d{9,14}$/.test(phone)?phone:'';
}
export function verifiedBusinessPhone(phones: Array<Record<string,unknown>>, expected: string) {
  const matches=phones.filter(phone=>ownBusinessPhone(phone.display_phone_number)===ownBusinessPhone(expected)&&ownBusinessPhone(expected));
  if(matches.length!==1||matches[0].is_on_biz_app!==true||matches[0].platform_type!=='CLOUD_API'||!/^\d{5,30}$/.test(String(matches[0].id)))throw Error('A Meta não confirmou o mesmo número no Business e na Cloud API.');
  return matches[0];
}
export function coexistenceCallback(value: unknown, allowedOrigin: unknown, endpoints: string[]) {
  const url=new URL(String(value??'')), allowed=new URL(String(allowedOrigin??''));
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.origin!==allowed.origin||url.pathname!=='/api/webhooks/meta'||[...url.searchParams.keys()].join(',')!=='company'||!/^[a-f0-9-]{36}$/i.test(url.searchParams.get('company')||'')||!endpoints.some(endpoint=>new URL(endpoint).origin===url.origin))throw Error('Callback incompatível com o cliente API autorizado.');
  return url.toString();
}
export function coexistenceGraphPath(path: unknown, waba: string, phone: string, method: string) {
  const selected=String(path??'').replace(/^\//,'');
  const allowed=method==='GET'?[phone,`${waba}/phone_numbers`,`${waba}/message_templates`,`${waba}/subscribed_apps`,`${waba}/template_analytics`]:[`${phone}/smb_app_data`,`${phone}/messages`,`${waba}/message_templates`];
  if(!['GET','POST'].includes(method)||!allowed.includes(selected))throw Error('Operação fora do número autorizado para coexistência.');
  return selected;
}

export function coexistenceAnalyticsParams(params: Record<string,string>) {
  const allowed=['start','end','granularity','metric_types','template_ids','limit','after'];
  if(Object.keys(params).some(k=>!allowed.includes(k)) || Object.values(params).some(v=>typeof v!=='string'||v.length>1000)) throw Error('Parâmetros de estatísticas inválidos.');
  const start=Number(params.start),end=Number(params.end);
  if(!/^\d{10}$/.test(params.start||'')||!/^\d{10}$/.test(params.end||'')||end<=start||end-start>90*86400||params.granularity!=='DAILY') throw Error('Período de estatísticas inválido.');
  let ids: unknown;try{ids=JSON.parse(params.template_ids)}catch{throw Error('Modelos inválidos.')}
  if(!Array.isArray(ids)||ids.length<1||ids.length>10||ids.some(id=>typeof id!=='string'||!/^\d{5,30}$/.test(id))) throw Error('Modelos inválidos.');
  if(!/^(sent|delivered|read|clicked)(,(sent|delivered|read|clicked))*$/.test(params.metric_types||'')) throw Error('Métricas inválidas.');
  if(params.limit&&!/^(?:[1-9]\d?|100)$/.test(params.limit))throw Error('Limite inválido.');
}
