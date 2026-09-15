"""Betel-only, authenticated durable HOLD inbox. No forwarding or business execution."""
import hashlib, hmac, json, os, pathlib, sqlite3, time, threading
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 2 * 1024 * 1024

class Rejected(Exception):
    def __init__(self, status, code): self.status, self.code = status, code

class Inbox:
    def __init__(self, path, secret, max_bytes=128*1024*1024, max_events=10000):
        if not isinstance(secret,str) or len(secret)<16: raise ValueError('Invalid private configuration')
        self.path, self.secret, self.max_bytes, self.max_events = str(path), secret.encode(), max_bytes, max_events
        with closing(self.connect()) as db:
            db.execute('pragma journal_mode=WAL')
            db.execute('create table if not exists owner(kind text primary key)')
            db.execute("insert or ignore into owner values('betel-webhook-held-v1')")
            assert db.execute('select kind from owner').fetchall()==[('betel-webhook-held-v1',)]
            db.execute('''create table if not exists events(
                receipt text primary key, identity text not null unique, sha256 text not null,
                body blob not null, headers text not null, received_at integer not null,
                state text not null check(state='held'))''')
            db.commit()
        if os.name!='nt':
            fd=os.open(str(pathlib.Path(self.path).parent),os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)

    def connect(self):
        db=sqlite3.connect(self.path,timeout=5)
        db.execute('pragma synchronous=FULL')
        db.execute('pragma busy_timeout=5000')
        return db

    def accept(self, body, headers, fault=None):
        if len(body)>MAX_BODY: raise Rejected(413,'body_too_large')
        signature=headers.get('x-connectyhub-signature','')
        expected='sha256='+hmac.new(self.secret,body,hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature,expected): raise Rejected(401,'invalid_signature')
        try: payload=json.loads(body)
        except (ValueError,UnicodeError): raise Rejected(400,'invalid_json')
        if not isinstance(payload,dict): raise Rejected(400,'invalid_envelope')
        event,instance=payload.get('event'),payload.get('instanceId')
        if not isinstance(event,str) or not event or len(event)>200 or not isinstance(instance,str) or not instance or len(instance)>200:
            raise Rejected(400,'invalid_envelope')
        # Secret is scoped only to the existing Betel endpoint. Never accept another org's key.
        digest=hashlib.sha256(body).hexdigest()
        event_id=payload.get('webhookEventId')
        if event_id is not None and (not isinstance(event_id,str) or len(event_id)>256): raise Rejected(400,'invalid_event_id')
        identity=json.dumps([event,instance,event_id or digest],separators=(',',':'))
        receipt='betel-inbox-'+hashlib.sha256(identity.encode()).hexdigest()
        safe_headers={'content-type':'application/json','x-connectyhub-signature':signature,
                      'x-connectyhub-event':event,'x-connectyhub-instance-id':instance}
        if event_id: safe_headers['x-connectyhub-webhook-event-id']=event_id
        db=self.connect()
        try:
            db.execute('begin immediate')
            existing=db.execute('select sha256 from events where identity=?',(identity,)).fetchone()
            if existing:
                if existing[0]!=digest: raise Rejected(409,'identity_conflict')
                db.rollback()
                return {'receipt':receipt,'state':'held','duplicate':True}
            count,size=db.execute('select count(*),coalesce(sum(length(body)),0) from events').fetchone()
            if count>=self.max_events or size+len(body)>self.max_bytes: raise Rejected(507,'capacity_reached')
            if fault: fault('before_insert')
            db.execute('insert into events values(?,?,?,?,?,?,?)',(receipt,identity,digest,body,json.dumps(safe_headers),int(time.time()*1000),'held'))
            if fault: fault('before_commit')
            db.commit()  # synchronous=FULL; ACK must follow this durability boundary.
            if fault: fault('after_commit')
            return {'receipt':receipt,'state':'held','duplicate':False}
        finally: db.close()

def serve(config):
    inbox=Inbox(config['database'],config['secret'])
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'
        def log_message(self,*args): pass
        def setup(self):
            super().setup(); self.connection.settimeout(15)
        def reply(self,status,value):
            encoded=json.dumps(value).encode();self.send_response(status)
            for k,v in {'content-type':'application/json','cache-control':'no-store','content-length':str(len(encoded)),'connection':'close'}.items(): self.send_header(k,v)
            self.end_headers();self.wfile.write(encoded);self.close_connection=True
        def do_GET(self): self.reply(404,{'error':'not_found'})
        def do_POST(self):
            try:
                if self.path!='/api/webhooks/connectyhub': raise Rejected(404,'not_found')
                if self.headers.get('transfer-encoding') or self.headers.get('content-encoding'): raise Rejected(415,'encoding_denied')
                lengths=self.headers.get_all('content-length',[])
                if len(lengths)!=1: raise Rejected(411,'length_required')
                try: length=int(lengths[0])
                except ValueError: raise Rejected(400,'invalid_length')
                if length<=0 or length>MAX_BODY: raise Rejected(413,'body_too_large')
                if len(self.headers.get_all('x-connectyhub-signature',[]))!=1: raise Rejected(401,'invalid_signature')
                body=self.rfile.read(length)
                if len(body)!=length: raise Rejected(400,'incomplete_body')
                result=inbox.accept(body,{k.lower():v for k,v in self.headers.items()})
            except Rejected as e: self.reply(e.status,{'error':e.code});return
            except Exception: self.reply(503,{'error':'persistence_unavailable'});return
            self.reply(202,result)
    host=config.get('host','127.0.0.1')
    if host not in ('127.0.0.1','172.18.0.1'): raise ValueError('Listener not approved')
    class BoundedServer(ThreadingHTTPServer):
        slots=threading.BoundedSemaphore(20)
        def process_request(self,request,address):
            if not self.slots.acquire(blocking=False): self.shutdown_request(request);return
            try: super().process_request(request,address)
            except Exception: self.slots.release();raise
        def process_request_thread(self,request,address):
            try: super().process_request_thread(request,address)
            finally: self.slots.release()
    server=BoundedServer((host,config.get('port',28112)),Handler)
    server.daemon_threads=True;server.serve_forever()

if __name__=='__main__':
    os.umask(0o077)
    serve(json.loads(pathlib.Path(os.environ['INBOX_CONFIG']).read_text()))
