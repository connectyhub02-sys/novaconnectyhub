from pathlib import Path
import hashlib,os,shutil,subprocess
p=Path('/opt/vision/app/deploy-vision-admin.py');s=p.read_text()
old="if __name__ == '__main__':\n    main()"
new="if __name__ == '__main__':\n    import fcntl\n    with open('/opt/vision/app/release.lock', 'a') as deployment_lock:\n        fcntl.flock(deployment_lock, fcntl.LOCK_EX)\n        main()"
if new not in s:
 assert s.count(old)==1,'Unexpected deploy entry point'
 backup=Path('/opt/connectyhub/maintenance/artifact-retention-20261026');backup.mkdir(mode=0o700,parents=True,exist_ok=True)
 shutil.copy2(p,backup/'vision-deploy-before.py')
 temporary=p.with_suffix('.next.py');temporary.write_text(s.replace(old,new));os.chmod(temporary,p.stat().st_mode&0o777)
 subprocess.run(['python3','-m','py_compile',str(temporary)],check=True);temporary.replace(p)
print('Deployment coordination lock installed; services unchanged.')
