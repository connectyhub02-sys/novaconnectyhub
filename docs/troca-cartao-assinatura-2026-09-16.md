# Troca de cartão da assinatura — 16/09/2026

## Entrega e limite

Implementação local, compartilhada por todas as organizações, sem identificadores
ou exceções para Betel/Vision. Em **Minha conta → Assinaturas**, owner/admin encontra
**Alterar método de pagamento** na assinatura ativa. O formulário substitui o
cartão de crédito das renovações Asaas gerenciadas pela ConnectyHub.

Não converte o contrato para Pix/boleto, não habilita recorrência onde ela não foi
autorizada e não migra acordos legados de outros gateways. Nesses casos há motivo
explícito e nenhum envio do cartão ao provedor. Um plano ativo, por si só, não
autoriza ativar débito automático. Acordos Asaas com `provider_subscription_id`
também exigem tratamento próprio no gateway; não basta trocar o cofre local.

**Não publicado. Migration não aplicada em produção. Nenhuma cobrança real,
tokenização real, push ou deploy realizados.**

## Caminho e garantias

- Interface: `account-console.tsx` abre `billing-card-replacement.tsx`, com aceite
  explícito da substituição para renovação e recargas já autorizadas. Nunca usa
  localStorage, URLs ou analytics para os campos; limpa o formulário após envio.
- API: `GET/POST /api/dashboard/billing/subscriptions/:id/payment-method`.
  Organização e executor vêm da sessão; identificadores no corpo não definem
  escopo. Origem igual à aplicação e JSON são obrigatórios no POST; resposta sem
  cache, tamanho limitado e limite de tentativas. RPC confere proprietário ou
  membro owner/admin, sem exceção global de administrador da plataforma.
- Serviço: `card-replacement.ts` registra uma tentativa durável antes de tratar
  cartão/provedor; envia somente `POST /creditCard/tokenizeCreditCard` com o
  `customer_id` do cartão anterior. O titular do novo cartão pode ser diferente
  do pagador, sem trocar o cliente ao qual o token pertence.
- Cofre: somente token cifrado AES-256-GCM e últimos quatro dígitos. PAN completo,
  CVV, titular/documento e resposta bruta do gateway não entram no banco/auditoria.
  Os dados do formulário passam transitoriamente pela API HTTPS da aplicação até
  o Asaas, como no checkout existente; não se trata de um formulário hospedado.
- Banco: a conclusão revalida autorização, elegibilidade e cartão esperado sob
  locks organização → assinatura. Inativa o antigo, insere o novo ativo e troca o
  ID na política de recarga na **mesma transação**. Mantém enable/disable, valores,
  teto mensal e autorização da recarga. Não dispara uma recarga.
- Cobrança em processing/pending/unknown na organização bloqueia a troca,
  inclusive recargas que tenham outra assinatura de produto. Os locks existentes
  de renovação/recarga usam a mesma organização. Uma renovação que leu um cartão
  antigo antes da troca continua sujeita à conferência de cartão ativo no claim.
- Idempotência: mesmo requestId recupera resultado, sem nova tokenização. Duas
  trocas com o mesmo cartão de origem só permitem uma substituição. Perda de
  resposta do banco não sobrescreve possível sucesso; GET recupera o resultado.
  Interrupção do processo antes da conclusão pode deixar auditoria `processing`;
  não existe worker que refaça a troca nem cobrança automática por essa tentativa.
  Nessa situação, conferir cartão/auditoria antes de uma nova solicitação.
- `billing_card_replacements`: organização, executor, assinatura solicitada,
  cartões anterior/novo (IDs internos), horários, versão de consentimento, estado
  e código de resultado sanitizado. RLS e grants só para service_role. Falhas de
  tokenização, acesso e elegibilidade ficam registradas. Requisições inválidas
  antes da identificação da tentativa (sem sessão/UUID/JSON/origem válida) são
  rejeitadas antes da criação do registro.

