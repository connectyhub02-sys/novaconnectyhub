# Auditoria de cobrança — 26/10/2026

## Parecer

**Não considerar o sistema integralmente saudável para operação sem acompanhamento.**
Há pagamentos e créditos corretamente conciliados, rotinas regulares e proteções
contra duplicidade. Entretanto, há avisos financeiros efetivamente não enviados,
falhas reproduzíveis no Pix Automático, divergência na base de saldo usada pela
recarga e falta de comprovação de renovação/recarga autônoma bem-sucedida.

Auditoria realizada aproximadamente entre 16h14 e 16h29 BRT. Código publicado
`b8faced7e9380487d4686eb790203233478d44e2`, slot b, confirmado pelo health público.
Consultas ao PostgreSQL de produção e Inngest em transações somente leitura;
Asaas produção consultado exclusivamente por GET. Nenhum débito, mensagem,
mandato, mudança de autorização, reparo de dados ou deploy foi executado.

## Cobertura e evidências

| Área | Evidência atual | Avaliação |
| --- | --- | --- |
| Agendadores | 576 execuções concluídas de cada uma das duas rotinas financeiras nas 48 horas consultadas; intervalo de cinco minutos | Executam, mas conclusão não comprova sucesso financeiro |
| Cartão | Um pagamento inicial/promocional aprovado, confirmado no Asaas; duas tentativas pontuais de renovação recusadas | Integração comprovada; nenhuma tentativa com `automatic_day` preenchido |
| Planos | 3 assinaturas ativas administrativas, 3 vencidas, 1 pendente e 7 canceladas | Inventário exige distinguir autorização, exceção administrativa e inadimplência |
| Pix comum | Um pagamento de R$ 9,99 recebido e com fulfillment de 25.000 créditos | Caminho real comprovado nesse pagamento |
| Recarga automática | Uma política ativa, verificada pelo worker; zero registros em `credit_topup_runs` | Configurada, sem cobrança real homologada |
| Pix Automático | Flag ativa; única autorização CANCELLED no banco e Asaas; zero ACTIVE e zero efeitos iniciais concluídos | Criação/cancelamento comprovados; ativação e renovação não comprovadas |
| Avisos | 7 falhas recentes, todas com cinco tentativas e sem ID de envio | Falha operacional atual |
| Webhook Asaas | Habilitado, fila não interrompida, eventos de pagamentos e Pix Automático presentes | Configuração atual correta; entrega individual não foi inspecionada na interface Asaas |
| Integridade | Dois pagamentos aprovados, ambos com fulfillment e transação de crédito; saldos iguais à soma do livro de créditos | Sem divergência nas verificações descritas abaixo |

Os 370 testes existentes executados passaram, em 35 arquivos carregados. Três
experimentos adicionais reproduziram comportamentos problemáticos. Testes usam
dublês/ambiente local e não substituem liquidação bancária ou entrega ao cliente.
Os arquivos financeiros examinados na cópia com dependências foram comparados
com este checkout; diferenças detectadas eram somente terminações de linha.

## Achados prioritários

### A1 — P1: avisos de saldo e renovação não estão chegando ao provedor

Sete eventos recentes em `billing_notification_events` estão `failed`, sem
`provider_message_id`, todos com cinco tentativas:

- Vision: saldo abaixo de 20%, saldo abaixo de 10% e autorização da recarga.
- Pizzaria Macedo&Dias: quatro eventos de lembrete de renovação, incluindo
  destinatários responsáveis. O plano vence em 28/10 e não tem cartão ativo salvo.

Erro registrado: nenhum WhatsApp disponível. O agente configurado como remetente
da plataforma, Eliane, está `needs_review`, com conexão `archived`. A Vision tem
conexões de WhatsApp, mas seu registro de agente atual não satisfaz a seleção do
remetente de avisos (`metadata.agent_kind=whatsapp` e vínculo de instância).
Na Pizzaria, o agente Max está `needs_review` e `agentEnabled=false`, apesar de a
conexão aparecer conectada. Não tratar conexão de transporte como agente elegível.

