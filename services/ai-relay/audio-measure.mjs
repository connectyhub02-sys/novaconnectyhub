import {spawn} from 'node:child_process';

export const studioMediaLimits = Object.freeze({bytes:20_000_000,seconds:1800,timeoutMs:30_000});
const formats='wav,mp3,ogg,flac,aac,mov,matroska';
const inputArgs=['-v','error','-protocol_whitelist','pipe','-format_whitelist',formats];

// Pipes are the only permitted protocol: a container cannot fetch a URL, read a
// local playlist/sidecar or open an arbitrary file on the VPS. No shell is used.
function run(binary,args,bytes,{limit,timeoutMs,collect=true}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let count=0,failed=false;const chunks=[];
    const fail=()=>{if(!failed){failed=true;child.kill('SIGKILL');}};
    const timer=setTimeout(fail,timeoutMs);
    child.stdout.on('data',chunk=>{count+=chunk.length;if(count>limit)fail();else if(collect)chunks.push(chunk);});
    // Never persist decoder diagnostics: they may include source metadata.
    child.stderr.on('data',()=>{});
    child.stdin.on('error',()=>{});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('audio_decoder_unavailable'));});
    child.on('close',code=>{clearTimeout(timer);if(failed||code!==0)reject(new Error('audio_invalid_or_limit'));else resolve(collect?Buffer.concat(chunks,count):count);});
    child.stdin.end(bytes);
  });
}

/** Duration is decoded sample count, not a client value or container header. */
export async function measureStudioAudio(bytes,{ffprobe='ffprobe',ffmpeg='ffmpeg',maxSeconds=studioMediaLimits.seconds,timeoutMs=studioMediaLimits.timeoutMs}={}) {
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>studioMediaLimits.bytes)throw new Error('audio_size_invalid');
  if(!Number.isFinite(maxSeconds)||maxSeconds<=0||maxSeconds>studioMediaLimits.seconds)throw new Error('audio_limit_invalid');
  const description=await run(ffprobe,[...inputArgs,'-show_entries','stream=codec_type,channels,sample_rate','-of','json','pipe:0'],bytes,{limit:65536,timeoutMs});
  const streams=JSON.parse(description.toString('utf8')).streams;
  if(!Array.isArray(streams)||streams.length!==1||streams[0].codec_type!=='audio')throw new Error('audio_single_stream_required');
  const channels=Number(streams[0].channels),sampleRate=Number(streams[0].sample_rate);
  if(!Number.isSafeInteger(channels)||channels<1||channels>8||!Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('audio_format_invalid');
  const decoded=await run(ffmpeg,[...inputArgs,'-xerror','-i','pipe:0','-map','0:a:0','-vn','-sn','-dn','-ac','1','-ar','16000','-f','s16le','pipe:1'],bytes,{limit:Math.floor(maxSeconds*32000),timeoutMs,collect:false});
  if(decoded<2||decoded%2)throw new Error('audio_empty');
  return {duration_seconds:decoded/32000,channels,sample_rate:sampleRate};
}