Nenhuma função nova cria ou atualiza assinatura, plano, ciclo, fatura, pagamento,
saldo, preço ou vencimento. Checkout, renovação e recarga mantêm seus caminhos.

## Migration

Necessária: `0150_subscription_card_replacement.sql`.

Adiciona últimos quatro dígitos ao cofre, permite credencial sem tentativa de
cobrança de ativação, cria a auditoria e três RPCs restritos ao serviço. Registros
existentes e a restrição de um cartão ativo por assinatura são preservados.
Aplicar antes de publicar a interface/API, somente após nova autorização.

A tarefa duplicada arquivada mencionou outra migration com prefixo 0150. Ela
**não faz parte desta entrega**. Não aplicar ambas nem incorporar seus arquivos
sem conciliar o histórico; conferir a numeração no destino ao preparar a release.

## Arquivos da entrega

| Área | Arquivos |
|---|---|
| Painel | `src/components/connectyhub-os/account-console.tsx`, `src/components/connectyhub-os/billing-card-replacement.tsx` |
| API | `src/app/api/dashboard/billing/subscriptions/[subscriptionId]/payment-method/route.ts` |
| Serviço e consentimento | `src/lib/billing/card-replacement.ts`, `src/lib/billing/managed-renewal-policy.ts` |
| Tokenização | `src/lib/sales-catalog/asaas-direct.ts` |
| Banco | `supabase/migrations/0150_subscription_card_replacement.sql` |
| Testes | `tests/billing-card-replacement.test.ts`, `tests/billing-card-replacement-sql.test.ts` |
| Documentação | `docs/estado-operacional.md`, este relatório |

## Evidência local

- 84 testes em seis arquivos: `billing-card-replacement.test.ts`,
  `billing-card-replacement-sql.test.ts`, `managed-asaas-adapter.test.ts`,
  `automatic-topup-outcomes.test.ts`, `native-billing-card.test.ts` e
  `native-billing-sql.test.ts`. Incluem 20 testes SQL com PGlite, DDL real do cofre
  e migration nova: atomicidade, rollback, isolamento, papéis, concorrência,
  idempotência, erros, campos financeiros preservados e permissões SQL.
- Testes HTTP simulados conferem que o único endpoint externo de substituição é
  tokenização; nenhuma chamada a payments, subscriptions ou payWithCreditCard.
- TypeScript (`tsc --noEmit --incremental false`) e ESLint direcionado aprovados.
- Navegador Playwright local com componente real e API simulada: desktop
  1280×900 e celular 390×844, sem overflow horizontal, recusa/sucesso, campos de
  cartão limpos, bloqueio por ausência de renovação, sem erros de página.
  A rota temporária de prévia foi removida.
- Build de produção Next/webpack aprovado, com TypeScript e 108 páginas. A primeira
  tentativa encontrou referências geradas à prévia removida; os dois arquivos
  temporários de tipos foram removidos e o build completo passou. Somente as três
  variáveis Supabase necessárias ao build foram carregadas no ambiente do processo
  a partir do checkout principal, sem novo arquivo de segredo.

Testes locais não comprovam aceitação de um cartão no Asaas nem emissão futura
de cobrança real. Não foi criada cópia de segredos nesta worktree.

## Betel: leitura somente, 16/09 às 17:17 BRT

Consulta ao Supabase da VPS confirmou para Betel Leiloes:

- Assinatura de plano `active`, Asaas, recorrente e sem acordo externo;
- Um cartão ativo no cofre e nenhuma tentativa em processing/pending/unknown;
- Sem cancelamento registrado; fim do período em 14/10/2026 às 10:33:55 BRT;
- Credencial Asaas da plataforma cadastrada no banco e chave de cifragem presente
  no ambiente local consultado. Os valores não foram exibidos nem copiados.

O estado é compatível com a implementação. Presença da credencial e de um token
antigo não comprova validade atual da credencial nem habilitação atual do gateway.
Não foram consultados nem alterados número de cartão, token, fatura ou cobrança.

