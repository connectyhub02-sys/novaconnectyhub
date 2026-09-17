# Métodos de pagamento — pacote local de 17/09/2026

## Estado

**Direção de release corrigida pelo titular:** publicar pelo push em
`connectyhub02-sys/novaconnectyhub`, branch `master`, acionando a Vercel existente.
Os registros de bloqueio da CLI abaixo são históricos; não justificam mudar de
projeto nem impedem por si só a pipeline GitHub. Na integração com a master atual,
0150/0151 já pertencem à infraestrutura e 0152 ao gerenciamento de cartões.
Migrations deste pacote renumeradas para **0153/0154**. Troca usa `last_digits` e
`selectable` do cofre existente, com formulário validado no bloco Métodos de
pagamento e preservação da ação Tornar padrão. Ensaio transacional com rollback
no banco real passou, sem alteração dos contratos/cartão ativo.

Migrations 0153/0154 aplicadas às 20:10 BRT, com backup privado direcionado,
histórico/auditoria e verificação de RLS/grants. Fingerprint dos contratos
inalterado (`a2b020a9d628b75537f6a03440b235a9`), um cartão ativo antes/depois.
117 cenários distintos verificados após integrar a master, ESLint, TypeScript e
build aprovados. Aguardar confirmação do SHA servido após push e atualizar webhook
somente com o novo handler disponível. Flag permanece sem habilitação nesta etapa.

Implementados localmente: troca segura de cartão e Pix Automático Asaas na
primeira contratação de plano recorrente com preço fixo. A troca de cartão para
Pix Automático em plano já ativo permanece explicitamente bloqueada no painel e
no servidor: a Jornada 3 pública exige pagamento inicial. Não foi implementado
atalho com cobrança simbólica, antecipação de vencimento ou Pix comum disfarçado.

Nada deste pacote foi publicado. Nenhuma autorização, mandato, cobrança ou troca
real de cliente foi criada. Consulta de publicação em 17/09, aproximadamente
19:34 BRT: `vercel whoami` retorna `pilgerlandingpage`; consulta autenticada ao
projeto `prj_SVsJoIWfofx7KRpRL7bDJsL5Q8W3`, equipe `team_F30ubMSe0tNWndpvkO9dSCDA`,
retorna **404 — Project not found**. O código está neste worktree isolado; não
usar o checkout principal com alterações de outros trabalhos como pacote de deploy.

Nova tentativa autorizada de publicação às 20:00 BRT confirmou o mesmo 404 e a
mesma identidade CLI. `vercel teams list` mostra somente
`pilger-landing-pages-projects` (Guilherme Pilger AI). Conforme ordem expressa de
parar se esse acesso continuasse bloqueado, nenhuma migration, mudança de webhook,
flag ou implantação foi executada nesta tentativa. Pacote funcional: commit
`93788513`, branch `codex/metodos-pagamento-pix-automatico`.

## Comportamento implementado

- Checkout apresenta Cartão, Pix comum manual e Pix Automático. A terceira opção
  depende da capacidade retornada pelo servidor; mostra o motivo se indisponível.
- Pix Automático informa valor inicial, valor/intervalo recorrentes e exige
  consentimento. O primeiro pagamento é solicitado pelo QR integrado do Asaas,
  sem criar outro pagamento com POST `/payments`.
- O Asaas recebe `paymentCreationMode=SUBSCRIPTION`. Ele gera as próximas
  cobranças; o worker de cartão não cria débitos para essa assinatura.
- Persistência service-role/RLS para mandato, organização, assinatura, pagamento,
  ator, consentimento, ambiente, IDs do provedor, estado e auditoria. QR fica
  disponível apenas ao titular/admin autenticado e é descartado do registro ao
  entrar em estado ativo/terminal. Nenhuma credencial bancária do pagador é coletada.
- O pagamento inicial é correlacionado pelo `conciliationIdentifier`. O servidor
  consulta o mandato e o pagamento no Asaas, verifica cliente/valor/meio e só
  encaminha ativação quando o mandato está ACTIVE e o pagamento CONFIRMED/RECEIVED.
  O estado de sucesso da interface também espera a aplicação dos efeitos locais.
