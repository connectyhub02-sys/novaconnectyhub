import {mkdir,realpath,lstat,open,readFile,link,unlink,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {objectIds,MAX_OBJECT_BYTES} from './protocol.mjs';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=async path=>{try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function remove(path){try{await unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}}
// The root must be private and writable only by this service. Local administrators remain trusted.
export async function diskStore(directory){
 const requested=resolve(directory);await mkdir(requested,{recursive:true,mode:0o700});const root=await realpath(requested);
 if((await lstat(requested)).isSymbolicLink())throw Error('symlink_root');
 async function namespace(project,object){objectIds(project,object);let current=root;for(const part of [project,object]){current=join(current,part);await mkdir(current,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(current)!==current)throw Error('unsafe_namespace');}return current;}
 async function writeNew(path,bytes){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}
 async function syncDirectory(path){if(process.platform==='win32')return;const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
 return {
  async put(project,object,bytes,sha256){
   if(!Buffer.isBuffer(bytes)||bytes.length>MAX_OBJECT_BYTES||digest(bytes)!==sha256)throw Error('integrity_mismatch');
   const dir=await namespace(project,object),target=join(dir,'content'),dead=join(dir,'deleted');if(await exists(dead))throw Error('object_deleted');
   const temporary=join(dir,`pending-${randomUUID()}`);await writeNew(temporary,bytes);
   try{try{await link(temporary,target);}catch(e){if(e.code!=='EEXIST')throw e;if(digest(await readFile(target))!==sha256)throw Error('immutable_object_conflict');}
    if(await exists(dead)){await remove(target);throw Error('object_deleted');}await syncDirectory(dir);return {bytes:bytes.length,sha256};
   }finally{await remove(temporary);}
  },
  async get(project,object,sha256,bytes){const dir=await namespace(project,object);if(await exists(join(dir,'deleted')))throw Error('object_deleted');const file=join(dir,'content');const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_OBJECT_BYTES||stat.size!==bytes)throw Error('integrity_mismatch');const result=await readFile(file);if(digest(result)!==sha256||await exists(join(dir,'deleted')))throw Error('integrity_mismatch');return result;},
  async delete(project,object){const dir=await namespace(project,object);try{await writeNew(join(dir,'deleted'),Buffer.from('deleted\n'));}catch(e){if(e.code!=='EEXIST')throw e;}await syncDirectory(dir);await remove(join(dir,'content'));await syncDirectory(dir);return true;},
  async inventory(){const result=[];for(const project of await readdir(root)){for(const object of await readdir(join(root,project))){const dir=await namespace(project,object);if(await exists(join(dir,'deleted'))){result.push({project,object,deleted:true});continue;}const file=join(dir,'content');if(!await exists(file))continue;const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_OBJECT_BYTES)throw Error('unsafe_object');const data=await readFile(file);result.push({project,object,bytes:data.length,sha256:digest(data),deleted:false});}}return result;},
 };
}
// Copy into a separate private directory. Catalog metadata/ACLs still require their own DB backup.
export async function copyObjects(source,target){const manifest=await source.inventory();for(const row of manifest){if(row.deleted)await target.delete(row.project,row.object);else await target.put(row.project,row.object,await source.get(row.project,row.object,row.sha256,row.bytes),row.sha256);}return manifest;}