A [documentação oficial do Asaas](https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito),
consultada em 16/09, informa tokenização sem cobrança, token vinculado ao mesmo
cliente, disponibilidade no Sandbox e habilitação sujeita a análise em produção.
Não há evidência nesta tarefa de credencial faltante na produção; a habilitação
atual só ficará comprovada por validação autorizada do fornecedor/tokenização.

## Roteiro de homologação e validação com Betel

1. Preparar banco/Supabase **isolado**, com migrations até a nova 0150, autenticação
   de owner/admin e outro membro. Criar organização e assinatura fictícias no mesmo
   estado estrutural da Betel (active/asaas/recurring, sem acordo externo), com um
   cartão de homologação ativo. Não apontar aplicação de teste para o banco real.
2. Configurar credencial **Sandbox** Asaas, modo sandbox e chave de cifragem de
   homologação. Usar apenas dados/cartões de teste indicados pelo Asaas. Desabilitar
   workers externos de renovação/recarga neste ambiente. Não chamar checkout pago
   para provar a troca; a fixture do cofre deve usar tokenização independente.
3. Guardar snapshot de assinatura, ciclos, faturas/pagamentos e política de recarga.
   Abrir Minha conta → Assinaturas → Alterar método de pagamento. Preencher o novo
   cartão, aceitar substituição e salvar uma vez. Confirmar sucesso, ID da mesma
   assinatura e exatamente um cartão ativo; antigo inativo. Conferir auditoria de
   sucesso com executor/horário, sem PAN/CVV/token.
4. Comparar snapshot: plano, valores, vencimento, status e ciclo idênticos; nenhuma
   fatura/pagamento/tentativa financeira nova. Recarga mantém autorização/limites,
   apenas aponta para o novo cartão quando usava o antigo. Conferir futuras
   renovações pela seleção do novo token em teste simulado, sem cobrança real.
5. Repetir com cartão recusado, provedor indisponível, membro sem permissão,
   assinatura de outra organização e assinatura sem renovação. O cartão atual deve
   permanecer intacto. Simular requisições simultâneas e resposta perdida; conferir
   auditoria antes de repetir e ausência de qualquer pagamento novo.
6. Para Betel real: migration/publicação foram autorizadas em 16/09, mas estão
   bloqueadas pelo acesso de deploy descrito abaixo. A troca real permanece
   manual pelo titular. Revalidar assinatura e ausência de tentativas pendentes. O titular
   preenche o cartão no próprio painel; não enviar PAN/CVV a chats, logs ou equipe.
   Se o Asaas retornar erro de integração, conferir chave/modo e solicitar a
   habilitação de tokenização à conta do gateway, sem criar cobrança para testar.
7. Repetir a comparação do item 4 imediatamente após a troca. Não disparar cron,
   renovação antecipada, recarga ou cobrança real para validar esse recurso.

**Resposta objetiva:** pronto para homologação local controlada. A Betel possui
estado compatível e credencial cadastrada; o botão ainda não funciona na versão
publicada porque código/migration permanecem locais. Não é necessário recriar a
assinatura. A tokenização real e eventual ação de habilitação no gateway ainda
precisam ser verificadas sob autorização; não há bloqueio de gateway comprovado.

## Tentativa autorizada de publicação — 16/09/2026

Magno autorizou a migration e publicação na **ConnectyHub**, mantendo teste de
cartão real exclusivamente manual. A conferência SSH verificou hostname
`vmi3571281`, container `supabase-db` e diretório Compose
`/opt/connectyhub/supabase`. Os containers Betel existentes na mesma VPS não são
o alvo e não receberam operações.

Pré-check do banco: histórico termina em `0149/studio_operations`; versão 0150,
tabela `billing_card_replacements`, RPC `begin_billing_card_replacement` e coluna
`last_four` ainda ausentes. `activation_attempt_id` continua NOT NULL. Portanto,
a migration necessária continua sendo `0150_subscription_card_replacement.sql`.

