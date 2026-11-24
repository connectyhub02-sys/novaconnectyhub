# Cadastro PF/PJ e primeira empresa — 23/11/2026

Implementação autorizada pelo titular após a revisão da regra de cadastro.

## Regra

- Pessoa física: completar a conta não cria uma empresa com o nome pessoal. Em Empresa, o titular escolhe o nome e confirma a criação da primeira empresa.
- Pessoa jurídica: após o cadastro completo, o fluxo normal provisiona a primeira empresa com o nome empresarial informado. Acesso assistido sem empresa continua sem provisionamento automático.
- O nome pode ser editado pelo proprietário no painel, respeitando o acesso contratual existente. Empresas já existentes não são renomeadas pelo login.
- Cadastro incompleto mantém a conclusão obrigatória. Conta sem empresa recebe navegação de conta e criação da primeira empresa; contrato vencido mantém a navegação restrita existente.

## Integridade

A migration 0227 adiciona uma função disponível somente ao serviço. Criação da primeira empresa, vínculo do proprietário e provisionamento inicial são atômicos e serializados por usuário. O prazo inicial permanece ancorado em signup_completed_at: criar a empresa depois não reinicia sete dias nem concede bônus vencido. Quando já expirado, um ciclo fechado registra o vencimento para o resolvedor contratual. Não há backfill ou alteração de dados de clientes durante a migration.

Criação de empresas adicionais mantém o contrato e a carteira responsáveis existentes. Nenhum plano, cobrança, campanha, integração ou mensagem é ativado por esta implantação. Notificações normais de onboarding continuam respeitando os opt-ins existentes no fluxo normal do titular.

## Validação local

96 testes passaram em 13 arquivos: PF/PJ, escolha explícita do nome, preservação de nome editado, idempotência, rollback transacional, prazo vencido pelo resolvedor SQL real, permissões do RPC, isolamento e acesso assistido, cadastro incompleto e navegação restrita. ESLint dos arquivos alterados e git diff --check passaram.

## Publicação e observação

Release `dab097d11ed6d7843bfe75a6d6ad33374c4fc5b9` ativada no slot a em 23/11/2026, 22h34 BRT. Base `f07f299ef273869c418190b9915c0e9633afc5cf` preservada no slot b para rollback. Preparação intermediária `89da40e2` foi cancelada para incluir a proteção de revalidação do telefone e nunca ativada.

Migration 0227 aplicada em transação, com timeout de locks e permissões conferidas: anon/authenticated sem EXECUTE, service_role permitido. Compilação, TypeScript de produção e geração de 126 páginas concluídos. Smoke candidato e público confirmaram SHA, health/login, 25 assets, proteções de rotas, redirecionamento do link de login e leitura autenticada Inngest com 61 funções; nenhum job disparado.

Chrome Connecty: acesso assistido ao Ivan abriu Empresa, com menus de conta e formulário vazio para escolher o nome. Dados e cobrança carregou Cadastro completo, dados pessoais, primeira empresa e segurança. Nenhum formulário foi salvo. Consulta posterior confirmou zero empresas próprias e zero vínculos para Ivan. Connectyhub16 manteve quatro menus restritos e a tela de planos. Retorno ao Admin OS confirmado, sem sessão assistida restante.

A criação PF/PJ, concessão inicial, renomeação preservada e rollback foram validados nos testes locais; não foi feito novo cadastro real PF/PJ nem criada empresa real em produção nesta rodada. O nome de empresas existentes, planos, créditos e datas de clientes foram preservados. Nenhuma mensagem, redefinição, campanha ou cobrança enviada/ativada.

Evidências: `output/cadastro-pf-pj-20261123/`: `validacao-local.txt`, `migration-result.txt`, `smoke-candidate.json`, `smoke-public.json`, `ivan-preservado.txt`, `ivan-primeira-empresa.jpg` e `conta-vencida-menus.jpg`.
