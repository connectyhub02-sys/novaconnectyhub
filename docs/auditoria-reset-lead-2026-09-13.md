# Auditoria do atendimento e requisito de exclusão integral — 13/09/2026

**Regra de acesso atualizada em 14/09:** a visibilidade geral descrita neste registro histórico foi substituída por acesso exclusivo de administrador da plataforma em sessão assistida verificável no painel de cliente. O contrato de exclusão integral continua válido. [Implementação publicada e evidências](reset-acesso-assistido-2026-09-14.md).

## Escopo e evidências

Leitura de produção autorizada pelo titular: conversa atual com Gustavo e três conversas arquivadas visíveis no painel (Gustavo com o titular, Luna com o titular e Luna com Elaine). Dados pessoais, mensagens integrais, links de pagamento e credenciais não são reproduzidos neste relatório.

Na conversa atual, entre 11h59 e 12h29 BRT, 16 mensagens recebidas foram processadas; 35 envios de texto retornaram HTTP 200. Não houve botão registrado. As 15 execuções terminaram como completed, incluindo quatro substituídas por uma mensagem mais recente e duas encerradas pelo caminho de recuperação de checkout. Não houve erro de execução registrado nessa amostra.

O nome completo chegou em uma mensagem, mas o lead permaneceu sem evidência de identificação e o pedido sem customer_name. A sessão de cartão ficou em payment_deferred/customer_name_required, sem provider_payment_id. Havia URL interna de checkout, mas ela não foi enviada. O anúncio do link passou como texto comum. A reprodução local com nome fictício confirmou que findLeadNameEvidence não reconhece a solicitação de nome produzida pelo próprio fluxo de pagamento. Não foi encontrada evidência de rejeição por divergência entre nome e CPF.

## Conversas arquivadas

- Gustavo: respostas de revisão de pedido pediram produto/endereço repetidamente. A saudação do dia seguinte retomou uma alteração antiga em vez de iniciar uma resposta adequada à mensagem. Os registros distinguem revisão determinística e resposta do modelo; não é apenas indisponibilidade de WhatsApp.
- Luna com o titular: após oferecer inclusão de um produto, o fluxo pediu novamente produto, versão e quantidade mesmo depois de fornecidos. Às 09h52 BRT houve envio de botão de checkout com retorno HTTP 200. Após um agradecimento, o agente voltou a perguntar a forma de pagamento. Às 09h55, uma frase negando pagamento acionou financial_review. O código de paymentEvidenceIntent reconhece negação com “não” e “nunca”, mas não com “nem”, portanto classificou incorretamente a frase como alegação de pagamento. A revisão persistida passou a dominar respostas posteriores. As 55 execuções consultadas não apresentaram erro registrado.
- Luna com Elaine: houve promessas de acesso ao cartão sem botão e recuperação de Pix após pedido de página de produto. Duas execuções de 11/09 falharam porque o provedor de IA rejeitou histórico terminado em mensagem do modelo. Posteriormente, em 12/09 às 00h53 BRT, uma troca explícita para cartão produziu botão com HTTP 200. Os episódios anteriores e posteriores não devem ser tratados como a mesma versão comprovadamente defeituosa sem correlacionar implantação.

HTTP 200 comprova aceitação da solicitação pelo provedor, não leitura pelo destinatário. As conversas mostram falhas distintas: captura de identidade, promessa sem ação, retomada indevida de revisão e classificação errada de negação financeira. Corrigir apenas o nome não cobre todo o problema.

## Requisito final do titular

Disponibilizar “Resetar lead” na Central de Atendimento para os usuários da plataforma. Um modal deve explicar a exclusão definitiva antes da confirmação. O alcance é o lead inteiro na empresa: cadastro, conversas ativas e arquivadas, memória, dados coletados, arquivos, carrinhos, pedidos e solicitações vinculadas. O usuário explicitamente rejeitou preservar os pedidos no sistema como parte do reset.

O próximo contato deve criar um lead novo, sem recuperação do histórico anterior. A ação não restaura histórico e não deve provocar mensagens, cobranças ou recriação automática do contato. Excluir dados locais não significa apagar conversas dos aparelhos dos participantes nem cancelar ou estornar transações no provedor externo.

## Estado

Auditoria, implementação, publicação da aplicação e limpeza definitiva concluídas. Commit `747e9da` na master, Vercel `dpl_6i4ghcvHr5HzZjhCX1n7HFURf6LW` Ready/Production às 16:12:27 BRT. A base `44e22ad` já contém as correções de negação financeira, cortesia, continuidade de carrinho/método e revisão oferecida; foram preservadas. Este conjunto corrige captura de nome, promessa de link sem envio e histórico do Gemini terminado em fala do modelo. Os defeitos foram reproduzidos antes da correção.

A migration `0134_lead_reset` foi aplicada no Supabase da VPS. As sete funções locais e remotas tiveram o mesmo hash após remover comentários/espaços. A simulação de exclusão integral dos registros de teste levou 6,57 segundos e retornou rollback confirmado. Os gatilhos de arquivo antes recriavam cópias durante a exclusão; marcadores privados da própria transação agora evitam isso somente nos registros selecionados. Testes verificaram que o arquivamento comum continua ativo e que outras empresas permanecem isoladas.

O escopo identificado reúne oito cópias antigas do mesmo contato, nove conversas e 81 objetos de mídia, além de pedidos, sessões, tentativas, memória e solicitações. Um vínculo legado de sessão de outra empresa usa SET NULL: o reset desassocia a referência, sem excluir o outro cliente. Contadores de consumo da empresa permanecem, com metadados conversacionais removidos; não são pedidos do lead.

Após a publicação, a exclusão definitiva foi executada e os 81 objetos retornaram ausência na conferência do storage. A função de baixa de quota (`0062_release_storage_usage`) estava ausente na VPS; foi restaurada a partir do código versionado, com acesso restrito a service_role. A retomada terminou com todas as baixas confirmadas e nenhuma pendência.

A busca final revelou 38 memórias antigas com a marca `archived_test_history` e 1.302 vínculos em registros de consumo. A migration `0135_lead_reset_legacy_memory` ampliou o reset global para essas memórias e para desassociar o consumo, preservando seus totais. Os resíduos do teste foram removidos. Resultado: zero vínculos nas 37 verificações de tabelas/campos JSON; zero marcadores temporários e eventos antigos; sessão e lead de outra empresa preservados. Mensagem nova permitida, replay antigo e eco de envio tardio bloqueados.

Validação local: 2.529 testes em 191 arquivos, TypeScript e ESLint aprovados, mais rodada direcionada de 93 testes e sete testes SQL após o complemento legado. Modal publicado conferido em desktop/celular, foco inicial, Tab, Escape e cancelamento. A sessão usada para inspecionar a interface pertencia à Renata; nenhum reset foi confirmado nela. **Ainda não observado:** atendimento real iniciado pelo titular após o reset, nova entrega de checkout e alteração posterior do pedido. Não confundir as regressões e a validação do banco com entrega externa ou pagamento real.
