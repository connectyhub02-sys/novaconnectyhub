# Configuração dos agentes WhatsApp internos — 20/10/2026

Pedido: comparar WhatsApp → Agentes internos com o painel dos clientes e corrigir
as diferenças. Prompt, personalidade, memória, qualificação, voz, horários e
comportamento já compartilham `WhatsAppConsole`; o desvio estava no formulário
de cadastro/edição e no caminho de persistência do perfil interno.

## Correções

- Cadastro interno oferece a atividade com os mesmos perfis dos clientes,
  mantendo a opção de atendimento interno existente como padrão. A atividade
  escolhida inicializa prompt, personalidade, qualificação e comportamento.
- Cadastro e edição usam o editor compartilhado de responsáveis humanos.
  Os destinatários são gravados no agente e na conexão. A lista explicitamente
  salva prevalece sobre números antigos de rascunhos/instâncias. Pausar avisos
  continua possível; agentes legados sem lista preservam a configuração anterior.
- O seletor de canais aparece na edição, com a restrição real de Meta:
  Direct/Messenger/comentários exigem agente de empresa. Não se liberou o
  dispatcher de clientes para agentes sem organização.
- Nome interno e persona são carregados separadamente, evitando trocar o nome
  interno pela persona ao abrir/salvar. Automações internas e prompts existentes
  são preservados ao editar o cadastro.
- Erro na atualização da conexão informa gravação parcial e necessidade de
  salvar novamente, em vez de confirmar sincronização inexistente.

## Evidência e limites

Testes locais de agentes existentes (232) e regressões novas (9) aprovados;
TypeScript e ESLint aprovados. Regressões executam o escritor real de perfil
com persistência simulada: escopo platform/organization null, gravação nos dois
registros, dados legados, contatos inválidos, preservação de preferências e
restrição Meta. Cadastro verifica o perfil de atividade persistido.

Sem migration, alteração em massa de agentes existentes, envio de WhatsApp,
geração de voz ou consumo de IA de teste. Verificação visual/publicação ainda
em andamento no momento deste registro; completar após evidência real.
