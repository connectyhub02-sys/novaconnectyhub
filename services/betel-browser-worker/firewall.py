import subprocess
chain='BETEL_BROWSER'
subprocess.run(['iptables','-w','5','-N',chain],capture_output=True)
rules=['*filter','-F '+chain,'-A '+chain+' -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT','-A '+chain+' -s 172.22.0.2/32 -d 172.23.0.2/32 -p tcp --dport 3001 -j ACCEPT']
denied=['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4','13.140.34.227/32']
rules += ['-A '+chain+' -s 172.23.0.0/24 -d '+network+' -j DROP' for network in denied]
rules += ['-A '+chain+' -s 172.23.0.2/32 -p tcp --dport 443 -j ACCEPT','-A '+chain+' -j DROP','COMMIT']
subprocess.run(['iptables-restore','--wait','5','--noflush'],input='\n'.join(rules)+'\n',text=True,check=True)
for parent,rule in [('DOCKER-USER',['-s','172.23.0.0/24','-j',chain]),('DOCKER-USER',['-d','172.23.0.0/24','-j',chain]),('INPUT',['-s','172.23.0.0/24','-j','DROP']),('INPUT',['-s','172.23.0.0/24','-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT'])]:
 if subprocess.run(['iptables','-w','5','-C',parent,*rule],capture_output=True).returncode:subprocess.run(['iptables','-w','5','-I',parent,'1',*rule],check=True)

# Scoped app ingress crosses Docker bridges; preserve every unrelated raw drop.
network_id=subprocess.check_output(['docker','network','inspect','betel-production-egress','--format','{{.Id}}'],text=True).strip()
rule=['-i','br-'+network_id[:12],'-s','172.22.0.2/32','-d','172.23.0.2/32','-p','tcp','--dport','3001','-j','ACCEPT']
if subprocess.run(['iptables','-w','5','-t','raw','-C','PREROUTING',*rule],capture_output=True).returncode:
 subprocess.run(['iptables','-w','5','-t','raw','-I','PREROUTING','1',*rule],check=True)
