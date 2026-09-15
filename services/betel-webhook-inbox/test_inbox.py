import hashlib,hmac,json,os,pathlib,sqlite3,subprocess,sys,tempfile,unittest
from inbox import Inbox,Rejected
from contextlib import closing

SECRET='fixture-only-betel-secret-not-production'
def envelope(event_id='test-1',text='synthetic'):
    body=json.dumps({'event':'message','instanceId':'fixture','webhookEventId':event_id,'data':{'text':text}}).encode()
    return body,{'x-connectyhub-signature':'sha256='+hmac.new(SECRET.encode(),body,hashlib.sha256).hexdigest()}

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=pathlib.Path(self.tmp.name)/'inbox.sqlite'
    def tearDown(self):self.tmp.cleanup()
    def test_duplicate_survives_restart(self):
        first=Inbox(self.path,SECRET).accept(*envelope())
        second=Inbox(self.path,SECRET).accept(*envelope())
        self.assertEqual(first['receipt'],second['receipt']);self.assertTrue(second['duplicate'])
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('select count(*),state from events').fetchone(),(1,'held'))
            self.assertEqual(db.execute('select body from events').fetchone()[0],envelope()[0])
    def test_unauthorized_never_persists(self):
        inbox=Inbox(self.path,SECRET)
        with self.assertRaises(Rejected) as error:inbox.accept(envelope()[0],{'x-connectyhub-signature':'sha256=invalid'})
        self.assertEqual(error.exception.status,401)
        with closing(inbox.connect()) as db:self.assertEqual(db.execute('select count(*) from events').fetchone()[0],0)
    def test_conflict_not_silently_dropped(self):
        inbox=Inbox(self.path,SECRET);inbox.accept(*envelope())
        with self.assertRaises(Rejected) as error:inbox.accept(*envelope(text='changed'))
        self.assertEqual(error.exception.status,409)
    def test_storage_cap_fail_closed(self):
        inbox=Inbox(self.path,SECRET,max_events=1);inbox.accept(*envelope())
        with self.assertRaises(Rejected) as error:inbox.accept(*envelope('second'))
        self.assertEqual(error.exception.status,507)
        self.assertTrue(inbox.accept(*envelope())['duplicate'])
    def test_kill_at_durability_boundaries(self):
        # Process death before persistence, midtransaction, and after commit before ACK.
        for point,expected in [('before_insert',0),('before_commit',0),('after_commit',1)]:
            with self.subTest(point=point):
                path=pathlib.Path(self.tmp.name)/(point+'.sqlite')
                code="from test_inbox import *; Inbox(sys.argv[1],SECRET).accept(*envelope(),fault=lambda p: os._exit(77) if p==sys.argv[2] else None)"
                result=subprocess.run([sys.executable,'-c',code,str(path),point],cwd=pathlib.Path(__file__).parent)
                self.assertEqual(result.returncode,77)
                with closing(sqlite3.connect(path)) as db:self.assertEqual(db.execute('select count(*) from events').fetchone()[0],expected)
                receipt=Inbox(path,SECRET).accept(*envelope());self.assertEqual(receipt['duplicate'],bool(expected))
                with closing(sqlite3.connect(path)) as db:self.assertEqual(db.execute('select count(*) from events').fetchone()[0],1)
if __name__=='__main__':unittest.main()
