// Future Linux-only provisioning. No command runs on import. Never formats a supplied device.
import {mkdir,open,writeFile,lstat,readdir,statfs,unlink} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assert,noSymlink,json,uuid} from './lib.mjs';
export const imageBytes=2*1024**3;
export function checkAllocation(s){assert(s.isFile()&&s.nlink===1&&s.size===imageBytes&&s.blocks*512>=imageBytes,'Require exclusive fully preallocated 2 GiB file, not sparse');}
export function checkLoop(row,m){assert(row&&/^\/dev\/loop\d+$/.test(row.name)&&row.name===m.device&&row['back-file']===m.image&&Number(row.offset)===0&&Number(row.sizelimit)===0&&!Number(row.ro),'Loop identity mismatch');}
export function checkMount(row,m){assert(row&&row.target===m.mount&&row.source===m.device&&row.fstype==='ext4','Owned mount identity mismatch');for(const flag of ['rw','nodev','nosuid','noexec'])assert(row.options.split(',').includes(flag),'Mount protection missing');}
export function noOverlap(path,paths){path=resolve(path);for(const p of paths){const other=resolve(p);assert(path!==other&&!path.startsWith(other+sep)&&!other.startsWith(path+sep),'Storage overlaps an existing container mount or Docker root');}}
const rows=async(exec,file,args,key)=>JSON.parse(await exec(file,args))[key]??[];
async function loop(exec,m){const list=await rows(exec,'losetup',['--json','--list','--output','NAME,BACK-FILE,OFFSET,SIZELIMIT,RO'], 'loopdevices');const found=list.filter(r=>r.name===m.device||r['back-file']===m.image);assert(found.length===1,'Ambiguous loop allocation');checkLoop(found[0],m);}
export async function storageMarker(root){root=await noSymlink(root);const m=await json(join(root,'storage.json'));uuid(m.id);assert(m.kind==='managed-rehearsal-loop-v1'&&m.root===root&&basename(root)===`managed-storage-${m.id}`&&m.image===join(root,'data.ext4')&&m.mount===join(root,'mount'),'Invalid storage marker');const s=await lstat(m.image);checkAllocation(s);assert(s.ino===m.inode&&s.dev===m.fileDevice,'Backing file replaced');return m;}
export async function verifyStorage(exec,runRoot){
 const m=await storageMarker(dirname(dirname(runRoot)));assert(dirname(runRoot)===m.mount,'Fixture not inside owned mount');await loop(exec,m);
 const mounts=await rows(exec,'findmnt',['--json','--mountpoint',m.mount,'--output','TARGET,SOURCE,FSTYPE,OPTIONS'],'filesystems');assert(mounts.length===1,'Expected one exact mount');checkMount(mounts[0],m);
 assert((await readdir(m.mount)).every(n=>n===basename(runRoot)||n==='lost+found'),'Owned mount contains unrelated entries');return m;
}
export async function provisionStorage(exec,parent,{foreignMounts,dockerRoot}){
 assert(process.platform==='linux'&&process.getuid()===0,'Storage provisioning requires Linux root');parent=await noSymlink(parent);noOverlap(parent,[dockerRoot,...foreignMounts]);
 const p=await lstat(parent);assert(p.uid===0&&(p.mode&0o777)===0o700,'Storage parent must be root-owned 0700');
 const base=(await rows(exec,'findmnt',['--json','--target',parent,'--output','FSTYPE'],'filesystems'))[0];assert(['ext4','xfs'].includes(base?.fstype),'Require ordinary ext4/xfs backing filesystem');
 const fs=await statfs(parent);assert(Number(fs.bavail)*Number(fs.bsize)>=imageBytes+8*1024**3,'Backing filesystem needs 10 GiB free before allocation');
 const id=randomUUID(),root=join(parent,`managed-storage-${id}`),image=join(root,'data.ext4'),mount=join(root,'mount');await mkdir(root,{mode:0o700});await mkdir(mount,{mode:0o700});
 // Persist paths before side effects. Interrupted allocations remain for exact-scope review.
 await writeFile(join(root,'pending.json'),JSON.stringify({id,root,image,mount}),{mode:0o600,flag:'wx'});
 const f=await open(image,'wx',0o600);await f.close();await exec('fallocate',['--length',String(imageBytes),image]);const s=await lstat(image);checkAllocation(s);
 const device=(await exec('losetup',['--find','--show','--nooverlap',image])).trim();assert(/^\/dev\/loop\d+$/.test(device),'Invalid loop device');
 const m={kind:'managed-rehearsal-loop-v1',id,root,image,mount,device,inode:s.ino,fileDevice:s.dev};await writeFile(join(root,'storage.json'),JSON.stringify(m,null,2),{mode:0o600,flag:'wx'});await loop(exec,m);
 assert((await readdir(mount)).length===0,'Mountpoint not empty');
 // mkfs receives only the just-created, verified loop device, never caller input.
 // mke2fs otherwise discards free extents through the loop, punching holes in the preallocated file.
 await exec('mkfs.ext4',['-q','-F','-E','nodiscard,lazy_itable_init=0,lazy_journal_init=0',device],{timeout:120000});await loop(exec,m);checkAllocation(await lstat(image));
 await exec('mount',['--types','ext4','--options','nodev,nosuid,noexec',device,mount]);
 await writeFile(join(root,'provisioned.json'),JSON.stringify({id,capacity_bytes:imageBytes}),{mode:0o600});return m;
}
export async function releaseStorage(exec,root,{containerMounts,discard=false}){
 assert(process.platform==='linux'&&process.getuid()===0,'Storage release requires Linux root');const m=await storageMarker(root);noOverlap(m.root,containerMounts);await loop(exec,m);
 const mounts=await rows(exec,'findmnt',['--json','--list','--output','TARGET,SOURCE,FSTYPE,OPTIONS'],'filesystems');const attached=mounts.filter(r=>r.source===m.device||r.target===m.mount||r.target.startsWith(m.mount+'/'));assert(attached.length===1,'Unexpected mount references');checkMount(attached[0],m);
 // Never lazy/force unmount and never detach all. Busy mount fails closed.
 await exec('umount',['--',m.mount]);const after=await rows(exec,'findmnt',['--json','--list','--output','TARGET,SOURCE'],'filesystems');assert(!after.some(r=>r.source===m.device||r.target===m.mount),'Mount remains');await loop(exec,m);await exec('losetup',['--detach',m.device]);
 const loops=await rows(exec,'losetup',['--json','--list','--output','NAME,BACK-FILE'],'loopdevices');assert(!loops.some(r=>r['back-file']===m.image),'Loop release still pending');
 if(discard){const s=await lstat(m.image);assert(s.ino===m.inode&&s.dev===m.fileDevice&&s.nlink===1,'Backing file replaced before discard');await unlink(m.image);}
 await writeFile(join(root,'released.json'),JSON.stringify({id:m.id,image_preserved:!discard,evidence_inside_image:!discard}),{mode:0o600});return {image_preserved:!discard};
}
