# Plano vencido, cancelamento e adesão ao Pix Automático — 17/09/2026

Auditoria somente de leitura, às 23:15–23:18 BRT. Nenhuma regra, contrato,
fatura, cobrança, autorização ou configuração financeira foi alterada.

## Regra publicada e configuração real

- A assinatura recorrente inspecionada está `past_due`, organização `past_due`,
  `canceled_at=null`. Fim do ciclo: **16/09/2026 às 20:24:39 BRT**.
- A função publicada `resolve_organization_contract_access` retorna
  `allowed=false`, `reason=paid_expired`; o bloqueio começa no fim do ciclo.
- Política real: `grace_period_days=0`, `suspend_after_days=0`.
  Não há dias adicionais de acesso pagos depois do vencimento. O controle de
  acesso calcula isso no uso, mesmo antes da próxima atualização do status.
- `suspend_expired_platform_contract` fecha o ciclo vencido e mantém contratos
  **recorrentes** em `past_due`. Apenas preserva `canceled` existente ou encerra
  contratos de pagamento único. Não converte inadimplência recorrente em
  cancelamento após X dias. `past_due_at` é regravado pelo sweep, portanto não é
  evidência confiável do primeiro instante da suspensão.
- `paused`/suspensão administrativa são condições distintas. Vencimento não
  exige esse status para bloquear os recursos pagos. Regularização e produtos
  avulsos pagos permanecem acessíveis conforme o controle contratual.

Não foi encontrado prazo automático de 7, 15, 30 ou outro número de dias para
cancelar esse contrato recorrente. A lista de funções publicadas que manipulam
assinaturas/cancelamento foi conferida; os outros caminhos são eventos de
provedor, estorno, substituição de tentativa ou operações comerciais específicas,
não uma conversão temporal genérica de `past_due` em `canceled`.

## Worker e mensagens

`connectyhub-platform-automation-sweep` (`src/lib/inngest/functions.ts`) roda a
cada cinco minutos e chama `processPaidBillingLifecycleNotifications` e a fila
financeira. O contrato inspecionado registra origem `paid_lifecycle_sweep`, com
atualização às 23:15 BRT. O worker não foi disparado manualmente nesta auditoria.

Configuração real: WhatsApp global ligado, avisos diários começando três dias
antes, tentativa de cartão três dias antes habilitada, fallback Pix após falha
e avisos aos responsáveis habilitados. Opt-out e disponibilidade do remetente
continuam condicionando entrega; cartão exige autorização/vault válido.

- Antes do vencimento: lembrete do prazo e link de renovação.
- Ao expirar sem renovação: informa vencimento, preservação dos dados e pausa
  dos recursos pagos até regularizar, com caminho de renovação.
- Mensagens de carência só se aplicam quando a política permitir carência; com
  zero dias, a regra entra diretamente em expirado no instante limite.
- O aviso expirado usa deduplicação por contrato/período; o sweep não implica
  WhatsApp novo a cada cinco minutos nem cancelamento futuro.
- Aviso `subscription_canceled` exige um cancelamento efetivo; não é disparado
  só porque a assinatura permanece vencida.

Para o contrato inspecionado, banco registra quatro lembretes `sent` para o
owner e quatro para responsável, entre 13/09 à noite e 16/09 00h BRT. Registra
um aviso expirado para cada destinatário em 16/09 às 20:25 BRT. Não há evento de
cancelamento. `sent` é estado interno de envio, não confirmação de entrega ou
leitura no WhatsApp. Templates específicos estavam vazios: aplicam-se os padrões
versionados e a voz do remetente da plataforma/cliente.

## Por que esperar não libera Pix Automático

`plan-intent` busca contrato bloqueante em `pending`, `active`, `past_due` ou
`incomplete`. Um contrato `active`/`past_due` do mesmo plano gera/reutiliza
`renewal`; de outro plano, `plan_change`. A passagem do tempo não muda esse caminho.
API e RPC Pix atuais exigem contratação `initial` e assinatura `pending` ou
`incomplete`, sem outra assinatura externa vinculada e sem campanha variável.

Um contrato realmente cancelado deixa de ser bloqueante para a criação de uma
nova intenção `initial` se não existir outro contrato bloqueante. Isso descreve
uma condição do código, não uma jornada publicada de migração nem autorização
para editar status ou abandonar uma cobrança pendente.

Caminho disponível hoje: regularizar por Pix comum/cartão. Para adotar Pix
Automático durante a renovação, falta uma jornada própria. Recomendação de
produto: adesão transacional no vencimento, conciliando a cobrança aberta e o
contrato anterior, fixando qual período o primeiro Pix paga, capturando novo
consentimento e garantindo um único pagamento/mandato/lançamento de créditos.
Cancelamento efetivo seguido de nova contratação é outra possibilidade, mas
precisa encerrar pendências e preservar histórico/direitos; não deve ser um
atalho que apenas troca `past_due` por `canceled`.

Nenhuma dessas mudanças financeiras foi implementada nesta auditoria.

## Fontes locais conferidas

- `src/lib/billing/paid-lifecycle-notifications.ts` — seleção de prazo e suspensão.
- `src/lib/billing/renewal-policy.ts` — política e normalização.
- `src/lib/billing/contract-access.ts` e funções PostgreSQL publicadas — acesso.
- `src/lib/inngest/functions.ts` — sweep e frequência.
- `src/lib/billing/platform-billing-messages.ts` e `platform-billing-webhook.ts` —
  templates, destinatários, opt-out, deduplicação e envio.
