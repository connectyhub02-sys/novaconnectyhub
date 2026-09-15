# Migração Betel para a VPS — 15/09/2026

> Atualização posterior: novas automações e webhooks foram habilitados às 20:29 UTC. O HOLD descrito abaixo é o estado histórico desta etapa. Consulte a [ativação operacional](betel-ativacao-operacional-2026-09-15.md).

## Escopo e autorização

O titular autorizou a migração definitiva e esclareceu durante a execução que
a Betel ainda não está em uso e aceita indisponibilidade planejada. O aceite
separa aplicação/dados/acesso de liberação dos fluxos comerciais. Não executar
mensagens, chamadas pagas ou replays incertos como teste.

Aplicação: `https://betel.connectyhub.com.br`; API Supabase:
`https://betel-supabase.connectyhub.com.br`. O endereço anterior
`https://betel-leil-es.vercel.app` é preservado como entrada compatível.
A ConnectyHub principal continua na Vercel, sem migração de seus handlers.

## Cópia final verificada

Manutenção Vercel observada às **19:25:49 UTC**, deploy `AJrzUv4T1GMGb6s7LMSdruWfDGzT`,
commit Betel `671fa81`. Login, admin e callbacks antigos retornaram 503. Após
300 segundos, consulta PostgreSQL às 19:30:59 UTC encontrou zero transações
ativas de clientes. A origem não recebeu comandos de escrita da exportação.

Snapshot final `0000001E-0000EBAC-1`, diretório privado `20260915T193118Z`:
schema, dados, catálogo e integridade partilharam snapshot consistente, com TLS
verify-full. Sete arquivos foram copiados para fora da VPS e conferidos por SHA.
Dados SQL: 88.175.522 bytes, SHA256
`ceee5febc8169dafff0078c85b46914b6b32a6b250cc500bd3c5a3db23cabcbb`.

A origem ganhou quatro tabelas internas Auth e a coluna `one_time_tokens.expires_at`
desde o primeiro ensaio. As 31 colunas e 16 constraints adicionais já existiam
com metadados compatíveis no GoTrue do destino; o esquema da aplicação não mudou.
Não foi feita restauração cega dos schemas internos dos serviços.

Importação atômica às 19:36:58 UTC: **150 tabelas**, projetadas nas colunas da
origem, tiveram contagem e hash comparados **antes do commit**. O destino possui
154 tabelas; **217 referências verificadas, zero violações**. Migrações internas
Auth/Storage do destino foram mantidas. Quatro usuários originais preservados;
fixtures do ensaio removidas na cópia. A QA posterior cria apenas identidades
sintéticas delimitadas e deve removê-las antes do backup final de aceite.

R2 permanece no serviço existente. A tarefa Betel confirmou a cópia final de
**63 objetos / 8.043.955 bytes**, com hashes conferidos e nenhuma adição, alteração
ou falta em relação à cópia anterior. Isso não transforma inventário em arquivos
disponíveis no portal de infraestrutura.

## Runtime e isolamento

Imagem Betel do bundle SHA256
`43a5d619f3883cf63095b377291c6b8e566e9e8faceed2dc1e1e79157344944b`:
`sha256:87ee801ad0dfa20aed7d5972733cf6edd8b4aaa1ce5411f2eb643a86ca1a3432`.
Build Linux, TypeScript e páginas concluídos. App privado28103, API28100, banco
dedicado no volume ext4 de32GiB já ensaiado. SSR usa API interna; browser usa HTTPS
e chave pública própria, sem reutilizar credenciais globais da ConnectyHub.

A rede interna é mantida; uma segunda rede de egresso exclusiva permite apenas
TCP443 para os IPv4 resolvidos da API ConnectyHub e dos dois hosts R2 configurados.
Não há portas Docker publicadas. Host/serviços laterais e outros destinos foram
recusados nos testes; CH/R2 e broker privado responderam. As regras são refeitas
antes de iniciar a stack. Mudança dos IPs dos fornecedores pode exigir atualização
desse conjunto; falha fecha o acesso. Scraper genérico e provedores auxiliares
continuam retidos, sem liberação geral de Internet.

## Inngest e recebimento de webhooks

