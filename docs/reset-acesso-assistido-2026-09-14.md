# Reset exclusivo da operação ConnectyHub — 14/09/2026

Requisito atual do titular substitui a visibilidade geral descrita na auditoria de 13/09: somente administrador **da plataforma** pode resetar um lead quando entra no painel de uma organização cliente pelo acesso assistido administrativo. Owner/admin da organização não recebe essa autorização. Administração interna ou flag de interface isolada também não basta.

## Implementação

Base remota e implantação existentes conferidas em `4c84800`. Pacote isolado na branch `codex/reset-assistido-plataforma`, preservando a precisão decimal da API. Coordenação enviada à tarefa de Voz para reservar `0146`; suas migrations devem começar em `0147`.

O botão Acessar painel agora cria uma sessão Auth nova do cliente e um registro de `admin_assisted_sessions`, antes de trocar os cookies. Esse registro associa administrador originador, sua sessão real de `auth.sessions`, cliente, sessão real do cliente e organização primária selecionada pelo mesmo critério do workspace. O token opaco de 256 bits fica em cookie HttpOnly/Secure/SameSite Strict, com hash no banco e duração máxima de 30 minutos. Copiar link continua sendo acesso comum do cliente e não emite essa capacidade.

A UI consulta a autorização do servidor, começa sem botão e remove a capacidade na expiração, no encerramento local e em revalidações periódicas/a cada foco. O POST revalida independentemente. O banco confere as duas sessões, seus usuários, bloqueios/limites de validade, papel atual `profiles.is_platform_admin` do originador, vínculo organizacional do cliente e exclusão de organização interna. Identificadores de ator/empresa/flags enviados na requisição não concedem acesso. End/saída revogam o registro; retorno ao admin aguarda revogação. Sessão legada, sem registro verificável, não recebe a capacidade: é necessário entrar novamente pelo painel administrativo.

`reset_lead_data_assisted` revalida dentro da transação e atribui a auditoria ao administrador originador. Um lock na sessão serializa reset e revogação: uma operação já autorizada e em execução pode terminar; após revogação concluída novas operações são negadas. A função original `reset_lead_data` mantém o corpo integral, mas seu acesso direto por service_role também é revogado. A nova entrada e a conferência são exclusivas do serviço; anon/authenticated não podem chamar reset nem criar/ler/alterar os registros de acesso.

O contrato de exclusão permanece: cadastro, conversas ativas/arquivadas, memória, arquivos, carrinhos, pedidos e solicitações; confirmação explícita, auditoria mínima, locks, proteção de operações em andamento/replay e retomada dos objetos pendentes. A limpeza já autorizada de objetos pendentes continua independente da sessão assistida. Não há alteração de saldos, preços, planos, credenciais ou comportamento WhatsApp.

## Guarda de identidade administrativa

A conferência de produção encontrou UPDATE para authenticated no campo `profiles.is_platform_admin`, política de atualização do próprio perfil no código e somente o trigger `touch_profiles_updated_at` no destino. A migration adiciona um trigger que impede INSERT privilegiado ou mudança do campo pelos papéis anon/authenticated; edições comuns de perfil e atribuições pelo servidor preservadas. Nenhum perfil real foi promovido ou rebaixado como teste.

## Validação

- Suíte geral: 2.774 testes/217 arquivos aprovados. Mais três testes de visibilidade posteriores aprovados (expiração, revogação, negação do servidor e resposta atrasada após encerramento).
- Build Next.js 16.3.2 Webpack, TypeScript e lint dos arquivos alterados aprovados.
- Matriz SQL isolada com PGlite: acesso legítimo permitido; cliente owner/admin/comum, ausência/perda do papel da plataforma, sessão expirada/revogada/removida, banimento, login diferente do mesmo cliente, empresa divergente, vínculo removido e organização interna negados. RPC direta, adulteração da capacidade e autopromoção bloqueadas.
- Regressões existentes do reset integral aprovadas; novo ator auditado e confirmação conferidos. Fronteiras de Auth/banco nos testes HTTP simuladas, sem mensagens, inferência ou cobranças.
- Ensaio DDL no SQL Editor ConnectyHub VPS executado com rollback e ausência posterior da tabela/migration confirmada. MD5 do SQL LF: `d800732b2c41189035dedeb23deda45e`. Corpo do reset antes/depois: `c451b2107b57810d176abea29ee8871a`. RLS, wrapper exclusivo do serviço, entrada antiga fechada e trigger habilitado verificados no ensaio.

Migration `0146` aplicada e persistência conferida em consulta independente às 16:31:48 UTC: mesmo hash, RLS ativo, novo reset negado a anon/authenticated, entrada antiga negada a service_role e capacidade fictícia rejeitada. Nenhum registro de acesso assistido havia sido criado. Publicação do aplicativo e verificação da interface em andamento. Não houve reset real. Conferir abaixo o registro posterior à implantação antes de considerar a interface observada em produção.
