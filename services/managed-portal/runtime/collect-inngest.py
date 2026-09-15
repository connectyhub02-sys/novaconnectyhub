"""Read the existing engine through fixed queries; never register or execute work."""
import base64,datetime,json,pathlib,urllib.request,uuid
URL='https://inngest.connectyhub.com.br/v0/gql'
APP_ID='f4b90922-c8bc-54b2-958c-48840fd9bd3e'

def collect():
    values=dict(line.split('=',1) for line in pathlib.Path('/opt/connectyhub/proxy/access.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    token=base64.b64encode(':'.join(values[k].strip().strip('"') for k in ['DASHBOARD_USERNAME','DASHBOARD_PASSWORD']).encode()).decode()
    def query(q,variables=None):
        req=urllib.request.Request(URL,data=json.dumps({'query':q,'variables':variables or {}}).encode(),headers={'Content-Type':'application/json','Authorization':'Basic '+token})
        with urllib.request.urlopen(req,timeout=10) as r:
            raw=r.read(400001)
            if len(raw)>400000:raise ValueError('Oversized response')
            d=json.loads(raw)
        if d.get('errors') or not d.get('data'):raise ValueError('Engine query failed')
        return d['data']
    app=query('query($id:UUID!){app(id:$id){id name externalID url functionCount functions{id name slug triggers{type value}}}}',{'id':APP_ID})['app']
    if not app or app['externalID']!='connectyhub' or app['url']!='https://www.connectyhub.com.br/api/inngest':raise ValueError('Application identity changed')
    now=datetime.datetime.now(datetime.timezone.utc)
    q='query($from:Time!,$app:UUID!){runs(first:100,orderBy:[{field:QUEUED_AT,direction:DESC}],filter:{from:$from,appIDs:[$app]}){pageInfo{hasNextPage} edges{node{id appID functionID status queuedAt startedAt endedAt}}}}'
    recent=query(q,{'from':(now-datetime.timedelta(hours=24)).isoformat(),'app':APP_ID})['runs']
    names={f['id']:f['name'] for f in app['functions']}
    runs=[]
    for edge in recent['edges']:
        r=edge['node']
        if r['appID']!=APP_ID:raise ValueError('Wrong application')
        runs.append({'id':r['id'],'function_id':r['functionID'],'name':names.get(r['functionID'],'Função não registrada atualmente'),'status':r['status'],'queued_at':r['queuedAt'],'started_at':r['startedAt'],'ended_at':r['endedAt']})
    failure_query=q.replace('first:100','first:20').replace('appIDs:[$app]','appIDs:[$app],status:[FAILED]')
    failures=query(failure_query,{'from':(now-datetime.timedelta(hours=24)).isoformat(),'app':APP_ID})['runs']
    failed=[]
    for edge in failures['edges']:
        r=edge['node']
        if r['appID']!=APP_ID:raise ValueError('Wrong application')
        failed.append({'id':r['id'],'name':names.get(r['functionID'],'Função não registrada atualmente'),'status':r['status'],'queued_at':r['queuedAt'],'ended_at':r['endedAt']})
    functions=[{'id':f['id'],'name':f['name'],'slug':f['slug'],'triggers':'; '.join(t['type']+': '+t['value'] for t in f.get('triggers') or [])} for f in app['functions'][:200]]
    return {'status':'ok','collected_at':now.isoformat(),'app_id':APP_ID,'app_name':app['name'],'function_count':app['functionCount'],'functions':functions,'runs':runs,'has_more_runs':recent['pageInfo']['hasNextPage'],'failures':failed,'has_more_failures':failures['pageInfo']['hasNextPage'],'window_hours':24}
