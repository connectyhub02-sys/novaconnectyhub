import {postStatus, type SocialDraft, type Target} from './publishing-policy';
import type {ClientMetaOrganicPost} from '@/lib/meta/organic-publishing';
export type ContentPost = {id:string;revision:number;draft:SocialDraft;state:string;scheduled_for:string|null;created_at:string;legacy?:ClientMetaOrganicPost};
export type ContentDelivery = {id:string;post_id:string;target:Target;status:string;result_url:string|null;error_message:string|null;provider_id:string|null;api_data_deleted_at:string|null;updated_at?:string};
export type ContentTab = 'all'|'published'|'scheduled'|'drafts'|'attention';
export const contentTabs: {key:ContentTab;label:string}[] = [{key:'all',label:'Todos'},{key:'published',label:'Publicados'},{key:'scheduled',label:'Agendados'},{key:'drafts',label:'Rascunhos'},{key:'attention',label:'Precisam de atenção'}];
export function contentMatches(post:ContentPost, deliveries:ContentDelivery[], tab:ContentTab, now:number) {
  if(tab==='all')return true;
  if(tab==='drafts')return post.state==='draft';
  if(tab==='published')return deliveries.some(d=>d.status==='published');
  if(tab==='attention')return deliveries.some(d=>['failed','uncertain'].includes(d.status));
  return post.state!=='draft'&&post.state!=='cancelled'&&Boolean(post.scheduled_for)&&Date.parse(post.scheduled_for!)>now&&deliveries.some(d=>d.status==='queued');
}
export function contentStatus(post:ContentPost, deliveries:ContentDelivery[], now:number) {
  return contentMatches(post,deliveries,'scheduled',now)?'Agendada':postStatus(deliveries,post.state);
}
export function localDay(date:Date) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function monthDays(month:Date) {
  const first=new Date(month.getFullYear(),month.getMonth(),1,12);
  first.setDate(first.getDate()-((first.getDay()+6)%7));
  return Array.from({length:42},(_,i)=>new Date(first.getFullYear(),first.getMonth(),first.getDate()+i,12));
}
export function youtubeFormat(check:{duration:number;width:number;height:number}|null|undefined) {
  if(!check)return 'O formato será identificado após verificar o vídeo.';
  return check.duration<=180&&check.width<=check.height?'Formato de Shorts: vídeo quadrado ou vertical de até 3 minutos. A classificação final é do YouTube.':'Vídeo para o canal do YouTube (formato longo).';
}
// View-only adapter. Legacy IDs never enter the video editor or its mutation API.
export function legacyContent(items:ClientMetaOrganicPost[]):{posts:ContentPost[];deliveries:ContentDelivery[]} {
 const posts:ContentPost[]=[],deliveries:ContentDelivery[]=[];
 for(const item of items){
  const id=`meta:${item.id}`,targetList:Target[]=item.surfaces.map(s=>s==='facebook_page'?'facebook':'instagram');
  posts.push({id,revision:0,legacy:item,state:item.status==='draft'||(item.status==='review'&&!item.lastError)?'draft':item.status==='archived'?'cancelled':'approved',scheduled_for:item.scheduledFor,created_at:item.publishedAt??item.createdAt??'',draft:{mediaId:'',title:item.title,caption:item.caption,targets:targetList,captions:{},timezone:'America/Sao_Paulo',youtube:{privacy:'private',madeForKids:false,synthetic:false},tiktok:{privacy:'',comments:false,duet:false,stitch:false,ownBrand:false,branded:false,consent:false}}});
  targetList.forEach((target,index)=>{const delivery=item.deliveryStatus.find(d=>d.surface===item.surfaces[index]);deliveries.push({id:`${id}:${target}`,post_id:id,target,status:delivery?.phase==='published'||item.status==='published'?'published':item.lastError?(delivery?.phase==='sending'?'uncertain':'failed'):item.status==='publishing'?'processing':'queued',result_url:null,error_message:item.lastError,provider_id:delivery?.id??null,api_data_deleted_at:null});});
 }
 return {posts,deliveries};
}
