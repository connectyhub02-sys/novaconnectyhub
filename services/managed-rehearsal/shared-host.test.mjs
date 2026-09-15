import {test} from 'node:test';
import assert from 'node:assert/strict';
import {foreignSnapshot,unchangedForeign,namespaceGuard,noForeignDependents} from './shared-host.mjs';
import {checkAllocation,checkLoop,checkMount,noOverlap,imageBytes,provisionStorage,releaseStorage} from './storage.mjs';
const m={id:'test',project:'rehearsal'};
function container(id,service,project='rehearsal'){return {Id:id,Config:{Env:['FICTIONAL_PASSWORD=must-not-appear'],Labels:{'com.docker.compose.project':project,'com.docker.compose.service':service,'com.connectyhub.rehearsal.id':'test'}},HostConfig:{NetworkMode:service==='database'?'none':'container:db',CapDrop:['ALL']},Mounts:[],NetworkSettings:{Networks:{}},State:{StartedAt:'time',Status:'running'},RestartCount:0};}
test('shared namespace refuses host/bridge/foreign namespace/capability escalation',()=>{
 const db=container('db','database'),api=container('api','rest');namespaceGuard([db,api],m);
 for(const mode of ['host','bridge','container:production']){api.HostConfig.NetworkMode=mode;assert.throws(()=>namespaceGuard([db,api],m),/namespace/);}
 api.HostConfig.NetworkMode='container:db';api.HostConfig.CapAdd=['NET_ADMIN'];assert.throws(()=>namespaceGuard([db,api],m),/capabilities/);delete api.HostConfig.CapAdd;
 api.NetworkSettings.Networks={production:{}};assert.throws(()=>namespaceGuard([db,api],m),/interface/);api.NetworkSettings.Networks={};
 api.Config.Labels['com.connectyhub.rehearsal.id']='other';assert.throws(()=>namespaceGuard([db,api],m),/identity/);
 assert.throws(()=>namespaceGuard([api],m),/owner/);
});
test('foreign snapshot excludes own lifecycle, never exposes secrets, detects production changes',()=>{
 const prod=container('production','database','other-project'),db=container('db','database');const before=foreignSnapshot([prod,db],m.project);
 assert.doesNotMatch(JSON.stringify(before),/PASSWORD|must-not-appear/);unchangedForeign(before,foreignSnapshot([db,prod,container('api','rest')],m.project));
 prod.RestartCount++;assert.throws(()=>unchangedForeign(before,foreignSnapshot([prod],m.project)),/Existing containers changed/);
 assert.throws(()=>unchangedForeign(before,{}),/Existing containers changed/);
});
test('cleanup refuses foreign consumers of the owned namespace',()=>{
 const db=container('db','database'),prod=container('other','rest','production');assert.throws(()=>noForeignDependents([db,prod],[db]),/Foreign container attached/);
 prod.HostConfig.NetworkMode='bridge';noForeignDependents([db,prod],[db]);
});
test('storage bound rejects sparse files, foreign loops, offsets, wrong mounts and productive overlap',()=>{
 const allocation={isFile:()=>true,nlink:1,size:imageBytes,blocks:imageBytes/512};checkAllocation(allocation);
 for(const patch of [{blocks:1},{size:imageBytes*2},{nlink:2}])assert.throws(()=>checkAllocation({...allocation,...patch}),/preallocated/);
 const s={device:'/dev/loop9',image:'/private/data.ext4',mount:'/private/mount'},row={name:s.device,'back-file':s.image,offset:0,sizelimit:0,ro:0};checkLoop(row,s);
 for(const patch of [{name:'/dev/sda'},{'back-file':'/production'},{offset:512},{ro:1}])assert.throws(()=>checkLoop({...row,...patch},s),/identity/);
 const mount={target:s.mount,source:s.device,fstype:'ext4',options:'rw,nodev,nosuid,noexec'};checkMount(mount,s);
 assert.throws(()=>checkMount({...mount,target:'/production'},s),/identity/);assert.throws(()=>checkMount({...mount,options:'rw'},s),/protection/);
 noOverlap('/safe/test',['/production/data','/var/lib/docker']);assert.throws(()=>noOverlap('/production',['/production/data']),/overlaps/);assert.throws(()=>noOverlap('/production/data/sub',['/production/data']),/overlaps/);
});
test('Windows storage operations refuse before invoking commands',{skip:process.platform==='linux'},async()=>{
 let calls=0;const cmd=()=>{calls++;throw Error('unexpected command');};await assert.rejects(provisionStorage(cmd,'/unused',{}),/Linux root/);await assert.rejects(releaseStorage(cmd,'/unused',{}),/Linux root/);assert.equal(calls,0);
});
