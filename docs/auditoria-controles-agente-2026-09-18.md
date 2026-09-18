# Auditoria dos controles de agentes — 18/09/2026

## Escopo e critério de evidência

Pedido: corrigir digitação/limpeza dos campos; auditar Conexão, Prompt, Qualificação
e Comportamento; padronizar todas as sanfonas fechadas; tornar a escolha de voz
independente de conversa/rapport; verificar efeitos reais dos controles.

O painel cliente (`/dashboard/whatsapp`, inclusive acesso assistido) e o painel de
agentes internos (`AdminWhatsappAgentsConsole`) usam `WhatsAppConsole`. As correções
do editor são compartilhadas, sem selecionar uma organização específica.
`AdminCustomerWhatsappConsole` é um inventário administrativo, não um segundo editor.

Evidências distintas: **UI local** usa o componente real com dados sintéticos e HTTP
interceptado; **runtime** executa funções reais com banco/provedor simulados;
**leitura externa** verificou URLs antigas das figurinhas por HEAD. Nenhum desses
resultados equivale a envio WhatsApp, clonagem, geração paga ou publicação real.

## Erros encontrados e corrigidos localmente

1. Normalização a cada tecla removia espaços finais, Enter e campos vazios do Prompt,
   personalidade e qualificação. A qualificação ainda normalizava durante a renderização.
   Os editores agora mantêm o rascunho original; listas preservam linhas em branco.
2. Campos numéricos substituíam o valor vazio ou intermediário pelo mínimo. Agora
   aceitam apagar/redigitar, mantêm os limites no valor confirmado e preservam zero
   nos campos em que ele é permitido.
3. Regras opcionais explicitamente apagadas voltavam ao padrão após salvar. O
   normalizador do Prompt distingue texto vazio de campo ausente em registro legado.
4. A 17ª pergunta era descartada silenciosamente; excluir/adicionar podia repetir
   o identificador CRM. Há limite visível de 16 e identificadores únicos.
5. Textos excedentes eram truncados sem aviso; perguntas vazias e campos CRM iguais
   eram aceitos/corrigidos silenciosamente. A validação do editor impede o envio com
   mensagem específica, incluindo limites de listas, horário, fuso e VIP menor que
   qualificado. O servidor mantém sua normalização defensiva.
6. O selo do Prompt podia dizer “salvo” apesar de regras alteradas. Agora inclui o
   estado do construtor. A resposta de um salvamento lento não apaga edições posteriores.
7. Aplicar o perfil em agente legado podia descartar regras recém-editadas. A ação
   aplica o rascunho atual também quando não havia versão de perfil.
8. Selecionar voz forçava `responseMode=audio` e alterava a divisão de mensagens.
   Agora modifica somente os campos da voz; vale para seleção, categoria e clonagem.
   Botões de exclusão da voz deixaram de ficar dentro do botão de seleção.
9. “Atividade e atendimento” e “Estilo de conversa” iniciavam abertos. Todas as
   sanfonas usam a mesma implementação, fechadas ao montar a aba. Conexão, informações
   extras, clonagem, campo interno do CRM e as duas listas da qualificação seguem o padrão.
10. Presença “sempre online” ignorava `aiScheduleEnabled` no runtime. A presença
    agora não anula a janela de respostas, inclusive em horários que cruzam a meia-noite.
11. Rapport chegava à IA apenas como `off/soft/strong`. Agora cada opção fornece
    instruções explícitas e diferentes de adaptação de linguagem.
12. Sinais de baixa qualificação e regras do próximo passo entravam no atendimento,
    mas não no prompt da análise do CRM. Agora também participam dessa análise,
    condicionados a evidência na conversa; não se promete desconto fixo de pontos.
13. Figurinhas dependiam de URLs de terceiros indisponíveis. HEAD de `hi.webp` e
    `heart.webp` retornou 404 em 18/09. Substituídas por cinco artes originais SVG/WebP
    locais (512×512, fundo transparente fora do cartão), servidas pelo domínio do app.
    A disponibilidade pública das novas URLs e a aceitação pela UAZAPI dependem do deploy.

14. Os cartões tinham ação redundante de abrir e ocupavam duas linhas de botões.
    A altura medida foi 88 px, aproximadamente metade do cartão anterior.
    Agora a seleção é pelo cartão (também Enter/Espaço), com quatro ações horizontais,
    foto cadastrada ou do WhatsApp vinculado e iniciais na ausência/falha da imagem.
    A busca da foto respeita organização e agente e exclui instâncias arquivadas.
