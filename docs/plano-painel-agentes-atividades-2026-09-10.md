# Plano de melhoria do painel de agentes — atividades e configuração inicial

Data: 10/09/2026. Escopo: análise da captura enviada e do código local do ConnectyHub. Não houve alteração funcional, acesso ao banco de produção ou envio de mensagens. O repositório contém outras alterações em andamento; as conclusões descrevem a versão local inspecionada, sem presumir que ela seja idêntica à publicada.

**Resultado esperado:** depois do cadastro da conta, o cliente identifica seu negócio, escolhe sua atividade e conecta o WhatsApp. O agente começa a receber e responder mensagens com identidade, abordagem, qualificação e comportamento coerentes, sem exigir edição de prompt. Produtos, serviços, imóveis, horários e materiais podem ser adicionados progressivamente.

## 1. Diagnóstico verificado

| Tema | Evidência no código local | Consequência e ação |
| --- | --- | --- |
| Catálogo de atividades | Existem 12 modelos, incluindo o genérico. Imobiliária existe; corretor de imóveis, advogado, escritório de advocacia, contador e escritório contábil não constam. | Separar atividade e forma de atuação, mantendo os identificadores atuais compatíveis. |
| DNA inicial | `defaultWhatsappCloneProfile` começa com `enabled: false` e todos os campos vazios. `createClientAgent` salva esse objeto. | Criar DNA preenchido e ativo por perfil, com edição e desativação persistentes. |
| Ajustes avançados | Tom, objetivo, público, venda e limites recebem padrões. Encaminhamento recebe uma regra genérica; entrega/pagamento/pós-venda começa vazio, embora o prompt gerado tenha uma alternativa genérica. | Completar regras adequadas ao tipo de atendimento. O título atual se refere ao modelo de atividade, não aos parâmetros técnicos do LLM. |
| Troca de atividade | `updatePromptTemplateDraft` modifica apenas parte do construtor. `generatePromptFromTemplate` é outra ação. Ao salvar, prompt e configuração são enviados separadamente; o runtime prefere o prompt já salvo. | É possível salvar uma atividade nova com o texto anterior. Reunir aplicação, geração e persistência em uma operação coerente. |
| Preferências de comportamento | `forceStandardBehaviorForActiveAgents` força reações com emoji, probabilidades, áudio espontâneo, memória e outros valores para agentes ativos. | Algumas opções apresentadas como escolhas não respeitam a desativação. Separar proteções obrigatórias de preferências editáveis. |
| Origem do comportamento | O painel resolve instância → agente → global. O runtime resolve instância → global → agente. | Sem configuração da instância, painel e execução podem divergir. Compartilhar o mesmo resolvedor de configuração. |
| Emojis e figurinhas | DNA adiciona instruções textuais. Reações usam `/message/react`; figurinhas usam envio de mídia. Os seletores de reação/figurinha não recebem o DNA. | São recursos distintos, mas hoje não há política integrada de estilo. Um perfil formal pode receber uma reação inadequada. |
| Qualificação | Já está ativa; inclui necessidade, contexto, prazo e objeção. A objeção tem peso 20 e `required: false`. O botão da linha se chama “Obrigatória”. | Objeção opcional não significa objeção desligada. Tornar isso explícito no painel e manter tratamento de objeções ativo. |
| Qualificação por atividade | O prompt contém perguntas do nicho, mas o playbook de CRM é global e orienta usar apenas suas perguntas. | Unificar a definição das perguntas para não oferecer instruções concorrentes. |
| Memória | Existe extração de padrões de estilo por IA após respostas elegíveis; o estado começa vazio. A chamada depende do fluxo, do histórico e do sucesso do provedor. | Mostrar estado e aprendizados reais. Não prometer que toda conversa gerará aprendizado. A extração possui medição de consumo. |
| Humanização | Existe avaliador e painel com indicadores, mas os eventos dependem de `cloneRealTestMode`, que a normalização força para `false`. | Novas conversas, por si só, não alimentam esse painel pelo fluxo normal inspecionado. Desacoplar coleta de qualidade do modo de teste. |
| Ativação inicial | Criar agente exige negócio acessível, limite/plano disponível e responsável humano. A API verifica cadastro completo. O runtime também verifica acesso faturável. | Os três passos devem reaproveitar dados do cadastro e exibir pendências reais, sem esconder pré-requisitos. |

