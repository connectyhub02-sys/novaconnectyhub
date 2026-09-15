"""Local isolated HTTP contract, with synthetic bytes; never opens a production file."""
import importlib.util,pathlib,tempfile,threading,socketserver,http.client,socket,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('files',pathlib.Path(__file__).with_name('connected-files.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class UnixHTTP(http.client.HTTPConnection):
    def connect(self):self.sock=socket.socket(socket.AF_UNIX);self.sock.connect(self.host)
class SourceBoundaryTests(unittest.TestCase):
 def test_unrelated_hosts_and_redirects_are_not_file_sources(self):
    for url in ['http://127.0.0.1/secret','https://'+m.R2_HOST+'.evil.example/a','https://user:password@'+m.R2_HOST+'/a','https://'+m.R2_HOST+'/../a','https://'+m.R2_HOST+'/a?token=secret']:
        with patch.object(m,'lookup',return_value={'storage_registered':False,'public_url':url}),patch.object(m.urllib.request,'build_opener') as opener:
            with self.assertRaises(m.FileError) as failure:m.read_file('unused')
            self.assertEqual(failure.exception.status,404);opener.assert_not_called()
    self.assertIsNone(m.NoRedirect().redirect_request(None,None,None,None,None,None))
 def test_uuid_grammar_rejects_sql_before_execution(self):
    with patch.object(m.subprocess,'run') as run:
        with self.assertRaises(m.FileError):m.lookup("x';delete from lead_files;--")
        run.assert_not_called()
@unittest.skipUnless(hasattr(socket,'AF_UNIX'),'Unix socket runtime test runs in Linux')
class GatewayTests(unittest.TestCase):
 def test_access_and_methods(self):
    with tempfile.TemporaryDirectory() as folder:
        root=pathlib.Path(folder);(root/'secrets').mkdir();(root/'secrets/file-gateway-key').write_text('test-secret');m.ROOT=root
        calls=[]
        def read(file_id,head=False):calls.append(file_id);return (b'' if head else b'qa-file',7)
        original=m.read_file;m.read_file=read
        path=str(root/'gateway.sock')
        with socketserver.UnixStreamServer(path,m.Handler) as server:
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            def req(method,url,token='test-secret'):
                c=UnixHTTP(path);c.request(method,url,headers={'Authorization':'Bearer '+token});r=c.getresponse();result=(r.status,r.read(),r.getheader('Content-Length'));c.close();return result
            valid='/files/lead_files/3767a59b-389c-4a6c-bc0e-bfe2a4a5b321'
            self.assertEqual(req('GET',valid,'wrong')[0],401);self.assertEqual(calls,[])
            for url in ['/files/lead_files/../../secret',valid+'?url=http://localhost','/files/studio_assets/3767a59b-389c-4a6c-bc0e-bfe2a4a5b321']:
                self.assertEqual(req('GET',url)[0],404)
            self.assertEqual(calls,[])
            self.assertEqual(req('POST',valid)[0],405)
            self.assertEqual(req('GET',valid),(200,b'qa-file','7'))
            self.assertEqual(req('HEAD',valid),(200,b'','7'))
            server.shutdown();thread.join();m.read_file=original
if __name__=='__main__':unittest.main()