15. O nome aparecia como campo editável nas áreas de contexto. Agora Conexão e Prompt
    mostram o nome do cadastro somente para leitura; a edição fica no formulário
    Editar do agente e atualiza o nome nas demais seções.

## Matriz de efeito funcional

| Grupo / controles | Caminho de efeito verificado | Classificação e limites |
|---|---|---|
| Conexão: QR/código, telefone, status, reset, remover | handlers `runAction`, rotas de cliente/admin, `client-workspace` e `platform-whatsapp-console`; polling preserva rascunhos | UI e contrato revisados; nenhuma conexão real alterada. Ações concorrentes bloqueadas; telefone/modo limpos ao trocar agente |
| Cadastro/edição: nome, empresa/setor, atividade, responsáveis | formulários → APIs de agente → nome/metadata/responsáveis | Digitação sem normalização por tecla; autorização e isolamento preexistentes. Teste de aviso envia mensagem e não foi acionado |
| Atividade, identidade, registro/UF, exposição pública | `activity-profile`, `agent-prompt-templates`, `activity-setup` e metadados | Perfil preenche contexto/identidade. Exposição depende da página pública; não verifica credencial profissional |
| 7 regras e complemento | `prompt_builder_config` → `buildAgentPromptFromTemplate` → `resolveRuntimeAgentPrompt` | Aplicação automática quando modo automático; em modo manual é necessário aplicar perfil, como a UI informa |
| Instruções avançadas | prompt manual persistido e lido no runtime | Campo e limite verificados; instruções de segurança e dados reais continuam tendo precedência |
| Arquivos / melhorar complemento / importar DNA | upload, prompt-assistant e job de importação | Handlers presentes; upload preserva rascunhos. Extração, IA paga e job externo não executados nesta auditoria |
| Personalidade: assinatura, identidade, tom, vocabulário, ritmo, venda, objeções, fechamento, emojis, áudio, limites e notas | `whatsapp_clone_profile` → `buildCloneProfileLines` | Preferências chegam às instruções; são orientações de IA, não garantia determinística de redação |
| Aprender / avaliar qualidade | `extractCloneMemory`, `buildCloneMemoryLines`, condições de `persistCloneRealTestTurn` | Há persistência e leitura reais; testes de memória/métricas com I/O simulado. Qualidade é uma estimativa por regras |
| Qualificação ativa, oferta, objetivo, uma pergunta por vez | `lead_qualification_config` → `buildLeadQualificationInstruction` | Ativação e perguntas ausentes controlam o playbook; estilo de perguntas é orientação à IA |
| Qualificado/VIP, máximo de perguntas, rótulo/pergunta/campo/peso/obrigatória, adicionar/excluir | análise e helpers de score/status/campos de `qualification.ts` | Campos e limites verificados; pesos/limiares afetam cálculo. O limite conversacional é passado à IA, sem promessa de contagem perfeita em linguagem natural |
| Sinais de baixa qualificação / próximo passo | instruções de atendimento e análise do CRM | Conexão ao prompt da análise corrigida; exige avaliar qualidade da IA em casos reais |
| Agente ativo | guarda no início de `processWhatsappAgentRun`, configurações salvas separadas do efeito da pausa | Bloqueio real de execução; preferências preservadas ao pausar/reativar |
| Marcar como lido / presença | chamadas condicionais e `syncWhatsappBehaviorPresence`; focused/natural/always | Caminho real para o provedor; confirmação de leitura/online depende da UAZAPI e WhatsApp |
| Texto / áudio / espelho / voz | `shouldSendAudioResponse`, `resolveOutboundDelivery`, provedores de voz e controle de acesso | Seleção de voz não altera modo. Pedido explícito de texto, links e mídia visual têm exceções documentadas. Áudio depende de voz, acesso, créditos e provedor |
| Rapport / estilo / conversa leve / mídia proativa | `conversationStyleInstructions`, `buildSmallTalkContext`, `buildProactiveMediaInstruction` | Instruções efetivas na geração; não são garantias de que a IA usará cada recurso em toda resposta |
| Emojis em texto / reações | remoção determinística em `applyTextEmojiPreference`; `sendEmojiReaction` com contexto e probabilidade | Reação é eventual e evitada em contextos sensíveis; desligar texto não desliga reação |
| Figurinhas | `sendContextualSticker`, probabilidade e categoria textual | URLs reparadas; estilo discreto continua impedindo figurinhas, como descrito na ajuda. Entrega externa ainda não comprovada |
| Citações: desligado/inteligente/sempre | `resolveOutboundReplyTargets` | Desligado não cita; sempre escolhe a última entrada; inteligente classifica múltiplas entradas e tem fallback |
| Lotes: imagens/vídeos/documentos | `selectRecentVisualMediaBatch` / `selectRecentVisualMediaBeforeText` | Limites executados no código real com lotes sintéticos |
| Temporização inteligente e 15 tempos | `resolveWhatsappAgentRunDelaySeconds` e controles de contexto/mídia/áudio | Textos, sequências, legendas, mídia isolada, botões, lotes, eventos e áudio difícil têm ramos próprios. Temporização desligada remove a espera de agrupamento; ainda existem latência da IA/rede e presença de envio |
| Reativar agente após humano | `human-intervention`, webhook e `markConversationHandledByHuman` | Minutos chegam à pausa persistida; testes existentes de intervenção executados |
| Janela da IA, início/fim/fuso | `isWithinSchedule` no início do processamento | Corrigida a precedência da presença; testes com relógio/fuso determinísticos |
| Follow-up, delay, máximo, janela (editor interno/admin) | agendamento em `scheduleProactiveFollowUp` e execução/revalidação em `proactive-followup` | Existe implementação, mas a política da empresa pode substituir o liga/desliga e a janela do agente. Ver pendência abaixo |
| Loja: ativo / observador / assistente / vendedor ativo | `commerce-agent/agent-settings`, servidor e ações web | Ativação e observador têm guardas reais; assistente/vendedor ativo compartilham permissões de ações, com modo passado ao prompt. Não equivale a venda autônoma garantida |
| Redes sociais “em breve” | `metaFeatureLaunchPaused` e aviso do editor | Bloqueio explícito, não classificar como integração operacional |

