# Plano: atividade, atendimento e catálogo de ponta a ponta

Data: 11/09/2026. Implementação validada e publicada na master (`1267cd4`) e na Vercel, com a migration aplicada na VPS. Os testes locais abaixo não representam testes de atendimento real.

## Resultado esperado

O usuário escolhe profissão ou empresa, informa os dados essenciais e conecta o WhatsApp. O atendimento nasce com identidade, personalidade, perguntas de CRM, condução e próximo passo próprios da atividade. Configurações permanecem editáveis e são preservadas ao pausar/reativar.

No cadastro manual e na revisão de importação, cada item define sua ação: **Vender na loja**, **Solicitar agendamento** ou **Abrir site externo**. Preço é um dado separado: pode existir em um item de agenda, sem habilitar cobrança. Uma organização pode ter produtos de venda e serviços agendáveis simultaneamente.

## Evidência que motivou o plano

A conversa real da Renata foi lida no WhatsApp, desde o começo do histórico disponível até a última resposta de hoje. O teste imobiliário mostrou: orçamento convertido em pedido não escolhido; envio de um imóvel comercial junto da casa solicitada; atendimento apresentado como recepção de outro corretor; e aceite de consulta à agenda convertido em confirmação de pagamento. As páginas de produto mantêm controles de carrinho. Não foi confirmada geração de cobrança efetiva nessa auditoria.

Já existe correção **local**, anterior a este plano, bloqueando checkout no runtime de corretor/imobiliária/revenda e reconhecendo respostas de orçamento. Passou em 1.334 testes, TypeScript e ESLint. Ela não foi publicada e será revisada: uma proibição absoluta por atividade não atende à nova decisão de permitir uma loja mista por item.

## 1. Perfil completo por atividade

- Auditar todas as atividades cadastradas, incluindo pares profissional/empresa; não limitar a correção aos exemplos imobiliários.
- Cada perfil define representação, objetivo, vocabulário, perguntas relevantes, objeções, cuidados, critérios de recomendação, próxima ação e ação padrão para novos itens.
- Profissional: atendimento individual associado ao titular cadastrado, seus serviços e sua agenda; não inventar uma empresa, equipe ou terceiro para repassar todo atendimento. Empresa: recepção e representação do negócio, com profissionais/unidades realmente cadastrados.
- A atuação especializada não implica atribuir ao software identidade humana, credencial própria, experiência pessoal ou ações presenciais. Ao perguntar sobre a natureza do atendimento, a resposta deve ser transparente.
- Aplicar o perfil à primeira configuração, troca de atividade e instruções efetivamente usadas no runtime, incluindo agentes com prompt manual. Preservar ajustes identificáveis; substituição de personalizações exige ação explícita de reaplicar o perfil.
- CRM, personalidade e instruções devem concordar. Regras genéricas de varejo não podem sobrepor o fluxo profissional.

Exemplos de defaults:

| Atividade | Condução padrão | Próxima ação habitual |
|---|---|---|
| Corretor de imóveis | Atendimento individual, necessidades, região, orçamento, características e seleção de imóvel | Solicitar visita/proposta |
| Imobiliária | Atendimento da empresa e distribuição ao corretor cadastrado | Solicitar visita/proposta |
| Revenda de veículos | Necessidades, veículo escolhido, troca e condições cadastradas | Solicitar visita/test-drive |
| Advogado / escritório | Demanda, informações essenciais e consulta; representação individual ou institucional | Solicitar consulta/reunião |
| Dentista / clínica odontológica | Motivo geral, primeira consulta/retorno e disponibilidade; sem diagnóstico automático | Solicitar avaliação/consulta |
| Contador / escritório, arquitetura, seguros | Qualificação específica do serviço e encaminhamento adequado | Conversar sobre proposta/reunião |
| Eletricista, encanador, técnico de ar-condicionado e serviços locais | Necessidade, local, escopo conhecido e avaliação necessária | Solicitar atendimento/orçamento |
| Estética, professor e personal trainer | Objetivo, serviço e agenda próprios da atividade | Solicitar avaliação/aula/horário |
| Pizzaria, restaurante, moda, autopeças, comércio eletrônico e produtos de suplemento | Seleção, variações, disponibilidade, entrega e consentimento de compra | Comprar, quando o item estiver nesse modo |
| Farmácia, academia, cursos e operações mistas | Separar mercadorias, matrículas e serviços; regras próprias do perfil | Ação explícita de cada item |