Bloqueio de publicação: a CLI Vercel está autenticada em outra conta/equipe e
não encontra o projeto configurado `novaconnectyhub`
(`prj_SVsJoIWfofx7KRpRL7bDJsL5Q8W3`, equipe `team_F30ubMSe0tNWndpvkO9dSCDA`).
A listagem mostra apenas a outra equipe e a consulta autenticada desse projeto
retorna 404. Interrompido conforme a regra do titular de parar diante de bloqueio
de deploy. Nenhuma migration, backup novo, commit, push, deploy ou teste de
cartão real realizado nesta tentativa.

Para retomar: autenticar a Vercel com acesso à equipe/projeto ConnectyHub; depois
conferir a versão atualmente publicada e o schema novamente, gerar backup privado
do schema/tabelas afetadas, ensaiar a migration com rollback transacional,
aplicar somente a 0150 e publicar o app ConnectyHub. Não é necessário reiniciar
Inngest, relay ou serviços da Betel. O retorno preferencial, caso o novo app tenha
problema, é republicar a versão anterior mantendo a migration aditiva. Reverter
o schema exigirá antes conferir se já existem trocas reais e preservar auditoria
e credenciais novas; não restaurar indiscriminadamente dados financeiros antigos.

O ambiente publicado **ainda não está pronto** para o teste manual de troca.

## Ampliação e auditoria — 17/09/2026

**Implementado localmente:** formulário Minha Conta com número agrupado, entrada
numérica, identificação de bandeira, bandeiras aceitas visíveis, validade MM/AA,
CVV por bandeira, CPF/CNPJ com dígitos verificadores, telefone e CEP. Erros por
campo usam `aria-invalid`/`aria-describedby`; a API aplica a mesma validação.
Após tentativa enviada, dados sensíveis são apagados do formulário. Novo módulo
`replacement-card-input.ts` mantém essas regras fora dos demais checkouts.

**Auditoria da renovação:** teste `billing-card-replacement-sql.test.ts` aplica
DDL real do cofre e migration 0150 em PostgreSQL/PGlite. Usa o leitor real
`loadActiveAsaasCard` antes/depois do commit para provar seleção do novo token.
Executa o worker real `attemptManagedAsaasRenewal` com provedor simulado:
fora de D-3..D-1 não cobra; dentro da janela, claim recebe o novo ID e pagamento
simulado recebe o novo token. Outros testes comparam assinatura antes/depois,
ausência de faturas/pagamentos/ciclos novos, recarga autorizada preservada e
rollback integral do cartão anterior em falha. É evidência local, não renovação
real aprovada pelo banco.

**Pix Automático:** as duas superfícies mostram a opção desabilitada com razão
explícita. Pix comum tem identificação de pagamento manual, sem autorização de
débito recorrente. A nova rota `checkout/[subscriptionId]/pix-automatic` só expõe
capacidade indisponível para owner/admin da organização e rejeita POST com 409;
não cria mandato, não ativa plano nem encaminha para Pix comum. A troca de método
também rejeita `method: pix_automatic` antes de qualquer chamada ao provedor.
Isso é bloqueio preventivo, **não implementação funcional da modalidade**.

### Evidência Asaas e limites

Em 17/09/2026 às 18:39 BRT, uma única consulta autenticada **GET**, usando a
credencial de produção da plataforma em memória, retornou HTTP 200 e zero
autorizações em `/v3/pix/automatic/authorizations?limit=1`. Nenhuma chave, token
ou dado de pagador foi exibido. O resultado prova acesso à listagem, não permissão
de criação ou elegibilidade de recebimento. Não foi identificado endpoint público
dedicado de consulta de elegibilidade na documentação pesquisada. O menu da conta
também não é evidência suficiente.

Documentação oficial consultada:

- [Criar autorização](https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico):
  `immediateQrCode` obrigatório; Jornada 3 combina primeiro pagamento e autorização.