O catálogo atual reúne vendas gerais; pizzaria/delivery; restaurante/lanchonete; farmácia/saúde; moda/varejo; estética/clínica; academia/suplementos; serviços locais; cursos/educação; imobiliária; autopeças/veículos; e-commerce. Alguns modelos também agregam atividades com jornadas diferentes: academia e loja de suplementos, por exemplo.

## 2. Como diferenciar profissional e empresa

Modelar duas dimensões: **atividade** e **forma de atuação**. A interface pode reuni-las em uma busca, permitindo escolher diretamente “Corretor de imóveis — profissional autônomo” ou “Imobiliária — empresa”. Evitar dois longos formulários obrigatórios.

Forma de atuação comercial não deve ser inferida de CPF/CNPJ: um profissional com CNPJ pode atender sozinho. O cadastro já contempla pessoa física e jurídica; a apresentação comercial é outra informação. Manter `organization_id` como limite de dados, inclusive para profissionais, sem criar uma segunda estrutura paralela de clientes, agentes e catálogo.

| Profissional | Empresa | Diferença prática de atendimento |
| --- | --- | --- |
| Corretor de imóveis | Imobiliária | Agenda e encaminhamento ao corretor responsável versus distribuição entre corretores/unidades. |
| Advogado | Escritório de advocacia | Atendimento vinculado ao profissional versus triagem por área e equipe. |
| Contador | Escritório de contabilidade | Serviços do contador versus encaminhamento entre fiscal, contábil e departamento pessoal. |
| Dentista | Clínica odontológica | Agenda individual versus especialidades, profissionais e unidades. |
| Psicólogo | Clínica de psicologia | Disponibilidade do profissional versus seleção e encaminhamento entre profissionais. |
| Fisioterapeuta | Clínica de fisioterapia | Atendimento individual/domiciliar versus serviços e agenda da clínica. |
| Esteticista | Clínica de estética | Serviços e agenda próprios versus equipe, procedimentos e unidades. |
| Personal trainer | Academia ou estúdio | Avaliação inicial e acompanhamento individual versus planos, estrutura e aulas. |
| Professor particular | Escola ou empresa de cursos | Matéria e disponibilidade individual versus cursos, turmas e matrícula. |
| Arquiteto | Escritório de arquitetura | Projetos do profissional versus portfólio e equipe por especialidade. |
| Eletricista, encanador ou técnico de ar-condicionado | Empresa de manutenção/instalação | Visita e orçamento individual versus cobertura e despacho de equipe. |
| Corretor de seguros | Corretora de seguros | Encaminhamento ao corretor versus triagem por produto e equipe. |

**Primeira entrega:** os três pares solicitados — imóveis, advocacia e contabilidade. Na sequência, ampliar com saúde, beleza, educação e serviços locais. A tabela é uma proposta de cobertura; a priorização comercial posterior deve usar atividades dos clientes, buscas sem resultado e pedidos recebidos, sem presumir demanda já medida.

Também separar gradualmente oficina, loja de autopeças e revenda de veículos; academia e loja de suplementos; clínica médica e estética. Manter pizzaria, restaurante, varejo e e-commerce como atividades empresariais próprias. Incluir “Outra atividade” com uma base de atendimento pronta.

Identidade deve distinguir nome do agente, nome do profissional e nome comercial. Exemplo: “Sou a Lia, assistente da corretora Renata” versus “Sou a Lia, do atendimento da Imobiliária Horizonte”. No perfil individual, não inventar equipe, filiais ou estrutura de empresa. A assinatura acompanha o nome do agente por padrão e pode ser personalizada.

## 3. O que cada perfil deve entregar pronto

Um perfil deve reunir prompt, DNA, perguntas de qualificação, regras de encaminhamento e preferências de WhatsApp. A aplicação inicial é determinística, sem exigir geração por IA ou crédito para montar o texto.

