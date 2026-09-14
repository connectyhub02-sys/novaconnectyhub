import {createServer} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {pathToFileURL} from 'node:url';
import {createUploadHandler} from './uploads.mjs';
import {createStudioAssetHandler} from './studio-assets.mjs';

/** Persistent process, behind TLS. No client receives an upstream credential. */
export function createAiRelay({controlUrl,secret,fetcher=fetch,Socket=WebSocket,maxSessions=16,maxSessionMs=900000,uploadsEnabled=false,uploadStateDir,studioAssetsEnabled=false,studioAssetDir}) {
  if(!secret||secret.length<32)throw new Error('AI_RELAY_SECRET must contain at least 32 characters');
  const control=new URL(controlUrl);
  if(control.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(control.hostname))throw new Error('Control requires HTTPS');
  if(!Number.isInteger(maxSessions)||maxSessions<1||!Number.isInteger(maxSessionMs)||maxSessionMs<1000)throw new Error('Invalid relay capacity');
  const upload=uploadsEnabled?createUploadHandler({control,secret,fetcher,stateDir:uploadStateDir}):null;
  const assets=studioAssetsEnabled?createStudioAssetHandler({control:new URL('/api/internal/studio/relay',control),secret,fetcher,stateDir:studioAssetDir}):null;
  const server=createServer(async(req,res)=>{
    if(assets&&await assets(req,res))return;
    if(upload&&await upload(req,res))return;
    const health=req.method==='GET'&&['/','/health'].includes(req.url);res.writeHead(health?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify(health?{ok:true,version:'2026-09-14',live:true,uploads:uploadsEnabled,studio_assets:studioAssetsEnabled}:{error:'not_found'}));
  });
  server.requestTimeout=120000;
  const sockets=new WebSocketServer({server,maxPayload:2_000_000,perMessageDeflate:false});
  const sessions=new Set();
  const closeServer=server.close.bind(server);
  server.close=(...args)=>{upload?.close();assets?.close();for(const close of sessions)close();return closeServer(...args);};
  sockets.on('connection',client=>{
    if(sessions.size>=maxSessions){client.close(1013,'Capacidade temporariamente esgotada');return;}
    let upstream,id,ready=false,music=false,closed=false,dispatched=false,incomplete=false,sequence=0,turn=0,audioSeconds=0;
    let latestUsage,queue=Promise.resolve(),pendingBytes=0,timer;
    const call=async(payload)=>{
      const response=await fetcher(control,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Session accounting unavailable');return response.json();
    };
    const report=async(action)=>call({id,action,sequence:++sequence,turn,...(music?{audio_seconds:audioSeconds}:latestUsage?{usage:latestUsage}:{}),dispatched,incomplete:music?false:incomplete});
    const end=()=>{
      if(closed)return;closed=true;sessions.delete(end);clearTimeout(authTimer);clearTimeout(durationTimer);clearInterval(timer);
      if(upstream)upstream.close();if(client.readyState===WebSocket.OPEN)client.close(1000,'Sessão encerrada');
      if(id)queue=queue.catch(()=>undefined).then(()=>report('close')).catch(()=>undefined);
    };
    sessions.add(end);
    const authTimer=setTimeout(()=>client.close(1008,'Autenticação necessária'),10000);
    const durationTimer=setTimeout(end,maxSessionMs);
    client.on('message',data=>{
      pendingBytes+=data.length;if(pendingBytes>4_000_000){end();return;}
      queue=queue.then(async()=>{
        pendingBytes-=data.length;if(closed)return;
        const message=JSON.parse(data.toString());
        if(!id) {
          if(typeof message.id!=='string'||typeof message.access_key!=='string')throw new Error('Invalid session');
          const session=await call({action:'connect',id:message.id,access_key:message.access_key});
          id=session.id;music=session.music;clearTimeout(authTimer);
          const endpoint=music?'v1alpha.GenerativeService.BidiGenerateMusic':'v1beta.GenerativeService.BidiGenerateContent';
          upstream=new Socket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${endpoint}`,{headers:{'x-goog-api-key':session.api_key},maxPayload:16_000_000,perMessageDeflate:false});
          upstream.on('open',()=>{upstream.send(JSON.stringify({setup:session.setup}));});
          upstream.on('message',raw=>{
            pendingBytes+=raw.length;if(pendingBytes>20_000_000){end();return;}
            queue=queue.then(async()=>{
              pendingBytes-=raw.length;if(closed)return;
              const event=JSON.parse(raw.toString());
              if(event.setupComplete)ready=true;
              if(event.usageMetadata)latestUsage=event.usageMetadata;
              const content=event.serverContent??{};
              if(music)for(const chunk of content.audioChunks??[])audioSeconds+=Buffer.from(chunk.data??'','base64').length/(48000*2*2);
              if(event.usageMetadata||music&&content.audioChunks?.length)await report('checkpoint');
              if(content.turnComplete){incomplete=!latestUsage;turn++;latestUsage=undefined;}
              const safe={};for(const field of ['setupComplete','serverContent','toolCall','toolCallCancellation','goAway','filteredPrompt'])if(event[field]!==undefined)safe[field]=event[field];
              if(client.readyState===WebSocket.OPEN){if(client.bufferedAmount>4_000_000)throw new Error('Slow consumer');client.send(JSON.stringify(safe));}
            }).catch(end);
          });
          upstream.on('error',end);upstream.on('close',end);
          timer=setInterval(()=>{queue=queue.then(()=>closed?undefined:report('checkpoint')).catch(end);},5000);
          return;
        }
        const allowed=music?['clientContent','musicGenerationConfig','playbackControl']:['clientContent','realtimeInput','toolResponse'];
        if(!ready||Object.keys(message).length!==1||!allowed.includes(Object.keys(message)[0]))throw new Error('Invalid frame');
        if(upstream.bufferedAmount>4_000_000)throw new Error('Upstream unavailable');
        dispatched=true;incomplete=true;upstream.send(JSON.stringify(message));
      }).catch(end);
    });
    client.on('error',end);client.on('close',end);
  });
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=createAiRelay({controlUrl:process.env.AI_RELAY_CONTROL_URL,secret:process.env.AI_RELAY_SECRET,uploadsEnabled:process.env.AI_UPLOAD_RELAY_ENABLED==='true',uploadStateDir:process.env.AI_UPLOAD_STATE_DIR,studioAssetsEnabled:process.env.STUDIO_ASSETS_ENABLED==='true',studioAssetDir:process.env.STUDIO_ASSET_DIR});
  server.listen(Number(process.env.PORT??3120),'0.0.0.0');
  for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close());
}
