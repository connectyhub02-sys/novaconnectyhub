"""Create a new bounded filesystem for this homologation; never accepts a device path."""
import json,os,pathlib,shutil,subprocess
R=pathlib.Path('/opt/connectyhub-managed-portal');image=R/'data.ext4';mount=R/'data';size=8*1024**3
def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
assert os.getuid()==0 and R.resolve()==R and json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
if not image.exists():
    assert shutil.disk_usage(R).free>size+12*1024**3
    with image.open('xb'):pass
    image.chmod(0o600);run('fallocate','--length',str(size),str(image))
    before=image.stat();assert before.st_size==size and before.st_blocks*512>=size and before.st_nlink==1
    run('mkfs.ext4','-q','-F','-E','nodiscard,lazy_itable_init=0,lazy_journal_init=0',str(image))
    after=image.stat();assert after.st_ino==before.st_ino and after.st_blocks*512>=size
    (R/'storage.json').write_text(json.dumps({'image':str(image),'inode':after.st_ino,'size':size}))
saved=json.loads((R/'storage.json').read_text());assert image.stat().st_ino==saved['inode'] and image.stat().st_size==saved['size'] and not image.is_symlink()
mount.mkdir(mode=0o700,exist_ok=True)
unit=run('systemd-escape','--path','--suffix=mount',str(mount));unitpath=pathlib.Path('/etc/systemd/system')/unit
body=f'[Unit]\nDescription=ConnectyHub isolated homologation storage\nBefore=connectyhub-managed-portal.service\n\n[Mount]\nWhat={image}\nWhere={mount}\nType=ext4\nOptions=loop,nodev,nosuid,noexec\n\n[Install]\nWantedBy=multi-user.target\n'
if unitpath.exists():assert unitpath.read_text()==body
else:unitpath.write_text(body)
run('systemctl','daemon-reload');run('systemctl','enable','--now',unit)
assert run('findmnt','-n','-o','TARGET','--target',str(mount))==str(mount)
for name,uid in [('postgres',70),('objects',1000)]:
    p=mount/name;p.mkdir(mode=0o700,exist_ok=True);os.chown(p,uid,uid)
print(json.dumps({'storage_bytes':size,'mount':str(mount),'persistent_mount_unit':unit}))