Essa matriz orienta o catálogo inteiro de perfis; o detalhamento de perguntas e critérios será revisado atividade por atividade durante a implementação.

## 2. Identificação e registros profissionais

- Exibir campos condicionais conforme a atividade: nome profissional/de exibição, conselho ou entidade de registro, número e UF quando aplicável.
- Exemplos: CRECI, OAB e CRO; profissões sem conselho não recebem campo obrigatório artificial.
- Diferenciar registro do profissional e identificação da empresa. Clínica/escritório podem associar profissionais cadastrados, sem inventar uma equipe.
- Disponibilizar os dados ao agente e permitir escolher sua exibição na página pública.
- Registro informado não recebe selo de verificação automática. Dados vazios nunca são completados pela IA.

## 3. Ação de cada produto ou serviço

- Mesma escolha em criação, edição e revisão de importação: venda, agenda ou site externo.
- Sugerir pelo perfil, com resumo claro antes de salvar/importar. Não inferir compra apenas por existir preço, imagem ou campo legado de checkout.
- Venda: preço, variações, estoque e condições de compra existentes.
- Agenda: tipo de atendimento, agenda/recurso associado, responsável e duração quando necessário. CTA adequado: solicitar visita, avaliação, reunião ou test-drive.
- Site externo: URL cadastrada/importada, preservando fotos e contexto.
- Exemplo de loja mista: creme dental em venda; avaliação odontológica em agenda. O agente identifica o item atual e segue a ação correspondente.
- Galeria, escolha de capa, ingestão no R2 e consumo da cota da organização continuam iguais em todos os modos.

## 4. Uma regra compartilhada entre WhatsApp e páginas públicas

- A configuração persistida do item é a fonte da ação comercial. A atividade fornece o default; não reclassifica itens explicitamente revisados a cada conversa.
- Produto em agenda não entra no carrinho, resumo de compra, cobrança ou recuperação de pagamento. A validação precisa existir nos endpoints, e não só no botão.
- Venda explícita segue o fluxo normal, com item escolhido e consentimento contextual. Não incluir item agendável em checkout misto.
- Página pública e vitrine exibem a ação correta, incluindo versões móveis, cards e barras fixas. Em catálogo exclusivamente consultivo, ocultar carrinho e linguagem de compra.
- Resolver profissão/empresa e responsável pelos vínculos salvos. Parâmetros de link servem para rastreamento, não para alterar permissões, ação do item ou organização.
- O agente da loja e suas automações também devem usar a mesma regra; não pré-adicionar itens de agenda ao carrinho.

## 5. Agenda integrada

- Reutilizar recursos, disponibilidade, capacidade e reservas da agenda existente. Criar o percurso público necessário, sem expor compromissos de outros clientes.
- Levar à agenda o item escolhido e o contexto do interessado, preservando o vínculo com agente/empresa.
- Com agenda configurada: oferecer horários válidos e confirmar apenas após reserva persistida. Repetição de clique ou mensagem não duplica reserva.
- Sem agenda, recurso habilitado ou horário disponível: permitir solicitar contato/agendamento ao responsável, deixando o estado pendente explícito. Nunca confirmar horário fictício.
- Pedir somente os dados necessários, reaproveitando os já recebidos. Permitir consultar, remarcar ou cancelar conforme as regras existentes.

## 6. Continuidade, CRM e automações

