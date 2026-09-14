# Atendimento aos responsáveis — 14/09/2026

## Causa e escopo

A leitura da operação da Renata confirmou resposta automática e follow-up para uma representação de 12 dígitos de um responsável cadastrado com 13 dígitos. A diferença era o nono dígito móvel brasileiro; a comparação anterior exigia igualdade literal. Não foi falha de pagamento do Gemini nem alteração de cadastro. Não reproduzimos a conversa real nem enviamos mensagens para testar.

A correção é por agente: lista atual completa de responsáveis, com compatibilidade dos campos antigos quando não existe lista explícita. Uma lista explícita vazia ou alterada prevalece sobre campos antigos. Nome ou sufixo de telefone não prova identidade. País, DDD e assinante completo precisam coincidir; a equivalência de nono dígito é restrita ao celular brasileiro. JIDs LID não são tratados como números: exige-se mapeamento explícito para telefone. Nos grupos, somente o autor da mensagem é comparado, nunca todo o grupo ou a mensagem citada.

## Proteções

- Webhook e retomada após reconexão evitam enfileirar atendimento ao responsável. Histórico técnico recebido e status de entrega permanecem.
- Execução pendente reconsulta o cadastro antes de atender, gerar IA/voz e enviar mensagens. Inclusão de responsável durante uma geração impede o envio posterior; o custo de uma geração já realizada continua contabilizado.
- Follow-ups pendentes, retornos e recuperações que usam o executor compartilhado revalidam antes de gerar e antes de cada tentativa de entrega. Bloqueios intencionais ficam como ignorados (`agent_responsible`), sem repetição automática.
- Avisos financeiros/operacionais e endpoints administrativos de confirmação continuam fora dessa barreira de atendimento. Nenhum cadastro, tarifa, carteira, callback administrativo ou preferência de aviso foi alterado.

## Verificação e limites

78 testes direcionados aprovaram identidade, fronteiras reais de geração/TTS/transporte, follow-up e notificações. A rodada geral teve 2.799 aprovados e 28 falhas: 15 timeouts de testes SQL concorrentes, 12 testes de follow-up que precisaram carregar o novo helper real no harness e uma divergência pré-existente IA/AI no guia gerado. Após ajustar o harness, 38 testes de responsáveis/follow-up passaram; os dez arquivos SQL passaram em 36 testes com dois workers e timeout de 30 segundos. O guia divergente não foi alterado neste pacote de atendimento. Na base integrada com a produção atual, mais 100 testes de atendimento/reconexão/notificações e 40 de transporte/link/webhook passaram. Build final de produção, TypeScript, lint e diff-check aprovados.

Não houve envio WhatsApp, geração paga, alteração de dados reais ou migration. O titular ainda deve observar uma conversa real depois da publicação. Identificadores opacos sem mapeamento de telefone não permitem afirmar a identidade; não são comparados por seus dígitos. Publicação desta correção ainda pendente.
