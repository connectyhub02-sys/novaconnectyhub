# Preparação da VPS Contabo — 11/09/2026

> Registro histórico da instalação inicial. Atualização de 11/09/2026: Inngest e Supabase de produção foram transferidos para a VPS; Vercel e Cloudflare R2 foram mantidos. O estado atual está nos relatórios de [migração do Inngest](migracao-inngest-vps-2026-09-11.md) e [migração do Supabase](migracao-supabase-vps-2026-09-11.md). As descrições de ambiente vazio abaixo se referem ao momento da preparação, anterior à migração.

## Escopo e estado

Supabase e Inngest instalados em uma VPS nova. A aplicação de produção continua na Vercel, o Supabase gerenciado continua sendo o banco de produção, o Inngest Cloud continua responsável pelas automações existentes e os arquivos existentes continuam no Cloudflare R2. Não houve troca de variáveis de produção, importação de dados de clientes ou cancelamento dos serviços anteriores.

Esta preparação não representa uma migração concluída.

## Servidor e endereços

- Contabo Cloud VPS 8, 8 vCPU, 24 GB de memória anunciada, 300 GB SSD, US East/Carlstadt.
- IPv4: `13.140.34.227`; hostname: `vmi3571281`.
- Ubuntu 24.04.5 LTS, kernel 6.8.0-139-generic após reinicialização; Docker 29.8.0; Docker Compose v5.5.1.
- Supabase Studio/API: <https://supabase.connectyhub.com.br>.
- Inngest: <https://inngest.connectyhub.com.br>.
- Dois registros A criados no DNS da Vercel, TTL 60. Registros existentes do site preservados.
- Caddy termina HTTPS, obtém/renova certificados automaticamente e reinicia com o Docker.
- Assinatura de Auto Backup da Contabo consta ativa no painel. A conclusão do primeiro backup do provedor ainda precisa ser conferida.

## Serviços instalados

### Supabase

Diretório: `/opt/connectyhub/supabase`.

Configuração oficial da versão `self-hosted/v0.8.1`, incluindo PostgreSQL 17, Auth, PostgREST, Realtime, Storage, imgproxy, Studio, postgres-meta, Edge Runtime, Supavisor e gateway Envoy. As imagens usam as versões do Compose oficial dessa referência.

O `.env` contém chaves próprias geradas na VPS, inclusive a configuração assimétrica do Auth. Não regenerar essas chaves durante uma atualização normal.

`COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml` é necessário: o override limita o gateway e o pooler ao loopback. Sem incluir esse arquivo explicitamente, o Compose pode publicar portas diretamente.

Portas de host: `127.0.0.1:8000`, `127.0.0.1:5432`, `127.0.0.1:6543`. Não publicar PostgreSQL na internet para conectar o frontend.

Cadastros e acesso anônimo ao Auth estão desabilitados nesta instalação nova. SMTP, OAuth, usuários, funções, políticas, buckets e dados de produção ainda precisam ser migrados/configurados antes da troca.

### Inngest

Diretório: `/opt/connectyhub/inngest`; arquivo `compose.yaml`.

- Inngest `v1.44.0`, em modo `inngest start`, com chaves de evento e assinatura próprias.
- PostgreSQL 17 externo ao processo Inngest, em volume persistente.
- Redis 7 externo, com AOF, `appendfsync everysec` e política `noeviction`.
- Imagens do PostgreSQL e Redis fixadas por digest no Compose.
- 20 workers de fila; limites de memória dos containers: Inngest 4 GB, PostgreSQL 2 GB, Redis 1 GB.
- Portas `127.0.0.1:8288` e `127.0.0.1:8289`; PostgreSQL e Redis sem portas públicas.

No proxy, somente POST em `/e/*` e `/fn/register` chega diretamente à autenticação nativa do Inngest. As demais rotas exigem a senha administrativa do painel. O gateway Connect não foi publicado; a integração validada usa HTTP/serve.

Para futura integração do SDK: `INNGEST_DEV=0`, `INNGEST_BASE_URL=https://inngest.connectyhub.com.br`, `INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY` da VPS. Não alterar essas variáveis em produção antes de planejar a transição das automações e execuções pendentes.

## Acessos e proteção

- SSH temporário com a senha escolhida na contratação da VPS. Nenhuma chave SSH de acesso permanente foi instalada por esta preparação.
- UFW: entrada negada por padrão; SSH, HTTP e HTTPS permitidos.
- Portas internas do Docker vinculadas ao loopback; o firewall do host isoladamente não substitui essa configuração.
- Configurações e segredos sob `/opt/connectyhub`, diretórios administrativos com modo 0700 e arquivos de segredo com modo 0600.
- Supabase Studio: usuário/senha em `/opt/connectyhub/supabase/.env`, campos `DASHBOARD_USERNAME` e `DASHBOARD_PASSWORD`.
- Inngest: usuário/senha em `/opt/connectyhub/proxy/access.env`.
- Chaves do Inngest: `/opt/connectyhub/inngest/.env`.
- Credenciais não incluídas neste documento nem no Git. Guardar os acessos em um gerenciador de senhas; trocar a senha temporária SSH após a instalação e os testes combinados com o titular.

## Backups

Script: `/usr/local/sbin/connectyhub-backup`.

