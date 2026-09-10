import {describe,it,expect} from 'vitest';
import {EventEmitter,once} from 'node:events';
import {WebSocket} from 'ws';
import {createAiRelay} from '../services/ai-relay/server.mjs';

async function fixture(rejectCheckpoint=false){
  const calls=[],frames=[];let getUpstream;
  class ProviderSocket extends EventEmitter {
    bufferedAmount=0;
    constructor(url,options){super();getUpstream=()=>this;expect(url).toMatch(/^wss:\/\/generativelanguage\.googleapis\.com\/ws\//);expect(options.headers['x-goog-api-key']).toBe('upstream-secret');queueMicrotask(()=>this.emit('open'));}
    send(raw){const frame=JSON.parse(raw);frames.push(frame);if(frame.setup)queueMicrotask(()=>this.emit('message',Buffer.from('{"setupComplete":{}}')));}
    close(){this.emit('close');}
  }
  const server=createAiRelay({controlUrl:'http://127.0.0.1/control',secret:'s'.repeat(32),Socket:ProviderSocket,fetcher:async(_url,request)=>{
    const body=JSON.parse(request.body);calls.push(body);
    if(body.action==='connect')return Response.json({id:'session',api_key:'upstream-secret',setup:{model:'models/private'},music:false});
    if(body.action==='checkpoint'&&rejectCheckpoint)return Response.json({error:'insufficient'},{status:402});
    return Response.json({ok:true});
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const client=new WebSocket(`ws://127.0.0.1:${server.address().port}`),messages=[];
  client.on('message',raw=>messages.push(JSON.parse(raw.toString())));
  await once(client,'open');const ready=once(client,'message');client.send(JSON.stringify({id:'session',access_key:'ticket'}));await ready;
  return {client,server,calls,frames,messages,provider:()=>getUpstream(),cleanup:async()=>{if(client.readyState!==WebSocket.CLOSED){const close=once(client,'close');client.close();await close;}await new Promise(resolve=>server.close(resolve));}};
}
describe('Live relay keeps credentials and billing on the server',()=>{
  it('meters provider usage before delivering output and removes private usage metadata',async()=>{
    const f=await fixture();try{
      const received=once(f.client,'message');
      f.provider().emit('message',Buffer.from(JSON.stringify({usageMetadata:{promptTokenCount:5,responseTokenCount:3},serverContent:{modelTurn:{parts:[{text:'Olá'}]},turnComplete:true},modelVersion:'private'})));
      await received;
      expect(f.calls.map(c=>c.action)).toEqual(['connect','checkpoint']);
      expect(f.calls[1].usage.responseTokenCount).toBe(3);
      expect(JSON.stringify(f.messages)).not.toMatch(/secret|modelVersion|usageMetadata|TokenCount/);
      expect(f.messages[1].serverContent.modelTurn.parts[0].text).toBe('Olá');
    }finally{await f.cleanup();}
  });
  it('closes and withholds output when the wallet cannot renew the reservation',async()=>{
    const f=await fixture(true);try{
      const closed=once(f.client,'close');
      f.provider().emit('message',Buffer.from(JSON.stringify({usageMetadata:{promptTokenCount:5,responseTokenCount:3},serverContent:{modelTurn:{parts:[{text:'Paid result'}]}}})));
      await closed;
      expect(f.messages).toHaveLength(1);expect(f.calls.some(c=>c.action==='checkpoint')).toBe(true);
    }finally{await f.cleanup();}
  });
  it('rejects client attempts to replace the fixed model or setup',async()=>{
    const f=await fixture();try{
      const closed=once(f.client,'close');f.client.send(JSON.stringify({setup:{model:'models/other'}}));await closed;
      expect(f.frames).toEqual([{setup:{model:'models/private'}}]);
    }finally{await f.cleanup();}
  });
});
