> Registro da revisão 1.3.1. A implementação posterior 1.4.0, inclusive liquidação acima da reserva e recursos adicionais, está em [integrações e créditos](integracoes-ia-creditos-2026-09-10.md).

# Auditoria de recursos e créditos — 10/09/2026

## Resultado

A cobrança **não estava integralmente alinhada** com os recursos em uso. A falta de algumas integrações públicas também é real: cadastrar modelos e tarifas não implementa sessões em tempo real, lotes, cache, busca ou geração de mídia.

Esta auditoria revisou os caminhos de IA na plataforma e na API, a carteira compartilhada, o registro de consumo e a documentação. As correções abaixo estão no código local. A migração 0127 precisa acompanhar a publicação. Não houve geração paga, alteração de saldo, cobrança retroativa ou aplicação de migração no banco remoto nesta verificação.

## Evidência do banco

Consulta somente de leitura, em 10/09/2026, com amostra dos **1.000 registros mais recentes dentro de 30 dias**, 27 recursos de cobrança, 6 modelos internos e 57 tarifas cadastradas. A amostra atingiu o limite; não representa a totalidade do período.

- **121 respostas `chat_completion`**, modelo `gemini-3.6-flash`, marcadas `customer_billable/completed`, tinham custo e cobrança zero e `matchedRates=[]`.
- Havia tarifas desse modelo para `external_ai`, mas as tarifas específicas de conversa ainda estavam vinculadas aos modelos 2.5.
- Memória do lead e do agente, aprendizado, estado da conversa, análise, follow-up, leitura de imagem, transcrição e voz ElevenLabs tinham registros com cobrança na amostra. Isso comprova registros, não uma auditoria de cada fatura do fornecedor.
- Atividades da própria plataforma aparecem como `internal_shadow`: custo operacional próprio, sem débito na carteira de um cliente. A prévia de voz clonada aparece como incluída no preço de clonagem (`platform_absorbed`).

O resumo local em `tmp/credit-coverage-audit.json` contém configuração e agregados, sem conteúdo de conversas ou credenciais. O script `tmp/audit-credit-coverage.cjs` faz apenas consultas. Os 121 registros históricos foram preservados; **não se criou cobrança retroativa**.

## Correções implementadas

| Problema | Correção |
| --- | --- |
| Modelo atual sem tarifa de conversa; tarifas genéricas antigas em outras tarefas | 0127 alinha os recursos internos de texto aos preços de cada modelo já preparado na API, incluindo vigências futuras. Mantém pisos por recurso e tarifas comerciais por plano. |
| Raciocínio e contexto adicional de ferramentas omitidos no uso interno | Contabilização compartilhada soma esses componentes uma vez. Entrada já em cache não é somada novamente. Inclui resposta principal WhatsApp, tarefas auxiliares e agentes internos. |
| Tarifas ausentes resultavam em uso concluído gratuito | Consumo fica pendente para conferência e a operação informa falha. Tarifas incompletas de entrada/saída também são rejeitadas. Modelos não cadastrados não herdam silenciosamente uma tarifa genérica. |
| Tabela de tarifas truncada em 500 linhas | Leitura paginada e ordenada das tarifas ativas. |
| Empresa vinculada podia usar o plano errado na seleção da tarifa | A precificação usa o plano da organização responsável pela carteira. O consumo continua atribuído à organização que o realizou. |
| Contexto extenso Pro no fluxo interno | Uso acima de 200 mil unidades internas recebe a tarifa específica de contexto extenso já preparada na API. |
| Falha de débito apagava o valor devido | Mantém custo e valor calculado, registra estado pendente e agenda conferência. |
| Corrida entre tentativas podia descontar duas vezes | A função SQL trava a carteira, valida organização, recurso de uso e valor e retorna a transação existente. |
| Resultado do débito perdido na rede | Uma nova tentativa concilia o mesmo consumo e restaura o estado concluído sem repetir o desconto. |
| Resposta principal WhatsApp era entregue antes da cobrança | Confirma a cobrança antes do envio. Falha financeira é registrada e propagada. O processamento já realizado continua registrado mesmo se a entrega falhar. |
| Voz WhatsApp continuava sendo entregue após falha de cobrança | Propaga a falha e preserva o registro de diagnóstico da mídia. |
| Voz Gemini precificada apenas pelo tamanho do texto | Nova categoria `voice_generation_audio`, separada da tarifa por caracteres; registra processamento de entrada e áudio gerado. Se o provedor omitir medição, a estimativa é identificada e usa duração real do PCM para saída. |
| Interpretação de agenda sem autenticação do provedor | Inclui o cabeçalho de autenticação e conserva o registro de consumo antes de aplicar a decisão. |

O reconciliador no ciclo de cinco minutos processa somente débitos pendentes novos, com valor positivo e `debit_retry_at` explícito. Falhas são reagendadas para uma hora depois. Ele não recalcula nem cobra automaticamente os registros históricos com tarifa ausente.

## Cobertura funcional e financeira