App real no motor existente: `5aa137bc-fe2b-5385-8e94-138d6d054335`, `betel-ai`,
**12 funções registradas**; as45 da ConnectyHub permaneceram iguais. Broker28111
com chaves próprias, IDs internos fixados e ledger separado do ensaio28110.
Eventos recebem namespace Betel; entregas incertas não são reenviadas. Registro
foi novamente fechado depois da validação. **Broker e handlers estão pausados.**

26 testes de broker Windows/Linux passaram; são contrato/isolamento, não execução
comercial das12 funções. A espera real de360segundos pertence ao ensaio sintético
anterior. Um cron novo pode selecionar linhas antigas: não remover pausas apenas
por ter configurado um horário de corte. Consultar a matriz de elegibilidade da
tarefa Betel, especialmente follow-ups, campanhas, agenda e chamadas incertas.

Webhooks permanecem em **hold** na caixa exclusiva Betel: HMAC sobre bytes
originais, SQLite WAL/FULL, persistência antes202, recibo idempotente. Cinco testes
incluíram morte do processo antes/depois do commit; HTTPS e restart foram testados
com fixtures. O proxy Vercel também devolveu o mesmo recibo ao repetir a fixture.
Não há autodrain, atendimento ou cobrança por essa caixa. Fixtures
`migration.test.hold` nunca devem ser encaminhadas.

A UI do Inngest Cloud advertiu que arquivar cancelaria execuções existentes.
A ação foi recusada. Origem e histórico permanecem preservados, com callback503;
não interpretar retenção limitada da UI como prova de fila vazia. Não cancelar
nem repetir trabalhos antigos sem conciliação.

## Portal

Empresa original Betel `66cb4c5a-35f2-4c08-9982-38bd72d2b9be`, projeto do portal
`9349f704-bdaa-41f1-957f-23f3317ba969`. Coleta somente leitura: estrutura do banco
dedicado, consumo/carteira próprios na CH e app Inngest correto. Não concede
permissão do banco produtivo a um membro do portal. Não cria cobrança, chave ou saldo.
37 verificações HTTP Betel e 69 de regressão da conexão CH passaram, com admin,
anônimo, membro e bloqueio de escrita. UI autenticada conferida.

## Fechamento verificado

Login HTTPS/SSR, navegador e controle de permissões passaram no endereço novo
e no legado. Deploy legado `E1mbACueDAhCbCigotV7r156b3Ri` encaminha para a VPS;
os callbacks Inngest antigos continuam 503. Às 19:47:50 UTC foram removidos
dois usuários QA, dois perfis e um vínculo de operação criados para o teste.
Os quatro usuários originais foram comparados e permaneceram inalterados.

Backup final `final-20260915T194845Z`: 154 tabelas restauradas em banco de ensaio,
217 relações verificadas, zero violações. A comparação de conteúdo passou.
Oito arquivos foram copiados para armazenamento privado nesta máquina Windows
e tiveram SHA-256 conferido. Dump de 11.459.694 bytes:
`4b4190d50efb9f06d59c8719ad1ccd3176b664fca742d449fe7243e12e3b3c26`.
Inclui configuração privada, código publicado, roles e cópia SQLite consistente
da caixa de webhooks. O teste usou as roles do mesmo cluster: não comprova
reconstrução integral em servidor vazio. A cópia externa é local, não um serviço
automático de backup externo. Eventos recebidos depois do snapshot ficam na VPS.

Portal conectado às 19:55:30 UTC, sem ampliar permissões; navegação autenticada
confirmou banco, consumo próprio e 12 funções com aviso de execução retida.
Também foi preservado um dump privado do portal antes da troca de estado.
[Evidência resumida](evidencias/betel-production-2026-09-15.json).

A hospedagem, os dados e o acesso estão migrados. A liberação comercial de
automações e webhooks continua pendente e bloqueada, conforme o escopo aceito.
Nenhum replay, envio externo ou geração paga foi usado para encerrar esta etapa.

Credenciais, dumps, objetos e relatórios com conteúdo privado ficam fora do Git.
Fonte Cloud preservada para recuperação. Após escrita nova na VPS, retornar à
origem exige congelamento e conciliação do delta; não basta trocar DNS/proxy.