- [Implementação](https://docs.asaas.com/docs/pix-automatico-implementacao):
  mandato precisa de confirmação; emissão do QR não equivale a ACTIVE.
- [Pix Automático](https://docs.asaas.com/docs/pix-automatico): instruções MANUAL
  precisam de antecedência de 2 a 10 dias úteis, distinta do worker de cartão.
- [Eventos](https://docs.asaas.com/docs/eventos-para-pix-autom%C3%A1tico): tratar
  ACTIVE, REFUSED, EXPIRED, CANCELLED e eventos de instrução/eligibilidade.

**Pendente:** implementar persistência de autorizações/instruções, confirmação
de primeiro pagamento e ACTIVE antes de ativar recorrência, autenticação e
idempotência de webhook, reconciliação por consulta e agenda em dias úteis. O
checkout inicial pode seguir Jornada 3 após esses componentes e habilitação serem
verificados. Para plano ativo, continua pendente confirmar com o provedor uma
jornada sem pagamento inicial; não antecipar vencimento/cobrança para contornar
essa limitação. Recargas autorizadas por cartão exigem decisão explícita antes
de serem migradas para outro meio. Nenhuma autorização/cobrança/webhook real foi
criado para testar.

**Verificação local:** 100 testes em oito arquivos passaram, incluindo 21 testes
SQL, validação de documentos/bandeiras, fronteiras HTTP e indisponibilidade de
Pix Automático. TypeScript e ESLint aprovados. Prévia Playwright em 1280×900 e
390×844: sem overflow/erros JS, máscara correta, CPF inválido impede envio,
Pix Automático desabilitado, recusa limpa campos, sucesso e inelegibilidade.
A rota temporária de prévia foi removida.
Build final Next/webpack aprovado, incluindo TypeScript e 108 páginas. A primeira
tentativa encontrou tipos gerados da prévia removida; os dois arquivos temporários
gerados foram removidos e a nova execução terminou com código zero.

**Publicado:** nenhuma alteração desta tarefa. **Bloqueado:** acesso de deploy
Vercel conforme verificação de 16/09, não repetida em 17/09. Último schema remoto
conferido ainda sem 0150. Checkout inicial e troca para Pix Automático permanecem
pendentes, mesmo após eventual publicação deste bloqueio visual/API.

## Decisão de pacote completo e bloqueio verificado — 17/09, 19:10 BRT

O titular vetou deploy isolado da melhoria de cartão e autorizou publicar somente
o pacote completo, após implementação/validação. Também instruiu parar se faltar
habilitação, credencial ou webhook Asaas. Essa condição foi constatada antes de
iniciar a implementação funcional do mandato.

### Consulta real somente de leitura

`GET https://api.asaas.com/v3/webhooks?limit=100&offset=0`, autenticado com a
credencial de produção da plataforma, em 17/09/2026 às 22:10:33 UTC (19:10 BRT):

| Item | Resultado |
| --- | --- |
| Webhook ConnectyHub | `/api/webhooks/asaas/platform-billing` |
| Ativo | Sim |
| Fila interrompida | Não |
| Autenticação cadastrada | Sim, campo oficial `hasAuthToken=true` |
| Eventos de pagamento observados | CREATED, CONFIRMED, RECEIVED, OVERDUE, DELETED, REFUNDED |
| Eventos `PIX_AUTOMATIC_*` | Nenhum |

Foi lida toda a listagem retornada, respeitando paginação. Nenhum token, chave,
dado de pagador ou conteúdo bruto do webhook foi registrado. O resultado seguro
ficou em arquivo local ignorado `tmp/asaas-pix-webhooks-readonly-result.json`.
O campo `hasAuthToken` comprova configuração; a API não retorna o segredo.
Fonte do contrato: [listar webhooks](https://docs.asaas.com/reference/listar-webhooks).

**Bloqueio de ambiente comprovado:** não há webhook ConnectyHub recebendo
ACTIVE/CANCELLED/EXPIRED/REFUSED de Pix Automático. A listagem de autorizações com
HTTP 200 não substitui isso nem comprova permissão para criar mandatos. Não se
afirma que a conta é inelegível: essa situação permanece não comprovada.

**Bloqueio de produto/provedor comprovado pelo contrato público:** a
[criação de autorização](https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico)
exige `immediateQrCode`, cujo objeto exige `originalValue` e `expirationSeconds`.
A [jornada documentada](https://docs.asaas.com/docs/pix-automatico) combina
primeiro pagamento e autorização. Portanto esse endpoint não atende a troca
imediata sem pagamento inicial exigida para plano ativo. Não inferir que valor
zero, cobrança simbólica ou pagamento adiantado resolvem o requisito.

### Contrato confirmado para a futura implementação

- Na contratação inicial, separar `immediateQrCode.originalValue` (total inicial)
  de `value` (preço recorrente), incluindo desconto/adicionais com suas regras.
- Usar `paymentCreationMode=SUBSCRIPTION` para o Asaas gerar os ciclos; não
  criar também cobranças pelo worker D-3..D-1 de cartão.
- Persistir ID do mandato, `contractId`, `customerId`, `subscriptionId` Asaas,
  estado, organização/assinatura e `immediateQrCode.conciliationIdentifier`.
  O identificador de conciliação relaciona o pagamento inicial; confirmar no GET
  remoto e exigir valor/cliente corretos, sem confiar somente no webhook.
- A resposta de criação contém QR `payload`/`encodedImage`; emissão não ativa
  plano. Esperar primeiro pagamento confirmado e autorização ACTIVE.
- Persistir eventos de forma idempotente e reconciliar estado remoto para eventos
  repetidos ou fora de ordem; nunca refazer POST após timeout ambíguo sem localizar
  a autorização original pela consulta paginada de cliente e `contractId`.
- Retentativa de entrega/conciliação não deve gerar novo débito. Retentativas
  financeiras extradia são uma política específica (`ALLOW_THREE_IN_SEVEN_DAYS`)
  e precisam de consentimento/implementação próprios; não herdar tentativas de
  cartão. Intradia é responsabilidade do banco pagador.
- Cancelar/refusar/expirar mandato remove a capacidade de débito futuro sem apagar
  auditoria ou encurtar o período já pago. Conferir também instruções agendadas.

### Publicação em lote após desbloqueio

1. Resolver a jornada de troca sem primeiro pagamento com Asaas; não simular essa
   capacidade na interface. Completar mandato/webhook/reconciliação e testes de
   contrato para ambos os fluxos suportados, incluindo concorrência entre métodos.
2. Preparar migration nova para mandatos/eventos/instruções, RLS e auditoria;
   manter 0150 para cartões. Validar banco isolado, testes, build e interface.
3. Conferir credencial/mode/token do webhook existentes. Registrar os eventos
   de autorização e instrução no webhook existente quando esse passo for liberado,
   preservando todos os eventos PAYMENT já utilizados. Não foi definida nova
   variável de ambiente nem criado webhook nesta rodada.
4. Revalidar acesso à Vercel ConnectyHub (bloqueado na última consulta em 16/09),
   backup/schema remoto e compatibilidade; aplicar migrations e app como um pacote,
   com caminho de retorno que preserve auditoria financeira.
5. Após publicação, fazer smoke sem pagamento: menu, permissões e status. Teste
   financeiro exige autorização específica adicional: titular inicia o checkout,
   confirma pagamento/autorização no próprio banco, verifica ACTIVE+pagamento e
   próxima data. Não forçar cron, trocar cliente real ou cobrar para provar a troca.

**Estado ao parar:** cartão implementado e validado anteriormente; Pix Automático
funcional ainda não implementado. Esta rodada realizou pesquisa e leituras reais,
sem mudança de código funcional, migration aplicada, webhook alterado, mandato,
cobrança ou deploy. A parada segue a instrução explícita recebida; não é uma
alegação de que o pacote está pronto para publicação.
