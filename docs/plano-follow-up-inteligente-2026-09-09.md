# Plano de follow-up inteligente e recuperação de carrinho

Proposta de produto e implementação — 09/09/2026. Este documento não ativa envios nem altera o pagamento em produção. Números de frequência, janelas e amostras abaixo são parâmetros iniciais propostos, sujeitos à validação por segmento.

## 1. Resultado pretendido

Decidir, para cada lead, se há um motivo útil para contato, qual oferta faz sentido, qual janela oferece maior chance de resposta e qual linguagem preserva a relação com a marca. Não enviar também é uma decisão válida e deve aparecer no histórico.

A tecnologia é compartilhada por todos os agentes. Os dados pessoais, compras e preferências ficam isolados por empresa. Agentes da mesma empresa compartilham o contexto autorizado e coordenam quem fala; empresas independentes não acessam os perfis umas das outras.

Quatro jornadas usam o mesmo mecanismo de decisão, com estados internos separados e um único habilitador de mensagens automáticas para o cliente:

| Jornada | Gatilho | Objetivo | Encerramento |
| --- | --- | --- | --- |
| Retomada de conversa | Uma conversa comercial relevante ficou sem resposta | Ajudar a continuar a decisão | Resposta, desinteresse, atendimento humano ou limite |
| Recuperação de carrinho | Um pedido confirmado ficou sem pagamento | Resolver uma dificuldade concreta | Pagamento, cancelamento, objeção, expiração ou limite |
| Recomendação e recompra | Oferta relevante, reposição ou hábito de compra | Apresentar algo útil ao interesse atual | Conversão, recusa, validade da oferta ou limite |
| Retorno previsto | Compra/atendimento registrado, com data ou intervalo de retorno | Convidar a voltar ou agendar | Novo atendimento, agendamento, recusa, pausa ou limite |

## 2. Base verificada no projeto

- `src/lib/whatsapp/proactive-followup.ts` já enfileira eventos no Inngest, verifica configuração, janela horária, resposta posterior, limite de mensagens e alguns estados financeiros. A geração usa as últimas oito mensagens e um prompt genérico; embora carregue o prompt do agente, não o inclui na composição desse follow-up. O envio é textual e separado do fluxo comercial principal.
- `src/lib/whatsapp/agent-behavior.ts` traz follow-up desligado por padrão, atraso de 120 minutos, máximo de duas mensagens e janela de 09h a 20h. Essas configurações não constituem um perfil individual de horário.
- Fora da janela, a rotina retorna `outside_time_window`; não agenda uma próxima janela nesse caminho. A comparação de horário considera horas inteiras, ignorando os minutos configurados.
- Recuperação de pedido e follow-up geral dependem do mesmo habilitador. O agendador geral tem um `catch` vazio, que dificulta enxergar falhas. A função inteira de follow-up roda em uma etapa com retries; envio e registro precisam de proteção persistente contra duplicidade e concorrência.
- `src/app/api/track/route.ts`, `src/lib/tracking/*` e `src/components/tracking/connecty-tracker.tsx` já têm eventos, sessões de comércio, identidades web, cliques e observações técnicas. `src/lib/client-os/lead-technical-profile.ts` reúne as observações mais recentes de dispositivo, navegador, localização e IP.
- O motivo específico de um toggle não salvar no agente citado ainda exige reprodução de UI e persistência; não foi demonstrado por esta leitura de código.

