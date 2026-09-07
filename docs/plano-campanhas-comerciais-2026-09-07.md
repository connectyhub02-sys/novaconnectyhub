# Plano de campanhas comerciais da ConnectyHub

Status: proposta de ampliação; nenhuma campanha, desconto ou cobrança foi ativado nesta análise.

Escopo ampliado a pedido do usuário: os mesmos benefícios comerciais devem existir no admin da ConnectyHub e no painel das empresas clientes, para suas próprias vendas. A ampliação abaixo faz parte do plano, ainda não da funcionalidade publicada.

## Situação verificada

O desconto de primeira compra atual só atende ao checkout inicial elegível, uma vez por proprietário da conta. Não atende à renovação, à reativação ou ao upgrade de um cliente que já comprou. O desconto anual acompanha o intervalo anual contratado. Os intervalos existentes são semanal, mensal, trimestral e anual; o semestral e a escolha de várias durações para o mesmo plano precisam ser acrescentados.

O preço de renovação é preservado no contrato. A cobrança inicial descontada fica na fatura. As renovações gerenciadas, o checkout e o contexto financeiro consultado pelos agentes precisam passar a consultar a mesma programação de preços. Alterar apenas o formulário do admin não resolve esses casos.

## Configuração proposta no admin

Criar Admin → Campanhas de planos, com rascunho, prévia e publicação:

- Nome e descrição pública: por exemplo, Setembro de ofertas ou Volte para a ConnectyHub.
- Início e fim para aderir, com data, hora e fuso America/Sao_Paulo.
- Planos de destino e períodos de pagamento participantes.
- Público: novos clientes, clientes existentes, clientes inativos ou contas selecionadas. Para upgrade, permitir selecionar os planos de origem.
- Operações elegíveis: contratação, upgrade, renovação e reativação, cada uma explicitamente habilitada.
- Desconto percentual ou preço final promocional do plano. O valor total da fatura continua incluindo eventuais adicionais, apresentados separadamente.
- Duração do benefício: uma cobrança, N cobranças ou etapas de preço. Exemplo de etapas: 90% na primeira mensalidade, 50% nas duas seguintes e preço normal depois.
- Limite de uso por conta e campanha. Cancelar, tentar novamente, trocar de empresa ou de plano não reinicia automaticamente o benefício.
- Condição após a promoção: valor, periodicidade e data da próxima cobrança, exibidos na prévia.
- Avisos: mensagem, público e agenda de comunicação separados da publicação da regra de preço. Nenhum disparo é realizado nesta proposta.

O prazo para contratar não é a duração do desconto. Uma campanha encerrada em 30 de setembro pode garantir três mensalidades promocionais a quem aderiu antes do encerramento.

## Períodos de pagamento

Oferecer mensal, trimestral, semestral e anual dentro do mesmo plano. Preservar configurações semanais existentes. Cada opção informa preço normal do período, desconto e total a pagar.

Pagamento antecipado é uma cobrança pelo período inteiro. Não deve gerar novas mensalidades dentro do período já pago. Exemplo meramente ilustrativo, usando mensalidade-base de R$ 100:

| Opção | Desconto ilustrativo | Cobrança | Acesso contratado |
| --- | --- | --- | --- |
| Mensal com oferta inicial | 90% por uma mensalidade | R$ 10 agora; R$ 100 na próxima | Um mês por cobrança |
| Mensal com oferta por três meses | 30% por três mensalidades | R$ 70 por mês; R$ 100 a partir da quarta | Um mês por cobrança |
| Trimestral antecipado | 15% | R$ 255 de uma vez | Três meses |
| Semestral antecipado | 30% | R$ 420 de uma vez | Seis meses |
| Anual antecipado | 40% | R$ 720 de uma vez | Doze meses |

O desconto de um pacote pode ser uma condição permanente daquela periodicidade ou uma promoção limitada. Essa diferença deve ser explícita: a prévia mostra a próxima renovação do pacote com seu preço e prazo. Não mudar automaticamente de anual/semestral para mensal após uma promoção. Uma mudança de periodicidade exige escolha explícita do cliente.