- Manter item em foco, itens descartados e ação pendente: fotos, detalhes, proposta, agendamento ou compra.
- Interpretar confirmações curtas pela pergunta imediatamente relevante. Aceitar visita não confirma compra; informar orçamento não escolhe produto.
- Pergunta ambígua deve ser esclarecida. Evitar buscar confirmação em uma prévia comercial antiga depois de mudança de assunto/item ou recusa.
- Fotos e links devem corresponder ao item solicitado, sem ressuscitar itens descartados ou incluir opções não solicitadas.
- Registrar no CRM a intenção apropriada e seu progresso; não criar pedido de venda para uma visita.
- Follow-ups distinguem consulta pendente, visita/reunião e compra. Despedidas e conversas concluídas continuam fora do abandono.

## 7. Dados existentes e compatibilidade

- Preservar prompts personalizados, galerias, links, dados profissionais e escolhas revisadas de produtos.
- Versionar a aplicação de padrões e registrar sua origem para distinguir default de edição do usuário.
- Para agentes/itens legados consultivos sem ação explícita, aplicar fallback sem cobrança e sinalizar revisão. Não declarar todo checkout antigo como intenção explícita de venda nem reescrever o varejo em massa.
- Não apagar pedidos, pagamentos ou agendamentos anteriores. Mudança de atividade não autoriza reaproveitar cobrança antiga fora do novo contexto.
- Campos de perfil/item podem aproveitar metadados existentes; decidir migrations após fechar contratos e vínculos da agenda. Se necessárias, serão incrementais e compatíveis na VPS. Não presumir que não haverá SQL.

## Ordem de execução e publicação

1. Definir contrato compartilhado de perfil, identidade, registro e ação por item, incluindo precedência e defaults legados.
2. Implementar edição nos painéis de cliente/admin e nas duas entradas do catálogo: manual e importação.
3. Adaptar runtime WhatsApp, agente da loja, CRM e recuperação de contexto.
4. Adaptar vitrine/página pública e conectar a agenda; bloquear cobranças incompatíveis no servidor.
5. Executar revisão de legado, regressão e conferência visual; preparar uma publicação conjunta com eventual migration compatível antes de habilitar o novo fluxo.

O escopo foi autorizado durante a conversa e implementado localmente. A política inicial de bloquear toda compra pela profissão foi substituída pela ação explícita de cada item: uma organização profissional pode vender uma mercadoria e agendar um serviço no mesmo catálogo. A publicação deve ocorrer somente após concluir a validação e aplicar a migration compatível.

## Implementação e validação local

- Perfil individual versus empresa aplicado ao texto efetivo do agente e ao agente da loja; personalidade/CRM preservam edições identificáveis. Fechamentos e exemplos individuais deixam de usar recepção de um terceiro. Registros profissionais são dados informados, sem alegação de verificação; trocar o tipo de conselho limpa o registro incompatível.
- Cadastro manual e revisão de importação oferecem venda, agendamento e site externo. A agenda do item pertence à mesma organização. Itens legados herdados de atividade profissional recebem revisão de agendamento; destino legado `manual_handoff` exige escolha antes de publicar, sem conversão silenciosa para checkout.
- A página pública consulta os mesmos recursos e horários e chama `reserve_customer_appointment`, também usado pelo WhatsApp. O painel lê `customer_agenda_bookings`. Reservar por um canal ocupa a capacidade disponível no outro. A reserva pública é idempotente e só confirma depois de persistida; respeita o fuso da agenda. Sem agenda vinculada, apresenta solicitação de atendimento.
- Itens de agenda ocultam controles de compra e usam textos próprios; preços permanecem informativos. API de checkout e proteção no banco impedem novas cobranças incompatíveis, preservando atualizações financeiras de registros anteriores.
- WhatsApp mantém a seleção do serviço sem preço e em respostas curtas de agenda; não escolhe um dos itens de uma oferta ambígua. Orçamento não vira pedido e fotos não incluem um segundo imóvel quando o cliente pediu um específico.
- Origem “Importado do WhatsApp” fica nos metadados internos, sem destaque público. Galeria, capa, R2 e cota da organização permanecem no fluxo de importação.
- Valores monetários são convertidos por extenso antes da síntese de voz compartilhada, preservando números de telefone, códigos e URLs. Não altera o preço no cadastro.
- Troca Pix → cartão recupera o checkout do mesmo pedido quando utilizável, sem criar nova cobrança. Bloqueios financeiros continuam ativos. Resposta não pode anunciar checkout que não foi executado.
- Retomada de pedido consulta e revalida o checkout existente e a ação atual dos itens. Envia os botões de pagamento e saída separadamente; registra o conteúdo realmente aceito pelo provedor. Fallback de texto com links apenas após rejeição explícita do formato, sem repetição automática após resultado incerto.

