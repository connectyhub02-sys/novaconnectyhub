# Fluxos por atividade — proposta de 24/09/2026

Objetivo do titular: ao escolher a profissão ou empresa no painel do agente, o fluxo comercial se aplica sozinho. O cliente só cadastra produtos e, quando vende com entrega, escolhe se entrega para o Brasil (frete) ou na própria região (taxa de entrega) e quais regiões. Atender, qualificar, vender e agendar 100% no WhatsApp; o cartão usa o checkout próprio.

## O que já existe (verificado no código)

| Peça | Estado |
|---|---|
| 32 atividades (`activity-presets.ts`) | Cada uma define tom, vocabulário, perguntas de qualificação, próximo passo e cuidados; aplicadas automaticamente ao escolher a atividade |
| Destino padrão por atividade (`activity-profile.ts`) | Varejo e alimentação → venda (checkout); demais → agendamento. Rótulos: "Agendar visita", "Agendar test-drive", "Agendar avaliação", "Agendar reunião" |
| Destino por produto | Venda, agendamento, site externo ou encaminhar ao responsável — escolhido em cada item |
| Entrega | Frete por estado (tabela), entrega local por zonas (CEP, raio, mapa ou bairros) com taxa, mínimo e grátis acima de X, retirada. Loja só local usa "taxa de entrega" |
| Pizzaria | Montagem por unidade: tamanhos, meio a meio (preço fixo, maior sabor ou média), bordas e adicionais; montagem marcada como somente local por padrão |
| Agenda | Calendários, horários, bloqueios, reserva atômica, avisos e lembretes; calendário único usado automaticamente |
| Aumento de carrinho | Complemento escolhido pelo sistema (outra categoria, uma vez por pedido), ligado por padrão |

## O que falta

1. **Venda + agendamento** (dentista que cobra o procedimento, esteticista com pacote, aula paga): hoje o produto pode ser marcado "precisa agendamento", mas isso é só informativo. Depois do pagamento ninguém oferece horário nem liga a reserva ao pedido.
2. **Escolha única de entrega na empresa**: hoje são chaves separadas (frete, entrega local, retirada). O cliente deveria responder uma pergunta: "Entrego para o Brasil", "Entrego na minha região" ou "Os dois", e só então ver a configuração correspondente.
3. **Configuração guiada pela atividade**: esconder o que não se aplica (corretor não vê frete; pizzaria não vê agenda, a não ser que queira).
4. **Primeira compra com ferramentas (fase 4)**: necessária para cardápios com muitos itens parecidos; sem ela, um item ambíguo pode sumir do pedido.

## Modalidades de fluxo (por produto; a atividade define o padrão)

| Modalidade | Como termina no WhatsApp | Configuração que o cliente vê |
|---|---|---|
| A. Venda com entrega | Pedido → frete ou taxa → pagamento (Pix no chat ou checkout) | Brasil / minha região / os dois; zonas; retirada |
| B. Venda sem entrega | Pedido → pagamento → acesso ou instruções (curso, serviço online) | Instruções de acesso |
| C. Agendamento | Qualifica → horários → reserva gravada → avisos | Horários da agenda |
| D. Venda + agendamento (novo) | Qualifica → pagamento → horários → reserva ligada ao pedido | Horários da agenda |
| Encaminhar / site externo | Já existentes | — |

## Padrões propostos por grupo de atividade

| Grupo | Atividades | Modalidade padrão | Alternativa permitida |
|---|---|---|---|
| Alimentação | Pizzaria, restaurante e lanchonete | A (entrega local por taxa + retirada) | — |
| Varejo | Moda, autopeças, e-commerce, suplementos, farmácia, academia (loja) | A (Brasil ou região, escolha do cliente) | B |
| Imóveis e veículos | Corretor de imóveis, imobiliária, revenda de veículos | C (visita / test-drive), nunca checkout | — |
| Consultivos | Advogado, contador, arquiteto, corretor de seguros e escritórios | C (reunião) | D (consulta paga) |
| Saúde e estética | Dentista, clínica odontológica, esteticista, estética/clínica | C (avaliação) | D (procedimento pago + agenda) |
| Serviços técnicos | Eletricista, encanador, ar-condicionado, oficina, serviços locais | C (visita técnica / orçamento) | D (serviço de preço fixo) |
| Educação e treino | Personal, professor particular, cursos | D (aula/pacote) | B (curso online), C |
| Geral | Outra atividade | A | todas |

## Configuração do cliente em três passos

1. Escolhe a atividade (já existe).
2. Cadastra os produtos: a modalidade vem preenchida pela atividade e pode ser trocada por produto.
3. Completa só o que as modalidades usadas exigem: entrega (Brasil/região e zonas) e/ou horários da agenda.

## Ordem de implementação sugerida

1. Fase 4: primeira compra com ferramentas (necessária para a pizzaria).
2. Escolha única de entrega e configuração guiada pela atividade.
3. Modalidade D (venda + agendamento).
4. Revisão do texto de cada atividade para citar a modalidade (ex.: pizzaria oferece bebida; corretor nunca fala em pedido).

## Decisões do titular (24/09/2026)

- D1 — Venda + agendamento: **paga primeiro, agenda depois**. Confirmado o pagamento, o agente oferece os horários e grava a reserva ligada ao pedido. Pedido pago sem horário disponível precisa de tratamento explícito (avisar o responsável; nunca prometer data inexistente).
- D2 — Troca de atividade com produtos cadastrados: a nova modalidade vale para **produtos novos**, com um botão para **aplicar a todos**.