Não confundir pagar três mensalidades separadas com antecipar um trimestre. O controle de desconto é por período faturado, não por tentativas no cartão. Adicionais recorrentes devem ter periodicidade compatível e preço apresentado para o período; créditos/limites do plano não devem ser multiplicados pelo número de meses sem regra explícita.

## Regras financeiras e de adesão

1. Calcular o preço no servidor usando o plano, a conta, a campanha e a operação elegível. Guardar a versão da oferta e todas as etapas no contrato aceito.
2. Usar uma campanha por contratação como padrão, sem acumular descontos automaticamente. Comparar ofertas pelo total do mesmo período e informar a escolha. Qualquer combinação futura exige regra explícita e prévia.
3. Reservar a oferta por checkout com validade definida. Na emissão/alteração da cobrança, verificar reserva e validade; cobranças já emitidas mantêm os termos aceitos até seu vencimento. Não deixar um link antigo estender indefinidamente uma oferta encerrada.
4. Vincular cada etapa a um período faturado. Reenvio de Pix, recusa de cartão e repetição de webhook não avançam a programação. Impedir uso simultâneo duplicado por conta. Não reiniciar a promoção depois de estorno, cancelamento ou troca de empresa.
5. Manter cobrança atual, próximas etapas e preço após a promoção separados. O fim da campanha não altera os contratos de quem aderiu; editar uma campanha cria nova versão para novas adesões.
6. Uma campanha de upgrade é uma oferta, não uma migração automática. Mostrar data de início, diferença a pagar e aproveitamento do período já pago. Evitar sobreposição de contratos e dupla cobrança. Liberar os recursos do plano novo após confirmação financeira.
7. Uma campanha de reativação pode alcançar uma conta antiga como a do Gustavo. Conferir a fatura aberta antes de aplicar: não alterar valores de pagamentos em processamento. Emitir uma revisão/novo checkout quando necessário e preservar a trilha da cobrança substituída. Não perdoar outros débitos implicitamente.
8. Manter o bloqueio por inadimplência e a liberação conforme o plano contratado. A adesão à promoção sozinha não reativa recursos: é necessária a confirmação do pagamento.
9. Preservar o consentimento de renovação automática, com as etapas promocionais e os valores seguintes claramente informados. Tentativas D−3/D−2/D−1 devem usar o preço correto do próximo período, sem consumir três etapas da promoção.
10. Produtos avulsos já comprados e os preços de contratos não participantes permanecem regidos por suas condições existentes.

## Checkout, agentes e arquivo do lead

- Mostrar a oferta elegível no painel, sua validade, economia e custo posterior. Exibir todos os totais antes da confirmação.
- Registrar no arquivo do lead: oferta exibida, clique, proposta enviada, seleção, aceite, versão da campanha, fatura, tentativa, confirmação/recusa, mudança de plano e término do benefício.
- Registrar entrega/falha dos avisos e impedir mensagens duplicadas. Comunicações devem atingir apenas o público elegível, respeitando as preferências de recebimento já registradas.
- Disponibilizar ao agente a promoção contratada, etapa atual, próxima cobrança, saldo de períodos promocionais e estado financeiro confirmado. O agente pode explicar a oferta, mas não inventar elegibilidade, preço ou confirmação de pagamento.
- Para o cliente da ConnectyHub, vincular essa jornada à identidade financeira verificada do próprio cliente; não misturá-la com leads das lojas dele.

## Implementação em etapas

