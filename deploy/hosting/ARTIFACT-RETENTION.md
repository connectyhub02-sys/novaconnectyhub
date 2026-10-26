# Retenção de artefatos reproduzíveis

Serviço do host, separado do arquivamento de diagnósticos Inngest e dos backups.
A política preserva todas as versões dos últimos sete dias e as cinco mais novas
de cada raiz, todas as referências de containers restantes e todos os serviços em
execução. Candidatos e versões de retorno recentes ficam protegidos.

A remoção de containers alcança somente Vision admin candidate/rollback/failed,
node:22-alpine, encerrados há mais de sete dias e com uma única montagem de release
sob /opt/vision/app/releases. Sem força e sem remover volumes. As raízes de arquivos
permitidas são /opt/vision/app/releases e /opt/connectyhub/app/releases; pastas com
dados, uploads, storage, backups ou .git não são elegíveis. Symlinks e mounts fora
do escopo são recusados. Imagens limitadas a connectyhub-app:<commit>, antigas,
sem referência de nenhum container e preservando as cinco mais novas.

Cache: somente builder connectyhub-build, alvo máximo de 3 GB e reserva de 1 GB.
O Docker preserva entradas em uso; arquivos reproduzíveis sem uso podem ser recriados
na próxima compilação. Limites suportados conferidos no buildx instalado.
Não usa docker system prune, volume prune, truncamento de banco ou VACUUM FULL.
Backups, credenciais, mídias R2, filas e livros financeiros ficam fora da política.

Comandos:

- python3 artifact_retention.py: plano, sem exclusão.
- python3 artifact_retention.py --apply: executa o plano validado novamente.
- python3 -m unittest -v test_artifact_retention: testes em Linux.

Instalar script em /opt/connectyhub/hosting e unidades systemd do mesmo diretório.
Criar /var/lib/connectyhub-artifact-retention em modo 700. O timer executa a cada
seis horas (02h15, 08h15, 14h15 e 20h15 de Brasília, com atraso aleatório até dez
minutos). O script usa os locks de deploy dos dois projetos e lock próprio.

O serviço usa DOCKER_CONFIG próprio sob seu diretório de estado, mantendo
ProtectHome ativo. Copiar apenas a definição local do builder connectyhub-build
para docker/buildx/instances/connectyhub-build, sem config.json, credenciais ou
contextos de registries. Conferir endpoint unix:///var/run/docker.sock e driver
docker-container antes da instalação. Esse arquivo aponta para o builder já
existente: não cria outro daemon nem altera sua configuração.

O publicador Vision deve adquirir /opt/vision/app/release.lock em volta de main;
o publicador ConnectyHub já usa /opt/connectyhub/app/release.lock. A aplicação
continua em execução enquanto publicações concorrentes aguardam a manutenção.
Não iniciar uma manutenção se houver publicador antigo já em andamento sem lock.

Estado privado: plan.json, last-run.json e history.jsonl em
/var/lib/connectyhub-artifact-retention. Resumo sem caminhos/credenciais publicado
em /opt/connectyhub/monitoring/public/artifact-retention.json. Falha não aparece
como conclusão. Estatística de bytes é diferença observada do disco, afetada pela
atividade de outros serviços; não equivale à soma lógica de arquivos apagados.

A medição de storage reconhece versões e auxiliares vision-* que montam somente
pastas da raiz Vision já revisada, sem volumes extras ou vínculo a outro projeto.
Essa atribuição serve apenas para contar armazenamento. Não modifica
broker.inventory nem as regras destrutivas de hospedagem. Nomes fora do escopo,
montagens externas e volumes não revisados continuam recusados.

A retenção limita artefatos; não garante capacidade ilimitada. Monitor geral alerta
em 80% e 90%. Se dados úteis/carga crescerem além da folga, planejar capacidade e
retenção de diagnósticos sem apagar dados de negócio ou comprometer idempotência.
