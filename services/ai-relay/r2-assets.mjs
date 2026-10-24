import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';

/** Private payloads only. Authorization remains in the one-use relay ticket. */
export function createR2AssetStore({endpoint,bucket,accessKeyId,secretAccessKey,client}) {
 if(!bucket||(!client&&(!endpoint||!accessKeyId||!secretAccessKey)))throw new Error('Private R2 asset configuration is required');
 const s3=client??new S3Client({endpoint,region:'auto',forcePathStyle:true,
  credentials:{accessKeyId,secretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:3});
 const key=id=>{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new Error('Invalid asset id');
  return `studio-relay/assets/${id}.audio`;
 };
 const send=async command=>{
  try{return await s3.send(command,{abortSignal:AbortSignal.timeout(60000)});}
  catch(error){const safe=new Error('Private asset storage unavailable');
   if(error?.$metadata?.httpStatusCode===404||error?.name==='NoSuchKey')safe.code='ENOENT';
   throw safe;
  }
 };
 const store={
  async read(id){const result=await send(new GetObjectCommand({Bucket:bucket,Key:key(id)}));
   if(!Number.isSafeInteger(result.ContentLength)||result.ContentLength>20_000_000){result.Body?.destroy();throw new Error('Asset size limit');}
   return Buffer.from(await result.Body.transformToByteArray());
  },
  async stat(id){const result=await send(new HeadObjectCommand({Bucket:bucket,Key:key(id)}));return {size:result.ContentLength};},
  async exists(id){try{await store.stat(id);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}},
  async writeExclusive(id,bytes,mime){
   if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>20_000_000)throw new Error('Asset size limit');
   await send(new PutObjectCommand({Bucket:bucket,Key:key(id),Body:bytes,ContentLength:bytes.length,
    ContentType:mime,CacheControl:'private, no-store',IfNoneMatch:'*',Metadata:{sha256:createHash('sha256').update(bytes).digest('hex')}}));
  },
  async remove(id){await send(new DeleteObjectCommand({Bucket:bucket,Key:key(id)}));},
 };
 return store;
}