1. **Preço por período e campanhas:** cadastro/versionamento de campanhas, períodos e etapas; vínculo ao contrato; cálculo único de preço e elegibilidade; migração compatível com os descontos atuais.
2. **Admin e contratação:** editor com simulação, escolha de período do mesmo plano, ofertas de contratação/upgrade/reativação/renovação e reserva de checkout.
3. **Cobrança e acesso:** aplicar programação à emissão de faturas, Pix, cartão, cobrança gerenciada, confirmação por webhook e fim do período; preservar idempotência, cobrança proporcional e regras de bloqueio.
4. **Jornada e comunicação:** eventos no CRM, contexto dos agentes, prévia/segmentação dos avisos e agenda de comunicação.
5. **Validação e publicação:** testes financeiros, migração e conferência do checkout em celular antes de ativar campanhas reais.

Pontos atuais de integração: `commercial-terms.ts`, `plan-discounts.ts`, `managed-asaas-renewals.ts`, `native-card-checkout.ts`, `plan-checkout.ts`, `platform-billing-webhook.ts`, `customer-journey.ts`, API `dashboard/billing/plan-intent`, console de planos e checkout de planos.

## Critérios de aceite

- Conta antiga como Gustavo aceita uma campanha de reativação habilitada, paga o valor promocional e renova pelo valor posterior informado.
- Três mensalidades com desconto geram exatamente três períodos promocionais. Recusas, novas tentativas e webhooks repetidos não duplicam uso nem cobrança.
- Adesão dentro da janela mantém o benefício contratado depois de encerrada a campanha; adesão fora dela não consegue obter desconto por URL adulterada ou checkout sem reserva válida.
- Pagamento antecipado de três, seis ou doze meses concede exatamente o período contratado e não produz cobranças mensais intermediárias.
- Upgrade não descarta silenciosamente o período pago, não cobra duas assinaturas e só libera recursos confirmados do plano de destino.
- Clientes não participantes e contratos anteriores não são reprecificados ao editar uma campanha.
- Sem desconto cumulativo involuntário; centavos, adicionais, virada de mês, ano bissexto e fuso são conferidos.
- Pagamentos pendentes ou de valor divergente não reativam a conta. Comprovante enviado pelo lead não substitui confirmação financeira.
- O checkout e o agente apresentam os mesmos valores e condições registrados no arquivo do lead.

## Extensão para as empresas clientes

### Configuração equivalente nos dois painéis

Usar o mesmo cálculo de campanhas, elegibilidade, preços por período e etapas promocionais, com integrações próprias para o faturamento da ConnectyHub e para os pedidos das lojas. Evitar duas implementações de cálculo que produzam valores diferentes.

- Admin da ConnectyHub: campanhas dos seus planos e produtos, para seus próprios clientes.
- Painel da empresa → Vendas → Campanhas e benefícios: campanhas dos produtos, serviços, pacotes e assinaturas próprios daquela empresa, para seus leads.
- Oferecer os mesmos controles comerciais aplicáveis: primeira compra, janela de adesão, preço final ou percentual, N cobranças promocionais, etapas de desconto, antecipação de 3/6/12 meses, reativação, renovação e upgrade de assinatura/pacote.
- Produto avulso recebe benefício por compra; duração em mensalidades é exibida apenas para assinaturas. Pacote de sessões deve informar quantidade, validade e regras de utilização, sem presumir uma assinatura ou entrega física mensal.
- Mostrar somente meios de pagamento realmente habilitados para a empresa. Pagamento antecipado, parcelamento no cartão e cobrança recorrente são escolhas distintas, com seus valores e vencimentos explícitos.
- Não copiar os percentuais do admin para os lojistas. Cada empresa escolhe suas campanhas. Disponibilidade e ações devem respeitar as permissões e os recursos contratados já existentes, sem conceder poderes administrativos da plataforma.

### Lacuna verificada no checkout das lojas

O catálogo já possui tipo recorrente, intervalos e preço promocional com datas. Entretanto, `transparent-checkout.ts` rejeita itens recorrentes ao pagar com cartão, e `payment-sessions.ts` rejeita recorrência antes de criar o Pix avulso. Portanto, esses caminhos não bastam para oferecer a programação de várias mensalidades.

