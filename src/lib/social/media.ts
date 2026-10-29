import 'server-only';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadR2Config,buildPublicObjectUrl } from '@/lib/storage/r2';
import { uploadClientMetaOrganicMedia } from '@/lib/meta/organic-publishing';
import type { VideoCheck } from './publishing-policy';
const execute=promisify(execFile);
export const maxVideoBytes=100*1024*1024;
export async function boundedBytes(body: ReadableStream<Uint8Array>,limit=maxVideoBytes){
 const reader=body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try {while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit)throw Error('O vídeo excede 100 MB.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
 if(!length)throw Error('Arquivo vazio.');return Buffer.concat(chunks);
}
export async function inspectVideo(bytes:Buffer):Promise<VideoCheck>{
 if(bytes.length>maxVideoBytes||bytes.subarray(4,8).toString('ascii')!=='ftyp')throw Error('Envie um vídeo MP4 de até 100 MB.');
 const directory=await mkdtemp(join(tmpdir(),'connecty-social-')),path=join(directory,'video.mp4');
 try{
  await writeFile(path,bytes);
  const {stdout}=await execute('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',path],{timeout:20000,maxBuffer:1024*1024});
  const probe=JSON.parse(stdout),video=probe.streams?.find((s:{codec_type:string})=>s.codec_type==='video'),audio=probe.streams?.find((s:{codec_type:string})=>s.codec_type==='audio');
  const duration=Number(probe.format?.duration),width=Number(video?.width),height=Number(video?.height);
  if(!video||!Number.isFinite(duration)||duration<=0||duration>600||width<1||height<1||width>4096||height>4096)throw Error('Use vídeo de até 10 minutos e resolução máxima de 4096 pixels.');
  const [num,den]=String(video.avg_frame_rate).split('/').map(Number),fps=num/(den||1);
  if(!Number.isFinite(fps)||fps<=0||fps>120)throw Error('Taxa de quadros inválida.');
  await execute('ffmpeg',['-v','error','-xerror','-nostdin','-threads','1','-protocol_whitelist','file,pipe','-i',path,'-map','0:v:0','-map','0:a:0?','-threads','1','-f','null','-'],{timeout:120000,maxBuffer:1024*1024});
  return {version:1,duration,width,height,fps,videoCodec:String(video.codec_name),audioCodec:audio?String(audio.codec_name):null,sha256:createHash('sha256').update(bytes).digest('hex'),warnings:audio?[]:['Este vídeo não tem faixa de áudio.']};
 }catch(error){if(error instanceof Error && !('code' in error))throw error;throw Error('Não foi possível validar o vídeo. Verifique se o MP4 está íntegro ou tente novamente.');}
 finally{await rm(directory,{recursive:true,force:true});}
}
export async function uploadSocialVideo(client:SupabaseClient,org:string,user:string,name:string,bytes:Buffer){
 const check=await inspectVideo(bytes);
 const media=await uploadClientMetaOrganicMedia({client,organizationId:org,userId:user,fileName:name,contentType:'video/mp4',bytes});
 const row=await client.from('content_pipeline_items').select('metadata').eq('organization_id',org).eq('id',media.id).single();
 if(row.error)throw Error('Vídeo enviado, mas o diagnóstico não foi registrado. Atualize a biblioteca.');
 const saved=await client.from('content_pipeline_items').update({metadata:{...row.data.metadata,social_video_check:check}}).eq('organization_id',org).eq('id',media.id);
 if(saved.error)throw Error('Não foi possível registrar a validação técnica.');
 return {id:media.id,check};
}
export async function socialMedia(client:SupabaseClient,org:string,id:string){
 const row=await client.from('content_pipeline_items').select('id,title,metadata').eq('organization_id',org).eq('scope','organization').eq('content_type','meta_organic_media').eq('id',id).single();
 const m=row.data?.metadata;
 if(row.error||!m||m.content_type!=='video/mp4'||typeof m.storage_key!=='string'||!m.storage_key.startsWith(`meta/organic/${org}/`)||m.storage_key.includes('..')||!Number.isInteger(m.size)||m.size<=0||m.size>maxVideoBytes)throw Error('Selecione um vídeo da biblioteca desta empresa.');
 const config=await loadR2Config(client);if(!config.ok)throw Error('Armazenamento indisponível.');
 return {id,title:row.data.title,metadata:m,url:buildPublicObjectUrl(config.config.publicUrl,m.storage_key),size:m.size as number,check:m.social_video_check as VideoCheck|undefined};
}
export async function socialVideoBytes(media:Awaited<ReturnType<typeof socialMedia>>){
 const response=await fetch(media.url,{redirect:'error',signal:AbortSignal.timeout(60000),cache:'no-store'});
 if(!response.ok||!response.body)throw Error('Não foi possível ler o vídeo armazenado.');
 const bytes=await boundedBytes(response.body,media.size);
 if(bytes.length!==media.size||(media.check&&createHash('sha256').update(bytes).digest('hex')!==media.check.sha256))throw Error('O arquivo mudou. Envie o vídeo novamente.');
 return bytes;
}
export async function checkStoredVideo(client:SupabaseClient,org:string,id:string){
 const media=await socialMedia(client,org,id);if(media.check?.version===1)return media.check;
 const check=await inspectVideo(await socialVideoBytes(media));
 const saved=await client.from('content_pipeline_items').update({metadata:{...media.metadata,social_video_check:check}}).eq('organization_id',org).eq('id',id);
 if(saved.error)throw Error('Não foi possível salvar o diagnóstico.');return check;
}
