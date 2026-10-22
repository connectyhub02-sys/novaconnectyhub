import {describe,it,expect} from 'vitest';
import {readHumanMessageText,readProviderMessageText} from '../src/lib/whatsapp/message-text';
import * as contactMessages from '../src/lib/automations/lead-contact-message';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Media from '../src/lib/whatsapp/message-media';
import type {ClientLeadMessage} from '../src/lib/client-os/leads-crm';

const descriptor={URL:'https://mmg.whatsapp.net/v/t62/audio.enc?token=private',mimetype:'audio/ogg; codecs=opus',fileSHA256:'private-hash',mediaKey:'private-key',PTT:true,seconds:12};
const serialized=JSON.stringify(descriptor);
const media=serverModuleHarness<typeof Media>('src/lib/whatsapp/message-media.ts');
const crm=serverModuleHarness<{mapMessage:(row:unknown)=>ClientLeadMessage}>('src/lib/client-os/leads-crm.ts',{'@/lib/whatsapp/message-media':media},['mapMessage']);
const ingest=serverModuleHarness<{extractMessageSnapshot:(payload:unknown)=>{textContent:string|null;messageType:string}}>('src/lib/whatsapp/webhook-ingest.ts',{
  '@/lib/automations/lead-contact-message':contactMessages,
  './lead-avatar-sync':{readLeadProfileImageUrl:()=>null},
},['extractMessageSnapshot']);
function row(text=serialized){return {id:'msg',provider:'uazapi',provider_message_id:'provider-msg',provider_chat_id:'5511999999999@s.whatsapp.net',direction:'outbound',message_type:'AudioMessage',text_content:text,payload:{messages:[{messageType:'AudioMessage',text:serialized,content:serialized,fromMe:true}]},created_at:'2026-10-22T10:00:00Z'};}

describe('WhatsApp media descriptors are not transcripts',()=>{
  it.each([serialized,JSON.stringify(serialized)])('hides serialized/double-encoded transport data',text=>{
    expect(readHumanMessageText(text)).toBeNull();
    expect(readProviderMessageText({text,content:text})).toBeNull();
  });
  it('retains real speech, ordinary JSON, links and emoji',()=>{
    for(const text of ['Enviei o orçamento.','{"produto":"Casa","valor":100}','https://example.com/oferta','🎤'])expect(readHumanMessageText(text)).toBe(text);
  });
  it('recovers captions without copying quoted speech or transport fields',()=>{
    expect(readProviderMessageText({text:serialized,content:JSON.stringify({...descriptor,caption:'Foto da proposta.'})})).toBe('Foto da proposta.');
    expect(readProviderMessageText({content:descriptor,contextInfo:{quotedMessage:{conversation:'Fala de outra pessoa'}}})).toBeNull();
  });
  it('reads the legacy media descriptor for playback while keeping the encrypted URL behind the proxy',()=>{
    const result=media.resolveConversationMessageMedia(row(),{proxyBasePath:'/api/dashboard/attendance/media'});
    expect(result).toMatchObject({kind:'audio',mimeType:'audio/ogg; codecs=opus',url:'/api/dashboard/attendance/media/msg',directUrl:descriptor.URL,transcription:null});
  });
  it.each(['internal-org','customer-org'])('cleans old history without changing the row in %s',organization_id=>{
    const original={...row(),organization_id};
    const mapped=crm.mapMessage(original);
    expect(mapped.text).toBe('Áudio recebido.');expect(mapped.mediaKind).toBe('audio');expect(mapped.mediaTranscription).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain('private-key');expect(JSON.stringify(mapped)).not.toContain('mmg.whatsapp.net');
    expect(original.text_content).toBe(serialized);
    expect(crm.mapMessage({...original,text_content:'Posso ligar amanhã?',payload:{...original.payload,media_transcription:{provider:'gemini'}}}).text).toBe('Posso ligar amanhã?');
  });
  it.each([true,false])('does not persist technical JSON as speech for fromMe=%s',fromMe=>{
    const base={messageType:'AudioMessage',id:'abc',chatid:'5511999999999@s.whatsapp.net',fromMe};
    expect(ingest.extractMessageSnapshot({messages:[{...base,text:serialized,content:serialized}]}).textContent).toBeNull();
    expect(ingest.extractMessageSnapshot({message:{...base,text:serialized,content:{...descriptor,caption:'Uma legenda válida.'}}}).textContent).toBe('Uma legenda válida.');
  });
  it('infers the media type from serialized content when the provider only says media',()=>{
    expect(ingest.extractMessageSnapshot({message:{id:'abc',type:'media',content:serialized}}).messageType).toBe('AudioMessage');
  });
  it('does not expose the descriptor in quoted messages',()=>{
    const mapped=crm.mapMessage({...row('Resposta'),payload:{quotedMsg:{messageType:'AudioMessage',text:serialized,content:serialized}}});
    expect(mapped.quotedMessage?.text).toContain('citado sem texto');
    expect(JSON.stringify(mapped.quotedMessage)).not.toContain('private');
  });
});
