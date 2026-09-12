# Recuperação de pagamento Pix → cartão — 12/09/2026

## Evidência e causa

Investigação feita em cópia isolada, partindo de `1d332551386b33b94041169fc2f9435747e1e54c`. O checkout original foi consultado somente para leitura. A tarefa anterior confirmou parada, e uma consulta de coordenação confirmou estado idle/completed. Não havia alteração de código pendente naquele checkout; havia notas operacionais e evidências locais, que foram preservadas.

O painel da Vercel confirmou a implantação `dpl_BkpfV5GDXozVaV3V2533pu7RDmfn` como **Ready / Latest / Production**, associada ao domínio principal e ao commit acima, criada em 12/09 às 03:48:46 UTC. Portanto, o relato das 12h30 BRT ocorreu depois da publicação da correção anterior. A credencial local da CLI estava inválida; a versão foi conferida pela sessão existente do navegador, sem alterar credenciais.

Leituras do Supabase de produção confirmaram esta sequência em 12/09, fuso America/Sao_Paulo:

| Horário | Registro observado |
|---|---|
| 12:17 | Pedido confirmado, sessão Asaas Pix criada; envio com código Pix registrado. |
| 12:30:09 | Cliente solicita explicitamente: “melhor muda pra mim estou sem saldo no pix muda para cartão de credito”. |
| 12:31 | Quatro mensagens de áudio, com texto persistido alegando alteração e orientando acesso pelo botão; `interactive_button=false`, sem fallback de botão, respostas HTTP 200 desses envios de áudio. |
| 12:32:42 | Cliente envia “?”. |
| 12:33:24 | Resposta em texto alega liberação e pergunta se o botão está visível; nenhum botão registrado. |
| 12:33:44 | Cliente informa “que botão ? não apareceu nada aqui”. |
| 12:34:29 | Um áudio promete liberar o acesso; nenhum botão registrado. |

As três execuções após o pedido de cartão terminaram `completed`, sem erro registrado, pelo caminho de geração de resposta. Não há motivo de conclusão `sales_catalog_existing_checkout_link`. A sessão consultada permaneceu `method=pix`, `status=pending`, `provider_status=PENDING`, sem atualização posterior à entrega inicial. Esses estados foram lidos no banco, não reconfirmados por uma consulta ao Asaas. A configuração atual habilita Pix e cartão, com `transparent_card_enabled=true`; nenhum registro de tentativa de cartão, revisão pendente ou trava foi encontrado para o pedido. Isso não comprova entrega futura nem autorização financeira do cartão.

Reproduções locais, exclusivamente com produtos fictícios comuns, demonstraram causas no runtime compartilhado:

1. O resíduo “muda pra mim” era tratado como mudança de carrinho pelo filtro genérico. A recuperação retornava sem consultar o checkout, e a preferência de cartão também era descartada ao interpretar o histórico.
2. A recuperação usava o seletor de itens para **criar um pedido**, que exige intenção de compra atual. Com o resumo anterior ainda no histórico, uma solicitação de método ou reclamação de botão resultava em seleção vazia, embora já houvesse pedido confirmado.
3. “?” encontrava o filtro de conversa antes do seu tratamento específico; a reclamação completa sobre o botão não correspondia ao reconhecedor de pagamento ausente.
4. O bloqueio de alegações sem execução não cobria as frases observadas sobre alterar o método ou acessar o checkout. A validação apenas da resposta `completed` ocultava a ausência da ação de pagamento.

A ausência de um evento de recusa de Pix por saldo insuficiente não foi usada como explicação: o gatilho deste caso é uma solicitação explícita do cliente, independente de webhook bancário. A falha histórica da resposta terminada em “Total:” permanece fora deste conjunto.

## Alteração local

- Reconhecimento de troca de método com expressões de cortesia e negação por falta de saldo, sem descartar cancelamento, dúvidas, atendimento humano ou mudanças reais de itens/endereço.
- Recuperação confronta os itens e quantidades do resumo diretamente com o pedido existente, sem exigir novo consentimento de compra. Mudanças posteriores ainda não resolvidas impedem reabrir o pedido antigo. O rascunho persistido usa a mesma distinção entre troca de método e alteração de carrinho.
- “?” e reclamação completa de botão podem recuperar o acesso quando há contexto de pagamento. Preferência do cliente continua prevalecendo sobre afirmações incorretas da IA e persiste com os mesmos vínculos de organização, conversa, instância e pedido.
- Alegações de alteração/liberação e instruções de checkout sem execução recebem resposta controlada. Nenhum ajuste de prompt por nicho foi necessário.
- Validação de transporte revelou um risco adicional: erro HTTP 500 contendo “button” acionava nova tentativa com outro formato de URL. O helper agora exige rejeição definitiva para essa repetição. HTTP 408/5xx preserva entrega incerta e não repete o botão; rejeição definitiva mantém o fallback com a mesma URL.

O cartão abre a página interna da **mesma sessão/pedido**, com `payment_method=card`. Enviar esse acesso não cobra o cartão nem cancela o Pix. O processamento financeiro permanece no envio do formulário pelo cliente, com os controles existentes de reconciliação e concorrência. Não foi criada uma cobrança substituta para entregar o acesso.

## Validação e limites

**1.562 testes aprovados em 161 arquivos**, mais TypeScript (`tsc --noEmit`), ESLint dos arquivos alterados e `git diff --check`. O arquivo de regressão da troca contém 56 testes e usa pizza e dados fictícios.

A regressão percorre funções reais do runtime, leitura do checkout transparente, construção da URL, transporte centralizado e persistência do resultado; banco, autorização/configurações auxiliares e HTTP externo são simulados. Verifica botão, fallback de texto, estado de entrega incerta, preservação da cobrança, histórico com resumo, rascunho persistido, escolha posterior de Pix, isolamento e bloqueios financeiros. Os testes existentes do processamento de cartão também integram a suíte completa. Não foi feita compra, cobrança, cancelamento, mensagem a cliente ou teste pago de IA.

A primeira execução ampla teve quatro timeouts por concorrência e dois testes sensíveis a CRLF do checkout Windows. Apenas as quebras de linha locais do guia gerado e de um componente foram normalizadas temporariamente para LF, sem diferença de conteúdo no Git, e restauradas após a validação. A suíte completa passou com `--maxWorkers=2`, sem mudar testes, prazos ou código desses módulos.

**Estado: alteração local, não publicada, sem migration.** A produção permanece na versão anterior conferida. Antes de publicar, confirmar autorização deste conjunto e revisar o diff isolado. Depois da publicação, conferir commit/implantação e observar o reteste do titular com produto fictício comum. Aceitação HTTP do provedor não equivale a confirmar que o botão apareceu no aparelho; isso exige observação real.

Os registros privados consultados permanecem fora do Git. Este relatório omite nomes de clientes, contatos, endereços, produtos do histórico, credenciais e códigos de pagamento.