## Pendências que impedem certificar tudo em produção

- **Follow-up:** os controles do agente são mostrados apenas no editor de agentes
  internos/admin. Para clientes, a configuração é centralizada em Automações.
  Quando existe `automation_policies`, as expressões
  `policy.follow_up_enabled ?? behavior.proactiveFollowUp` e os horários da política
  prevalecem sobre o painel do agente. Assim, desligar ou mudar a janela somente
  no editor interno pode não produzir o efeito esperado quando houver política
  aplicável à organização da instância. Não alterado neste pacote:
  é preciso unificar a precedência entre Agentes e Automações para as jornadas de
  conversa, recuperação de compra, retorno e recomendação sem remover opt-out,
  restrições de contato ou revalidação anterior ao envio.
- **Produção:** publicação, teste com conta de cliente real, envio/recepção de
  texto/áudio/figurinhas, leitura/presença, importação de DNA e upload com extração
  permanecem pendentes nesta rodada. Os testes atuais substituem provedores externos.
- **Recursos generativos:** rapport, estilo, perguntas e limites de linguagem exigem
  avaliação de respostas reais. O código comprova a inclusão das instruções, não
  conformidade absoluta de cada resposta gerada.

## Verificações e artefatos

Os testes de regressão ficam em `tests/agent-editor-fields.test.ts` e
`tests/agent-controls-runtime.test.ts`; `tests/agent-card-photos.test.ts` verifica
prioridade e isolamento das fotos. A primeira suíte cobre todos os perfis de
atividade, edição e validação; a segunda executa funções reais de horário, mídia,
temporização, citações, áudio, presença e instruções.

O ensaio em navegador e suas evidências sintéticas ficam em
`tmp/agent-editor-browser-audit.cjs`, `tmp/agent-editor-browser-audit.json` e PNGs
do mesmo prefixo, incluindo a variante `-admin`. O teste dos cartões e nome fica
em `tmp/agent-cards-audit.cjs`, com resultado JSON e captura próprios. A página temporária de ensaio é removida antes do build.
Resultados finais de execução e publicação são registrados no estado operacional.

Verificação final: 3.166 testes na suíte completa; após cartões/nome, 195 testes
direcionados aprovados (incluem o novo teste de fotos), ESLint e TypeScript sem
erros e build webpack aprovado. Os ensaios locais registraram 25 verificações
por variante (61 campos no cliente e 65 no interno), sem erros JavaScript, mais
a conferência de cartões/nome em 1440/390/320 px. Envio para master autorizado em 18/09/2026; implantação em produção ainda não conferida.

Integração para GitHub sobre `ac187574`: os 22 commits remotos existentes foram
preservados. Os 222 testes direcionados de agentes e o build webpack completo
com TypeScript e 108 páginas estáticas passaram na base integrada.