- `src/app/api/dashboard/billing/plan-intent/route.ts` — nova intenção/renovação.
- `src/lib/billing/pix-automatic.ts` e `begin_billing_pix_authorization` publicado —
  elegibilidade da autorização Pix.

## Escopo proposto: “Reativar com Pix Automático”

**Backlog, não implementado nem autorizado para executar em clientes.**

A auditoria encontrou peças reaproveitáveis: `retirePlatformCheckout`,
`hold_commercial_invoice_revision`, `void_commercial_invoice_revision` e
`retireAsaasPayment` bloqueiam/reconciliam cobranças antes de substituí-las.
`cancelPendingSubscription`, porém, cancela somente `pending`/`incomplete`.
A criação de intenção atual ocorre em etapas separadas. Não existe operação
completa que encerre `past_due` e crie o contrato substituto com idempotência,
controle de renovação concorrente, recuperação de falhas e trilha do lead.

### Fluxo de produto

1. Mostrar “Reativar com Pix Automático” ao owner/admin de contrato vencido,
   bloqueado por prazo e sem mandato ativo; manter Pix comum/cartão como opção.
2. Fazer uma prévia autenticada sem mutação: plano, período encerrado, estado das
   cobranças, valor inicial, valor recorrente, início do novo período e tratamento
   da cobrança aberta. Indicar explicitamente qualquer mudança de condição.
3. Pedir confirmação específica: encerrar o contrato vencido para trocar o método,
   preservar histórico/pagamentos anteriores e iniciar nova contratação. Separar
   essa confirmação do consentimento de pagamento e renovação no banco.
4. Depois da conclusão da migração, abrir o novo checkout com Pix Automático
   selecionado. **Não gerar QR automaticamente.** Endereço/consentimento continuam
   exigidos. O plano só é liberado após pagamento confirmado e autorização ativa.

### Regra proposta para a cobrança aberta

Primeira versão limitada a renovação não paga sem débito externo em andamento:
substituir a fatura vencida como `superseded` pela nova contratação, mantendo
vínculos e motivo, sem recebimento nem estorno fictício. Isso é uma decisão de
produto proposta, não uma política de inadimplência já aplicada. O novo pagamento
compra um novo período a partir da ativação; não creditar o período anterior.

Se existir cobrança externa, primeiro conferir titularidade, referência, valor,
status e todas as tentativas. Pagamento processando, resultado desconhecido,
mandato vivo, disputa ou pagamento recém-confirmado bloqueiam a migração até
conciliação. Uma cobrança elegível a cancelamento precisa ser encerrada e
confirmada no provedor antes de criar a substituta. Uma resposta ambígua não
libera outro pagamento. Se a política comercial exigir quitação da dívida,
usar regularização e adesão posterior, sem misturar as duas jornadas.

### Implementação necessária

- Operação durável de migração, única por contrato de origem, com chave de
  idempotência, ator, organização, versão da prévia e consentimento registrado.
- Reserva sob bloqueio da organização/contrato/fatura na mesma ordem financeira
  existente. Guardas compartilhadas com renovação automática, Pix, cartão,
  edição de carrinho e webhooks; não basta bloquear só o novo endpoint.
- Estados explícitos para preparação, conciliação/retirada externa, conclusão e
  revisão necessária. Falhas de rede retomam a operação persistida. Não simular
  rollback local de um cancelamento externo já confirmado.
- Transação final revalida ausência de pagamento/mandato concorrente; encerra
  contrato antigo com motivo de migração, desativa renovação automática antiga,
  vincula cobranças substituídas e cria um único contrato `pending` + checkout
  `initial`. Preservar condições comerciais ou exigir revisão explícita; não
  reaplicar automaticamente desconto de primeira compra por trocar de método.
- Contrato novo recebe vínculos de origem/destino e apenas a carteira correta.
  Nenhum crédito ou direito é liberado nessa transação. A confirmação financeira
  usa o fulfillment idempotente existente; cancelamento/estorno também precisa
  distinguir contratos e ciclos antigos/novos.
- Eventos na jornada comercial da plataforma: intenção de reativação, confirmação,
  contrato anterior encerrado, checkout substituto criado, migração em revisão e
  ativação confirmada. O worker arquiva no lead correto, sem token/QR/PAN/CVV.
- Cancelar a prévia é inerte. Depois de encerramento externo confirmado, eventual
  abandono do checkout novo permanece recuperável; não reativar o antigo por UI.

### Critérios de aceite antes de habilitar

Testar PostgreSQL/serviço/UI: repetição e clique duplo; duas abas; escopo de outra
organização; preço/revisão alterados; corrida com webhook pago e sweep de cartão;
falha antes/depois da retirada externa; resposta ambígua; retomada após crash;
contrato novo abandonado; nenhum crédito antecipado; primeira confirmação
liberando créditos uma só vez; migração sem reaplicar desconto inicial; histórico
pagamento antigo preservado e eventos do lead na organização comercial correta.
Liberar atrás de flag após esses testes e revisão da regra de fatura substituída.
Teste financeiro real em organização do titular exige autorização própria.