| Família | Plataforma / API local | Cobrança e pendências |
| --- | --- | --- |
| Texto, raciocínio, JSON, instruções e funções | Implementados conforme modelo | Entrada e saída, incluindo raciocínio e processamento de ferramentas. Funções executadas pelo cliente não são executadas pela ConnectyHub. |
| Imagens, áudio, vídeo e PDF como entrada | Implementados conforme modelo | Processamento de conteúdo; tarifas por modalidade precisam ser conferidas a cada família de modelo adicionada. |
| Resposta, memória, classificação, resumos e aprendizado | Implementados na plataforma | Recursos individualizados; tarifa alinhada ao modelo pela 0127. |
| Follow-up, agenda, recuperação comercial e assistentes do painel | Existem caminhos de IA medidos | Geração e interpretação utilizam créditos. Agendar uma tarefa determinística não implica uma nova geração de IA. |
| Código e contexto de URL | Implementados na API | Processamento da chamada. Sem serviço independente de execução de funções do cliente. |
| Vetores | Texto implementado na API | Entrada processada; vetores multimodais ainda precisam de preços por modalidade. |
| Voz | Implementada na plataforma; não liberada na API pública | Medição e tarifa de áudio corrigidas para Gemini; ElevenLabs mantém preços por caracteres e clonagem. Prévia incluída na clonagem tem custo operacional registrado, evitando cobrar duas vezes pelo pacote. |
| Upload, consulta e exclusão de arquivos | Implementados na API com propriedade por projeto | Gestão incluída; análise ocorre na chamada que utiliza o arquivo. Não representa pesquisa/indexação em arquivos. |
| Pesquisa web e mapas | Ainda não liberados na API | Falta adaptar a execução, medir consultas, cobrar ferramentas e preservar atribuições obrigatórias. |
| Imagem, música e vídeo gerados | Modelos catalogados | Faltam adaptadores públicos, entrega/armazenamento, unidades específicas e conciliação das operações. |
| Tempo real de áudio/vídeo e música | Ainda não implementado | Requer relay próprio, acompanhamento contínuo de consumo, reserva renovável e fechamento de sessão. Não se deve entregar uma credencial que contorne a carteira. |
| Lotes | Ainda não implementados | Cobrança por item efetivamente processado, preços próprios, cancelamento, resultados parciais e reconciliação prolongada. |
| Cache | Ainda não implementado publicamente | Criação, leitura com tarifa própria, armazenamento ao longo do tempo, expiração e exclusão. |
| Pesquisa em arquivos | Ainda não implementada publicamente | Indexação, pesquisa, armazenamento e propriedade dos recursos. |
| Pesquisa autônoma, interações, computador, agentes e recursos de plataforma especializados | Catálogo não equivale a integração | Exigem contratos e adaptadores específicos, estado persistente, custo por etapa e revisão da disponibilidade/acesso na conta. |
| Infraestrutura, armazenamento, mensageria e pagamentos | Há centros de custo e cobrança de plano | A existência de um centro de custo não prova alocação completa de custo por cliente. Não se adicionaram cobranças arbitrárias por consultas administrativas ou por componentes já incluídos no plano. |

## Limitações que continuam abertas

1. **Não há paridade completa com o fornecedor.** Os dez modelos liberados nesta implementação não representam todos os modelos e recursos catalogados. A documentação pública agora explicita disponibilidade e forma de consumo, sem publicar endpoints inexistentes.
2. A API pública de geração reserva créditos antes de executar; vários fluxos internos ainda geram antes de debitar. A correção impede tratar falhas como cobrança concluída, mas reserva preventiva universal ainda precisa ser integrada a esses fluxos.
3. Se uma geração ocorrer e o processo morrer antes de registrar o uso, o consumo pode não chegar ao registro. Não há diário durável de despacho e reconciliação universal para todos os provedores. Clonagem, prévias, armazenamento e certas tarefas auxiliares ainda capturam falhas em metadados.
4. A API preserva custo que ultrapasse a reserva como custo absorvido. Ferramentas com cobrança própria precisam de reserva adequada e liquidação específica antes da liberação.
5. Custo registrado é uma estimativa local. A conciliação com faturas do fornecedor, câmbio real, descontos, cache implícito, impostos e custos fixos não foi realizada. Não se pode afirmar que toda margem está garantida.
6. Não foram feitas gerações reais pagas nem testes de todas as modalidades no fornecedor. Os testes descritos abaixo exercitam código e banco local, com fronteiras externas simuladas.

## Referências técnicas e critério de preço

A referência oficial separa entrada, saída, raciocínio e uso de ferramentas: [GenerateContent e UsageMetadata](https://ai.google.dev/api/generate-content). A [tabela oficial de preços](https://ai.google.dev/gemini-api/docs/pricing), consultada em 10/09/2026, descreve unidades diferentes para texto, áudio, imagem, vídeo, pesquisa, cache e lotes.

Para a tarifa de voz 3.1 Flash TTS: US$ 1 por milhão de unidades de entrada e US$ 20 de saída; duração de áudio equivale a 25 unidades por segundo. A migração conserva a regra comercial já existente: câmbio de referência R$ 6/US$, multiplicador 4 e R$ 0,01 por crédito. Isso é configuração de preço, não garantia de margem cambial. As tarifas de texto vêm das tarifas já cadastradas para a API, com as respectivas vigências.

## Publicação e validação

- Documentação pública: seção **Recursos e créditos**, guia Markdown e OpenAPI 1.3.1.
- A migração **0127** depende das migrações anteriores, inclusive 0125. Publicar código que utiliza `debit_retry_at` sem a migração impede a recuperação prevista. Coordenar banco e código em janela de manutenção.
- Migrações ainda locais desta sequência: 0123, 0124, 0125, 0126 e 0127. Não executar retrocobrança como parte do rollout.
- Testes locais verificam raciocínio/ferramentas, cache sem duplicação, tarifa ausente, preservação da dívida, voz, autenticação da agenda, reagendamento, débitos repetidos, isolamento entre carteiras, reservas, permissões SQL e recuperação após resposta perdida.
- Resultado de suíte e build deve ser conferido no relato final da execução; nenhum teste simulado substitui validação operacional após publicação.

Validação desta execução: 1.080 testes em 135 arquivos aprovados; build de produção e TypeScript aprovados. ESLint sem erros (a verificação geral encontrou dois avisos em funções antigas de cobrança). Página e downloads públicos verificados localmente, sem sessão, em larguras de 390, 768 e 1440 px, sem erros de JavaScript ou transbordamento horizontal.