Unidades: `connectyhub-backup.service` e `connectyhub-backup.timer`. Agendamento diário às 06:30 UTC, com atraso aleatório de até 15 minutos, execução persistente e trava contra sobreposição. Em falha, nova tentativa após cinco minutos, limitada a três inicializações por hora; timeout de uma hora. Arquivos em `/var/backups/connectyhub`, com acesso restrito ao root; remoção de arquivos desse backup com mais de sete dias.

Conteúdo:

- Dump custom do banco Supabase e exportação de roles/globals.
- Dump custom do banco Inngest.
- Snapshot RDB do Redis.
- Configurações, segredos e arquivos de Storage/Functions da instalação local; diretório de dados físicos do PostgreSQL excluído do tar.
- Script de backup, unidades systemd e configurações do Docker/UFW.
- Inventário das imagens e checksums SHA-256.

Os arquivos contêm dados e credenciais. Não enviar para Git, chat ou armazenamento público. A cópia local não substitui backup fora da VPS. Validar o Auto Backup contratado e definir uma cópia externa independente antes da migração definitiva.

PostgreSQL e Redis são capturados sequencialmente: este backup não é um snapshot atômico entre os dois serviços do Inngest. Uma restauração operacional precisa considerar execuções em andamento, idempotência e possível reconciliação. Para a transição de produção, controlar produtores/executores e fazer a captura final de forma coordenada.

## Testes executados

- Todos os containers Supabase e Inngest apresentaram estado saudável após a instalação.
- HTTPS válido nos dois subdomínios, sem desabilitar a verificação de certificados.
- Painéis retornam 401 sem credencial e 200 com a credencial correta.
- Supabase: REST, Auth health e Storage com respostas 200 nas chamadas autenticadas pertinentes.
- Tabela temporária com RLS: chave anônima recebeu lista vazia; chave de serviço acessou apenas o registro de validação esperado.
- Inngest: uma tarefa executou uma etapa, aguardou e continuou depois da reinicialização do container Inngest, sem repetir a primeira etapa.
- Outra execução validou registro de aplicação e envio de evento através do domínio público com HTTPS.
- Envio de evento com chave inválida e registro de aplicação sem chave retornaram 401.
- Aplicação de teste removida do Inngest ao fim dos testes; nenhum app de produção registrado na VPS.
- Checksums do backup conferidos; Redis RDB passou no `redis-check-rdb`.
- Dumps dos dois bancos restaurados em bancos temporários. No Supabase, restauração completa com owners e privilégios passou usando `supabase_admin`; o usuário `postgres` não é superusuário e não restaura sozinho algumas estruturas internas. Registro de teste conferido após restauração. Bancos temporários removidos.
- VPS reiniciada: todos os serviços voltaram automaticamente e ficaram saudáveis, HTTPS voltou nos dois endereços e o registro de validação persistiu. Firewall e timer de backup ativos. A tabela de teste foi removida depois dessa conferência e um novo backup foi concluído.
- Após o reboot, aproximadamente 1,9 GiB de RAM em uso, 21 GiB disponíveis e 278 GB de disco livres. Essa medição é da instalação vazia, sem carga de produção; não constitui teste de capacidade com clientes.

Os testes de restauração usaram o cluster/roles da instalação recém-criada. Não substituem um ensaio de recuperação em máquina vazia nem comprovam a migração dos dados do Supabase Cloud.

## Operação

```sh
# Saúde e portas, sem imprimir segredos
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
systemctl status connectyhub-backup.timer
journalctl -u connectyhub-backup.service --since today

# Backup manual
systemctl start connectyhub-backup.service

# Gerenciamento dos serviços
cd /opt/connectyhub/supabase && docker compose ps
cd /opt/connectyhub/inngest && docker compose ps
cd /opt/connectyhub/proxy && docker compose ps
```

Não usar `docker compose down -v` em manutenção: isso remove volumes persistentes. Antes de upgrades, registrar a imagem atual, gerar backup e validar restauração. Não recriar `.env` nem regenerar chaves existentes.

## Próxima etapa: migração controlada

1. Inventariar dependências reais do projeto: banco, usuários Auth, buckets privados, Realtime, Edge Functions, SMTP/OAuth, segredos e extensões.
2. Ensaiar importação do Supabase gerenciado, incluindo roles, políticas, funções e arquivos necessários. Preservar os segredos usados para criptografar dados da aplicação; tratar separadamente eventuais segredos do Vault.
3. Validar uma implantação de teste apontada para a VPS: login, agentes, créditos, cobrança, API de IA, WhatsApp e permissões entre contas, sem cobranças ou mensagens reais de teste.
4. Definir migração das filas/execuções pendentes e um único responsável por cada agenda. Evitar que Cloud e VPS disparem a mesma automação.
5. Fazer backup final, trocar variáveis/deploy de produção e monitorar, mantendo procedimento de retorno para os serviços anteriores.
6. Cancelar os serviços substituídos somente depois de confirmar a operação e a recuperação dos dados.

Referências oficiais: [Supabase Docker](https://supabase.com/docs/guides/self-hosting/docker), [restauração do Supabase Cloud](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [Inngest self-hosting](https://www.inngest.com/docs/self-hosting).
