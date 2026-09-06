Plano de continuidade financeira, comprovantes e histórico do lead — 06/09/2026

Este plano cobre as lojas, produtos, carrinhos e checkouts da ConnectyHub, o arquivo do lead e o atendimento pelo WhatsApp. Os agentes da mesma empresa devem consultar os mesmos fatos financeiros. Empresas diferentes continuam isoladas. A proposta abaixo foi aprovada pelo usuário e implementada em 06/09/2026; os achados descrevem a situação anterior à execução.

Execução e validação:

- Migrações 0080 e 0081 aplicadas: evidências e conferências financeiras independentes do status do pagamento, proteção contra regressão de pagamentos confirmados, histórico de versões de mensagens e de alterações de cadastro/pedido.
- O agente consulta os pedidos por empresa e lead, incluindo atendimentos de outros agentes da mesma empresa. Perguntas financeiras provocam consulta ao processador, com limite de frequência; falhas de consulta são explicitadas no contexto.
- Alegação ou comprovante sem confirmação abre uma conferência humana, pausa cobranças/ofertas e preserva os anexos. A conclusão autorizada registra responsável e referência da consulta. Confirmação financeira verificada prevalece sobre tentativas antigas.
- Diagnósticos seguros distinguem recusa, validação, integração e resultado desconhecido. As mensagens não inventam falta de saldo nem garantem inexistência de débito.
- Mensagens recebidas, enviadas, editadas e removidas na origem têm versões preservadas pelo banco, independentemente da execução do agente. Um trabalho periódico arquiva imagens, áudios, vídeos e documentos no bucket privado `lead-archive`, com recuperação de falhas e acesso pelo CRM.
- Alterações de cadastro/pedido são preservadas com estado anterior/posterior; eventos de navegação têm identificador, deduplicação e fila persistente de reenvio no navegador.
- A interface do arquivo do lead mostra conferências, mensagens preservadas, arquivos e pendências de recuperação. A navegação de versões possui paginação.
- Validação: 78 arquivos de testes, 580 testes aprovados; lint e build aprovados; interface verificada em 320, 390 e 1366 pixels, incluindo resolução da conferência. A recuperação de uma imagem real do histórico também foi validada no armazenamento privado. Os testes de cobrança utilizaram simulações; não foi feito pagamento real para validar esta entrega.

Limites operacionais: eventos bloqueados pelo navegador ou nunca recebidos não podem ser reconstruídos; arquivos antigos já expirados no WhatsApp dependem de disponibilidade no provedor. A recuperação continua em segundo plano e mostra pendências no CRM. A cópia de mídia respeita a quota de armazenamento e o limite de 100 MB por arquivo. PAN, CVV, senhas e credenciais são excluídos do histórico textual/estruturado; o checkout não os envia para o rastreamento. Uma resposta ambígua ao enviar o resultado da conferência não é reenviada cegamente: o CRM sinaliza a necessidade de conferir a conversa. Links de checkout hospedados antigos podem exigir conferência humana quando o processador não fornece uma consulta equivalente à cobrança transparente.

A regra principal será: a situação do pagamento vem de uma confirmação financeira verificada. Mensagens do cliente, anexos, OCR, cliques e eventos enviados pelo navegador não confirmam recebimento. Um comprovante é uma evidência para conferência. Havendo resultado inconclusivo, a resposta correta é “Ainda não temos confirmação do pagamento”, e não uma afirmação definitiva de recusa ou de inexistência de débito.

Na tentativa real analisada anteriormente, o pedido ficou com pagamento `failed`, a tentativa com `error` e sem motivo específico ou identificador de cobrança retornado. A notificação automática foi registrada na conversa. Esses registros não comprovam insuficiência de saldo ou limite. Não reclassificar retroativamente esse caso como recusa sem uma evidência nova do processador.

O que a auditoria encontrou:

- `src/lib/sales-catalog/asaas-direct.ts`: o erro do processador perde o código e a etapa. Atualmente um HTTP 400 de criação de pagamento é tratado como recusa de forma ampla, enquanto falhas de cadastro do pagador viram erro genérico. É necessário distinguir validação, integração, recusa e resultado desconhecido.
- `src/lib/whatsapp/agent-runtime.ts`, `maybeMarkSalesCatalogPaymentProof`: até uma mensagem como “já paguei” pode ser classificada como comprovante e alterar `payment_status` para `proof_sent`. Isso substitui a situação financeira por um estado documental. O UPDATE também não revalida o status anterior sob bloqueio, o que deve ser corrigido para evitar disputa com uma confirmação concorrente.
- A mesma rotina marca `status=needs_human` e grava um evento, mas não chama diretamente as rotinas completas de pausa, atribuição e notificação humana. Elas já existem em outros caminhos e podem ser reaproveitadas.
- `loadOrganizationSalesCatalogOrders` prioriza a conversa atual quando ela existe. Assim, compartilhar o cadastro não significa que todos os pedidos de outro agente sejam carregados nessa consulta. O contexto financeiro precisa ser buscado pela empresa e pelo lead, com seleção explícita do pedido.
- `loadLeadCommerceStoreContext` fornece um resumo limitado de sessões, mensagens e ofertas. Um evento aparecer no CRM não garante, sozinho, que o agente receba seu resultado financeiro detalhado.
- O rastreador envia os eventos a `/api/track`; o servidor grava `intelligence_events`. Falhas de rede não têm uma fila persistente de reenvio no cliente, e a sincronização complementar da sessão pode falhar sem recuperação. Não existe base para prometer a captura de absolutamente todo clique.
- O arquivo do lead já tem paginação de histórico. A melhoria deve indexar e vincular os eventos ao lead/pedido diretamente, preservando essa paginação, em vez de criar outra lista truncada.
- A confirmação manual de pagamento pelo painel existe. Precisa manter autoria, evidência e origem próprias, sem transformar uma decisão manual em uma suposta confirmação do gateway.

