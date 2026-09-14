import {describe,it,expect} from 'vitest';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createUploadHandler} from '../services/ai-relay/uploads.mjs';

async function fixture(options={}) {
  const stateDir=await mkdtemp(join(tmpdir(),'connecty-upload-test-'));
  const id=randomUUID(),ticket='a'.repeat(64),calls=[];
  let confirming=options.confirming!==false;
  const fetcher=async(url,request)=>{
    calls.push({url:String(url),...request});
    if(String(url)==='https://control.example/internal') {
      expect(request.headers.Authorization).toBe('Bearer control-secret');
      const command=JSON.parse(request.body);
      if(command.action==='upload.connect')return Response.json({id,organization_id:'wallet',size_bytes:3,mime_type:'text/plain',display_name:'Synthetic',api_key:'provider-secret'},{status:options.ticketStatus??200});
      if(command.action==='upload.complete')return Response.json(confirming?{id,status:'active'}:{error:'temporary'},{status:confirming?200:503});
      return Response.json({ok:true});
    }
    if(request.headers['X-Goog-Upload-Command']==='start')return new Response(null,{headers:{'x-goog-upload-url':options.target??'https://generativelanguage.googleapis.com/upload/resume?token=fake'}});
    expect(request.body.equals(Buffer.from('abc'))).toBe(true);
    expect(request.headers['x-goog-api-key']).toBeUndefined();
    return Response.json({file:{name:'files/synthetic'}});
  };
  let handler=createUploadHandler({control:'https://control.example/internal',secret:'control-secret',fetcher,stateDir});
  const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}/uploads/${id}`;
  const send=(headers={})=>fetch(url,{method:'PUT',headers:{Authorization:`Bearer ${ticket}`,'Content-Type':'text/plain',...headers},body:'abc'});
  return {id,url,ticket,calls,stateDir,send,confirm:()=>{confirming=true;},restart:async()=>{handler.close();handler=createUploadHandler({control:'https://control.example/internal',secret:'control-secret',fetcher,stateDir});await handler.flush();},cleanup:async()=>{handler.close();await new Promise(resolve=>server.close(resolve));await rm(stateDir,{recursive:true,force:true});}};
}
describe('VPS customer upload transport',()=>{
  it('allows browser preflight without consuming a ticket and rejects more than 20 MB before provider access',async()=>{
    const f=await fixture();try{
      const preflight=await fetch(f.url,{method:'OPTIONS',headers:{Origin:'https://customer.example','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}});
      expect(preflight.status).toBe(204);expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');expect(f.calls).toHaveLength(0);
      const status=await new Promise((resolve,reject)=>{
        const req=httpRequest(f.url,{method:'PUT',headers:{Authorization:`Bearer ${f.ticket}`,'Content-Length':'20000001','Content-Type':'text/plain'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
        req.on('error',reject);req.end();
      });
      expect(status).toBe(413);expect(f.calls).toHaveLength(0);
    }finally{await f.cleanup();}
  });
  it('forwards synthetic bytes only to the fixed provider and exposes no credentials',async()=>{
    const f=await fixture();try {
      const response=await f.send();expect(response.status).toBe(201);
      expect(await response.json()).toEqual({id:f.id,status:'active'});
      expect(f.calls).toHaveLength(4);
      expect(f.calls[1].headers['x-goog-api-key']).toBe('provider-secret');
      expect(await readdir(f.stateDir)).toEqual([]);
    }finally{await f.cleanup();}
  });
  it('rejects a foreign resumable URL before sending file bytes',async()=>{
    const f=await fixture({target:'https://attacker.example/upload/steal'});try{
      const response=await f.send();expect(response.status).toBe(502);
      expect(f.calls.some(c=>c.url.includes('attacker'))).toBe(false);
      expect(JSON.stringify(await response.json())).not.toMatch(/secret|token=fake/);
      expect(JSON.parse(f.calls.at(-1).body).action).toBe('upload.fail');
    }finally{await f.cleanup();}
  });
  it('does not contact the provider with a rejected disposable ticket',async()=>{
    const f=await fixture({ticketStatus:401});try{
      expect((await f.send()).status).toBe(401);expect(f.calls).toHaveLength(1);
    }finally{await f.cleanup();}
  });
  it('checks declared metadata before forwarding bytes',async()=>{
    const f=await fixture();try{
      expect((await f.send({'Content-Type':'application/pdf'})).status).toBe(422);
      expect(f.calls.every(c=>c.url==='https://control.example/internal')).toBe(true);
    }finally{await f.cleanup();}
  });
  it('recovers confirmation after restart without re-uploading or retaining private content',async()=>{
    const f=await fixture({confirming:false});try{
      const response=await f.send();expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('upload_confirmation_pending');
      const jobs=await readdir(f.stateDir);expect(jobs).toEqual([`${f.id}.json`]);
      const persisted=await readFile(join(f.stateDir,jobs[0]),'utf8');
      expect(JSON.parse(persisted)).toMatchObject({id:f.id,name:'files/synthetic'});
      expect(persisted).not.toMatch(/abc|secret|access_key/);
      const providerCalls=f.calls.filter(c=>c.url.includes('googleapis')).length;
      f.confirm();await f.restart();
      expect(await readdir(f.stateDir)).toEqual([]);
      expect(f.calls.filter(c=>c.url.includes('googleapis'))).toHaveLength(providerCalls);
      expect(f.calls.some(c=>JSON.parse(typeof c.body==='string'?c.body:'{}').action==='upload.fail')).toBe(false);
    }finally{await f.cleanup();}
  });
});
