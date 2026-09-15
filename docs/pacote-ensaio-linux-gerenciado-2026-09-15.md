# Pacote para revisão: ensaio Linux dos projetos gerenciados

15/09/2026. **Preparação local, sem autorização implícita de execução na VPS.** Base funcional local: `47f0cd65`, `b080cbf8`, `41d84a57`, branch `codex/managed-projects`. Este pacote acrescenta somente documento, Dockerfile e Compose de revisão. Não publica o portal nem modifica a ConnectyHub em produção. O pacote de voz `17731ed` é outro trabalho, já ancestral de `e597e610` registrado em produção.

## Objetivo e limite da entrega

Ensaiar em Linux a autenticação, RLS, arquivos privados, worker diagnóstico e alertas persistidos com clientes fictícios. O Compose está em `services/managed-rehearsal/compose.review.yml`; usa um Dockerfile próprio, sem alterar os modelos anteriores. É um modelo revisável, **ainda não um procedimento executável completo**: faltam o bootstrap Linux, o executor com prazo e a adaptação do harness. As variáveis obrigatórias sem valores impedem uma inicialização casual. O artefato Next criado com configuração fictícia nos testes anteriores não pode ser publicado.

O Inngest não tem serviço, imagem, profile, download ou comando neste Compose. Seu leitor foi testado por contrato; executar o motor continua fora deste ensaio.

## Serviços e teto de recursos

| Serviço | Imagem/implementação | Memória máxima | CPU máxima | Porta interna |
|---|---|---:|---:|---:|
| database | PostgreSQL oficial 17.11 Alpine 3.23 | 512 MiB | 0,50 | 5432 |
| auth | Supabase GoTrue v2.197.0 oficial | 256 MiB | 0,25 | 9999 |
| rest | PostgREST v16.3 oficial | 128 MiB | 0,25 | 3000 |
| managed-gateway | Node 22 Alpine, fonte local | 128 MiB | 0,25 | 3080 |
| worker | Mesma imagem local; somente diagnostic.ping | 128 MiB | 0,25 | nenhuma |
| telemetry-gateway | Mesma imagem local; amostras fictícias | 128 MiB | 0,25 | 3082 |
| objects | Mesma imagem local; armazenamento privado | 256 MiB | 0,25 | 3081 |
| **Total dos serviços** | **7 containers** | **1.536 MiB** | **2,00** | **nenhuma publicada** |

Reservar adicionalmente até 512 MiB e 0,50 CPU para o futuro executor dos testes, também limitado: orçamento simultâneo proposto **2 GiB / 2,5 CPUs**, mais overhead do kernel e do Docker. Não executar compilação Next ou instalação de dependências durante a janela de carga. Esses tetos não medem consumo típico nem comprovam capacidade livre na VPS. O núcleo PostgreSQL começa com shared_buffers=64 MiB, no máximo 30 conexões e pool REST de três. Os limites pequenos buscam tornar a saturação observável; um OOM reprova o ensaio, sem ampliar o limite automaticamente.

Todos os serviços têm `restart: no`, rootfs somente leitura, capabilities removidas e no-new-privileges. PostgreSQL usa UID/GID 70; Auth e Node usam usuário 1000; o usuário 1000 do PostgREST precisa ser confirmado no ensaio. Diretórios precisam ser preparados com permissões mínimas compatíveis, não chmod 777. As propriedades dos bind mounts/segredos serão verificadas no Linux; a declaração YAML não comprova que funcionam.

## Imagens e downloads

Metadados consultados em 15/09 no Docker Hub, arquitetura **linux/amd64**. O Compose fixa os digests de manifesto específicos dessa arquitetura; não depende da movimentação futura das tags.

| Repositório/tag | SHA256 linux/amd64 | Bytes comprimidos informados |
|---|---|---:|
| postgres:17.11-alpine3.23 | 09f3fe6ab613dc2ba3f7584dcebdf4bb7acf98366169cd1805ebf9a65eab1041 | 116.694.890 |
| node:22-alpine | 76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c | 57.738.922 |
| supabase/gotrue:v2.197.0 | 839f529492d116b4e8b7777c953a27c381d34c15a744b1bcefde5eefaa1f9f9f | 30.443.157 |
| postgrest/postgrest:v16.3 | 63b567a462c4fd81ede0bdff0b38a150f732ad5fe4f4b01cebeb6a1aa8dbe0d6 | 6.545.594 |

Soma conservadora sem deduplicar camadas: **211.422.563 bytes (~202 MiB)**. Camadas extraídas, cache de build e metadados ocupam mais disco. Reservar **2 GiB para imagens/build**, não tratar tamanho comprimido como ocupação final. A imagem local apenas copia fontes `.mjs`, sem npm/apk ou dependências adicionais. Downloads do executor, se necessários, devem ser inventariados em complemento antes da execução; não estão incluídos nesses 202 MiB. Nenhuma imagem foi baixada ou construída neste preparo.

