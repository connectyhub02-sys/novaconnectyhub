// Pure guards; importing this module never accesses Docker or modifies the host.
import {assert,hash} from './lib.mjs';
export function foreignSnapshot(containers,project){
 return Object.fromEntries(containers.filter(c=>c.Config.Labels?.['com.docker.compose.project']!==project).map(c=>[c.Id,hash(JSON.stringify({config:c.Config,host:c.HostConfig,mounts:c.Mounts,networks:c.NetworkSettings.Networks,started:c.State.StartedAt,status:c.State.Status,restarts:c.RestartCount}))]).sort(([a],[b])=>a.localeCompare(b)));
}
export function unchangedForeign(before,after){assert(JSON.stringify(before)===JSON.stringify(after),'Existing containers changed; stop only rehearsal and investigate, never revert production');}
export function namespaceGuard(containers,m){
 const db=containers.find(c=>c.Config.Labels?.['com.docker.compose.service']==='database');
 if(!containers.length)return;
 assert(db&&db.HostConfig.NetworkMode==='none','Missing isolated namespace owner');
 for(const c of containers){
  assert(c.Config.Labels?.['com.connectyhub.rehearsal.id']===m.id,'Missing rehearsal identity label');
  assert(c===db||c.HostConfig.NetworkMode===`container:${db.Id}`,'Foreign network namespace');
  assert(Object.keys(c.NetworkSettings.Networks??{}).every(n=>n==='none'),'Unexpected network interface');
  assert(!c.HostConfig.Privileged&&!c.HostConfig.CapAdd?.length&&c.HostConfig.CapDrop?.includes('ALL'),'Network capabilities not dropped');
  assert(!c.HostConfig.PidMode&&!c.HostConfig.Devices?.length&&!c.HostConfig.VolumesFrom?.length,'Host resources exposed');
 }
}
export function noForeignDependents(all,owned){
 const ids=new Set(owned.map(c=>c.Id));
 for(const c of all)if(!ids.has(c.Id))assert(!ids.has(c.HostConfig.NetworkMode?.replace(/^container:/,'')),'Foreign container attached to rehearsal namespace; manual investigation required');
}
