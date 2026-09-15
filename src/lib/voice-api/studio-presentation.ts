export function studioQuoteLabel(credits:number,reservationOnly:boolean){
 const amount=(reservationOnly?Math.ceil(credits):credits).toLocaleString('pt-BR',{maximumFractionDigits:2});
 return `${reservationOnly?'Custo máximo deste áudio: até':'Custo desta operação:'} ${amount} créditos ConnectyHub`;
}
export type StudioQuote={credits:number;reservation_only:boolean};
// Only waits for the form's required inputs; the server validates ownership,
// duration, tariff and every parameter before quoting or reserving anything.
export function studioFormReady(body:string){
 try{
  const b=JSON.parse(body),has=(key:string,min=1)=>typeof b[key]==='string'&&b[key].trim().length>=min;
  switch(b.operation){
   case 'gemini_tts':return has('voice_id')&&has('text');
   case 'transcription':case 'audio_isolation':return has('asset_id');
   case 'voice_change':return has('asset_id')&&has('voice_id');
   case 'forced_alignment':return has('asset_id')&&has('text');
   case 'dubbing':return has('asset_id')&&has('target_language',2);
   case 'dialogue':return Array.isArray(b.turns)&&b.turns.length>0&&b.turns.every((t:{text?:string;voice_id?:string})=>t.text?.trim()&&t.voice_id);
   case 'voice_design':return has('description',20)&&has('sample_text',100);
   case 'voice_design_save':return has('preview_id')&&has('name',2)&&has('description',20);
   case 'dictionary_create':return has('name')&&Array.isArray(b.rules)&&b.rules.length>0&&b.rules.every((r:{string_to_replace?:string;type?:string;alias?:string;phoneme?:string})=>r.string_to_replace?.trim()&&(r.type==='alias'?r.alias?.trim():r.phoneme?.trim()));
   default:return false;
  }
 }catch{return false;}
}
export function scheduleStudioQuote(url:string,body:string,onQuote:(quote:StudioQuote)=>void,onError:(message:string)=>void){
 const controller=new AbortController();let active=true;
 const timer=setTimeout(async()=>{
  try{
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:controller.signal});
   const value=await response.json();
   if(!response.ok)throw new Error(value.error?.message??'Não foi possível calcular o custo.');
   if(typeof value.credits!=='number'||!Number.isFinite(value.credits)||value.credits<0||typeof value.reservation_only!=='boolean')throw new Error('Cotação inválida.');
   if(active)onQuote(value);
  }catch(error){if(active)onError(error instanceof Error?error.message:'Não foi possível calcular o custo.');}
 },600);
 return()=>{active=false;clearTimeout(timer);controller.abort();};
}