`notification-sender.ts` exige um remetente elegível; o fallback da plataforma
também está indisponível. Não se deve reativar atendimento comercial ou trocar
preferências do cliente só para contornar esse problema.

`platform-billing-webhook.ts:1969` seleciona apenas `attempts < 5`. Portanto,
reconectar o remetente não recupera automaticamente esses sete eventos. O texto
“será tentado novamente” permanece gravado mesmo depois do limite. Há ainda dois
eventos antigos, de 14/09, em entrega incerta, fora da fila automática; precisam
de conferência antes de qualquer reenvio.

**Correção necessária:** restaurar um remetente financeiro autorizado, distinguir
falha antes do envio de entrega incerta, criar fila de atenção para tentativas
esgotadas e retomar somente avisos ainda pertinentes. `sent` deve continuar sendo
distinto de entregue/lido; não foi comprovado recebimento no aparelho do cliente.

### A2 — P1: criação de Pix Automático incompatível com a origem interna do proxy

Em `src/app/api/dashboard/billing/checkout/[subscriptionId]/pix-automatic/route.ts`,
depois do guard que aceita a origem pública configurada, há outra comparação
direta entre `Origin` e `new URL(request.url).origin`.

O runtime publicado usa `HOSTNAME=0.0.0.0`, `PORT=3000`, enquanto a origem pública
é `https://www.connectyhub.com.br`. O Next instalado monta a URL inicial usando
hostname/porta internos. Experimento com usuário autorizado, cabeçalhos de proxy
e URL interna reproduziu HTTP 403, antes de `beginPixCheckout`; o controle com URL
pública chegou ao serviço simulado e retornou 200.

**Correção necessária:** aplicar a validação de origem pública confiável já usada
pelas rotas corrigidas de cartão, mantendo rejeição de origem externa e CSRF.
Não foi feito POST autenticado de criação em produção; a conclusão resulta da
topologia publicada, implementação do Next e reprodução isolada.

### A3 — P1: primeiro Pix recebido pode ficar sem fulfillment se a recorrência falhar

`pix-automatic.ts:112` retorna sem registrar/liberar o pagamento inicial quando o
mandato ainda não está ACTIVE. Além disso, a reconciliação exclui REFUSED.
O experimento com pagamento inicial RECEIVED e mandato REFUSED confirmou que
nenhuma reserva/vinculação ou fulfillment é chamado.

