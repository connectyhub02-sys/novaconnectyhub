# Perfis de atendimento por atividade — implementação

Data: 10/09/2026. Implementado e preparado para envio à branch `master` a pedido do usuário. Sem alteração de dados reais ou migration SQL nesta entrega. O envio ao GitHub não comprova, por si só, um deploy em produção.

## Resultado

O catálogo passou de 12 para 32 atividades: 12 profissionais, 19 empresas e uma opção de atendimento geral. Escolher uma atividade prepara instruções, personalidade ativa com 12 campos, assinatura vinculada ao nome do agente, qualificação e comportamento. Essa preparação não chama IA nem consome créditos de geração.

Cada atividade possui identidade, público, objetivo, vocabulário, rotina, perguntas, objeções, fechamento, condições, encaminhamento, limites e exemplo de abordagem próprios. Os perfis distinguem profissional individual de equipe; não inventam estrutura, credenciais, preços ou disponibilidade. Agenda e pagamento só são confirmados após resultado efetivo das ferramentas.

### Catálogo entregue

| Profissionais | Empresas correspondentes |
| --- | --- |
| Corretor de imóveis | Imobiliária |
| Advogado | Escritório de advocacia |
| Contador | Escritório de contabilidade |
| Dentista | Clínica odontológica |
| Esteticista | Clínica de estética |
| Personal trainer | Academia e estúdio de treino |
| Professor particular | Escola e empresa de cursos |
| Arquiteto | Escritório de arquitetura |
| Eletricista, encanador, técnico de ar-condicionado | Empresa de manutenção e instalações |
| Corretor de seguros | Corretora de seguros |

Outras empresas: pizzaria e delivery, restaurante e lanchonete, farmácia e drogaria, loja de roupas/calçados/acessórios, loja de autopeças, loja virtual, loja de suplementos, oficina mecânica e revenda de veículos. O catálogo inclui também “Outra atividade / atendimento geral”.

## Interface e execução

- Busca de atividades organizada por profissionais e empresas.
- Orientação inicial em três passos: negócio, atividade e conexão do WhatsApp. Nome e responsável reaproveitam valores disponíveis, sem retirar validações de cadastro, responsável, plano e conexão.
- Regras avançadas preenchidas; edição de texto técnico opcional. O prompt automático acompanha os dados atuais no servidor e na execução.
- DNA apresentado como “Personalidade do agente”, preenchido e ativo nos novos perfis. Campos personalizados, assinatura própria e opção de desativação são preservados ao mudar de atividade.
- Perguntas próprias de cada atividade, com dúvidas/objeções incluídas. “Obrigatória” indica exigência da resposta; não liga ou desliga a pergunta.
- Emojis no texto, reações às mensagens e figurinhas têm controles distintos. Estilo discreto, equilibrado ou descontraído orienta as reações. Áudio depende do modo escolhido e da voz disponível.
- Memória e qualidade ficam em “Evolução do agente”, com estados vazios e dados reais. Coleta de indicadores deixou de depender do modo de teste. O painel explica que a avaliação é heurística; aprendizado e atendimento continuam sujeitos ao consumo normal da plataforma.

## Compatibilidade

Os identificadores das atividades anteriores foram mantidos. Academia/suplementos e autopeças/veículos receberam alternativas específicas para os negócios antes agrupados. Agentes antigos preservam o prompt manual até aplicação explícita do perfil pelo painel; não houve atualização em massa de clientes.

As definições editoriais ficam em `src/lib/whatsapp/activity-presets.ts`; a aplicação compartilhada fica em `src/lib/whatsapp/activity-setup.ts`. A configuração usa os metadados JSON existentes do agente e da instância, com versão e origem do perfil. Não é necessário executar SQL no Supabase.

## Validação

- 171 testes direcionados passaram, em oito arquivos: catálogo completo, diferenciação dos pares, criação pelo serviço, prompt automático no runtime, preservação de texto manual, personalizações, qualificação, emojis, comércio, encaminhamento e timeouts.
- ESLint passou nos arquivos envolvidos.
- TypeScript (`tsc --noEmit --incremental false`) passou após a correção de tipagem descrita abaixo.
- Prévia local no navegador com o componente real e dados fictícios: troca de advogado para escritório, 12 campos preenchidos, edição e desativação persistidas no estado da prévia e verificação em viewport de celular. Não representa teste de persistência no Supabase de produção.
- Revalidação antes do envio à `master`: suíte geral com dois workers passou integralmente, com 1.172 testes em 143 arquivos. A divergência anterior na documentação OpenAPI foi resolvida nas alterações da API de IA já integradas ao repositório.
- Uma correção mínima de tipagem em `src/lib/ai-api/automation.ts` verifica a existência de `request_id` antes de ler o campo; preserva o fallback para `id`.

## Publicação

A entrega foi preparada sobre a `master` sincronizada com `origin/master`, incluindo as demais mudanças já integradas no repositório. A adoção de perfis por agentes já existentes ocorre pela ação explícita “Aplicar perfil da atividade”, preservando o atendimento atual até essa escolha. Não há SQL adicional para executar no Supabase.