1. Preservar o resultado financeiro e melhorar o diagnóstico — prioridade imediata.

Criar um resumo financeiro consultável por empresa, lead, pedido e tentativa: método, valor, situação, fonte da confirmação, momento da última consulta, código normalizado do provedor, etapa da falha e ação permitida. Separar o resultado da tentativa do estado consolidado do pedido. Uma tentativa antiga recusada não pode derrubar um pagamento posterior confirmado, e um comprovante não pode apagar nenhum dos dois.

Registrar apenas diagnósticos seguros: código permitido, categoria e etapa (`customer_lookup`, `customer_create`, `payment_create`, `capture`, `reconcile`). Não persistir o corpo bruto da requisição/resposta. Número completo do cartão, CVV, senhas, tokens e cabeçalhos de autenticação não pertencem ao CRM, aos logs ou ao contexto da IA. Códigos desconhecidos permanecem desconhecidos; não inferir falta de limite.

Reconsultar o processador pelo identificador ou referência do pedido quando o cliente perguntar sobre pagamento, disser que pagou ou apresentar comprovante. Considerar todas as tentativas relevantes e outros meios de pagamento do mesmo pedido. A consulta precisa ter limite de frequência e registrar quando houve indisponibilidade. Não realizar uma nova cobrança para descobrir o resultado de uma anterior.

Essa abordagem acompanha a documentação do Asaas: uma recusa pode trazer apenas uma mensagem genérica, e um resultado inconclusivo precisa ser consultado antes de repetir a operação. [Cobranças via cartão de crédito](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito).

2. Separar comprovante, alegação do cliente e revisão humana — prioridade imediata.

Armazenar alegações como “já paguei” separadamente dos anexos efetivamente recebidos. Cada evidência deve conter mensagem de origem, arquivo protegido quando houver, horário, agente, empresa, lead e pedido identificado. OCR pode auxiliar a triagem de valor, data, destinatário e identificador, mas nunca autorizar entrega ou declarar autenticidade.

Adicionar um registro de revisão com estado próprio: solicitada, em conferência, resolvida com confirmação ou resolvida sem confirmação. O estado financeiro permanece independente. Não chamar o cliente de fraudador; discrepância documental não prova fraude.

Usar uma transação com bloqueio do pedido ao anexar evidência e abrir revisão. Uma confirmação recebida ao mesmo tempo deve prevalecer. Pedidos aprovados não voltam para “comprovante enviado”. Se houver mais de um pedido possível, perguntar qual deles ou encaminhar para conferência; não escolher automaticamente o primeiro pedido aberto.

3. Dar ao agente uma conduta financeira explícita e baseada na consulta atual.

| Situação verificada | Resposta e próxima ação |
| --- | --- |
| Recusa confirmada, motivo não informado | Informar que a tentativa não foi autorizada, sugerir conferir com o banco e oferecer outro cartão ou Pix, preservando os itens, os dados e o frete. |
| Erro de dados ou integração | Informar que não foi possível concluir; corrigir o dado identificado ou encaminhar falha técnica. Não atribuir a falha ao banco nem ao saldo. |
| Pendente, em análise ou resultado desconhecido | Dizer que ainda está em verificação. Reconciliar; não induzir nova cobrança enquanto houver risco de duplicidade. |
| Cliente afirma pagamento ou envia comprovante | Agradecer, guardar a evidência e consultar novamente. Sem confirmação financeira, manter o pedido sem liberação. |
| Confirmação verificada | Confirmar o pagamento e seguir o fluxo previsto de atendimento/entrega, sem confundir confirmação do cartão com disponibilidade do saldo para saque. |
| Cancelamento, estorno ou contestação | Explicar o estado atual do caso; não continuar afirmando que o pedido está pago nem prometer prazo de estorno não informado. |

Os eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, análise de risco, autorização e captura têm significados distintos no processador. O mapeamento será compartilhado pelo checkout, CRM, notificações e contexto do agente. [Eventos para cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas).

Exemplo após recusa confirmada: “Essa tentativa não foi autorizada. O motivo específico não foi informado. Você pode conferir com seu banco. Prefere tentar outro cartão ou seguir pelo Pix?”

Exemplo quando o cliente diz que houve débito: “Recebi seu comprovante. Ainda não temos confirmação desse pagamento. Vou encaminhar para nossa equipe conferir com o financeiro antes de você tentar pagar novamente.” Só dizer que encaminhou depois de registrar o encaminhamento real.