O Asaas documenta que o primeiro pagamento pode estar recebido mesmo quando o
banco não confirma a autorização recorrente. O dinheiro permanece recebido; a
autorização dos ciclos seguintes é que falhou. Ver
[FAQ oficial](https://docs.asaas.com/docs/faq-2) e
[fluxos de webhook](https://docs.asaas.com/docs/fluxos-de-webhook).

**Correção necessária:** separar o reconhecimento do pagamento inicial da
permissão para cobrar os próximos ciclos; registrar o pagamento uma única vez e
tratar a ausência de autorização recorrente explicitamente. Não ativar recorrência
recusada nem estornar automaticamente. Não há cliente afetado identificado no
histórico atual, pois não existe primeiro pagamento de Pix Automático concluído.

### A4 — P1: recarga usa saldo bruto, enquanto o uso depende do saldo disponível

A função **instalada em produção** `claim_credit_topup(uuid)` lê somente
`balance_credits`; não subtrai `reserved_credits`. A UI de Minha Conta e os
serviços de consumo consideram as reservas.

Exemplo: saldo 250, reserva 200 e gatilho 100 deixam apenas 50 disponíveis,
mas não disparam recarga. É possível faltar saldo para uma operação antes de o
gatilho de recarga ser atingido. Durante a consulta da Vision havia
2.878,695240 créditos brutos e 233,654400 reservados, portanto 2.645,040840
disponíveis; **nesse instante não havia recarga devida**, em nenhuma das bases.

**Correção necessária:** alinhar gatilho, avisos e exibição à mesma definição de
saldo e testar concorrência, liberação de reservas, teto e idempotência. Preservar
condições autorizadas; corrigir o cálculo não autoriza aumentar o teto mensal.

### A5 — P1: falhas financeiras podem parecer sucesso operacional

A execução de 16h20 BRT terminou como Completed/`swept`, mas continha
`paidLifecycle.failed=1`. O retorno do worker não eleva falhas de negócio a alerta
operacional por si só. A fila de avisos já esgotados também fica fora da consulta
de pendentes.

Em `automatic-topups.ts`, erro do RPC de reserva é ignorado com `continue`; o
worker atualiza `last_checked_at` e retorna `attempted:0`. Um experimento com erro
simulado de banco reproduziu esse resultado. Em renovação, o retorno
`cardAttempt.failed` não é contado diretamente em `summary.failed`.

**Correção necessária:** registrar resultados distintos para inelegível, recusado,
falha técnica, entrega incerta e falha esgotada; monitorar sucesso de negócio,
idade das pendências e cobranças elegíveis sem tentativa. Não usar retries da
função inteira para repetir débitos incertos. Isolar a etapa de recargas das
reconciliações de IA que hoje a antecedem na mesma função; as últimas execuções
consultadas chegaram à etapa de recarga normalmente.

### A6 — P2: recuperação de vencidos depende de operação explícita

A política de cartão autoriza até uma tentativa por dia em D−3, D−2 e D−1, após
09h de São Paulo. Não há tentativa no vencimento ou recuperação automática de
dívida vencida. Isso corresponde ao consentimento vigente, mas significa que
uma falha nessa janela não será corrigida simplesmente na próxima execução.

Na Betel, o marcador temporário de campanha que bloqueava cobrança foi corrigido
pela migration 0210. A assinatura atual não conserva os dois bloqueios. A tentativa
pontual autorizada em 23/10 foi recusada (`check_card_limit`, HTTP 400), teve efeitos
de recusa concluídos e não gerou créditos. O GET atual do Asaas mostra OVERDUE,
sem pagamento. O contrato permanece vencido desde 14/10; acesso resolvido como
`paid_expired`. A dívida não está regularizada.

As duas tentativas de renovação existentes são pontuais, com `automatic_day` nulo.
Não existe evidência de tentativa agendada de cartão bem-sucedida no histórico
consultado. Nenhuma das assinaturas atuais tem simultaneamente cartão autorizado,
cobrança habilitada e vencimento futuro: Betel já venceu; Vision está desativada
administrativamente; as demais não têm cartão ativo.

**Ação necessária:** fila operacional de cobranças elegíveis sem tentativa e de
vencidos, com recuperação conforme autorização; homologar o ciclo agendado sem
antecipar cobrança de cliente. Não expandir silenciosamente o consentimento.

### A7 — P2: Pix recebidos diretamente não são conciliados com contratos

A listagem completa de pagamentos da conta Asaas retornou sete registros,
`hasMore=false`: quatro recebidos, dois vencidos e um estornado. Quatro têm vínculo
com `billing_payments`. Três são Pix recebidos diretamente, sem referência da
plataforma: R$ 10.000 recebidos em setembro, R$ 5.000 em outubro e R$ 3.500 estornados.
Seus eventos aparecem como ignorados porque não foi encontrado pagamento local.

Isso **não prova perda de crédito, dívida incorreta ou falha no checkout**: podem
ser recebimentos conciliados comercialmente fora do módulo. O sistema não deve
abater uma mensalidade apenas por nome do pagador ou valor. Falta uma trilha
explícita para relacionar o recebimento direto ao contrato/fatura e registrar o
motivo quando não pertence à cobrança da plataforma.

## Vision: situação da autorização atual

- Cartão ativo final 7842; a recarga aponta explicitamente para esse registro.
- Recarga habilitada: 5.000 créditos por R$ 47, ao atingir 100 créditos; teto
  R$ 47/mês. Isso permite **uma recarga aprovada por mês**, não reposição ilimitada.
- Worker verifica a política, mas ainda não há tentativa de recarga.
- Mensalidade de R$ 10.000 continua com `auto_charge_disabled=true`, por origem
  administrativa. Trocar cartão ou autorizar recarga não autoriza essa mensalidade.
- Acesso atual liberado por exceção `admin_manual_access`; não confundir com
  mensalidade paga. Nenhuma dessas opções foi alterada na auditoria.

## Verificações aprovadas e limites

- Os dois pagamentos locais aprovados foram encontrados como RECEIVED no Asaas,
  com valores iguais e fulfillment existente. CONFIRMED local versus RECEIVED
  remoto no cartão é uma evolução do provedor, não uma divergência de valor.
- Nenhuma duplicidade de `provider_payment_id` local; nenhuma duplicidade de
  débito por `usage_event_id`; nenhuma referência de consumo ou transação de
  fulfillment inexistente.
- Nenhuma carteira negativa ou reserva negativa. A soma das transações coincide
  com o saldo de cada carteira, dentro de 0,000001 crédito, na leitura transacional.
- Nenhuma fatura paga sem pagamento aprovado/estornado associado.
- Webhook ativo e sem interrupção no Asaas. Há autenticação e controles de
  idempotência no código; a API de listagem não devolveu `authToken`, o que não
  significa que ele esteja ausente na configuração.
- Zero assinaturas externas Asaas na listagem atual. A recorrência de cartão
  gerenciada pela aplicação não depende de uma assinatura externa.
- Os logs de entrega individual do Asaas são disponibilizados apenas pela
  [interface web](https://docs.asaas.com/docs/logs-de-webhooks); não foram acessados.
  Os registros locais e GETs comprovam os estados descritos, não todas as entregas.
- Um evento antigo da integração de loja tem token inválido em setembro; não é
  prova de falha atual do webhook de cobrança da plataforma.
- O handler genérico de webhook da plataforma retorna 200 com `processing:deferred`
  em um catch. Essa ramificação merece fila durável de recuperação; os fluxos
  nativos/Pix interceptados antes dela retornam erro em falhas. Não foi encontrada
  falha nessa ramificação nos registros de auditoria consultados.
- Não foram testados financeiramente novo cartão, compra de créditos, recarga,
  nova autorização Pix Automático, renovação, estorno ou chargeback. Não há
  certificação ponta a ponta desses cenários pelo simples sucesso dos testes.

## Ordem de tratamento e critérios de encerramento

1. Restabelecer os avisos financeiros e tratar os sete eventos esgotados, com
   revisão de pertinência e de destinatários. Comprovar envio e entrega autorizados.
2. Corrigir origem do Pix Automático e separar pagamento inicial de autorização
   recorrente. Testar pagamento recebido + autorização recusada, eventos duplicados
   e fora de ordem, cancelamento, estorno e renovação.
3. Corrigir base de saldo da recarga e tornar falhas técnicas observáveis. Testar
   reservas concorrentes, recusa, resposta incerta, teto mensal e cartão substituído.
4. Implantar acompanhamento financeiro de vencimentos sem tentativa, avisos
   esgotados, conciliação pendente e recebimentos sem vínculo. Distinguir exceções
   administrativas e opt-out de defeitos de cobrança.
5. Homologar renovação agendada, recarga e Pix Automático em ambiente controlado.
   Uma operação real exige titular, valores e condições autorizados; verificar
   pagamento no provedor, uma única liberação de créditos, aviso e próxima cobrança.

As correções e homologações acima permanecem **pendentes**. O resultado desta
tarefa é o diagnóstico, não uma declaração de reparo ou publicação.

## Reprodução local

Evidências e scripts de consulta desta sessão estão em
`C:/Users/conne/Documents/ConnectyHub/output/billing-audit-20261026/`:
`provider-sanitized.json`, consultas `.sql`, leitores Asaas somente GET e
`diagnostic.test.ts`. Credenciais são carregadas do ambiente em memória; os scripts
não as imprimem. Não versionar dados brutos de clientes nem arquivos de ambiente.

Experimentos: `npx vitest run output/billing-audit-20261026/diagnostic.test.ts`
na cópia principal com dependências. Os três testes afirmam o comportamento
problemático observado para reproduzi-lo; **não são critérios de aprovação de uma
correção futura**. A futura regressão deve exigir o comportamento correto.
