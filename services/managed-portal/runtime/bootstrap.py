"""One-time isolated homologation bootstrap. Run only in the fixed owned root."""
import base64, hashlib, hmac, json, os, pathlib, secrets, subprocess, sys, time
ROOT=pathlib.Path('/opt/connectyhub-managed-portal')
SOURCE=ROOT/'source'
COMPOSE=SOURCE/'services/managed-portal/runtime/compose.yml'
def run(args,body=None):
    p=subprocess.run(args,input=body,text=True,capture_output=True,timeout=180)
    if p.returncode: raise RuntimeError('Command failed: '+args[0]+' '+str(p.returncode))
    return p.stdout
def compose(*args):return run(['docker','compose','-f',str(COMPOSE),*args])
def sql(body):return run(['docker','compose','-f',str(COMPOSE),'exec','-T','database','psql','-At','-U','postgres','-d','managed_portal','-v','ON_ERROR_STOP=1'],body)
def write(path,value,mode=0o600):
    with path.open('x',encoding='utf8') as f:f.write(value)
    path.chmod(mode)
def token(secret,role):
    enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
    body=enc(b'{"alg":"HS256","typ":"JWT"}')+'.'+enc(json.dumps({'role':role,'aud':'authenticated','exp':1893456000}).encode())
    return body+'.'+enc(hmac.new(secret.encode(),body.encode(),hashlib.sha256).digest())
def main():
    assert os.getuid()==0 and ROOT.resolve()==ROOT and json.loads((ROOT/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
    assert not (ROOT/'initialized.json').exists(),'Already initialized'
    assert run(['findmnt','-n','-o','TARGET','--target',str(ROOT/'data')]).strip()==str(ROOT/'data'),'Persistent mount missing'
    sec=ROOT/'secrets';sec.mkdir(mode=0o700,exist_ok=True)
    if not (sec/'web.env').exists():
        values={k:secrets.token_hex(32) for k in ['database-password','auth-password','rest-password','jwt-secret','worker-seed','telemetry-key','object-key']}
        values['service-key']=token(values['jwt-secret'],'service_role');values['anon-key']=token(values['jwt-secret'],'anon')
        for name,value in values.items():write(sec/name,value,0o444)
        write(sec/'auth.env',f"DATABASE_URL=postgresql://supabase_auth_admin:{values['auth-password']}@127.0.0.1:5432/managed_portal?sslmode=disable\nGOTRUE_JWT_SECRET={values['jwt-secret']}\n")
        write(sec/'rest.env',f"PGRST_DB_URI=postgresql://authenticator:{values['rest-password']}@127.0.0.1:5432/managed_portal\nPGRST_JWT_SECRET={values['jwt-secret']}\n")
        write(sec/'web.env',f"PORTAL_SERVICE_KEY={values['service-key']}\nPORTAL_ANON_KEY={values['anon-key']}\nMANAGED_OBJECT_SIGNING_SECRET={values['object-key']}\n")
        write(sec/'owner-access.json',json.dumps({'url':'https://infraestrutura.connectyhub.com.br','email':'admin@infraestrutura.connectyhub.com.br','password':secrets.token_urlsafe(24)},indent=2))
    auth=(sec/'auth-password').read_text();rest=(sec/'rest-password').read_text()
    compose('up','-d','database')
    for _ in range(40):
        try:compose('exec','-T','database','pg_isready','-h','127.0.0.1','-U','postgres','-d','managed_portal');break
        except RuntimeError:time.sleep(1)
    if not (ROOT/'roles-applied').exists():
        sql(f"""begin;
create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create role authenticator login noinherit password '{rest}';
create role supabase_auth_admin login noinherit createrole password '{auth}';
grant anon,authenticated,service_role to authenticator;
grant connect on database managed_portal to authenticator,supabase_auth_admin;
grant create on database managed_portal to supabase_auth_admin;
alter role supabase_auth_admin set search_path=auth;
create schema auth authorization supabase_auth_admin;
commit;""")
        write(ROOT/'roles-applied','ok')
    compose('up','-d','auth')
    for _ in range(60):
        if sql("select count(*) from information_schema.tables where table_schema='auth' and table_name='users';").strip()=='1':break
        time.sleep(1)
    if not (ROOT/'schema-applied').exists():
        base=(SOURCE/'services/managed-rehearsal/lib.mjs').read_text().split('export const baseSql=`',1)[1].split('`;',1)[0]
        sql(base)
        for name in ['0150_managed_projects.sql','0151_managed_objects.sql','0152_managed_inngest_bindings.sql','0153_managed_persistent_alerts.sql']:
            sql((SOURCE/'supabase/migrations'/name).read_text())
        sql((SOURCE/'services/managed-portal/runtime/portal.sql').read_text())
        sql((SOURCE/'services/managed-portal/runtime/connected-source.sql').read_text())
        write(ROOT/'schema-applied','ok')
    compose('up','-d')
    # Credential stays inside the private container; stdout carries only the Auth UUID.
    owner=json.loads((sec/'owner-access.json').read_text())
    script="""const fs=require('fs');const key=process.env.PORTAL_SERVICE_KEY;const account=JSON.parse(fs.readFileSync(0,'utf8'));(async()=>{const r=await fetch('http://127.0.0.1:9999/admin/users',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password,email_confirm:true})});const data=await r.json();if(!r.ok||!data.id)process.exit(1);console.log(data.id)})()"""
    user=run(['docker','compose','-f',str(COMPOSE),'exec','-T','web','node','-e',script],json.dumps(owner)).strip()
    import uuid
    uuid.UUID(user)
    sql(f"insert into public.infrastructure_admins(user_id) values('{user}');")
    write(ROOT/'initialized.json',json.dumps({'owner_id':user,'created':time.time(),'database':'managed_portal'}))
    print(json.dumps({'initialized':True,'owner_created':True,'production_database_used':False}))
if __name__=='__main__':main()
