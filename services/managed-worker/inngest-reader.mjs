// Fixed metadata queries against the v1.44.0 core API; never forwards client GraphQL.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const statuses=new Set(['COMPLETED','FAILED','CANCELLED','RUNNING','QUEUED','SKIPPED']);
const query='query ManagedMetadata($app: UUID!, $filter: RunsFilterV2!) { app(id:$app) { id name functions { id name appID } } runs(first:50,orderBy:[{field:QUEUED_AT,direction:DESC}],filter:$filter) { edges { node { id appID functionID status queuedAt startedAt endedAt } } pageInfo { hasNextPage } } }';
const bounded=(value,max=160)=>{if(typeof value!=='string'||value.length>max)throw Error('invalid_metadata');return value;};
export async function readInngestMetadata({endpoint,authorization,appId,now=Date.now(),request=fetch}){
 if(!uuid.test(appId))throw Error('invalid_binding');
 const url=new URL(endpoint);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/v0/gql'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','inngest'].includes(url.hostname))))throw Error('invalid_engine_endpoint');
 if(typeof authorization!=='string'||authorization.length<16||authorization.length>4096||/[\r\n]/.test(authorization))throw Error('invalid_engine_credential');
 const response=await request(url,{method:'POST',redirect:'error',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{app:appId,filter:{appIDs:[appId],from:new Date(now-86400000).toISOString(),until:new Date(now).toISOString()}}}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('engine_unavailable');
 const reader=response.body?.getReader();if(!reader)throw Error('invalid_engine_response');let bytes=0;const chunks=[];
 try{while(true){const result=await reader.read();if(result.done)break;bytes+=result.value.length;if(bytes>262144){await reader.cancel();throw Error('engine_response_too_large');}chunks.push(result.value);}}finally{reader.releaseLock();}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(body.errors?.length||!body.data?.app||body.data.app.id!==appId)throw Error('engine_scope_unconfirmed');
 const app=body.data.app;const edges=body.data.runs?.edges;
 if(!Array.isArray(app.functions)||app.functions.length>1000||!Array.isArray(edges)||edges.length>50)throw Error('invalid_engine_response');
 const functions=app.functions.map(f=>{if(f.appID!==appId||!uuid.test(f.id))throw Error('engine_scope_mismatch');return {id:f.id,name:bounded(f.name)};});
 const runs=edges.map(({node:r})=>{if(r.appID!==appId||!uuid.test(r.functionID)||!statuses.has(r.status))throw Error('engine_scope_mismatch');for(const time of [r.queuedAt,r.startedAt,r.endedAt])if(time!==null&&(!Number.isFinite(Date.parse(time))))throw Error('invalid_metadata');return {id:bounded(r.id,30),functionId:r.functionID,status:r.status,queuedAt:r.queuedAt,startedAt:r.startedAt,endedAt:r.endedAt};});
 return {app:{id:appId,name:bounded(app.name)},functions,runs,truncated:body.data.runs.pageInfo?.hasNextPage===true,observedAt:new Date(now).toISOString()};
}
