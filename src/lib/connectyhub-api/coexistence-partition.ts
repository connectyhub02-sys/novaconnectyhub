import {coexistenceFields} from './coexistence-policy';
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
export function partitionCoexistenceEvents(payload:unknown,bindings:Array<{id:string;waba_id:string|null;phone_number_id:string|null}>){
 const root=obj(payload),ordinary:Obj[]=[],relays:Array<{connectionId:string;payload:Obj}>=[];
 for(const item of arr(root.entry)){
  const entry=obj(item),remaining:unknown[]=[];
  for(const changeItem of arr(entry.changes)){
   const change=obj(changeItem),value=obj(change.value),field=String(change.field||'');
   const waba=field==='account_update'?String(obj(value.waba_info).waba_id||entry.id):String(entry.id||'');
   const binding=bindings.find(b=>b.waba_id===waba);
   if(!binding){remaining.push(changeItem);continue;}
   // All changes owned by this WABA stay out of the ordinary AI pipeline.
   const phone=String(obj(value.metadata).phone_number_id||'');
   if(!coexistenceFields.includes(field)||(phone&&phone!==binding.phone_number_id)||(!phone&&field!=='account_update'))continue;
   relays.push({connectionId:binding.id,payload:{object:'whatsapp_business_account',entry:[{...entry,id:waba,changes:[changeItem]}]}});
  }
  if(remaining.length)ordinary.push({...entry,changes:remaining});
 }
 return {ordinary:{...root,entry:ordinary},relays};
}