O agendamento por `ts` futuro usado no projeto é documentado pelo [Inngest](https://www.inngest.com/docs/guides/delayed-functions). Não é necessário substituir o agendador por suposição; é necessário tornar cada decisão agendada observável, cancelável e revalidada.

## 3. Perfil comportamental com evidências

O arquivo do lead deve distinguir fatos observados, preferências declaradas e estimativas. Cada estimativa guarda a origem, a quantidade de dias/sessões que a sustentam, a data de atualização e a confiança.

| Dimensão | Evidência útil | Aplicação |
| --- | --- | --- |
| Interesse | Busca, páginas vistas, atributos, favoritos e conversa | Seleção de ofertas compatíveis |
| Compra | Pedido pago, frequência, itens e cancelamentos | Recompra, afinidade e prevenção de oferta repetida |
| Momento | Horários de mensagens, respostas, cliques e compras | Janelas diferentes para conversar e comprar |
| Conversa | Tamanho das respostas, formalidade e preferência explícita por áudio/texto | Adaptação do agente sem caricatura |
| Dificuldade | Frete, prazo, preço, erro de pagamento, pedido de ajuda | Recuperação coerente com a objeção |
| Contexto | Cidade confirmada, fuso, horário da loja, clima verificado | Oportunidade comercial contextual |
| Contato | Permissão, preferência de frequência e pedidos de pausa | Elegibilidade e limites |

Compras e preferências declaradas devem pesar mais que uma visita isolada. Repetir vinte cliques na mesma sessão não equivale a vinte demonstrações independentes de interesse. Evidências antigas perdem peso; rejeições reduzem a afinidade correspondente. Um presente para outra pessoa não deve automaticamente virar preferência pessoal.

IP não identifica de forma confiável uma pessoa e não deve unir leads. Usar identidade autenticada ou vínculo comprovado com o lead; tratar links encaminhados e visitas anônimas com confiança reduzida. Nunca colocar telefone, endereço ou documento em links de campanha; usar identificadores opacos e assinados.

Navegador, sistema e tipo de aparelho são observáveis em páginas próprias quando disponíveis; não é correto prometer que toda mensagem do WhatsApp revela esses dados. A localização por IP é aproximada. Localização precisa depende de informação fornecida ou permissão. No WhatsApp, envia-se à conta do contato; não se escolhe qual aparelho físico vinculado receberá a mensagem.

Separar consentimento para rastreamento de consentimento para mensagens. Revisar a implementação atual em que a criação do identificador de visitante grava o cookie de consentimento; criar um ID não comprova que o lead aceitou marketing. Reter somente dados necessários, definir prazo de retenção e permitir correção, exclusão e pausa.

## 4. Escolher o horário sem inventar certeza

Um primeiro contato às 19h é uma pista, não um hábito. Começar com horário preferido declarado e contexto da sessão; usar uma janela da loja quando não houver base individual suficiente e não disparar proativamente apenas por esse primeiro horário.

Construir distribuições separadas de início espontâneo de conversa, resposta a contato da loja, navegação e compra. Usar faixas de 30–60 minutos por dia da semana, com fuso e decaimento temporal. A amostra deve contar dias/sessões independentes, não somente mensagens. Suavizar perfis com pouca amostra usando o padrão agregado da própria empresa, sem importar histórico pessoal de outros clientes.

Uma primeira referência possível é elevar a confiança após pelo menos cinco sessões em três dias distintos; essa referência precisa ser calibrada com dados reais. Preferências explícitas e evidências recentes podem alterar o horário. Separar respostas espontâneas das induzidas pelas próprias campanhas para não ensinar artificialmente que o horário escolhido pelo sistema era o preferido do lead.

A janela de envio é a interseção entre horário permitido pela pessoa, disponibilidade provável, funcionamento da loja, validade da oferta e regras do canal. Se a interseção for vazia, adiar ou descartar com motivo. Não existe garantia de que o lead esteja com o celular na mão.

## 5. Decisão de contato e recomendação

O processamento segue: evento → atualizar perfil → gerar oportunidades → filtrar elegibilidade → ordenar oportunidades → escolher janela → preparar mensagem → revalidar → enviar → observar resultado.

Os filtros anteriores à IA verificam permissão, pausa, atendimento humano, pedido ou revisão financeira pendente, frequência recente, estoque, entrega, horário da loja e compatibilidade da categoria com o canal. Uma oportunidade também pode ser rejeitada por baixa confiança ou ausência de benefício novo.

Na primeira versão, uma pontuação explicável combina afinidade, intenção recente, intervalo provável de recompra, relevância da novidade e qualidade da janela, com penalidades por repetição e fadiga. Pesos são hipóteses iniciais; não apresentar a pontuação como probabilidade calibrada de compra.

Gerar candidatos por atributos do catálogo: categoria, ingredientes, sabores, finalidade, preço e disponibilidade. A IA pode ajudar a organizar atributos e redigir; o preço, estoque, frete, desconto e pagamento vêm das ferramentas e regras comerciais.

Prioridade entre jornadas: atendimento ativo e pendência financeira suspendem ofertas proativas; recuperação de um pedido prevalece sobre uma novidade irrelevante ao pedido. Reservar o envio por empresa/lead para impedir Gustavo e Luna de abordarem a mesma pessoa juntos. A escolha do agente respeita a conversa e relação existentes.

Começar com regras e afinidade individual. Com dados suficientes, testar ranking aprendido e exploração controlada entre alternativas já pertinentes, dentro da janela e frequência autorizadas. A opção “não enviar” participa da comparação. Novos modelos só substituem regras quando melhoram resultados medidos.

## 6. Recuperação de carrinho

O relógio começa no envio confirmado do meio de pagamento ou em evento confiável do checkout. Falha de entrega da mensagem exige tratamento técnico, não uma cobrança ao lead por suposto abandono.

Para compra imediata, propor primeira avaliação em 10–20 minutos. Isso é uma avaliação de elegibilidade, não uma mensagem obrigatória. Se o cliente ainda está preenchendo o checkout, acabou de interagir, pediu prazo ou já informou uma dificuldade, a ação muda. Para produtos de decisão longa, a loja usa outra política.

Antes de qualquer recuperação, consultar o estado atual da cobrança; pagamentos confirmados, cancelamentos, comprovantes em análise e intervenção humana bloqueiam a cobrança automática. Revalidar imediatamente antes de transmitir, além de cancelar tarefas ao receber esses eventos. Leituras inconclusivas do gateway não autorizam afirmar inadimplência.

Exemplo: “Conseguiu usar o Pix ou apareceu alguma dificuldade?” Se houver falha técnica registrada: “Vi que a tentativa no cartão não foi concluída. Quer tentar novamente ou prefere Pix?” Se a pessoa disser que pagou, consultar e seguir o fluxo de conferência; nunca repetir a cobrança.

O mesmo pedido e cobrança válida devem ser reutilizados. Reenviar Pix pelo fluxo já validado; cartão pelo checkout correto. Expiração e mudança de método passam pelas regras atuais de pagamento. Nenhuma recuperação recria pedidos às cegas.

Se não houver resposta, uma segunda oportunidade pode ocorrer na próxima janela elegível. Limite inicial sugerido: até duas tentativas por episódio, com pausa explícita depois; compra rápida não deve gerar cobrança de um carrinho obsoleto no dia seguinte. Descontos e prorrogações só existem quando configurados pela loja.

## 7. Follow-up inteligente: exemplo da pizza

Três compras pagas de quatro queijos, em sextas à noite, produzem evidência de afinidade com queijos e uma hipótese de janela de compra. Não comprovam que a pessoa gosta de qualquer pizza nem que estará disponível toda sexta.

Quando a loja publica uma nova pizza de dez queijos, o sistema verifica atributos, estoque, preço, área de entrega e permissão de contato. Se existir uma janela elegível e não houver pedido em curso, prepara uma recomendação curta no tom do agente:

“Hoje entrou uma de dez queijos no cardápio. Como você costuma pedir a quatro queijos, achei que ia gostar dessa também 😊”

Um botão “Ver e pedir” pode levar a um carrinho sugerido, com total e condições atuais. Esse carrinho é uma proposta, não um pedido já autorizado. Endereço antigo e preferência de produto não equivalem à confirmação de nova compra. Após o aceite, usar o mesmo fechamento e Pix/cartão já existentes, sem uma implementação paralela de pagamento.

Clima e feriados podem contextualizar a mensagem quando forem verdadeiros e úteis. Consultar fontes estruturadas por cidade/data, com validade e cache; se não houver confirmação, omitir a referência. Não inferir crenças políticas, saúde ou vulnerabilidade para persuadir. Notícias locais podem informar uma condição operacional relevante, como funcionamento no feriado, sem construir perfis ideológicos.

Se a pessoa recusar a novidade, registrar essa preferência; não insistir trocando palavras. Se disser “hoje não, sexta”, pausar e respeitar a data. Se responder, o atendimento normal assume com a recomendação e seus motivos no contexto, evitando nova apresentação ou repetição de perguntas.

## 8. Experiência do cliente no painel

O relacionamento tem somente o botão **Follow-up inteligente**, por empresa. O cliente o habilita e o sistema coordena suas quatro jornadas. A **Agenda inteligente** é um módulo opcional com habilitador independente, descrito em 8.2. Não exigir criação de campanhas, tags, públicos, calendário anual, prompts ou regras técnicas.

Descrição sugerida: “Seus agentes retomam conversas, ajudam a concluir compras e identificam oportunidades de retorno com base no histórico de cada cliente. O sistema escolhe o momento e a abordagem, respeitando as preferências de contato.” Exemplos curtos explicam conversa interrompida, Pix não concluído, novidade relevante e retorno à barbearia.

O sistema reaproveita catálogo, horários e dados da empresa já cadastrados. A ativação não presume a existência de informações ausentes: produtos sem disponibilidade confirmada não viram ofertas; leads sem base suficiente não recebem personalização inventada. Mostrar uma pendência simples e específica somente quando ela impedir o funcionamento.

Frequência, ranking, janelas e política por jornada são responsabilidade interna do produto, com padrões conservadores e limites de consumo. Descontos dependem de regras comerciais existentes; habilitar follow-up não autoriza inventá-los. A simulação e o piloto pertencem à implantação e ao controle de qualidade, não são configuração obrigatória para o usuário final.

Exibir um estado simples: ativo, aprendendo ou precisa de atenção. Aprendendo não bloqueia ações com motivo comprovado, como uma recuperação de pedido elegível; apenas evita afirmar hábitos ainda não demonstrados. O usuário pode consultar atividade, pausar um lead ou desligar o botão. Ao desligar follow-up, suas quatro jornadas ficam pausadas, inclusive convites de retorno; registros e agendamentos reais são preservados. Lembretes de compromissos pertencem à Agenda inteligente e têm controle independente, respeitando também as preferências de contato. Reativar exige reavaliar pendências, sem despejar mensagens atrasadas.

No arquivo do lead: interesses com evidências; janela provável e confiança; preferências declaradas; última abordagem; próxima ação; motivo de envio/adiamento/bloqueio; controles “pausar”, “não oferecer este produto” e “definir horário”. Não expor IP e rastreamento como argumentos na mensagem ao cliente.

Cada decisão precisa responder: por que este lead, por que esta oferta, por que este horário, qual agente, qual evidência e o que aconteceu depois. Falha de geração, agendamento e entrega aparecem como estados diferentes, não como “enviado”.

### 8.1. Retorno previsto: uma ação simples no arquivo do lead

Separar retorno previsto como conceito e registro, sem construir um segundo sistema de envio. Um hábito estimado e uma data combinada não têm a mesma certeza. O retorno deve guardar evento de origem, serviço/produto, data efetiva, intervalo ou data desejada, origem da definição e estado.

Na ficha do lead, oferecer **Registrar visita ou compra**. O usuário confirma o que aconteceu e quando, com “hoje” como padrão; pode marcar **Lembrar de voltar em 7, 15 ou 30 dias**, ou escolher uma data. Um botão **Agendar retorno** permite registrar diretamente uma combinação com o cliente. As tags visuais são geradas a partir do registro; uma tag genérica “comprou” sozinha não informa data, item nem periodicidade.

O intervalo pode ser reaproveitado de uma preferência previamente definida para aquele serviço, de um hábito com evidências suficientes ou de uma combinação expressa com o lead. Em um primeiro atendimento, uma sugestão de 30 dias é uma proposta a confirmar, não um fato aprendido. Não exigir que o comerciante crie uma automação para cada pessoa.

Se a compra paga ou atendimento concluído já chega por integração confiável, registrar automaticamente, sem redigitação. Pedido de preço, pedido cancelado e agendamento ainda não realizado não equivalem a compra ou visita concluída. Integrar a agenda/POS quando existente; registros offline sem integração precisam do lançamento simples.

| Caso | Registro | Comportamento |
| --- | --- | --- |
| Barbearia | Corte realizado hoje; retorno previsto em 30 dias | Próximo da data, convidar a agendar em janela adequada; só oferecer horários reais |
| Sushi | Visita hoje; lembrete combinado para daqui a uma semana | Preparar uma oportunidade de retorno na data, respeitando funcionamento e contato |
| Camiseta | Compra realizada hoje | Aprender afinidade; não impor recompra mensal a um produto sem ciclo comprovado |

Uma data de retorno é um convite previsto, não um agendamento confirmado. A mensagem pode dizer “Quer que eu veja um horário para seu próximo corte?”, mas não afirmar que reservou uma vaga. Um horário expressamente combinado com o lead prevalece sobre o horário estimado pelo modelo.

Novo atendimento antes da data cancela o convite antigo e recalcula o ciclo conforme a regra de retorno. Agendamento confirmado suspende convites para marcar o mesmo atendimento e passa à agenda de atendimento. Resposta, recusa e pausa reavaliam a tarefa. Silêncio não gera mensagens infinitas a cada 30 dias: cada evento abre um episódio com tentativas limitadas; o próximo ciclo depende de nova evidência ou de uma recorrência explicitamente solicitada.

Recomendação, recuperação e retorno disputam o mesmo limite de contato. Se um retorno já atende ao motivo de uma recomendação, escolher uma abordagem ou combinar o conteúdo coerentemente. Nunca mandar uma mensagem de novidade e outra de retorno no mesmo momento por falta de coordenação.

### 8.2. Agenda inteligente: módulo opcional independente

**Decisão de produto:** incluir uma agenda nativa na plataforma, compartilhada pelos agentes de cada empresa e separada do habilitador de follow-up. Loja virtual pode usar relacionamento e recuperação sem ativar agenda; prestador de serviço pode usar agenda e lembretes operacionais sem ativar recomendações comerciais. Retorno previsto continua sendo um registro no arquivo do lead; não exige contratar, configurar ou habilitar uma agenda para funcionar.

| Controle | Responsabilidade |
| --- | --- |
| Follow-up inteligente | Retomada de conversa, recuperação de carrinho, recomendações e convites de retorno |
| Agenda inteligente | Consultar disponibilidade, reservar, remarcar, cancelar, lembrar compromissos e registrar resultado |
| Retorno previsto, na ficha do lead | Guardar quando vale convidar a pessoa a voltar, manualmente ou após atendimento concluído |

#### Base encontrada e limites

Existe `src/components/connectyhub-os/custom-software-agenda.tsx`, ligado a `/api/admin/custom-software`, e a migration `0109_custom_software_meetings.sql`. Esse fluxo interno de reuniões de software personalizado tem horários, reserva com bloqueio transacional e eventos. Sua administração é restrita à plataforma, os slots não têm escopo de empresa e a solicitação é única por lead. Não é uma agenda geral multiempresa pronta para receber clínicas, profissionais ou restaurantes; reaproveitar padrões, sem expor essas tabelas diretamente aos clientes.

`src/lib/agents/responsible-human.ts` já mantém responsáveis por agente, telefones e preferência por avisos operacionais. Usar esse cadastro como destino das notificações de agenda. O retorno interativo de presença ainda precisa de implementação específica; o cadastro existente não comprova essa capacidade.

#### Ativação simples com fatos operacionais reais

Botão **Agenda inteligente — Ativar**. Descrição: “Seu agente consulta os horários disponíveis, agenda pelo WhatsApp, envia lembretes e avisa o responsável sobre reservas e alterações.”

Reutilizar horários, unidade, fuso, serviços e responsáveis já cadastrados. Quando faltar informação indispensável, pedir somente uma confirmação curta: quais serviços, duração e quantos atendimentos podem ocorrer juntos. Um prestador individual pode iniciar com uma agenda; equipes precisam de profissionais/recursos. Restaurante precisa da quantidade de pessoas e capacidade de mesas, com tempo de ocupação. Não inferir capacidade a partir do setor nem inventar duração de procedimento clínico.

Perfis de serviço/restaurante facilitam o preenchimento, mas são sugestões a conferir. Permitir cadastro em linguagem natural, por exemplo “Atendo de terça a sábado, das 9h às 18h; cada corte leva 30 minutos; sou só eu”, e apresentar o resumo para confirmar. Isso é cadastro operacional inicial, não montagem de uma automação.

#### Fluxo de reserva

1. Entender o serviço, dia, horário, unidade e profissional quando necessários. Em restaurante, entender número de pessoas. Esclarecer ambiguidades relevantes, como 9h versus 21h.
2. Consultar a fonte real de disponibilidade: funcionamento, intervalos, feriados/bloqueios, duração, preparo/limpeza, profissional, sala, mesa e capacidade.
3. Se houver disponibilidade no horário pedido, obter os dados e o aceite necessários, reaproveitando o que o lead já disse. Se não houver, oferecer poucas alternativas próximas. Não trocar unilateralmente o horário; exceção apenas se a pessoa tiver autorizado claramente, por exemplo “pode marcar o primeiro livre depois das 9h”.
4. No aceite, conferir e reservar atomicamente. Uma consulta anterior não garante que a vaga continue livre. Se outro lead a ocupar, explicar e oferecer alternativas reais. Só afirmar “agendado” após a gravação bem-sucedida.
5. Registrar no arquivo do lead e avisar o responsável cadastrado: pessoa, serviço/reserva, data, horário e profissional/unidade quando aplicável. Falha no aviso não desfaz uma reserva válida; registrar e recuperar a notificação separadamente.

A memória do agente recebe um resumo do compromisso, mas o banco da agenda é a fonte de verdade. Reconsultar antes de afirmar horários ou alterações. Reserva de mesa exige controle de capacidade e sobreposição da ocupação; não modelar o restaurante como uma agenda de uma vaga por horário.

#### Confirmação e lembretes

Para um corte às 9h, um lembrete às 8h30 pode dizer “Seu horário é hoje às 9h. Está confirmado?”, com **Confirmar**, **Remarcar** e **Cancelar**. O intervalo é um padrão por tipo de compromisso, não necessariamente 30 minutos para todos os setores. Se o agendamento acontecer depois do instante do lembrete, não emitir lembrete atrasado nem repetir imediatamente a confirmação.

O lembrete de compromisso usa a data combinada como referência, com regras de contato; não espera a janela de compras aprendida pelo follow-up. Em horários muito cedo, usar uma antecedência adequada em vez de mandar mensagem inconveniente. Confirmação de presença e reserva são estados distintos: ausência de resposta não cancela a vaga automaticamente.

Confirmar avisa o responsável uma vez. Remarcar consulta alternativas e aguarda aceite; a troca da reserva ocorre atomicamente, sem perder a vaga antiga se a nova falhar. Cancelar libera recursos, invalida lembretes antigos e avisa o responsável. Todos os avisos usam o cadastro existente; não criar outro destinatário obrigatório.

#### Comparecimento e resultado do atendimento

Não perguntar às 9h se o atendimento das 9h já foi concluído. Após o término previsto e uma tolerância, enviar ao responsável uma pergunta vinculada àquela reserva: “O atendimento do João, das 9h, foi realizado?”, com **Sim, realizado**, **Não compareceu** e **Ainda não sei**.

“Ainda não sei” ou ausência de resposta mantém o resultado pendente. Não presumir falta pelo silêncio nem conclusão pelo relógio. Se houver necessidade operacional, a agenda também pode registrar chegada e atendimento em andamento, sem confundi-los com conclusão.

Ao confirmar realização, registrar o evento de atendimento e alimentar o perfil do lead; criar retorno previsto conforme o intervalo definido para o serviço ou combinado com a pessoa. Para a barbearia, pode ser 30 dias; para outros serviços, não inventar uma periodicidade. Gerar convites automáticos de retorno somente quando o follow-up estiver habilitado e o lead elegível.

Se marcou “Não compareceu”, registrar a falta e cancelar o retorno que dependeria daquele atendimento. Uma oportunidade limitada de remarcar pode ser considerada pelo follow-up, sem tratar a falta como compra/consumo realizado. Corrigir um resultado no painel deve reavaliar tarefas derivadas e preservar a auditoria.

#### Segurança operacional e coordenação

- Cada ação de botão referencia compromisso, organização, versão e destinatário autorizado, com validade. Validar o WhatsApp do responsável ou do lead antes de alterar o estado; não interpretar um “sim” solto como confirmação de uma reserva arbitrária.
- Duplicatas e botões de versões anteriores não repetem ações nem alteram uma reserva remarcada. Respostas ao responsável são tratadas como operação de agenda, sem cair indevidamente no atendimento comercial comum.
- Registrar duração, recursos, participantes, fuso, status da reserva, confirmação do lead, resultado do atendimento e histórico de alterações separadamente. Eventos e tarefas têm identificadores estáveis.
- A IA não decide encaixes clínicos, urgência nem duração de procedimentos desconhecidos. Agenda serviços definidos pela clínica e encaminha situações não previstas ao responsável. Notificações operacionais incluem somente o necessário, sem reproduzir relatos clínicos.
- Um agendamento válido suspende convites para agendar o mesmo serviço. Lembretes operacionais e campanhas são coordenados para não abordar a pessoa duas vezes pelo mesmo motivo.
- Ao desligar a agenda, impedir novas operações automáticas e deixar explícito o destino dos lembretes pendentes. Preservar compromissos no painel; desligar uma função não cancela reservas nem informa falsamente cancelamento aos leads.
- A primeira versão usa a agenda nativa como fonte de disponibilidade. Sincronização com agendas externas é opcional e posterior; não prometer proteção contra conflitos em calendários que ainda não estejam integrados.

#### Entrega e testes

Construir inicialmente reservas por profissional/recurso, confirmação, remarcação, cancelamento, avisos e registro de atendimento. Implementar capacidade de mesas como perfil próprio antes de oferecer agenda para restaurantes. Conectar atendimento concluído ao retorno previsto, sem duplicar o sistema de follow-up.

Planejar migrations aditivas com escopo por empresa, recursos/serviços, regras de disponibilidade, reservas, alocações, ações e notificações. Validar duas reservas concorrentes, durações sobrepostas, capacidade de mesas, intervalo/feriado, remarcação com falha, confirmação tardia, responsável errado, clique duplicado, atendimento antecipado, silêncio e desligamento do módulo. Não ativar agendamento em produção sem esses testes.

### 8.3. Navegação: centralizar em Automações

Atualização de direção em 12/09/2026: por solicitação do titular, a Agenda inteligente passa a ter entrada própria **Agenda** no menu do cliente (`/dashboard/agenda`), com calendário de compromissos e configurações recolhidas. O agendamento público oferece calendário mensal clicável para escolher o dia. A referência visual é Google Agenda, sem integração Google. O desenho abaixo é histórico; relacionamento e demais automações continuam na central. Estado de validação e publicação em [estado-operacional.md](estado-operacional.md).

Manter **Automações** como entrada no menu lateral. Usar seções recolhíveis: clicar no cabeçalho abre, clicar novamente fecha. Na entrada normal, começar com os blocos fechados e mostrar seus estados no resumo. Não criar um item lateral chamado “Follow-up com agenda”. A agenda e o relacionamento são módulos independentes dentro da mesma central.

O projeto já tem `/dashboard/automacoes`, `ClientAutomationsCenter` e `ClientWhatsappAutomationStudio`, com empresa, WhatsApp de envio, templates de mensagens do checkout e operações de grupos/canais. Essa central é o ponto de expansão. A área `/admin/automacoes` administra automações da própria plataforma e não deve ser confundida com as automações de venda dos clientes.

Organização proposta:

| Área de Automações | Experiência |
| --- | --- |
| Follow-up inteligente | Um botão, descrição com exemplos, estado e resultados; inclui retomada, recuperação, recomendações e retornos |
| Agenda inteligente | Habilitador independente, calendário operacional, compromissos e resultado dos atendimentos |
| Mensagens de pedidos | Confirmações e atualizações transacionais já existentes, com templates preservados |
| WhatsApp: grupos, canais e status | Operações de campanha existentes, recolhidas inicialmente, com destinos e controles próprios |
| Atividade | Histórico comum de envios, próximas ações, falhas e motivos; consulta, não configuração obrigatória |

A entrada na central destaca os dois módulos inteligentes e seus estados. Não juntar todos os formulários em uma página longa nem exigir configuração de grupos, canal ou templates para ligar follow-up. O usuário pode entrar diretamente na agenda para trabalhar com compromissos; a ficha do lead também abre sua reserva/retorno pelo contexto.

Retirar do comportamento do agente o bloco “Follow-up proativo”, incluindo habilitador, atraso fixo, máximo por conversa e janela. Comportamento continua cuidando de personalidade, tom, áudio e condução do atendimento. Durante a transição, um link “Gerenciar em Automações” pode ajudar a localizar o recurso, sem manter dois habilitadores concorrentes.

A migração deve preservar as configurações existentes e seus escopos; não transformar automaticamente o follow-up de um agente em autorização para todos. Antes de trocar o executor, inventariar tarefas antigas, migrar ou invalidar suas versões e garantir um único responsável por cada envio. A recuperação nova substitui o acionamento antigo equivalente, enquanto templates transacionais de pagamento continuam com sua finalidade. Evitar que recuperação por template e recuperação inteligente acionem o mesmo pedido.

Reutilizar a preferência existente de priorizar o WhatsApp da conversa. O responsável por um lead continua sendo o agente que o atende, com destino padrão apenas quando pertinente e autorizado. Centralizar o controle não troca a personalidade nem o número de envio de todos os contatos.

Essa é uma decisão de organização de produto. O documento não removeu componentes da interface nem ativou novos fluxos em produção.

### 8.4. Redesenho da central de Automações

#### Diagnóstico da tela atual

Na leitura de `client-automations-center.tsx`, a página repete contexto em três indicadores no topo, na base das automações e no painel do WhatsApp. Em `client-whatsapp-automation-studio.tsx`, cinco ações de atualização, cinco cartões de habilitação, seleção de destinos, janela de abertura de grupo, criação de campanha, prévia, inteligência e histórico ocupam a mesma superfície. O resultado é uma página extensa mesmo quando o usuário não está criando uma campanha.

O componente compartilhado `Panel`, em `panel-primitives.tsx`, já implementa `collapsible` com `<details>/<summary>` e `defaultOpen=false`. “Mensagens automáticas” utiliza esse recurso; o painel “WhatsApp: grupos, canais e status” não informa `collapsible`. A primeira melhoria pode reutilizar a estrutura existente. Recolher melhora a entrada; também é necessário reorganizar o conteúdo aberto.

#### Estrutura de entrada proposta

```text
Automações
BuffaloMass · Gustavo · WhatsApp conectado       Configurações

▸ Follow-up inteligente          Estado + resumo de atividade
▸ Agenda inteligente             Estado + próximos compromissos
▸ Grupos, canais e status        Destinos + envios programados
▸ Mensagens de pedidos           Resumo das mensagens configuradas
▸ Atividade                      Últimos resultados e pendências
```

Os estados acima são campos da interface proposta, não valores reais do ambiente. A abertura apenas revela conteúdo: não ativa, desativa, salva nem dispara mensagens. Fechar um bloco preserva rascunhos e a execução das rotinas ativas. Um acesso direto a um compromisso ou erro pode abrir o bloco pertinente automaticamente; a entrada normal permanece recolhida. Evitar colocar habilitadores interativos dentro do próprio `<summary>`: manter estado no cabeçalho e botão de ativação claramente separado no conteúdo aberto.

Substituir os cartões grandes de empresa/WhatsApp e a base sempre aberta por uma linha compacta de contexto. Usar nome amigável do agente e estado da conexão; identificadores técnicos ficam em detalhes. Em contas com várias empresas, manter seleção e escopo visíveis. “Configurações” abre painel lateral para WhatsApp padrão, preferência pela conversa e avisos transacionais. Preservar escolhas existentes e mostrar qual configuração está sendo alterada.

#### Grupos, canais e status quando aberto

Apresentar uma área de trabalho curta, com navegação interna **Destinos**, **Campanhas** e **Envios programados**. Mostrar somente a área selecionada. Histórico e análises extensas ficam em Atividade, já filtrados pelo módulo; um resumo com link é suficiente aqui.

| Hoje | Proposta |
| --- | --- |
| Cinco botões para atualizar, buscar e analisar | Descoberta inicial automática, sincronização com cache e horário da última atualização; uma ação secundária “Atualizar destinos” |
| Cinco cartões grandes de habilitação | Capacidades disponíveis conforme conexão/plano; seleção de destino e ações da rotina substituem habilitações redundantes |
| Formulário de campanha sempre aberto | Lista de campanhas com estado e próxima execução; botão principal “Criar campanha” |
| Lista extensa de produtos junto da prévia | Seleção com busca no editor de campanha; prévia sob demanda |
| Janela de grupo e três mensagens sempre expostas | Ação “Programar abertura do grupo” no destino escolhido; formulário aberto somente ao usar |
| Formato, menções e ajustes de botão sempre visíveis | Padrões úteis e “Mais opções” no editor, mantendo acessíveis as escolhas existentes |
| Métricas e produtos mais usados ocupando a página | Resumo curto e acesso a resultados detalhados em Atividade |
| Histórico inteiro abaixo de tudo | Lista paginada com filtros e detalhes por execução |
| Indicador “Agenda” para campanhas | “Envios programados”, distinguindo da agenda de atendimentos |

Criar campanha abre um editor lateral no desktop e uma tela apropriada no celular. Pedir destino, conteúdo/produtos e momento de publicação; a IA ajuda com o texto. A prévia deve refletir o conteúdo que será publicado. Uma ação final clara agenda ou publica o que foi preparado. Editar rascunho, salvar configuração e publicar são ações distintas, com retorno próximo do controle usado.

Descoberta automática significa buscar os destinos disponíveis ao conectar ou quando o cache estiver vencido, com limites e estado de sincronização. Não repetir consultas e análises custosas a cada clique no acordeão. Métricas usam atualização em segundo plano quando suportada; falhas mostram opção de tentar novamente. Não afirmar ausência de grupos quando a consulta falhou ou ainda está carregando.

Se não houver grupos ou canais, mostrar uma mensagem curta e ocultar os formulários que dependem deles. Status pode continuar disponível se a conexão permitir. Destino sem permissão de publicação aparece com motivo compreensível. Não exibir identificadores internos, listas vazias extensas ou grandes cartões com zero como conteúdo principal.

#### Recursos nativos e escolhas que continuam necessárias

A proposta é eliminar habilitações globais redundantes de campanhas em grupos, campanhas em canais, status e interações. Botões e enquetes são ferramentas disponíveis quando o canal suporta. O cliente escolhe onde publicar ao criar a rotina; não precisa primeiro ligar uma chave técnica para a mesma função.

Para atendimento em grupos, substituir a combinação de habilitadores por uma escolha por destino: **Atender neste grupo**, acompanhada do modo de resposta quando necessário. Encontrar um grupo apenas o disponibiliza na lista; não transforma automaticamente todos os grupos do número em locais de atendimento. Uma campanha ativa mantém um comando simples de pausar/retomar. Assim, simplificação não remove a escolha operacional do cliente.

No código atual, `FeatureGates` altera comportamento do agente e há verificações de capacidade no fluxo de campanha, além de permissões por destino. A alteração precisa abranger interface, validação e executor; esconder os cartões não basta. Preservar limitações reais do provedor, permissões e acesso do plano. Inventariar os valores existentes para não converter uma desativação intencional em ativação silenciosa. Mapear configurações para o novo modelo e testar instâncias com escolhas diferentes; não mudar esses estados junto de uma simples alteração visual.

Follow-up e agenda mantêm seus dois habilitadores independentes porque representam novos comportamentos automáticos. A disponibilidade nativa de uma ferramenta de campanha não equivale a ligar uma jornada inteira. Rotinas existentes seguem seus estados e destinos; abrir a nova central não inicia nenhuma rotina.

#### Direção visual e usabilidade

- Reduzir caixas dentro de caixas, margens excessivas, textos técnicos em caixa alta e repetição de títulos. Usar superfície neutra e cores para estados e ações relevantes.
- Trocar botões de largura inteira por ações proporcionais ao conteúdo no desktop; manter alvos de toque adequados no celular. Compactar a composição sem reduzir a legibilidade das fontes.
- Ter uma ação principal por área. Ações secundárias ficam próximas do item a que se referem ou em menu contextual.
- Mostrar descrições e exemplos curtos ao abrir Follow-up ou Agenda, com detalhes opcionais. Não exigir configurações avançadas para ativar follow-up.
- Exibir carregamento, vazio, erro, pausa e ativo como estados distintos. Resultados indisponíveis não viram números inventados.
- Garantir navegação por teclado, foco visível, rótulos acessíveis e ausência de rolagem horizontal. Não criar vários níveis de acordeões dentro de acordeões.
- Preservar rascunhos ao recolher seções. Ao trocar empresa/agente ou sair com alterações pendentes, evitar perda silenciosa e nunca levar um rascunho para outra empresa.

#### Entrega da interface e critérios de aceite

1. **Organização visual:** recolher grupos por padrão, compactar contexto, separar formulários sob demanda e mover detalhes extensos. Manter comportamento atual durante essa etapa.
2. **Simplificação funcional:** consolidar habilitadores redundantes, implementar descoberta automática e alinhar validações internas, preservando destinos, campanhas e pausas existentes.
3. **Novos módulos:** inserir Follow-up e Agenda conforme suas entregas funcionais, com ativação real e estado verificável. Não publicar botões que indiquem ativo sem executor funcionando.
4. **Validação:** conferir desktop em 1920×1080 e 1366×768 e celular em 390×844; navegação inicial curta, grupos fechados, conteúdo legível quando aberto e sem transbordamento horizontal. Testar teclado, preservação de rascunhos, ausência de destinos, falha de conexão e contas com múltiplas empresas.
5. **Regressão operacional:** abrir/recolher não altera configurações nem envia mensagens; sincronização não ativa grupos; campanhas mantêm destinos e pausas; pagamentos e notificações mantêm o comportamento validado. Verificar novo estado de capacidade tanto no frontend quanto no backend.

O acordeão e a reorganização visual, isoladamente, não exigem migration SQL. O novo sistema de follow-up, retornos e agenda exigirá persistência adicional conforme as seções seguintes; a migração dos habilitadores depende do modelo final. Nenhuma migration foi criada nesta etapa de planejamento.

## 9. Implementação e persistência

Reutilizar `intelligence_events`, `commerce_sessions`, `lead_web_identities`, leads, pedidos e sessões de pagamento. Fazer projeções incrementais, sem pedir ao modelo para reler toda a vida do lead em cada clique.

Planejar migrations SQL aditivas para estruturas de: políticas internas por jornada e habilitador da empresa; perfil comportamental agregado/versionado; eventos de atendimento/compra offline e retornos previstos; oportunidades de contato; decisões e fila de envio persistente; atribuição de experimentos. Os nomes finais dependem do inventário completo do schema para evitar duplicar estruturas existentes.

Toda linha pertence a uma organização, com RLS, índices por organização/lead/data e unicidade por oportunidade/tentativa. Registrar versão do perfil, política e modelo usados. Manter timestamps em UTC, junto ao fuso usado para a decisão.

Separar planejamento, geração, validação e envio em passos recuperáveis. Usar reserva transacional, chave idempotente estável e confirmação do provedor. Não prometer entrega “exatamente uma vez” se o provedor não suportar idempotência: timeout entra em estado incerto, exige conciliação e não autoriza retry cego. Reprocessamento após crash não pode produzir outra cobrança ou campanha duplicada.

Eventos de pagamento, resposta, opt-out, troca de carrinho e atendimento humano invalidam tarefas antigas. Na hora de enviar, refazer as verificações de elegibilidade, estoque, validade e estado do pedido; cancelamento de fila sozinho não elimina corridas.

Centralizar a composição do agente: persona, fatos pertinentes, intenção da abordagem e memória resumida. Reutilizar as proteções contra promessas inexistentes e o adaptador de pagamento. A IA escolhe palavras; regras e ferramentas autorizam ações e valores.

O adaptador do canal aplica os requisitos vigentes. Na WhatsApp Business Platform oficial, mensagens fora da janela de atendimento exigem templates aprovados; permissões e pedidos de interrupção precisam ser respeitados. A integração Uazapi atual deve ter suas capacidades e limitações avaliadas explicitamente; aceitar um envio tecnicamente não comprova adequação às regras do canal. Referência: [política oficial de mensagens](https://business.whatsapp.com/policy).

## 10. Entregas em ordem

| Etapa | Entrega | Critério para avançar |
| --- | --- | --- |
| 0. Central organizada | Seções recolhíveis, contexto compacto e formulários sob demanda; depois consolidação de capacidades | Interface curta e acessível, rascunhos preservados e nenhuma ativação ou publicação incidental |
| 1. Auditoria e confiabilidade | Reproduzir toggle, inspecionar eventos reais, corrigir agendamento, janela, logs e duplicidade | Toda tentativa tem estado e motivo; pagamento/resposta/pausa impedem abordagem indevida |
| 2. Recuperação funcional | Políticas independentes, consulta de cobrança, reenvio seguro e retomada pelo agente | Pix e cartão recuperados sem duplicar pedido, sem loop e sem cobrança após pagamento conhecido |
| 3. Perfil e simulação | Evidências, afinidades e janelas individuais no arquivo do lead | Decisões explicáveis com amostra/confiança, isolamento e consentimento verificados |
| 4. Retornos e recomendações piloto | Registro simples de visita/compra, retorno previsto, novidade e recompra | Um botão na ativação; retorno sem duplicidade; oferta correta e tom do agente preservado |
| 5. Aprendizado e expansão | Avaliação incremental, ranking e experimentação limitada | Ganho de conversão/margem sem piora relevante de rejeição e reclamações |

Trilha opcional de agenda: aproveitar a base de eventos, identidade e notificações das primeiras etapas para entregar disponibilidade e reservas transacionais, depois lembretes e confirmação de realização. Conectar à etapa de retornos. A entrega de recuperação de carrinho para lojas virtuais não depende da agenda, e a agenda não depende de um modelo avançado de recomendação.

Piloto em poucas empresas que ativarem a função, depois expansão gradual do mesmo código. Começar internamente em simulação para validar horários, conteúdo e custos; habilitar envios reais dentro das políticas do produto e das permissões de contato. O cliente final não precisa configurar o piloto. Controle global de pausa e rollback interno por jornada preservam atendimento e pagamentos.

## 11. Como demonstrar que funciona

- Testes de fluxo com relógio controlado: fuso, meia-noite, minutos, mudança de horário, lead novo e histórico antigo.
- Corridas: pagamento enquanto a tarefa acorda, resposta durante geração, dois agentes concorrentes, retries, restart depois de envio e resposta ambígua do provedor.
- Identidade: navegador compartilhado, link encaminhado, eventos repetidos, rastreador automático de preview e tentativa de cruzar organizações.
- Catálogo: indisponibilidade, preço alterado, oferta vencida, endereço não confirmado e categoria incompatível com o canal.
- Conversa: personalidade preservada, sem inventar clima, estoque, desconto ou Pix; recusa e pausa respeitadas.
- Retorno: evento offline com data passada, remarcação, atendimento antecipado, agendamento futuro ainda não realizado, supressão por agendamento confirmado, desligamento/reativação do botão e silêncio sem repetição infinita.
- Métricas distintas por jornada: pagamento recuperado, resposta útil, conversão incremental, margem após custos, descadastro, reclamação, fadiga e duplicidade.
- Manter um grupo elegível sem a abordagem para medir ganho incremental. Comparar somente “comprou depois do envio” superestima resultado porque parte dos leads compraria sozinha. Fazer divisão por lead/empresa e controlar sobreposição entre jornadas.
- Definir limites de custo, qualidade e volume antes de cada piloto. Começar sem metas artificiais de conversão: estabelecer a linha de base e medir a melhoria.

## Decisão recomendada

Construir a recuperação confiável primeiro, já sobre uma base compartilhada de decisão, fila e auditoria. Em seguida acrescentar o perfil e as recomendações em simulação. A inteligência evolui com evidências; a confiabilidade do pagamento e a humanidade dos agentes são requisitos desde a primeira entrega.