Validação final: 1.387 testes em 153 arquivos na suíte completa, TypeScript, ESLint dos arquivos alterados/novos e `git diff --check` passaram. Conferência visual local com API simulada em 1200×900 e 390×844: seleção de agenda, serviço sem preço, erro de disputa de horário sem confirmação falsa, reserva confirmada após sucesso e ausência de overflow horizontal. Evidências locais em `tmp/activity-preview/desktop.png` e `tmp/activity-preview/mobile.png`. Foram removidos também o badge incorreto de checkout no serviço importado e o fundo translúcido que prejudicava a leitura do diálogo público.

Publicação pendente: aplicar `supabase/migrations/0130_catalog_item_appointments.sql` na VPS antes do deploy do aplicativo. A migration acrescenta o modo agenda nas importações, perfis derivados de agentes da própria organização, revisão de defaults antigos e bloqueios de novas cobranças. Foi exercitada em PostgreSQL local via PGlite; não foi aplicada em produção. Nenhuma mensagem real, cobrança, reserva de cliente ou upload pago foi disparado nos testes desta etapa. Depois do deploy, validar os fluxos reais com o titular; os testes simulados não comprovam entrega de botões ou pronúncia final do provedor de voz.

Atualização de publicação em 11/09: a etapa de banco acima foi concluída após autorização. A migration `0130` foi registrada na VPS, com backup privado dos 82 itens anteriores. Treze imóveis herdados passaram para agendamento; 67 itens de venda e dois externos foram preservados. Zero prévias de importação pendentes naquele instante. O envio do aplicativo está em andamento; mensagens, áudio e reservas reais ainda não foram testados nesta publicação.

Conclusão da publicação: Vercel Ready no domínio principal em 11/09 às 20:43 BRT, commit `1267cd4`. Página do Ipiranga e API de disponibilidade responderam 200; conferência pública desktop/celular mostrou agendamento sem controles de compra. A agenda da organização ainda não foi configurada/vinculada, portanto a resposta correta atual é solicitar atendimento, sem horários fictícios. O titular fará essa configuração no painel. O agente está salvo como `advogado`, e o botão observado é “Agendar reunião”; voltar a atividade para o perfil imobiliário desejado antes do teste de corretor. Não houve reserva, mensagem ou cobrança real nesta verificação.

## Critérios de aceite

- Selecionar profissão ou empresa preenche todo o perfil relevante, mantendo edição e preferências.
- A distinção profissional/empresa aparece na conversa, e credenciais só usam dados cadastrados.
- Reproduzir a conversa da Renata: orçamento não gera pedido; casa escolhida determina fotos; aceite de visita vai à agenda; link do imóvel não oferece carrinho no modo agenda.
- Dentista com produto de venda e serviço agendável consegue os dois fluxos na mesma organização, sem mistura.
- Advogado, contador, imóveis, veículos, saúde/estética e varejo passam em cenários próprios; todos os perfis cadastrados têm cobertura de configuração e suas diferenças.
- Testar preços opcionais em agenda, importação/edição/reimportação, site externo, R2/cota, agenda indisponível, concorrência de reservas, repetição de clique e isolamento entre organizações.
- Testar acesso direto a checkout de item agendável, carrinho misto e troca de atividade com histórico de compra.
- Concluir TypeScript, ESLint, suíte de testes e interface desktop/celular. Separar testes simulados de validação real após publicação; nenhum envio, cobrança ou reserva real é inferido de teste local.
