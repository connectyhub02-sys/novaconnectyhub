# Recarga automática e avisos de saldo — 10/09/2026

> Registro histórico da verificação inicial. A proposta de remetente abaixo foi substituída, nesta mesma data, pela regra de usar o agente do cliente com contingência da plataforma para todos os avisos da conta. Consulte `cobertura-avisos-financeiros-conta-2026-09-10.md` e `saida-lista-contato-2026-09-10.md` para a implementação entregue.

## Resultado da verificação

A recarga automática por saldo já está implementada, com escolha de pacote, valor de disparo, cartão autorizado e teto mensal de compras. Não é uma assinatura mensal de créditos: é uma compra avulsa iniciada quando o saldo chega ao valor autorizado. O exemplo de comprar 5.000 créditos ao chegar a 1.000 é aceito pela regra existente, mas não é a configuração padrão atual.

Não habilitamos políticas, cobramos cartões ou enviamos mensagens nesta verificação. Não houve alteração no código da aplicação.

## Evidência do banco configurado

Consulta somente de leitura em 10/09/2026 às 09h31 de Brasília, usando a configuração do workspace:

| Item | Resultado |
| --- | --- |
| Cartões ativos no cofre | 0 |
| Políticas de recarga habilitadas | 0 |
| Tentativas de recarga automática | 0 |
| Avisos de créditos com status enviado | 2 |
| Fila de avisos de saldo no momento | 0 |
| Pacote Resposta Rápida | 5.000 créditos / R$ 47 |
| Pacote Venda Mais | 12.000 créditos / R$ 97 |
| Pacote Alta Performance | 30.000 créditos / R$ 197 |
| Pacote Escala Total | 75.000 créditos / R$ 397 |

Os 5.000 créditos são o menor pacote publicado encontrado; não são o saldo mínimo necessário para o agente operar. O catálogo pode ser alterado. As contagens não comprovam execução do agendamento nem entrega/leitura das mensagens pelo destinatário.

## Comportamento atual

- O titular pode escolher qualquer pacote elegível. A tela usa a política salva ou o primeiro pacote do catálogo; o disparo sugerido na ausência de política é 100 créditos, não 1.000.
- A autorização fica disponível apenas com cartão salvo e ativo. Hoje esse cartão é obtido no fluxo de adesão à renovação do plano. Não há cartão ativo no banco consultado.
- A recarga somente concede créditos após confirmação do pagamento. Uma operação em conferência bloqueia outra tentativa; recusa definitiva desativa a política. Preço diferente exige nova autorização.
- Existe intervalo mínimo de uma hora entre tentativas e teto mensal autorizado. Isso limita compras automáticas, não a quantidade de chamadas do cliente enquanto houver saldo.
- O agendador está configurado para cinco minutos, e processa até cinco políticas habilitadas por execução. Não é um gatilho instantâneo e o lote atual precisa evoluir para atender grande escala.
- Desabilitar recarga não interrompe atendimento. A validação do agente bloqueia novas execuções de IA com saldo zerado; as operações de cobrança também protegem o saldo disponível, inclusive valores reservados. O painel continua acessível.
- Os avisos pagos atuais usam 20%, 10% e zero. Os dois primeiros podem ser substituídos por valores absolutos. Não existe uma terceira faixa intermediária de aviso.
- Os percentuais usam uma referência de franquia/saldo registrada no banco; não significam automaticamente percentuais de 1.000 créditos. Há controle por episódio e intervalo de 15 minutos entre avisos.
- Os avisos passam pelo canal de cobrança da plataforma. O titular recebe no telefone do perfil; responsáveis dos agentes podem receber cópias conforme suas preferências e a política de notificações.
- O carregador do remetente exige uma instância marcada como WhatsApp administrativo da plataforma. Selecionar simplesmente o ID de um agente do cliente não resolve essa restrição.

## Ajuste proposto para a experiência solicitada

1. Apresentar como sugestão: “Quando meu saldo chegar a 1.000 créditos, comprar 5.000 créditos por R$ 47”. Permitir outro pacote e preservar autorizações já existentes. Confirmar o preço atual no momento da adesão.
2. Oferecer autorização de cartão diretamente na recarga, independente da renovação do plano, usando o cofre e os controles já existentes. Validar cadastro do cartão, cobrança e concessão única de créditos antes de anunciar o fluxo como comprovado em produção.
3. Sem recarga autorizada, avisar aos 1.000 créditos. Para a sequência mencionada pelo usuário, acrescentar faixas de 500, 200 e zero, explicitando que correspondem a 50% e 20% da referência de 1.000. Isso requer ampliar o estado atual de dois avisos intermediários.
4. Enviar alertas de créditos pela instância do próprio agente para seu responsável cadastrado, com validação de conta, vínculo do agente e preferências do destinatário. Não usar o número da plataforma como alternativa automática para esses alertas.
5. Gerar esses textos por modelo fixo com nome/saldo/link, sem chamada de IA nem débito. Assim o aviso de saldo zero permanece possível. Instância desconectada deve gerar pendência visível no painel.
6. Evitar várias mensagens sobre a mesma carteira compartilhada para o mesmo administrador. Deduplicar por conta, destinatário, faixa e ciclo de recarga; registrar tentativas e estados incertos antes de reenviar.
7. Informar no painel quando a recarga estiver em conferência, recusada ou sem autorização vigente, mantendo os avisos de saldo. A execução de recargas deve passar a uma fila escalável para não depender de apenas cinco contas a cada cinco minutos.

Exemplo em saldo baixo:

> Oi, aqui é a [nome do agente]! Meu combustível está acabando: restam 1.000 créditos na nossa conta. Ainda estou atendendo, mas preciso de uma recarga para continuar cuidando dos seus clientes. Você pode recarregar aqui: [link].

Exemplo em saldo zero:

> Meu combustível acabou e precisei pausar as respostas automáticas. Assim que a recarga for confirmada, poderei voltar a atender. Recarregue aqui: [link].

Onboarding, ativação e vencimento/problemas do plano continuam no canal da plataforma. A proposta acima trata dos avisos operacionais de créditos.

## Validação e fontes

- 13 testes locais aprovados em `tests/custom-contracts-topups-meetings.test.ts` e `tests/ai-credit-reservations.test.ts`: autorização pelo titular, cobrança sem duplicação, teto de compras, concessão única do pacote confirmado, preservação do plano, episódios de alerta e proteção da carteira.
- Consulta reproduzível de leitura em `tmp/audit-credit-recharge-20260910.cjs` (arquivo temporário ignorado pelo Git).
- Fontes: `src/components/connectyhub-os/credits-console.tsx`, `src/app/api/dashboard/credits/route.ts`, `src/lib/billing/automatic-topups.ts`, `src/lib/billing/wallet-alerts.ts`, `src/lib/billing/platform-billing-webhook.ts`, `src/lib/billing/trial.ts`, `src/lib/whatsapp/agent-runtime.ts`, `src/lib/inngest/functions.ts` e migrações `0108`/`0110`.
- Os testes usam banco local isolado. Não houve novo teste de cobrança, cadastro de cartão ou envio real de WhatsApp nesta verificação.