| Componente | Padrão proposto |
| --- | --- |
| Assinatura | Nome do agente, com opção “Usar o nome do agente” ativa. Se o cliente escrever outra assinatura, preservar essa escolha. |
| Identidade | Papel do assistente e vínculo com o profissional ou empresa. |
| Tom e vocabulário | Expressões adequadas à atividade, sem obrigar todos a usar gírias ou jargão. |
| Ritmo | Mensagens curtas, uma pergunta por vez, sem repetir informação respondida. |
| Abordagem comercial | Jornada própria: visita, orçamento, consulta inicial, matrícula ou compra. |
| Objeções | Acolher dúvidas, explicar com dados disponíveis e encaminhar exceções; ativo desde o início. |
| Fechamento | Próximo passo adequado ao perfil; só confirmar agenda, pedido ou pagamento com resultado real. |
| Emojis | Política de texto e reações compatível com a atividade, aplicada também ao envio efetivo. |
| Áudio | Estilo preenchido; envio subordinado ao modo de resposta e disponibilidade de voz. Recomendação inicial: texto, com áudio configurável. |
| Limites | Não inventar preços, disponibilidade, equipe, credenciais, condições ou resultados. |
| Complemento | Opcional e orientado por exemplos da atividade. Não preencher dados reais desconhecidos. |

Renomear “DNA manual do agente” para **“Personalidade do agente”**, com resumo visível: “Perfil de corretor de imóveis aplicado · Ativo · Personalizar”. Os campos vêm preenchidos; a edição detalhada fica recolhida. “Notas livres” pode permanecer opcional: não exigir preenchimento artificial apenas para atingir 12/12.

Renomear “Ajustes avançados do modelo” para **“Regras do atendimento”** e “Prompt técnico avançado” para **“Editar instruções avançadas”**. O usuário comum não precisa ver botões separados para gerar e depois salvar o prompt. Manter edição técnica para quem a utiliza, com indicação clara de que existe personalização manual.

Exemplo do pacote de corretor: identidade vinculada ao profissional; linguagem consultiva; perguntas sobre compra/aluguel, região, faixa de valor e necessidade; condução para visita; transferência ao próprio responsável em propostas e negociação. O pacote de imobiliária reutiliza a base de imóveis, mas muda apresentação, distribuição e encaminhamento. Não basta trocar o título.

## 4. Emojis, áudio e comportamento sem duplicidade

Concentrar esses controles em **“Estilo de conversa”**, com nível simples — discreto, equilibrado ou descontraído — e personalização opcional. O nível aplica valores estruturados, não apenas uma frase no prompt.

| Controle | O que significa para o cliente |
| --- | --- |
| Emojis nas respostas | Símbolos no texto enviado pelo agente. |
| Reagir às mensagens | Emoji preso à mensagem recebida no WhatsApp. |
| Figurinhas | Envio de um arquivo de sticker. |
| Conversa leve | Nome em português para small talk; usar quando houver abertura no diálogo. |
| Mídia proativa | Enviar material relevante e disponível durante o atendimento. |
| Resposta por áudio | Preferência efetiva de envio e voz; o DNA determina como o áudio deve soar. |

Perfis formais começam discretos; figurinhas ficam desligadas por padrão e disponíveis como personalização. Outros perfis podem ter linguagem mais leve. Preencher a personalidade automaticamente não implica ligar todos os recursos de mídia.

Retirar a imposição de preferências editáveis da normalização. Manter validações de valores e proteções operacionais separadas. O estado salvo, o painel e o envio precisam concordar. Ao desligar emojis no texto, não confundir isso com desligar reações; a interface deve deixar cada efeito explícito.

## 5. Qualificação e objeções

Manter qualificação e tratamento de objeções ativos desde o início. Corrigir a apresentação da pergunta de objeção: hoje ela já está disponível, porém não é obrigatória. Torná-la obrigatória em toda conversa pode criar perguntas desnecessárias para quem já quer fechar.

Proposta: mostrar “Incluída na qualificação” e deixar “Obrigatória para qualificar” como ajuste avançado. Se existir chave de ativação por pergunta, introduzir `enabled` separado de `required`, incluindo armazenamento, score e execução. Não reutilizar uma propriedade para dois significados.

Usar uma definição única das perguntas tanto no prompt quanto no CRM. Cada perfil terá um conjunto curto, pesos coerentes e limite de perguntas compatível. Permitir expansão pelo cliente e responder primeiro ao pedido atual. Informação já recebida preenche o campo sem perguntar de novo; ausência de objeção não deve impedir o próximo passo.

Na migração, revisar `configuredAt` e a detecção de qualificação não personalizada para que um playbook de atividade novo não seja substituído pelo global ao recarregar. Perguntas existentes não devem ser alteradas silenciosamente.

## 6. Entrada em três passos

Após os dados obrigatórios da conta:

