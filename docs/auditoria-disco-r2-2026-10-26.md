# Auditoria do disco e do R2 — 26/10/2026

Leitura de produção aproximadamente entre 19h25 e 19h38 BRT. Nenhuma exclusão,
compactação, alteração de retenção, publicação ou envio/cobrança de teste.
Valores de du abaixo são aproximados em GiB; medições não são simultâneas.

## Ocupação confirmada

Filesystem de 290 GiB, cerca de 283 GiB ocupados e 7,1–7,3 GiB livres (98%).
Inodes em 11%: o problema é capacidade em bytes.

| Caminho/categoria | Ocupação aproximada |
| --- | ---: |
| Volume PostgreSQL Inngest Vision | 112 GiB |
| Volume PostgreSQL Inngest ConnectyHub | 27 GiB |
| Aplicação Vision, incluindo versões e staging | 60 GiB |
| Backups locais ConnectyHub | 20 GiB |
| Containerd, imagens/camadas compartilhadas | 27 GiB |
| Volume do builder ConnectyHub | 8,5 GiB |
| Logs do host | 3,5 GiB |
| Aplicação ConnectyHub | 3,8 GiB |

Esta tabela é parcial; não atribui imagens compartilhadas a clientes. /opt/vision
inteiro soma 63 GiB; /opt/connectyhub 13 GiB e portal gerenciado 8,8 GiB.
Aplicações têm 314 diretórios de release Vision e 125 ConnectyHub. Docker observou
109 imagens, 29 ativas, e aproximadamente 675 containers parados; contagens variam
com publicações concorrentes. Não equivale a autorização para remover todos eles.

Docker informa 13,38 GB decimais de imagens recuperáveis e o builder dedicado,
8,752 GB de cache recuperável. São estimativas do Docker, não promessa de liberação
integral nem números para somar cegamente às categorias físicas. Há versões de
retorno e publicações concorrentes que precisam ser protegidas.

## R2 e retenção existentes

A mudança não foi fictícia: armazenamento de mídia e arquivamento de diagnósticos
são caminhos diferentes, ambos observados. Snapshot de mídia da Vision às 18h03 BRT:
50.088 objetos, 8.329.996.707 bytes em dois espaços externos.

Listagem autenticada do prefixo de retenção no R2 confirmou:

- ConnectyHub: 165 objetos, 1.957.635.983 bytes.
- Vision: 573 objetos, 5.141.708.288 bytes.

Quatro arquivos reais, um antigo e um recente de cada projeto, foram baixados em
memória, descriptografados e tiveram o hash do conteúdo conferido. Sem impressão
de conteúdo, credenciais, chave ou caminho privado de objeto. Isso verifica essas
amostras; não constitui ensaio integral de restauração dos bancos.

O registro local contabiliza 13.619.256 linhas de diagnóstico arquivadas da
ConnectyHub e 33.511.798 da Vision. Política implantada: detalhes de execuções
concluídas por pelo menos sete dias; falhas/cancelamentos por trinta. Só spans,
traces e history são elegíveis após finalização independente confirmada. Eventos,
resumos, Redis e dados de negócio não são removidos. Timer diário ativo; execução
de 26/10 das 01h18 às 01h28 BRT terminou com sucesso e produziu arquivos reais.

Os seis backups diários presentes somam 20.327.784.809 bytes, fora os manuais. A
rotina local mantém arquivos por aproximadamente sete dias e não possui upload
R2 neste script. Portanto, arquivar diagnósticos não transfere esses backups.

## Por que voltou a encher

O arquivamento apaga linhas elegíveis depois de confirmar a cópia externa, mas o
VACUUM comum deixa a maior parte do espaço livre dentro dos arquivos do banco para
reutilização. Não reduz automaticamente todos os arquivos da VPS. A compactação
inicial de 24/10 só concluiu traces/history da ConnectyHub: liberou cerca de 6,41
GiB. Foi interrompida por lock e pressão de conexões (99 sessões bloqueadas numa
operação de índice não concorrente). Estado segue attention_required.

Uma operação posterior de índices concorrentes terminou em 24/10 às 19h54 BRT,
liberando 23,56 GiB e registrando 36,2 GiB livres. Hoje restam aproximadamente
7,1 GiB: cerca de 29 GiB de folga foram consumidos desde esse registro. Não há
baseline por diretório suficiente para atribuir cada byte desse crescimento.

Banco Vision atual: 118.792.812.211 bytes; spans 76.381.102.080, history
19.809.476.608 e traces 15.036.899.328 bytes, incluindo índices/TOAST. Banco
ConnectyHub: 28.407.289.523 bytes. WAL medido em cerca de 433 MiB Vision e 81 MiB
ConnectyHub: não é o consumidor principal.

Vision registra aproximadamente 147.644 execuções com ended_at nas últimas 24h.
Há rotinas com 10.080 execuções/dia. A amostra de métricas de campanhas tem gatilho
cron e evento por empresa; a contagem isolada não comprova duplicação indevida.
Diagnósticos recentes e falhas ainda dentro da política permanecem locais.
O volume útil versus espaço interno reutilizável não foi medido fisicamente nesta
auditoria; não prometer recuperar os 139 GiB dos dois volumes.

Fonte técnica: [PostgreSQL 17 — recuperação de espaço](https://www.postgresql.org/docs/17/routine-vacuuming.html#VACUUM-FOR-SPACE-RECOVERY).
VACUUM FULL exige espaço temporário e bloqueia a tabela. Não foi iniciado com o
disco em 98% nem repetido o procedimento que antes bloqueou as conexões.

## Falha de observabilidade

Snapshot local da Vision está unavailable, embora a leitura R2 esteja atualizada.
Coletor reporta local_failed Rejected. Inventário carregado corretamente recusa
recursos usados por serviços fora da lista revisada. Foram identificados 285
containers parados usando raízes Vision fora do inventário aceito; isso impede a
atribuição exclusiva. O coletor usa a mesma
proteção do executor de hospedagem. Não relaxar a proteção de exclusão para fazer
o gráfico aparecer: separar medição de atribuição revisada e operações destrutivas.

## Ordem de correção proposta

1. Criar folga com seleção de artefatos reproduzíveis, preservando containers em
   execução, candidatos, versões de retorno e dados/volumes. Conferir tamanho real
   depois de cada lote; evitar prune geral e concorrência com deploys.
2. Estabelecer retenção limitada de releases/cache e mover backups selecionados para
   armazenamento externo privado, com criptografia, verificação e recuperação.
3. Medir ocupação útil/reutilizável dos históricos e preparar recuperação física
   com capacidade temporária suficiente, limite de locks e observação de conexões.
   Avaliar geração de diagnósticos e retenção sem remover garantias de idempotência.
4. Corrigir o inventário do monitor e expor uso por categoria, crescimento, última
   execução/resultado da retenção e alertas antes de atingir o limite.

A auditoria explica a pressão atual e comprova o arquivo externo; não afirma que
a capacidade foi corrigida. Serviços e arquivos de clientes permanecem preservados.
