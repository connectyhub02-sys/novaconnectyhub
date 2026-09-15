"""Sign only GET/HEAD for the existing R2 object store; no public ACL changes."""
import datetime,hashlib,hmac,json,pathlib,re,urllib.parse,urllib.request
def request(config_path,object_key,method):
    if method not in ('GET','HEAD'):raise ValueError('Read only')
    config=json.loads(pathlib.Path(config_path).read_text())
    endpoint=urllib.parse.urlsplit(config['R2_ENDPOINT'].rstrip('/'))
    public=urllib.parse.urlsplit(config['R2_PUBLIC_URL'].rstrip('/'))
    if endpoint.scheme!='https' or not re.fullmatch(r'[a-f0-9]{32}\.r2\.cloudflarestorage\.com',endpoint.netloc) or endpoint.path or endpoint.query or endpoint.fragment:raise ValueError('Invalid storage endpoint')
    if public.scheme!='https' or public.netloc!='pub-9f5b2802265a4ee2b52bc4e080f3941e.r2.dev':raise ValueError('Wrong object store')
    now=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');day=now[:8]
    path='/'+urllib.parse.quote(config['R2_BUCKET'],safe='')+'/'+urllib.parse.quote(object_key,safe='/')
    empty=hashlib.sha256(b'').hexdigest();signed='host;x-amz-content-sha256;x-amz-date'
    canonical_headers=f'host:{endpoint.netloc}\nx-amz-content-sha256:{empty}\nx-amz-date:{now}\n'
    canonical='\n'.join([method,path,'',canonical_headers,signed,empty]);scope=day+'/auto/s3/aws4_request'
    to_sign='\n'.join(['AWS4-HMAC-SHA256',now,scope,hashlib.sha256(canonical.encode()).hexdigest()])
    key=('AWS4'+config['R2_SECRET_ACCESS_KEY']).encode()
    for value in [day,'auto','s3','aws4_request']:key=hmac.new(key,value.encode(),hashlib.sha256).digest()
    signature=hmac.new(key,to_sign.encode(),hashlib.sha256).hexdigest()
    headers={'Authorization':f"AWS4-HMAC-SHA256 Credential={config['R2_ACCESS_KEY_ID']}/{scope}, SignedHeaders={signed}, Signature={signature}",'x-amz-content-sha256':empty,'x-amz-date':now}
    return urllib.request.Request('https://'+endpoint.netloc+path,method=method,headers=headers)