1. **Seu negócio:** usar nome já cadastrado ou permitir informar nome profissional/comercial. Reaproveitar o titular como responsável quando aplicável, com contato válido e editável.
2. **Sua atividade:** selecionar profissional ou empresa na busca. Criar agente e aplicar o pacote completo; nome sugerido e resumo prontos. Complemento opcional.
3. **Conectar WhatsApp:** QR Code ou meio disponível. Confirmar conexão e verificar prontidão; quando apto, indicar “Agente ativo para receber mensagens”, com ações “Testar atendimento” e “Pausar”.

Evitar exigir setor, cargo, prompt e DNA como tarefas adicionais. Gerar setor e cargo a partir do perfil. O teste é recomendado e opcional, sem virar um quarto passo obrigatório. Retomar o ponto em que o usuário parou, sem duplicar agente ou instância.

Conexão sozinha não deve significar prontidão. Validar vínculo do agente, configuração persistida, conexão operacional, permissões de atendimento e acesso ao serviço. Se houver pendência, mostrar uma ação específica para resolvê-la. Definir ativação no final do fluxo e respeitar pausas anteriores em agentes existentes.

Sem catálogo, o agente já pode recepcionar, entender a demanda, qualificar e encaminhar. Para informar valor, oferecer imóvel específico ou confirmar horário, depende de dados reais. Apresentar enriquecimento progressivo: “Adicione serviços”, “Cadastre imóveis”, “Informe horários”, conforme a atividade.

## 7. Memória e qualidade

Mover os dois blocos para **“Evolução do agente”**, fora da configuração inicial.

**Memória:** começar com “Aguardando conversas para aprender”. Depois mostrar padrões identificados, correções e atualização mais recente. O contador atual representa itens armazenados nas listas de memória, não uma medida acumulada de aprendizado. Um gráfico de evolução exige histórico de eventos; o objeto atual guarda apenas o estado recente. Incluir origem/data e possibilidade de revisar ou remover aprendizados em uma etapa posterior.

**Qualidade do atendimento:** coletar avaliações independentemente do modo de teste. Mostrar respostas avaliadas, período, alertas e indicadores de clareza, repetição e entrega de ações. A avaliação existente usa heurísticas; sua nota não demonstra cientificamente o quanto uma resposta é humana. Apresentar metodologia simples e evitar chamar a nota de probabilidade de humanização.

Começar com cards e barras baseados nos eventos disponíveis. Só mostrar tendência com pontos históricos suficientes; sem amostra, mostrar “Ainda sem avaliações”, não 0% nem nota fictícia. A coleta deve acontecer depois do envio, sem travar atendimento, com falhas observáveis e volume controlado. Aproveitar o avaliador local inicialmente, sem ligar automaticamente um benchmark adicional com IA.

## 8. Ordem de implementação e critérios de aceite

| Etapa | Entrega | Critério de aceite |
| --- | --- | --- |
| P0 — Consistência | Resolvedor compartilhado; separar padrões e preferências; salvar configuração coerente; definir modo automático/manual do prompt. | Alterar atividade atualiza o texto efetivo; desligar uma preferência persiste após recarga e é respeitado no runtime. |
| P1 — Pacotes completos | Modelo versionado de atividade/atuação, DNA ativo e campos preenchidos; três pares prioritários; adaptar os modelos atuais. | Agente novo de cada perfil funciona sem prompt digitado; corretor não se apresenta como imobiliária. |
| P1 — Qualificação integrada | Perguntas por atividade, objeções incluídas, significado de obrigatoriedade explícito. | CRM e instruções usam as mesmas perguntas; cliente decidido não fica preso em questionário. |
| P2 — Entrada simples | Fluxo de três passos, dados reaproveitados, resumo e prontidão. | Conta apta conecta e começa a receber atendimento sem abrir configurações avançadas; retomada não duplica registros. |
| P2 — Estilo de conversa | Centralizar emojis, reação, figurinha, áudio e conversa leve. | Preferências do perfil controlam instruções e mídia efetivamente enviada. |
| P3 — Evolução | Coleta de qualidade desacoplada; memória com estados claros; histórico para tendências. | Uma resposta elegível produz avaliação sem modo de teste; estado vazio é honesto; gráfico usa eventos reais. |
| P3 — Expansão | Demais pares da tabela e separação de modelos amplos. | Cada novo perfil passa cenários de identidade, qualificação, objeção, encaminhamento e ausência de catálogo. |

O primeiro incremento utilizável deve juntar P0 com os três pares prioritários e DNA automático. Expandir dezenas de opções antes disso apenas amplia a inconsistência atual.