A IA pode formular a resposta naturalmente. As permissões de confirmar pagamento, liberar pedido, criar nova cobrança e abrir revisão devem ser determinadas pelo backend, não apenas pelo prompt.

4. Acionar a equipe e acompanhar a resolução.

Abrir a revisão automaticamente se o cliente apresentar comprovante ou afirmar débito e a consulta continuar divergente/inconclusiva. A insistência reforça o encaminhamento, mas não deve ser exigida quando já há uma divergência clara. Uma recusa simples sem alegação de pagamento pode continuar com recuperação de venda.

Reutilizar as rotinas de handoff para registrar o caso, atribuir ao responsável financeiro/humano da empresa, criar a pendência no painel e notificar pelos canais configurados. Entregar pedido, valor, método, tentativas, última consulta, conversa e evidências, sem dados de cartão.

Suspender cobrança repetida, ofertas e follow-ups comerciais desse pedido durante a revisão. Controlar isso no pedido compartilhado para que outro agente não retome a cobrança. Manter os avisos financeiros necessários. Registrar tentativas de aviso, falhas e retomadas; se não houver responsável ou a notificação falhar, exibir pendência operacional e não prometer que alguém já foi avisado.

A equipe resolve consultando o processador/extrato e vinculando a confirmação ao pedido correto. Confirmação manual excepcional deve exigir permissão específica, justificativa, evidência e trilha de autoria. A resolução deve atualizar CRM, pedido e conversa, com retorno ao lead. O envio só acontece em execução futura autorizada; este plano não envia mensagens.

5. Consolidar a jornada no arquivo do lead e na consulta dos agentes.

Padronizar os eventos de visita, produto visto, busca, carrinho, oferta exibida/aceita/removida, início do checkout, alteração de dados/frete, tentativa de pagamento, resultado, comprovante, encaminhamento e resolução. Identificar origem e grau de confiança: navegador, backend, processador, cliente ou operador.

Toda mudança comercial aceita pelo backend deve gravar seu evento na mesma transação ou numa fila transacional recuperável. Eventos do navegador terão identificador único, confirmação de recebimento, fila limitada, reenvio com recuo e deduplicação. Eventos bloqueados pelo navegador ou nunca transmitidos não podem ser reconstruídos com certeza. Isso não pode comprometer o registro financeiro, que será independente do navegador.

Vincular o visitante ao lead após identificação validada no contexto da empresa e disponibilizar o histórico já associado. Consultas precisam validar empresa, lead, pedido e permissões; um identificador de lead, cookie ou evento público não autoriza alterar o pagamento. Eventos falsificados como “pagamento aprovado” vindos do navegador não têm efeito financeiro.

Mostrar no CRM uma linha do tempo com origem, horário, pedido, tentativa, resultado, motivo disponível e revisão. Usar paginação/indexação por lead e pedido. Os agentes terão um resumo atual e consulta dos detalhes sob demanda, incluindo pedidos de outros agentes da mesma empresa; não depender somente das últimas mensagens.

6. Validar antes da publicação global.

Os testes de aceitação devem provar:

- recusa genérica não vira “saldo insuficiente” e erro de cadastro não vira recusa bancária;
- timeout mantém resultado em verificação e impede cobrança duplicada;
- imagem, PDF, texto “já paguei” e instruções embutidas em comprovante não confirmam pagamento;
- webhook confirmado concorrente ao comprovante preserva a aprovação;
- Pix confirmado após cartão recusado encerra a cobrança e atualiza todos os agentes;
- webhook duplicado ou atrasado não repete baixa de estoque, mensagem ou confirmação;
- comprovante de outro pedido/empresa e lead com vários pedidos não são associados automaticamente ao pedido errado;
- divergência abre revisão real, avisa a equipe uma única vez e registra eventual falha do aviso;
- a conclusão humana fica auditada e o lead recebe o resultado correto;
- Gustavo e Luna consultam a mesma situação do lead dentro da empresa, sem acesso cruzado entre empresas;
- eventos comerciais do backend sobrevivem a falhas do rastreador; reenvio não duplica a timeline;
- PAN, CVV, tokens e senhas não aparecem no histórico, diagnóstico, prompt ou log;
- checkout móvel, CRM e WhatsApp apresentam o mesmo resultado atual, mantendo o pedido e frete na troca de método.

Executar com cenários controlados e respostas simuladas, seguidos de testes autorizados no ambiente apropriado do processador. Reutilizar a cobertura existente de transações e idempotência. Publicar primeiro a estrutura aditiva do banco, depois os leitores/escritores e a interface; preservar a compatibilidade dos links existentes. Não inventar motivos para falhas antigas sem diagnóstico salvo.

A ordem recomendada é proteger a confirmação financeira e o comprovante; adicionar diagnóstico e consulta atual; ligar a revisão humana; consolidar contexto/timeline; e só então publicar após os testes de toda a jornada. A alteração será comum às empresas e agentes, com a operação financeira da própria ConnectyHub adaptada às suas tabelas de cobrança sem misturar recebedores.