Incluir um fluxo efetivo de assinatura da loja: contrato com o comprador, períodos, faturas, autorização de renovação, tentativas, confirmação financeira, cancelamento e estado do benefício. Reutilizar regras comuns de cálculo e idempotência, mantendo cobrança e recebimento na conta correta da empresa.

Para Pix, cada período pode emitir sua cobrança e aviso para pagamento pelo comprador; não anunciar débito automático via Pix sem uma integração específica suportada e autorizada. Para cartão, a renovação exige autorização do comprador e vínculo seguro com a conta recebedora correta. Confirmar as capacidades necessárias da integração Asaas antes de habilitar recorrência real das lojas.

### Isolamento por empresa e identidade do comprador

- Campanha, produto, contrato, fatura, pagamento e eventos carregam o proprietário financeiro e a empresa responsável, conferidos no servidor. Aplicar isolamento também nas consultas, permissões do banco, APIs públicas e webhooks.
- Uma empresa não acessa, altera nem financia campanhas de outra, mesmo quando ambas pertencem à mesma conta. Descontos em produtos revendidos da ConnectyHub dependem de regra específica do proprietário do produto; o lojista não altera o preço da plataforma implicitamente.
- Primeira compra na loja é avaliada no histórico do comprador daquela empresa, compartilhado entre seus agentes. Ter comprado na loja A não consome a primeira compra da loja B. Trocar de agente ou iniciar outra conversa na mesma empresa não reinicia o benefício.
- Reconhecimento por navegador ajuda a continuidade, mas um cookie, telefone ou identificador fornecido na URL não concede sozinho acesso ao histórico financeiro nem direito a desconto reservado. A elegibilidade usa a identidade verificada e o histórico de pagamento da empresa.
- Leads das lojas permanecem nos arquivos das respectivas empresas; clientes diretos da ConnectyHub permanecem na jornada financeira da plataforma.

### Loja, WhatsApp e CRM

Apresentar a mesma oferta e o mesmo total na conversa do agente, página do produto, carrinho e checkout. Registrar exposição, clique, proposta, aceite, versão contratada, próximas etapas, eventos de pagamento e encerramento da promoção no arquivo do lead da empresa. Todos os agentes autorizados daquela empresa consultam essas condições.

O agente deve saber dizer, por exemplo: "Você está na segunda mensalidade com desconto. A próxima ainda será R$ 70; depois passa para R$ 100." Ele não deve criar descontos por conta própria nem afirmar pagamento com base em comprovante.

Definir de forma explícita se a campanha alcança itens de order bump/upsell. Como padrão, aplicar apenas aos produtos selecionados, preservando adicionais e frete fora do desconto. Não acumular preço promocional, desconto por período e campanha sem regra e prévia.

Campanhas e cobranças automáticas respeitam a suspensão operacional da conta da loja. Recepção e conciliação de retornos financeiros de pagamentos já emitidos precisam continuar para evitar perda de histórico ou confirmação duplicada; não confundir isso com reativar recursos da empresa.

### Acréscimos à execução e à validação

1. Generalizar o modelo de campanhas para proprietário plataforma/empresa antes de criar os dois editores.
2. Conectar contratos e faturamento recorrente das lojas ao cálculo comum, incluindo períodos antecipados, cancelamento e cancelamento da renovação sem apagar o período já pago.
3. Integrar ofertas ao catálogo, atendimento por qualquer agente da empresa, carrinho, checkout e CRM.
4. Validar com empresas de teste distintas: primeira compra independente entre lojas; compartilhamento entre agentes da mesma loja; acesso negado por troca de `organization_id`; conta recebedora correta; aplicação só em produtos autorizados; conciliação de pagamentos sem duplicação.
5. Cobrir produto avulso, serviço, assinatura mensal promocional e antecipação semestral/anual. Verificar a última cobrança promocional e a primeira pelo valor posterior, além de reenvio de Pix, recusa, estorno, cancelamento e suspensão da empresa.

Essa extensão não ativa campanhas, não envia anúncios e não cria cobranças reais nesta etapa de planejamento.