- Renovações são vinculadas pelo ID da assinatura Asaas e conferidas pelo valor
  recorrente e período. Cada pagamento/ciclo tem vínculo único; adicionais de
  pagamento único não reaparecem. Usa a ativação/contabilização idempotente existente.
- Claim SQL serializa concorrência com cartão, Pix comum e edição de carrinho.
  O registro precede o POST ao Asaas. Timeout mantém estado incerto/bloqueado;
  consulta paginada por cliente + contrato recupera a autorização. Ausência numa
  consulta não permite emitir outra autorização automaticamente.
- Webhook exige token, persiste ID antes de processar e reconcilia por GET remoto.
  Eventos repetidos e fora de ordem não promovem o estado apenas pelo payload.
  Trata CREATED/ACTIVE/CANCELLED/EXPIRED/REFUSED e audita instruções
  AWAITING_REQUEST/SCHEDULED/REFUSED/CANCELLED conforme estado remoto.
- Eventos de assinatura Pix são interceptados para preservar o período pago;
  encerramento do mandato não transforma cancelamento da recorrência em suspensão
  imediata de acesso. A expiração do plano continua seguindo o ciclo existente.
- Estorno integral confirmado por GET cancela o mandato ativo antes de concluir
  os efeitos locais do estorno, seguindo a política de interromper débitos futuros.
  Cancelamento incerto fica em conciliação; nunca emite outro mandato para compensar.
- Conciliação de fundo no job Inngest já existente, a cada cinco minutos, e
  consulta no checkout recuperam efeitos pendentes. Um resultado desconhecido não
  inicia outro débito. Recusa definitiva permite uma nova solicitação consciente.

## Limites explícitos

1. Só primeira contratação de plano recorrente está habilitada para criação. Planos
   ativos, produtos avulsos, mudança de plano e campanhas com preço por período
   retornam indisponibilidade. Desconto inicial separado do preço fixo de renovação
   e adicionais compatíveis são considerados no snapshot de cobrança.
2. Pix Automático usa `retryPolicy=NOT_ALLOWED` para retentativas extradia. A UI
   informa isso. As tentativas intradia seguem o banco; não foi implementada
   política de até três novas tentativas em sete dias. Retentativa de HTTP/webhook
   ou conciliação não é retentativa financeira.
3. Operação com POST ambíguo sem correspondência remota comprovada permanece em
   conferência e requer investigação operacional. Não liberar o lock manualmente
   sem verificar se o mandato existe. Operação interrompida antes de persistir o
   cliente também não dispara POST a partir de um GET.
4. Troca de Pix Automático já existente para outro mandato/cartão não foi liberada
   por este pacote. Cartão existente continua com a troca implementada na 0153;
   o painel não cancela mandato externo por consequência de um formulário de cartão.
5. Validação realizada com mocks contratuais e PostgreSQL local. Não houve teste
   financeiro em sandbox nem em produção. GET de autorizações com HTTP 200 não
   comprova habilitação para criação. A confirmação real depende da conta Asaas e
   de teste especificamente autorizado.

## Arquivos e implantação

- `0153_subscription_card_replacement.sql`: cofre e auditoria de troca de cartão.
- `0154_pix_automatic.sql`: `billing_pix_authorizations`, `billing_pix_events`,
  `billing_pix_payments`, claims, estados e vínculo de pagamentos/ciclos, RLS e grants.
- `src/lib/billing/asaas-pix-automatic-api.ts`: adaptador HTTP com erros sanitizados.
- `src/lib/billing/pix-automatic.ts`: consentimento, criação, conciliação e webhook.
- `/api/dashboard/billing/checkout/[subscriptionId]/pix-automatic`: GET de estado,
  POST com sessão owner/admin, escopo, origem, limite e dados cadastrais do titular.
- `/api/webhooks/asaas/platform-billing`: novo handler antes dos processadores antigos.
- `BillingPixAutomaticCheckout` e `BillingPlanCheckout`: interface integrada.
- Inngest e ciclo de notificações: conciliação sem criar cobrança duplicada.
- `.env.example`: `ASAAS_PIX_AUTOMATIC_ENABLED=false`; usar `true` em produção
  somente após schema, handlers, eventos e conta estarem conferidos. Sandbox usa
  configuração Asaas sandbox e token de webhook, em banco isolado.

