# Betel — importação e ensaio isolado na VPS

Escopo autorizado: preparar uma cópia privada da Betel, reconciliar os dados e
validar aplicação e automação sintética. Não houve troca da produção, DNS ou
publicação Vercel, execução de agentes reais, mensagens ou inferência paga.
O Cloud permanece como origem produtiva. O ensaio não significa migração
comercial concluída nem habilita os doze fluxos reais.

## Dados e recuperação

Exportação PostgreSQL 17.6 com transação somente leitura e snapshot compartilhado
entre schema, dados, catálogo e integridade. Arquivos privados copiados para fora
da VPS com SHA256 conferido. Importação atômica numa instalação independente:
117 tabelas públicas, 20 funções, 101 políticas e 80 triggers reconciliados;
as quatro contas Auth de origem foram preservadas.

A comparação inicial encontrou permissões adicionais herdadas do bootstrap.
Foram revogados somente 208 privilégios de tabela e 28 de execução adicionais;
quatro índices Auth da origem foram restaurados. Depois disso, metadados e ACL
públicos coincidiram. Diferenças internas das versões oficiais de Auth/Storage
foram classificadas; não foram copiadas cegamente sobre os componentes novos.

Duas contas sintéticas autorizadas e um vínculo de setor foram adicionados apenas
ao destino. Logins, refresh, logout e navegação geram seus próprios registros QA.
A reconciliação final separa essas identidades das linhas originais.

Resultado final: 146 relações de conteúdo originais coincidem em colunas,
quantidade, hash e conjunto de chaves; todas as 117 públicas e quatro contas Auth
originais preservadas. A projeção excluiu somente 19 eventos de auditoria QA,
duas identidades, dois usuários Auth, dois perfis administrativos e um vínculo de
setor. As diferenças restantes são dois históricos de migrations e nove FKs
adicionais dos componentes oficiais, sem violações.

O backup `final-20260915T175839Z` usa snapshot comum para dump, catálogo e
integridade. A restauração em outro banco conferiu 154 tabelas, conteúdo, chaves
primárias e 217 referências, sem violações. O banco de teste foi removido.
Dump, roles, configurações privadas e Storage foram copiados para o computador do
titular e verificados por SHA256. Roles do mesmo cluster foram usadas no ensaio:
isso não comprova recuperação integral em outro host. O ledger do broker e o
motor compartilhado têm instantes independentes; não há transação distribuída.

Storage do Supabase de origem estava vazio. A tarefa Betel preservou separadamente
63 objetos R2 (8.043.955 bytes), com hash e condição de versão. Referências externas
não equivalem a arquivos copiados; uma referência expirada foi classificada como
tombstone anterior ao ensaio. R2 produtivo não foi trocado.

## Isolamento e aplicação

Raiz exclusiva `/opt/betel-isolated-rehearsal`, volume ext4 prealocado de 32 GiB,
seis serviços com imagens fixadas: PostgreSQL, Auth, PostgREST, Storage, Envoy e
aplicativo. Rede Docker interna, nenhum publish de porta; acesso do computador
somente por túnel SSH. Chaves Supabase e Inngest próprias, segredos fora do Git.

Limites: banco 2 GiB/1 CPU; aplicativo 1 GiB/0,75 CPU; Auth/REST/Storage cada
256 MiB/0,25 CPU; Envoy 128 MiB/0,1 CPU; broker 256 MiB/0,25 CPU. São tetos,
não consumo observado nem previsão de capacidade comercial. O build foi limitado
a 3 GiB/1,5 CPU e teve acesso a dependências; runtime não tem acesso externo.

Do próprio container, TCP para Internet, Gemini, motor Inngest direto e portas
22/80/443/8288 do host foi bloqueado. A exceção INPUT é apenas o broker privado
na porta 28110; a regra de recusa da IP do ensaio precede as permissões públicas
do host. Serviços locais Supabase e broker responderam. O arquivo de atestação
do aplicativo impede inicialização acidental fora do ensaio, mas não substitui
o firewall. Guardas de rota bloqueiam mutações e handlers produtivos.

Artefato final da aplicação:
`ebd778dd6f500d28dd887c57755c8da8f3e0a181b1e647ac32465de362a79364`.
Imagem: `sha256:0b425edc86dec09ed5953edd4c49f4c0c46092dfefeee944c174e1f3062666f4`.
O baseline reproduziu falha prévia de autorização SSR em `/admin/usuarios`.
A tarefa Betel corrigiu o gate antes da leitura; repetição passou: viewer sem
setor recebe 403 sem dados, manager com setor acessa as páginas permitidas.
Oito chamadas de mutação/API/webhook/handler produtivo foram recusadas.

O supervisor systemd controla o Compose inteiro. Recriar serviços por fora do
supervisor fez `abort-on-container-exit` parar irmãos; corrigido reiniciando
somente a unidade do ensaio. Alterações futuras devem respeitar esse controle.

## Broker e automação

[Código e contrato](../services/managed-inngest-broker/README.md). Não foi instalado
outro motor Inngest. A instância existente recebeu apenas `betel-ai-rehearsal`,
uma função sintética, sem cron. As 45 funções e metadados anteriores da ConnectyHub
permaneceram iguais. O cliente nunca recebe a chave global da instância.

18 testes Windows/Linux e paridade criptográfica com SDK 4.6.0 passaram.
Verificações HTTP reais recusaram chave ausente, evento/registro/execução de outro
escopo e GraphQL. `Object.hasOwn` impede que nomes herdados do protótipo sejam
confundidos com execuções autorizadas. Respostas preservam os cabeçalhos oficiais
`x-inngest-sdk` e `x-inngest-sdk-handled`: omiti-los causou duas falhas sintéticas
iniciais, mantidas no histórico; após a correção, a espera curta concluiu.

Estado de entrega incerta nunca causa reenvio automático. O cenário sintético
uncertain concluiu com estado funcional `uncertain`, `retryAllowed: false` e
`providerCalls: 0`. Status COMPLETED do motor não deve ser confundido com sucesso
de negócio. Reenvio da mesma fixture devolve o recibo já persistido.

A fixture de 360 segundos estava esperando quando aplicativo, banco e broker do
ensaio foram reiniciados às 17:56:25 UTC. Retomou e concluiu com `providerCalls: 0`.
Consulta direta do evento no motor confirmou exatamente uma execução após o
reenvio ao broker. O motor compartilhado não foi reiniciado. Essas verificações
cobrem a fixture e os checkpoints; não simulam falha ou cobrança de provedor real.

## Limites para continuidade

O endpoint do aplicativo é local por túnel, não um domínio de produção. O broker
só permite a fixture; não representa execução dos fluxos comerciais da Betel.
Pagamentos, IA, WhatsApp, scraper e agendamentos reais não foram acionados. Não
cancelar o Cloud com base neste ensaio. Expansão exige manifesto revisado, limites,
testes de negócio, acesso persistente planejado e decisão de corte/rollback.
Backups externos recorrentes e recuperação integral da instância compartilhada
continuam sendo requisitos operacionais separados.

Evidências sanitizadas: [diretório do ensaio](evidence/betel-rehearsal-2026-09-15).
Em 15/09 às 18:04 UTC, os seis gates do contrato local passaram: API/Auth, túnel
PostgreSQL, isolamento do broker, execução sintética, bloqueio de egresso e
retomada após reinício. A tarefa Betel é responsável pela atualização atômica do
seu `.env.local`, preservando alterações concorrentes; esse arquivo não é uma
publicação Vercel nem libera os fluxos reais.
