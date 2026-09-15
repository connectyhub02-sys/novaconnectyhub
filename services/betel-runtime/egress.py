"""Betel production egress: fixed CH/R2 destinations, no lateral or general Internet access."""
import ipaddress,json,pathlib,socket,subprocess
R=pathlib.Path('/opt/betel-isolated-rehearsal')
assert json.loads((R/'owner.json').read_text())['kind']=='betel-isolated-rehearsal-20260915'
hosts=['www.connectyhub.com.br','0af7ebc3df0407b6fe023cdb3ecf704f.r2.cloudflarestorage.com','pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev']
resolved={h:sorted({a[4][0] for a in socket.getaddrinfo(h,443,socket.AF_INET,socket.SOCK_STREAM)}) for h in hosts}
assert all(ips and all(ipaddress.ip_address(ip).is_global for ip in ips) for ips in resolved.values())
def run(args):subprocess.run(args,check=True,capture_output=True)
chain='BETEL_EGRESS';marker=R/'audit/egress-owner.json'
existing=subprocess.run(['iptables','-S',chain],capture_output=True).returncode==0
if existing:assert json.loads(marker.read_text())['chain']==chain
else:
 run(['iptables','-N',chain]);marker.write_text(json.dumps({'chain':chain,'subnet':'172.22.0.0/24'}))
# Close this subnet while refreshing the task-owned chain; errors leave it closed.
guards=[]
for direction in ['-s','-d']:
 rule=[direction,'172.22.0.0/24','-m','comment','--comment','betel-egress-refresh','-j','DROP'];guards.append(rule)
 if subprocess.run(['iptables','-C','DOCKER-USER',*rule],capture_output=True).returncode:run(['iptables','-I','DOCKER-USER','1',*rule])
# Only this task-owned chain. Base policy is deny, and no other chain is flushed.
run(['iptables','-F',chain])
run(['iptables','-A',chain,'-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT'])
for ip in sorted({ip for ips in resolved.values() for ip in ips}):
 run(['iptables','-A',chain,'-s','172.22.0.2','-d',ip,'-p','tcp','--dport','443','-j','ACCEPT'])
run(['iptables','-A',chain,'-j','DROP'])
for direction in ['-s','-d']:
 rule=[direction,'172.22.0.0/24','-j',chain]
 if subprocess.run(['iptables','-C','DOCKER-USER',*rule],capture_output=True).returncode:run(['iptables','-I','DOCKER-USER','1',*rule])
run(['ufw','insert','1','deny','in','from','172.22.0.2','to','any','comment','Betel production deny host access'])
run(['ufw','insert','1','allow','in','proto','tcp','from','172.21.0.2','to','172.21.0.1','port','28111','comment','Betel production scoped broker'])
run(['ufw','allow','in','proto','tcp','from','172.18.0.4','to','172.18.0.1','port','28111','comment','Existing engine to Betel production broker'])
for rule in guards:run(['iptables','-D','DOCKER-USER',*rule])
(R/'audit/production-egress.json').write_text(json.dumps({'hosts':resolved,'tcp_ports':[443],'scraper_general_egress':False,'lateral_allowed':False}))
print('Betel egress rules prepared for CH/R2 only')
