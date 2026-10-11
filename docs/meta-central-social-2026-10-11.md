# Central Meta, calendário e atendimento social

Entrega de 11/10/2026. Aplicação `d4dd37363c5457c068fbaaf6f81ce24e98ac4ce3`, incluindo o ajuste de navegação do titular, publicada às 14h09 BRT no slot a/3130. Fallback b/3131 em `9660d8994ade14e76d5db7cc3e1fa4d15865189a`. Builder parado; nenhuma migration nova.

## Objetivo e referências

O titular pediu uma seção Meta no painel do cliente, inspirada nas áreas observadas na Vision Home: anúncios, campanhas WhatsApp, chat, templates, análise orgânica, atendimento Meta e criativos. Também incluiu o escopo do Metricool: planejamento, publicações programadas, caixa de entrada, análise e relatórios. A meta de cobertura é ampla, mas não equivale a afirmar paridade nesta entrega. Permanecem as fases Meta → YouTube → TikTok do [plano de expansão](plano-expansao-social-meta-youtube-tiktok-2026-10-11.md).

Referências públicas consultadas: [planejador Metricool](https://metricool.com/planner/), [visão dos recursos](https://help.metricool.com/get-to-know-metricool-p0zdh) e [Facebook no Metricool](https://metricool.com/facebook-with-metricool/). A Vision foi inspecionada somente pela interface autenticada, sem alterar contas, anúncios ou campanhas.

## O que mudou

- Seção Meta no menu do cliente e Central Meta com conexões e permissões registradas. Abre as telas reais de Meta Ads, publicações, calendário, WhatsApp oficial (com campanhas e modelos internos), análise do Instagram, atendimento social, canais do agente e biblioteca.
- Alinhamento posterior do titular: campanhas de mensagens ficam dentro do Chat Meta oficial. Removidas as entradas separadas de campanhas e modelos; URLs antigas redirecionam para a aba correspondente do chat. Meta Ads continua separado para anúncios pagos.
- Admin mantém sua operação Meta própria, ganha acesso direto a Publicações e calendário; seu chat recebe a mesma aparência nova. O painel do cliente continua independente do admin e do laboratório de revisão.
- Calendário mensal com filtros por rede e status, seleção de dia para criar rascunho e reaproveitamento do fluxo existente de aprovação/agendamento. Mostra explicitamente as 40 publicações mais recentes; ainda não há paginação por mês. Biblioteca reaproveita até 18 mídias mais recentes da empresa.
- Chat oficial usa o mesmo papel de parede do atendimento UAZAPI, balões verdes/brancos e avatar. A foto vem somente de um vínculo contato → lead já existente no CRM da própria empresa. A Cloud API não foi tratada como fonte de foto pessoal após uma resposta. Novos eventos podem preencher o nome do perfil sem sobrescrever nomes editados pelo operador.
- Direct/Messenger/comentários: histórico por organização, seleção de conversa, revisão/edição de respostas e monitor de entrega. Até 100 conversas e as últimas 100 mensagens por conversa. A revisão existente é reutilizada; não há compositor livre nem envio de mídia social nesta nova tela.
- Fila social passa a gerar respostas com o prompt/persona/modelo do agente configurado, histórico social recente e resumo do próprio lead. Antes usava apenas frases fixas. A resposta e uso são guardados antes da contabilização idempotente por execução; falha de geração/cobrança não libera envio.
- Canais privados podem seguir a configuração explícita de resposta automática, preservando aprovação global do agente. Superfícies públicas continuam sujeitas à revisão. Pausa humana, opt-out e configuração do agente são reconsultados antes de envio autônomo; há reserva condicional de execução/envio para impedir processamento concorrente da mesma execução.
- Direct/Messenger usam a janela padrão de 24 horas, conforme a [coleção oficial Send API da Meta](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api), exigindo mensagem de entrada com data válida. Exceções e extensões de janela não são habilitadas nesta versão. Permanecem verificações de plano/contrato, credenciais da empresa, permissões e ativação live por canal.

## Estado de capacidades e limites

| Área | Disponível nesta base | Trabalho ainda necessário |
| --- | --- | --- |
| Conexões | Login oficial e seleção de ativos existentes; WhatsApp com múltiplos números | Aprovações avançadas e piloto com empresas externas |
| WhatsApp oficial | Atendimento, modelos de texto/respostas rápidas, campanhas consentidas e fila da entrega anterior | Homologar múltiplos números reais/lotes, modelos de mídia/carrossel, cobrança comercial por mensagem e coexistência |
| Conteúdo | Facebook feed/foto e imagem Instagram; rascunho, aprovação e agendamento | Reels, Stories, carrosséis, vídeo/transcodificação, recorrência e importação em lote |
| Calendário/biblioteca | Visão mensal, filtros, seleção de mídia existente | Paginação completa, fuso da organização, colaboração/versões e banco de ideias |
| Análise orgânica | Perfil e mídias reais do Instagram conectado | Insights históricos, melhor horário, concorrentes, relatórios/exportações e demais redes |
| Meta Ads | Tela e consultas de desempenho existentes | Criação/edição real de anúncios, orçamento controlado, otimização e homologação de Ads MCP; rascunho local não comprova anúncio criado |
| Atendimento social | Conversas, IA com configuração do agente, revisão, controles de envio | Homologar eventos e respostas reais, mídia/botões, compositor humano completo e encaminhamento |
| Agente nos canais | Prompt/persona/modelo, histórico social e resumo do lead | Ferramentas completas de catálogo, agenda, pedidos/pagamentos e memória do runtime WhatsApp ainda não foram transportadas; a IA é instruída a não afirmar ações executadas |
| YouTube/TikTok | Escopo registrado | Adaptadores e aplicativos próprios nas próximas fases |

`META_SOCIAL_DISPATCH_MODE` estava ausente no container b antes desta publicação; o padrão é `dry_run`. Esta entrega preserva esse bloqueio. Quando a Meta liberar os canais, é preciso validar token/ativos/webhooks, confirmar a ativação por canal, mudar o modo global de operação e realizar piloto próprio. Não basta a aprovação aparecer no portal para começar envios automaticamente.

Nenhuma nova aprovação do App Review foi conferida ou presumida nesta entrega. A conta de revisão continua com sua allowlist restrita; a nova navegação não autoriza acesso às demais telas. Nenhuma campanha, anúncio ou mensagem externa foi iniciada para validar esta alteração.

## Verificação

157 testes em 29 arquivos Meta/multicanal passaram; TypeScript completo sem emissão e ESLint dos arquivos alterados passaram. Foram cobertos sessão, isolamento do histórico, fotos do CRM, nome recebido, uso do agente, falha de cobrança, pausa/opt-out/configuração, janela de 24 horas e regressões das filas e políticas existentes. São testes locais com dados simulados; não homologam envios externos.

Execuções sociais interrompidas após a reserva não repetem automaticamente uma chamada de IA com resultado incerto. A operação deve reconciliar execução, resposta persistida e consumo antes de repetir. O envio mantém os controles existentes de monitoramento/revisão; entrega externa depende de confirmação do provedor.

## Verificação em produção

- Candidata e domínio público: health/SHA, home/login/assets, logout 303 para `/`, proteção sem sessão e GET assinado do Inngest passaram.
- Conta real de revisão: chat, consultas WhatsApp e abas por URL retornaram 200; Central Meta, API social, admin e áreas fora da allowlist continuaram 403. Arquivo temporário privado de autenticação removido do container.
- Painel de cliente por acesso assistido: Central Meta, navegação sem campanhas/modelos separados, aba Campanhas dentro do chat e estado sem número conectado conferidos. Calendário abriu o formulário com `2026-10-20T09:00`, sem salvar/publicar; atendimento social carregou lista e monitor vazios, sem erro de consulta. Canais do agente carregaram agentes existentes e configuração social pausada; nada foi ativado/salvo.
- Central Meta verificada em desktop e viewport de 390 px, sem transbordamento horizontal. Viewport restaurado e acesso assistido encerrado. Isso não substitui o teste com autenticação normal de um cliente externo; a conta de revisão tem restrição intencional.
- `META_SOCIAL_DISPATCH_MODE` continua ausente na nova aplicação: padrão `dry_run` preservado. Respostas sociais reais, publicação orgânica externa e capacidades avançadas seguem pendentes de homologação.

O Chat Meta administrativo carregou com o histórico interno preservado e sem reimportar o número de teste. No IAB, a conta de revisão mostrou mensagens de teste já existentes sobre o papel de parede compartilhado, com balões verdes/brancos. Abrir a conversa atualizou seu estado de leitura; nenhuma nova mensagem foi enviada. Capturas locais em `.codex-screens/meta-central-publicada-20261011.jpg`, `meta-campanhas-no-chat-20261011.jpg`, `meta-central-celular-20261011.jpg` e `meta-chat-papel-parede-20261011.jpg` (fora do Git).
