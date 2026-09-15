"""Private Unix-socket file reader. Fixed organization and bucket; no writes."""
import hmac,http.server,json,os,pathlib,re,socketserver,subprocess,urllib.request,urllib.error,urllib.parse,importlib.util
ROOT=pathlib.Path('/opt/connectyhub-managed-portal')
SOCKET=pathlib.Path('/run/connectyhub-managed-files/gateway.sock')
ORG='c5b8e371-b60d-4a17-94da-0a93e69a285d'
MAX_BYTES=20_000_000
R2_HOST='pub-9f5b2802265a4ee2b52bc4e080f3941e.r2.dev'
PATH=re.compile(r'^/files/lead_files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')

class FileError(Exception):
    def __init__(self,status):self.status=status

def lookup(file_id):
    # The only interpolated input has already passed the UUID-only path grammar.
    if not PATH.fullmatch('/files/lead_files/'+file_id):raise FileError(404)
    sql=f"""begin read only;set local statement_timeout='8s';set local lock_timeout='1s';
    select jsonb_build_object('key',f.object_key,'bytes',f.byte_size,'public_url',f.public_url,
    'storage_registered',f.metadata->>'storage_bucket'='lead-archive' and exists(select 1 from storage.objects o where o.bucket_id='lead-archive' and o.name=f.object_key)) from public.lead_files f
    where f.id='{file_id}' and f.organization_id='{ORG}';rollback;"""
    r=subprocess.run(['docker','exec','-i','supabase-db','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,timeout=12)
    if r.returncode:raise FileError(503)
    if not r.stdout.strip():raise FileError(404)
    item=json.loads(r.stdout)
    if not isinstance(item['key'],str) or not item['key'] or any(p in ('.','..') for p in item['key'].split('/')):raise FileError(404)
    if item.get('bytes') is not None and (item['bytes']<0 or item['bytes']>MAX_BYTES):raise FileError(413)
    return item

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def read_file(file_id,head=False):
    item=lookup(file_id)
    if item['storage_registered']:
        values=dict(s.split('=',1) for s in pathlib.Path('/opt/connectyhub/supabase/.env').read_text().splitlines() if '=' in s and not s.startswith('#'))
        key=values['SERVICE_ROLE_KEY'].strip().strip('"')
        url='https://supabase.connectyhub.com.br/storage/v1/object/authenticated/lead-archive/'+urllib.parse.quote(item['key'],safe='/')
        headers={'Authorization':'Bearer '+key,'apikey':key}
    else:
        url=item.get('public_url') or '';parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!='https' or parsed.netloc!=R2_HOST or parsed.query or parsed.fragment or not parsed.path.startswith('/') or any(p in ('.','..') for p in urllib.parse.unquote(parsed.path).split('/')):raise FileError(404)
        spec=importlib.util.spec_from_file_location('private_r2_reader',pathlib.Path(__file__).with_name('connected-r2.py'))
        r2=importlib.util.module_from_spec(spec);spec.loader.exec_module(r2)
        req=r2.request(ROOT/'secrets/r2-read.json',item['key'],'HEAD' if head else 'GET')
    if item['storage_registered']:req=urllib.request.Request(url,method='HEAD' if head else 'GET',headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=15) as r:
            size=int(r.headers.get('Content-Length','0'))
            if size>MAX_BYTES:raise FileError(413)
            data=b'' if head else r.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES:raise FileError(413)
            return data,size if head else len(data)
    except urllib.error.HTTPError as e:
        raise FileError(404 if e.code in (400,404) else 503) from None

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def setup(self):
        super().setup();self.connection.settimeout(5)
    def serve(self,head=False):
        try:
            secret=(ROOT/'secrets/file-gateway-key').read_text().strip()
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+secret):raise FileError(401)
            match=PATH.fullmatch(self.path)
            if not match:raise FileError(404)
            data,size=read_file(match.group(1),head)
            self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(size));self.send_header('Cache-Control','private, no-store');self.end_headers()
            if not head:self.wfile.write(data)
        except Exception as e:
            self.send_response(e.status if isinstance(e,FileError) else 503);self.send_header('Content-Length','0');self.end_headers()
    def do_GET(self):self.serve()
    def do_HEAD(self):self.serve(True)
    def do_POST(self):self.send_error(405)

def main():
    assert os.getuid()==0 and json.loads((ROOT/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
    if SOCKET.exists():
        assert SOCKET.is_socket() and SOCKET.stat().st_uid==0
        SOCKET.unlink()
    with socketserver.UnixStreamServer(str(SOCKET),Handler) as server:
        os.chown(SOCKET,0,1000);os.chmod(SOCKET,0o660)
        server.serve_forever()
if __name__=='__main__':main()
