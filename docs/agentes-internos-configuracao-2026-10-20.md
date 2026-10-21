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
geração de voz ou consumo de IA de teste.

## Publicação e conferência final

Publicado em 20/10 às 20h55 BRT: `5a0c0c2f`, slot a/3130. Código enviado ao
GitHub `master`; anterior `1d6ffdb4` preservado no slot b para retorno. Build de
produção, TypeScript e 120 páginas aprovados. Candidata e HTTPS público:
saúde/SHA, 19 assets, bundle dos novos controles, APIs de agentes protegidas
(401 sem sessão), páginas protegidas (307), Inngest assinado com 58 funções.
Fixture de teste ausente da publicação (404). Builder parado ao concluir.

Navegador local com componentes reais e APIs simuladas validou em 1366 e 390 px:
edição/persistência do payload de responsáveis, nomes distintos, canais Meta
indisponíveis, atividade na criação e bloqueio de cadastro incompleto. Sem erros
de JavaScript ou transbordamento horizontal. Capturas em `.codex-screens/internal-*`.
O fixture usa as variáveis e atributos do tema real do painel. Servidor e fixture
locais removidos/parados após o teste. Dependências locais estavam incompletas e
foram reinstaladas pelo lockfile, sem alteração de versões ou arquivo de lock.
Rodada final: 241 testes aprovados. Não se gravaram dados de teste em produção.

A leitura agregada da produção encontrou um agente interno ativo, sem lista
explícita `responsible_humans`; seu registro foi preservado. A sessão Chrome
desconectou da ferramenta, portanto não houve confirmação visual autenticada
em produção. A interação foi comprovada no navegador local; a publicação,
proteção das rotas e funcionamento do serviço foram comprovados na VPS.