Credenciais continuam usando a integração existente: API key/mode, token e URL do
webhook, sem nova chave secreta Pix. Nunca configurar chave de produção num ensaio.

## Webhook real: leitura e mudança preparada

GET real em 17/09 às 19:10:33 BRT encontrou webhook ativo, autenticado e sem fila
interrompida em `/api/webhooks/asaas/platform-billing`. Ele não possui eventos
`PIX_AUTOMATIC_*`. O código de registro foi ampliado para os cinco eventos de
autorização e quatro de instrução. A configuração externa **não foi modificada**:
o novo handler não está publicado devido ao bloqueio Vercel. Atualizar os eventos
depois de disponibilizar o handler, preservando todos os eventos PAYMENT e
SUBSCRIPTION existentes; manter token, URL, conta e ambiente corretos.

## Verificação

208 testes em 15 arquivos passaram na rodada ampla. A suíte Pix final passou com
37 testes, incluindo mais dois cenários de estorno (210 testes distintos validados
no conjunto). Inclui SQL real (onze cenários Pix), cliente errado, preços alterados, modo incompatível, HTTP
400/403/429/503, timeout sem novo POST, consentimento, origem, permissões, ACTIVE
sem pagamento, pagamento sem ACTIVE, evento forjado, repetição e cancelamento de
assinatura preservando acesso pago. ESLint final aprovado. Build final de produção
Next/webpack, TypeScript e 108 páginas aprovado (exit 0), incluindo o ajuste de
cancelamento do mandato após estorno.

Playwright com APIs simuladas verificou as três opções, consentimento obrigatório,
QR/copia e cola, estado pendente sem ativação, confirmação ACTIVE, bloqueio dos
outros meios durante autorização, um único POST e ausência de overflow em 390×844.
Nenhum erro JavaScript observado. Prévia temporária removida ao concluir a inspeção.

## Publicação em lote e teste autorizado

1. Conferir o remote `connectyhub02-sys/novaconnectyhub` e integrar o pacote sobre
   `origin/master`, preservando o histórico. Fazer push para `master`; a pipeline
   GitHub aciona a Vercel existente. Não criar projeto nem alterar DNS.
2. Conferir o histórico remoto e nomes 0153/0154 contra alterações paralelas,
   obter backup privado e aplicar ambas as migrations no banco ConnectyHub.
3. Após as migrations, enviar cartão + Pix Automático + handler + job juntos, com
   criação Pix em produção desabilitada. Validar sessão, rotas e registro Inngest.
4. Atualizar o webhook existente com os nove eventos Pix, preservando demais
   eventos/configuração. Conferir elegibilidade com Asaas. Ativar a flag apenas
   quando tudo estiver disponível; não executar POST financeiro para descobrir isso.
5. Smoke sem pagamento: comparar as três opções, valores, permissões e bloqueio
   explícito em Minha Conta. Teste real separado: titular autoriza um checkout de
   teste específico, realiza primeiro pagamento e consentimento no banco, confere
   um mandato ACTIVE, uma ativação e a próxima data/valor. Nenhum cron forçado ou
   cobrança antecipada é necessário para demonstrar a troca de cartão.
6. Rollback preferencial: desabilitar novas criações Pix e republicar versão
   compatível que continue conciliando mandatos já existentes. Não remover tabelas,
   desfazer pagamentos ou desativar webhooks de mandatos reais indiscriminadamente.

## Referências do contrato

- [Criação da autorização](https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico).
- [Implementação e geração SUBSCRIPTION](https://docs.asaas.com/docs/pix-automatico-implementacao).
- [Conciliação do primeiro pagamento](https://docs.asaas.com/docs/implementation).
- [Eventos e estados](https://docs.asaas.com/docs/eventos-para-pix-autom%C3%A1tico).
- [FAQ e retentativas](https://docs.asaas.com/docs/faq-2).