## 9. Implementação e migração

Criar um resolvedor único de perfil, por exemplo `resolveAgentSetup`, com atividade, atuação, nomes e versão como entrada, retornando prompt, DNA, qualificação e comportamento. Reutilizá-lo na criação, edição, clonagem e painel administrativo que compartilha a interface.

Registrar identificador/versão do perfil e origem das configurações — padrão, personalizada ou derivada do histórico. A origem atual do DNA só aceita manual/histórico; ampliar o contrato e sua normalização. Para troca de atividade, alterar automaticamente apenas o que ainda segue o perfil, preservando campos personalizados. Oferecer “Aplicar padrões da nova atividade” com prévia quando houver conteúdo próprio a substituir.

Manter agentes existentes intactos na implantação. Para DNA vazio, oferecer preenchimento pronto; não confundir vazio com desativação deliberada. Para configurações sem origem registrada, usar migração conservadora. Preservar memória, qualificações, pausas, responsáveis, instruções manuais e a atividade antiga até a aplicação explícita de um novo perfil.

Assinatura deve acompanhar renomeações apenas enquanto estiver vinculada automaticamente ao nome do agente. Clonar para outro negócio precisa atualizar vínculos e identidade sem carregar nomes do anterior em texto livre. A aplicação deve ser idempotente, versionada e resistente a falha parcial; uma instância não pode executar um perfil diferente do indicado como salvo.

Não concatenar regras comerciais/limites duplicados. Respeitar o limite atual de 8.000 caracteres do prompt sem truncar silenciosamente instruções essenciais; validar o tamanho de todos os perfis. Separar os dados variáveis do catálogo da definição estável de atividade.

**Arquivos principais para execução:**

- [Catálogo e geração de prompt](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-prompt-templates.ts:5).
- [Criação de agentes](C:/Users/conne/Documents/ConnectyHub/src/lib/client-os/agents.ts:173).
- [DNA e normalização de comportamento](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-behavior.ts:240).
- [Aplicação do comportamento padrão](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-behavior.ts:506).
- [Troca de atividade no painel](C:/Users/conne/Documents/ConnectyHub/src/components/connectyhub-os/whatsapp-console.tsx:920).
- [Persistência e leitura do estado](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/client-workspace.ts:1153).
- [Qualificação](C:/Users/conne/Documents/ConnectyHub/src/lib/leads/qualification.ts:44).
- [Seleção do comportamento em execução](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-runtime.ts:1228).
- [Prompt utilizado em execução](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-runtime.ts:4446).
- [Avaliação de qualidade](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-runtime.ts:14097).
- [Extração de memória](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-runtime.ts:15228).
- [Reações no WhatsApp](C:/Users/conne/Documents/ConnectyHub/src/lib/whatsapp/agent-runtime.ts:15950).

## 10. Verificação e medidas de sucesso

Na auditoria, foram executados os testes existentes de qualificação, comportamento/localização e clone/comércio: **3 arquivos, 63 testes aprovados**. Comando: `npm test -- tests/lead-qualification-config.test.ts tests/whatsapp-standard-behavior-location.test.ts tests/whatsapp-clone-commerce.test.ts`. Esses testes validam o estado atual; parte deles exige os padrões forçados que a proposta altera. Precisam ser atualizados para o novo contrato, não simplesmente removidos.

Validação da futura implementação: criação sem texto livre; aplicação dos seis perfis prioritários; distinção profissional/empresa; persistência de desligamentos; respeito às personalizações; renomeação e clonagem; sincronização do prompt; pontuação e perguntas; reação/figurinha conforme estilo; acesso por organização; ausência de catálogo; retorno do WhatsApp após reconexão; avaliações e memória vazias ou populadas; retomada do fluxo e falhas de salvamento. Incluir uma verificação visual em desktop e celular e teste ponta a ponta controlado.

Medir desde o início: tempo mediano e percentil 90 até prontidão; conclusão de cada passo; abandono; percentual que edita prompt antes de ativar; primeiras respostas bem-sucedidas; buscas de atividade sem resultado; dúvidas de configuração recebidas pelo suporte. Separar prontidão técnica do tempo até chegar a primeira mensagem de um lead. Definir metas após medir a linha de base; critério imediato do produto: **zero campos de prompt obrigatórios e três etapas visíveis após o cadastro da conta**.
