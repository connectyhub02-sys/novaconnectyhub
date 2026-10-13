# Infraestrutura vinculada ao cliente

O Admin cadastra o projeto e vincula manualmente uma organização em
`/admin/infrastructure/<projeto>`. O contrato continua no fluxo comercial existente.
Não há compra automática de VPS, cobrança nova, vínculo por nome ou suspensão por
`past_due`. A visualização em `/dashboard/infraestrutura` exige associação real do
usuário à organização e `client_access_enabled=true`, reavaliadas em cada consulta.

Migration `0204` mantém as tabelas service-only e grava o vínculo junto da auditoria
na mesma transação, com revisão otimista. O cliente não recebe credenciais, endereços
internos, inventário de outros projetos ou comandos. O cadastro de um projeto não
provisiona recursos: o inventário do host precisa ser conferido separadamente.

## Executor no host

Instalar `broker.py` em `/opt/connectyhub/hosting`, com `projects.json` privado,
root-owned. Cada projeto declara `compose` (nome → diretório exato), `standalone`
(nome exato → imagem esperada), `directories`, `volumes` e `allowDelete`.
Nunca gerar essa configuração a partir de pedidos do navegador, grupos de exibição
ou prefixos genéricos. Conferir serviços ativos **e parados**, diretórios, volumes,
cron e serviços externos antes de habilitar as operações. Recursos novos/recriados
podem exigir revisão desse inventário antes de retomar uma hospedagem.
O executor recusa nomes/volumes/Compose duplicados e diretórios sobrepostos entre
projetos, e volta a conferir propriedade exclusiva na operação e na coleta.

O serviço systemd expõe exclusivamente um Unix socket em `socket/control.sock`
(root:1000, 660), montado em `/var/run/connectyhub-hosting` no app. Não expor o socket
à rede. A aplicação não recebe Docker, SSH nem um executor de comandos arbitrários.
`hosting.json` sanitizado é publicado a cada 30 segundos no diretório de métricas.

Pausa/quarentena salvam estado e políticas de reinício antes de desligar os serviços;
os dados ficam preservados e reinício automático é desabilitado. A retomada manual
restaura as políticas e inicia somente containers que estavam ativos. O resultado
"completed" atesta o comando; saúde de aplicação/banco segue nas métricas. Novos
deploys externos não são coordenados pelo controlador: não publicar sobre projeto
pausado/em quarentena. Reinício inesperado é sinalizado como erro na observação.

Excluir exige quarentena, confirmação textual específica, revisão atual e recursos
exclusivos. Remove containers sem `--force`, volumes nomeados revisados sem uso externo
e os diretórios declarados, recusando symlinks/escapes e filesystems aninhados.
**Não representa apagar todo o cliente:** R2, DNS, backups externos, contratos,
cadastro e auditoria são preservados e explicitados na prévia. Não faz prune de
imagens nem remove o proxy compartilhado. Redes Docker não são removidas.

Intentos e recibos ficam em `state/<projeto>.json`, gravados atomicamente com fsync.
A API exige admin da plataforma, allowlist infra, origem, confirmação e auditoria
antes do comando. Recebimento HTTP não equivale a conclusão. Repetir o mesmo recibo
não repete a operação. Falha ou reinício do executor durante uma ação bloqueia novas
ações até revisão privada; não apagar recibos para forçar uma repetição.

## Armazenamento por projeto

`storage.py` publica `storage.json` no mesmo diretório de métricas somente leitura.
Instalar o script junto de `broker.py` e as unidades `connectyhub-storage.*` no
systemd; habilitar o timer somente após uma coleta manual conferida. Coleta local
a cada hora, com prioridade baixa e CPU limitada; listagem R2 completa a cada seis
horas. Abrir o painel não dispara varreduras. Falhas ficam indisponíveis, sem zero
fictício. A aplicação rejeita leituras locais após três horas e R2 após doze horas.

O inventário local reutiliza a propriedade exclusiva revisada de `projects.json`:
diretórios, volumes, logs e camadas graváveis dos containers, inclusive parados.
Conta blocos locais sem seguir symlinks e deduplica hardlinks; camadas graváveis
usam a estimativa lógica do Docker. Não soma imagens compartilhadas. Mudança de
inventário durante a coleta invalida o resultado. O total é estimativa operacional,
não quota ou base de faturamento, nem pretende reconciliar todo o disco da VPS.

Configuração privada `/opt/connectyhub/hosting/storage-r2.json` (root, modo 600):
objeto por slug de projeto, com uma lista contendo `container`, `accountEnv`,
`bucketEnv`, `accessEnv`, `secretEnv`, `bucket` e `accountHash` (SHA256 da conta).
São referências aos nomes de variáveis existentes e escopos revisados; não copiar
credenciais para esse arquivo ou Git. O container deve pertencer ao projeto; conta
e bucket precisam coincidir com a revisão, sem bucket atribuído a dois projetos.
Novos projetos exigem revisão manual antes da medição. Nenhum vínculo comercial
ou acesso é criado pelo coletor.

R2 usa apenas ListObjectsV2 paginado, agrega bytes e contagem por extensão e nunca
publica nomes de objetos, buckets, credenciais ou caminhos. Cada bucket tem limite
operacional de 200 páginas e quatro minutos de listagem; exceder isso invalida a
leitura inteira. Uploads multipart incompletos não entram no total. Métricas do
fornecedor podem ter outra periodicidade/base de cobrança. Interface apresenta
quantidade e escala adaptativa azul, explicitamente sem limite contratado.

## Verificação

`python3 -m unittest discover -s deploy/hosting -p 'test_*.py'` (Linux).
`smoke.py` cria um único projeto descartável com nomes fixos que devem estar livres,
testa pausa/retomada/quarentena/exclusão e remove apenas seus próprios recursos.
Interrompe em caso de falha; revisar o estado antes de repetir. Nunca usar um cliente
real para homologar exclusão.