Fontes: [PostgreSQL oficial](https://hub.docker.com/_/postgres), [Node oficial](https://hub.docker.com/_/node), [metadados GoTrue](https://hub.docker.com/v2/repositories/supabase/gotrue/tags/v2.197.0), [metadados PostgREST](https://hub.docker.com/v2/repositories/postgrest/postgrest/tags/v16.3), [Dockerfile oficial Auth v2.197.0](https://github.com/supabase/auth/blob/v2.197.0/Dockerfile).

## Rede, volumes e dados

- Projeto Compose fixo `connectyhub-managed-rehearsal`, rede própria `isolated` com `internal: true`. Não reutilizar rede/banco/volumes de produção. Sem publicação de portas, DNS público, proxy produtivo, docker.sock ou network_mode host. Testes HTTP devem partir do executor conectado apenas à rede do ensaio.
- Tráfego esperado: executor → Auth/REST/gateways/objetos; worker → managed-gateway → REST → PostgreSQL; Auth → PostgreSQL. A rede interna é compartilhada entre esses serviços do ensaio, não uma política de firewall por par. RLS, credenciais e escopo da API continuam necessários.
- Verificar efetivamente a ausência de saída para Internet e para a rede produtiva antes de qualquer teste. A configuração `internal` não isola o administrador do host. Não montar coletor Docker nem consultar containers produtivos. A telemetria deste ensaio é sintética.
- `REHEARSAL_DATA_ROOT/postgres` e `/objects`: bind mounts em **um filesystem dedicado ou com project quota de 4 GiB comprovada**, compartilhado com os arquivos de restauração do ensaio. Limite de log dos containers: 10 MiB cada (70 MiB total). tmpfs PostgreSQL: 24 MiB, além de 32 MiB de shared memory. Reservar pelo menos 8 GiB livres no host antes de preparar imagens, dados e evidências.
- **Compose não impõe quota de disco aos bind mounts.** `max_wal_size` também não é teto de todo o banco. Sem quota real e teste de ENOSPC, a etapa de carga não pode começar. Não criar partição/loopback ou alterar quotas na VPS como consequência automática deste documento.
- Só quatro contas fictícias (infra admin, product admin, cliente A e B), dois projetos e organizações fictícios, textos e buffers gerados. Sem nomes/chaves/dumps de clientes; sem apps produtivos Betel/Vision/ConnectyHub vinculados. Arquivos do cenário: 0 bytes, 1 KiB, 1 MiB e acima do limite para recusa; não dados pessoais.
- Pasta de segredos privada fora do Git com valores aleatórios exclusivos e expirantes: senha DB, JWT signing, JWT de serviço, worker `mpw_`, assinatura de objetos e telemetria. Os env files Auth/REST conterão somente DSNs locais e segredo fictício compartilhado de assinatura. Nunca importar `.env.local` de produção. Secrets Compose são arquivos montados, não um cofre criptografado.

## Bootstrap ainda necessário

Preparar e revisar o diretório indicado por `REHEARSAL_BOOTSTRAP_ROOT` antes de execução: roles Auth/REST sem reaproveitar superusuário nas APIs, schema auth e permissões, tabelas-base mínimas `organizations`, `organization_members`, `profiles`, `ai_projects`, `voice_projects`. Auth aplica suas migrations e cria contas reais fictícias; depois aplicar **somente 0150–0153** ao banco `managed_rehearsal` e os vínculos fictícios. Não executar todas as migrations da plataforma sobre uma cópia produtiva.

A ordem deve aguardar saúde HTTP do Auth e readiness REST após aplicar schemas; `depends_on` não faz isso sozinho. O worker inicia apenas depois de registrar o hash da sua chave no projeto fictício. Essas etapas existem no harness Windows, porém **a adaptação Linux/container ainda não está pronta**. Não apontar o harness atual para a VPS: ele usa executáveis Windows e portas fixas locais. Faltam também o executor privado dos testes e a ponte de sessão Next, se incluída no ensaio. O Compose não contém Next/Studio/Kong/Realtime/Supabase Storage; objetos são o sidecar deste módulo. Não é ensaio de todo o Supabase self-hosted.

## Sequência de testes proposta, independente do Inngest

| Etapa | Verificação e critério de passagem |
|---|---|
| Pré-voo | Linux amd64, Docker/Compose existentes, digests, UID/GID, mounts novos, quota de 4 GiB, ausência de portas/rotas produtivas. Não instalar runtime silenciosamente. Registrar recursos livres e baseline antes da janela. |
| Auth/REST | Quatro logins e refresh reais, JWT inválido recusado, RLS A/B, revogação imediata de membro, product admin sem privilégio global. Reproduzir as asserções do harness real, registrando novo resultado Linux. |
| Worker | Uma execução diagnostic.ping e conclusão persistida; idempotência; chave de outro projeto/revogada negada; corrida de dois workers sem execução dupla; lease vencido incerto sem repetição automática. Segundo worker só substituindo outro serviço ou dentro de orçamento revisado. |
| Objetos | Upload/GET/delete assinado, hash e tamanho, limite 1 MiB da aplicação, duas requisições simultâneas, isolamento, retry, tombstone, quota e falha de disco. Reconciliar status pending/deleting após interrupção, sem liberar quota antes da confirmação. |
| Telemetria | Três amostras fictícias altas abrem um alerta; replay não duplica; recuperação/histerese; intervalo sem amostra e campo ausente; métricas globais invisíveis a cliente. |
| Carga limitada | Até 5 min, 1→5→10 requisições/s, no máximo 10 concorrentes e 3.000 requisições; diagnósticos sem efeito externo. Anotar p50/p95, 429, 5xx, OOM e fila. Não é prova de capacidade comercial. |
| Parada/retomada | Parar worker/objetos durante operações fictícias e reiniciar só esses serviços. Conferir estado incerto, ausência de repetição e recuperação de catálogo. |
| Restauração | Quiescer escritores e Auth; dump lógico do banco com auth e schemas gerenciados, roles/permissões e cópia consistente de objetos/tombstones. SHA256, manifestos e contagens. Parar o conjunto; restaurar em diretórios NOVOS sob a mesma quota; reabrir com configuração fictícia exclusiva. Refazer logins, RLS, arquivos/hash, estados e idempotência. Banco original do ensaio permanece preservado até validar. |
| Encerramento | Parar todo o projeto, confirmar nenhum container/listener remanescente, salvar resultados sanitizados e remover apenas recursos identificados do ensaio após validação dos caminhos. |

Para carga, interromper se houver OOM, 5xx inesperado sustentado por 30 s, quota acima de 75%, swap crescente ou degradação da produção. Se o host compartilhado tiver menos de 4 GiB de memória disponível, menos de 8 GiB de disco livre ou CPU acima de 70% no baseline de 5 min, adiar; não elevar plano automaticamente. Esses são limites conservadores propostos, sujeitos à revisão do host real, não uma garantia de isolamento de desempenho.

Restauração será **offline**, com escritores parados, em sequência para não duplicar o teto de RAM. Não prova backup online nem armazenamento fora do host. Uma cópia externa recuperável continua etapa separada, com destino privado previamente definido.

## Duração, encerramento e retorno

Janela proposta de **45 minutos de runtime**, depois de preparar imagens/fixtures. O futuro executor deve instalar timeout de encerramento e trap/finally antes de iniciar o conjunto. `restart: no` evita reinício automático, **não encerra containers aos 45 minutos**. Esse executor com timeout ainda precisa ser implementado e validado antes da execução; não deixar o Compose em execução desacompanhada.

O retorno consiste em parar o projeto isolado, sem alterar produção. Não há rollback de migration produtiva porque nenhuma será aplicada lá. Guardar hashes/relatório e, se necessário, dados fictícios até revisar o resultado; limpar depois apenas caminhos absolutos validados sob o diretório dedicado e volumes/rede identificados por este projeto. Não usar prune global, exclusão ampla de volumes nem reiniciar Docker/host. Não apagar imagens compartilhadas com outros serviços.

## Pendências e decisão seguinte

1. Revisar este pacote e escolher ambiente Linux isolado e janela. Preparar o documento não exigiu informação adicional do usuário.
2. Implementar/bootstrap e executor Linux com timeout, segredos fictícios, mounts/quotas e fluxo de recuperação; adaptar os testes e limitar seu orçamento a 512 MiB/0,5 CPU. Validar `docker compose config` no runtime aprovado. Nesta máquina Docker não foi executado; validação feita aqui é sintática/estática.
3. Conferir permissões Linux e comportamento das imagens fixadas. Não afirmar execução de container a partir dos 63 checks anteriores no Windows.
4. Testar capacidade e cópia externa separadamente antes de oferta gerenciada. Inngest permanece pendência independente, além da avaliação de licença para a oferta.

**Bloqueio de revisão automática:** o comando anterior de baixar, verificar e executar o binário Inngest foi rejeitado duas vezes, inclusive após autorização explícita. A ferramenta informou somente `blocked by policy`. Este pacote não transfere, reformula nem executa esse comando por outro ambiente.

Preview local preservado em `http://127.0.0.1:3026/infraestrutura/vps`; dados fictícios. Nenhum push, deploy, instalação, alteração de DNS, envio externo ou cobrança foi realizado para preparar este pacote.
