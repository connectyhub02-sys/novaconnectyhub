# Agentes unificados e automações de comentários — 11/10/2026

## Implementação

- Removidos o menu redundante **Agentes nos canais** e a aba **Redes sociais**. A rota antiga redireciona para Agentes. Criação/edição de agente da empresa e editor principal exibem WhatsApp, Direct, Messenger e comentários. O servidor exige integração, ativo selecionado, permissões concedidas e ativação de webhook para novas seleções Meta. Desativar continua permitido após desconexão.
- Em **Automações**, após follow-up e antes de grupos/canais/status, há modelos de comentário com expressão → mensagem privada com botão HTTPS opcional, e qualquer comentário → resposta pública com IA. Configuração por agente/empresa, filtros por IDs de publicação, rascunhos, pausa, revisão opcional e simulação local sem envio/consumo.
- A mensagem privada escolhida não chama IA; continuidade usa o mesmo agente somente após mensagem do contato e conforme a opção salva. Publicação de comentário com IA usa o contexto existente do agente. Revisão apresenta o destino público/privado e o botão antes do envio.
- Follow-up social permite uma retomada por resposta privada realmente enviada, entre 15 e 1.200 minutos, dentro de 23 horas desde a entrada do contato (margem para janela padrão de 24h). Não nasce de comentário ou visita. Nova mensagem, resposta humana, pausa, opt-out, conversa encerrada ou configuração alterada cancelam a retomada.
- Fila reaproveita Inngest/sweep e agent_runs existentes, com deduplicação por comentário e follow-up. Revalida regras antes de gerar e enviar; não repete resultados incertos. Metadados ficam no agente, sem migration. Clones começam sem automações/canais Meta ativos; mudança de empresa limpa automações anteriores.

## Limites explícitos

Envio social continua dependente de permissões, contrato/plano, ativo, credenciais, ativação por canal e modo global live. Esta entrega não muda o padrão dry_run nem ativa regras de clientes. Testes simulados não homologam a entrega do botão ou resposta privada na Meta.

Agentes internos de escopo platform não são selecionados pelo dispatcher social de organizações; configurar atendimento no agente da empresa pelo painel empresarial. WhatsApp mantém o controle de atendimento em Comportamento e conexão QR já existente.

Até 20 regras por agente, 50 IDs de publicações por regra e consulta de até 200 respostas privadas recentes por sweep. Seleção visual de publicações e expansão dessa paginação ficam pendentes. Canais de transmissão do Instagram não estão habilitados nem tratados como grupos WhatsApp. Publicações/Stories continuam com os limites da entrega anterior; a existência do calendário não comprova publicação de Stories pela API.

## Permissões e demonstração

Portal ConnectyHub Connect inspecionado nesta data: pedidos WhatsApp e instagram_basic ainda **Not submitted**, não aprovados. instagram_basic mostrava zero chamadas contabilizadas. Adicionados ao rascunho instagram_manage_comments, instagram_manage_messages, pages_manage_engagement e pages_read_user_content; pages_messaging reincluído. pages_manage_metadata é necessário para eventos e está em conferência de inclusão.

O formulário exige descrição, screencast real de ponta a ponta, chamadas de teste quando indicadas e declaração de uso permitido. Submit for review estava desabilitado. Não declarar teste executado com base na simulação local. Roteiro de homologação:

1. Reconectar somente ativos próprios com os novos escopos concedidos; verificar assinatura de eventos e canal pronto.
2. Em Agentes, selecionar comentários e Direct/Messenger. Em Automações, criar regra própria de palavra-chave e outra pública, com revisão inicialmente.
3. Conta de teste autorizada comenta em publicação própria. Mostrar entrada no painel, correspondência da regra, revisão, envio privado com botão e recebimento no Instagram/Messenger.
4. Mostrar resposta do contato e continuidade pelo mesmo agente; para público, mostrar comentário e resposta efetivamente visível na publicação.
5. Demonstrar pausa e opt-out. Gravar vídeo do percurso real, disponibilizar acesso de avaliação isolado e anexar a cada permissão correspondente.
6. Confirmar testes contabilizados e requisitos concluídos no portal antes do envio final.

Referências oficiais consultadas: [coleção Instagram da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [templates](https://www.postman.com/meta/instagram/folder/rl2amj3/templates), [Send API Messenger](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api). Human Agent não foi usado para estender envio automatizado além da janela padrão.

## Validação local

253 testes em 34 arquivos Meta/multicanal/editor passaram (uma asserção de texto antiga foi atualizada para a mensagem atual do botão e reexecutada). Cobertura inclui autorização por empresa, agente estrangeiro, ativação forjada, gravação de rascunho, conflito de atualização, regra pausada/alterada, mensagem pronta sem IA, janela e cancelamento de follow-up. TypeScript e ESLint passaram. Publicação e evidência de interface serão registradas após verificação.
