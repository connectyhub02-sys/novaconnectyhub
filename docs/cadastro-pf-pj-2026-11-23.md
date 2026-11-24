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

95 testes passaram em 12 arquivos: PF/PJ, escolha explícita do nome, preservação de nome editado, idempotência, rollback transacional, prazo vencido pelo resolvedor SQL real, permissões do RPC, isolamento e acesso assistido, cadastro incompleto e navegação restrita. ESLint dos arquivos alterados e git diff --check passaram.

Publicação e observação em produção serão registradas separadamente após a ativação. Não foram criadas contas ou empresas reais para validar os testes automatizados.
