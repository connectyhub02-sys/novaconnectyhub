# Agenda direta — plano e validação

Plano aprovado pelo titular em 13/09/2026. A implementação usa a base publicada `fb29bee`, preservando checkout, identificação contextual e reset integral. A migration da agenda é `0136`; `0134` e `0135` pertencem ao reset.

1. Reutilizar o calendário atual, com faixas por dia, duração, bloqueios completos e por período, compromissos manuais e fuso da empresa. Horários sugeridos são rascunho até salvar. O calendário padrão é escolhido explicitamente; vínculos específicos dos itens prevalecem.
2. Consultar a disponibilidade compartilhada entre painel, página do item e WhatsApp. Bloqueios e reservas concorrem pela mesma vaga no banco.
3. Com data/hora concretas e aceite atual do lead, reservar sem aprovação do responsável. Preservar a escolha quando falta somente o nome. Não interpretar orçamento, consulta de vagas ou aceite de fotos como compra ou reserva.
4. Confirmar somente após persistência, incluindo data, hora, local cadastrado e informação sobre mudanças. Usar o mecanismo existente de avisos ao responsável, com estados de entrega separados da reserva. Dúvidas posteriores continuam permitidas.
5. Agenda incompleta, ambiguidade e falhas recebem resposta factual. Encaminhamentos ao responsável são registros reais com vínculos explícitos; promessa textual não equivale a envio. Entrega incerta não autoriza repetição cega.
6. Validar interpretação, aceite, disponibilidade, conflitos e repetição, escopo, reset, notificações, UI e regressão de checkout. Publicar somente o conjunto validado e conferir banco e implantação ativa. O titular fará o reteste de mensagens reais.

## Integração e reversão

As guardas de `buildGeminiContents`, identificação de nome, inbound atual e proteção de recriação após reset são preservadas. Reservas, ofertas, execuções e encaminhamentos mantêm FKs com lead/conversa; o reset percorre esses descendentes. Configuração, recursos e bloqueios internos pertencem à empresa e sobrevivem ao reset de um contato. Workers devem conferir a existência dos registros e proteger a fase de envio contra reset concorrente.

Reversão da aplicação pode voltar à base anterior preservando as tabelas e reservas legítimas; não apagar reservas para reverter código. A migration é aditiva e mantém a assinatura da reserva. Antes de reverter, conferir filas em trânsito e compatibilidade da versão anterior com os novos bloqueios. Não executar rollback destrutivo sobre dados de clientes.

## Estado verificado

Suíte completa: **2.550 testes em 193 arquivos aprovados**. Após reforço da proteção de envio, **28 testes direcionados aprovados**. Build de produção (webpack), TypeScript e ESLint aprovados. A prévia local confirmou preservação de três faixas distintas, cadastro do local e bloqueio interno às 13h no fuso da empresa. Página temporária de QA removida.

Migration **0136 aplicada pelo navegador no Supabase da VPS**, com autorização explícita do titular, em 13/09/2026. Prévia confirmou 0134/0135 e ausência de 0136. A conferência transacional preservou as configurações existentes e as contagens de recursos e reservas. Após a aplicação: zero recursos, reservas, bloqueios e encaminhamentos. As três funções conferem com o arquivo local (incluindo conversão LF/CRLF da interface). Tabelas novas com RLS ativo, sem acesso anon/authenticated, e acesso service_role. Reserva com ACL explicitamente reafirmada como exclusiva do serviço interno; havia permissão excessiva no destino. Os seis vínculos FK dos encaminhamentos foram conferidos. O reset publicado não foi alterado; a compatibilidade com os novos descendentes foi validada em PostgreSQL local por PGlite.

Nenhum horário/local da empresa Renata foi inventado, nenhum dos imóveis Ipiranga foi escolhido por suposição, e nenhuma visita ou mensagem real foi criada para testar. A publicação do aplicativo está em andamento. Reteste real depende de cadastrar o atendimento, faixas, local e vínculo do item ou calendário padrão. As simulações não comprovam entrega real pelo WhatsApp.
