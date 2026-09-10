# Automações inteligentes — implantação de 09/09/2026

## Implementado

- Controle central de follow-up por empresa, com compatibilidade temporária com a configuração anterior por agente. Desligar o controle central interrompe suas quatro jornadas.
- Continuidade obrigatória do remetente: follow-ups, notificações de pagamento e avisos de agenda preservam agente e conexão do atendimento. Pedidos e reservas mantêm sua conversa de origem; indisponibilidade ou reassociação da conexão não autoriza substituição. O agente padrão atende apenas contatos sem histórico e campanhas. A antiga opção de desligar a prioridade da conversa é ignorada no servidor e foi removida da interface; não exige migration adicional.
- Janela de contato e fuso editáveis em uma opção recolhida do controle central, para acomodar empresas com atendimento noturno sem exigir uma esteira manual.
- Retomada de conversas, recuperação após envio confirmado do pagamento, convites de retorno e recomendações/recompra. A recuperação usa 15 minutos quando o controle central foi ativado e não existe prazo anterior.
- Fila persistente com exclusão mútua por empresa/lead, identificação de tentativas, recuperação de execução interrompida e bloqueio de reenvio diante de entrega incerta.
- Revalidação de conversa, pagamento, conexão, agente, intervenção humana e preferências antes do envio. Credenciais da IA carregadas pelo mesmo módulo usado no atendimento.
- Perfil com dias distintos de interação, faixa horária e dia da semana quando recorrente; afinidade por compras confirmadas; cadência de recompra após pelo menos três datas consistentes. Navegação só contribui quando consentida e vinculada à identidade observada do lead.
- Preferências de pausa e horário na ficha do lead. Registro manual de visita/compra, atalhos de 7/15/30 dias e cancelamento do convite. Comparecimento registrado na agenda gera visita e retorno quando o serviço tem intervalo configurado.
- Agenda opcional: profissionais/recursos, mesas exclusivas, capacidade, duração, horários, intervalos, datas bloqueadas e fuso. Reservas e remarcações transacionais, confirmação, cancelamento e comparecimento com controle de versão.
- O agente consulta horários e oferece opções reais antes de reservar. Avisos aos responsáveis cadastrados, lembrete ao cliente antes do compromisso e botões para confirmação, remarcação e resultado do atendimento.
- Tela de Automação com seções recolhidas, campanhas sob demanda, prévia opcional e histórico limitado inicialmente. Busca automática de grupos/canais com intervalo de 30 minutos; pausas anteriores preservadas.
- Recursos de campanha e interações disponíveis por padrão em novos agentes. Atendimento em grupos depende da escolha do destino e da permissão correspondente.

## Banco e operação

As migrations 0114 a 0118 foram aplicadas em uma transação no projeto Supabase `nkcnaizbsetmtcrocaon`, e registradas em `supabase_migrations.schema_migrations`. Nenhuma conversa ou cobrança foi apagada. As tabelas novas têm RLS e acesso de servidor; os endpoints do painel verificam empresa e papel do usuário.

Rotinas Inngest: varredura de follow-up e avisos a cada dois minutos; atualização de perfis/oportunidades a cada dez minutos. A entrega de avisos usa eventos independentes, com controle por empresa. A ativação de follow-up e agenda é feita pelo usuário da empresa; esta implantação não liga campanhas para toda a base.

## Limites desta versão

- O ranking inicial usa regras explicáveis; não é um modelo de probabilidade de compra treinado. Evidências consideradas: até 90 dias, 250 mensagens, 50 compras e 150 eventos de navegação por projeção.
- Recomendações exigem um horário com evidência suficiente e usam o catálogo atual. Não incluem clima/notícias não verificados e não inferem preferências políticas. Não selecionam o aparelho físico do destinatário.
- O link de recomendação abre o produto. A criação de uma nova cobrança continua dependendo da confirmação comercial pelo fluxo existente de Pix/cartão.
- Os convites reutilizam a conversa WhatsApp do lead. Para visitas offline sem conversa anterior, usam o WhatsApp padrão escolhido pela empresa e iniciam uma conversa sem inventar histórico. Sem telefone ou agente configurado, aguardam essa configuração.
- A agenda nativa não sincroniza calendários externos. Cada recurso tem seu próprio conjunto de vagas; um profissional que oferece serviços diferentes deve ser modelado sem duplicar sua capacidade.
- Entregas incertas exigem conferência na conversa. A atividade permite encerrar a verificação de follow-up sem repetir o envio.
- Métricas desta versão são operacionais. Atribuição incremental de receita, experiências controladas e calibração estatística do ranking são evoluções posteriores.

## Validação

Testes de banco cobrem concorrência de vagas, mesas, remarcação, isolamento por empresa, idempotência, botões antigos/duplicados, retornos após comparecimento e descoberta de destinos. Testes do executor verificam resposta recebida durante geração, pagamento confirmado, pausa da empresa e entrega incerta. Foram executados também a suíte de regressão, TypeScript, ESLint e build de produção.

A suíte final executou 867 testes em 104 arquivos: 866 passaram na execução conjunta; o teste de carteira que excedeu seu limite padrão de cinco segundos passou na execução isolada com limite de 15 segundos. Os cenários de retorno sem conversa anterior também passaram. Não houve envio de mensagens reais nem cobrança real durante os testes automatizados.
