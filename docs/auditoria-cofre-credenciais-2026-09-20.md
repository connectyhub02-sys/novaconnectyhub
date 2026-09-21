# Cofre administrativo: troca de credenciais — 20/09/2026

## Causa e correção

A migration 0087 aplicou `operational_contract_required` a todas as tabelas
operacionais com `organization_id`, inclusive `integration_credentials`.
`can_operate_organization(NULL)` retorna falso: a credencial global não pertence
a uma organização nem a um contrato. A política restritiva anulava a permissão
administrativa existente para leitura, inserção, atualização e exclusão.

A migration 0159 altera **somente essa política nessa tabela**. Uma credencial
`platform`, com organização nula, exige `is_platform_admin()`. Credenciais de
organização continuam exigindo associação, contrato válido e a política
preexistente de administrador da organização. Nenhuma regra global de contrato
foi removida, e nenhuma rota passou a usar uma chave de serviço para contornar RLS.

O endpoint `/api/admin/credentials` exige sessão e perfil de administrador,
reconhece campos do catálogo e aliases, criptografa o valor e atualiza o registro
existente por escopo/integração/nome. A interface envia somente campos editados.
Salvar dispara o teste da integração; o botão de teste isolado exige que o
rascunho tenha sido salvo. A falha reportada ocorria no salvamento, antes do teste
do fornecedor. Não prova que a nova chave seja inválida.

## Inventário e capacidade de edição

Consulta de metadados na VPS confirmou **66 credenciais globais cadastradas**,
todas reconhecidas pelo catálogo, e quatro credenciais de organizações, fora
do escopo desta alteração. O catálogo possui **97 campos em 16 integrações**.

| Integração | Campos no catálogo | Cadastrados globais | Efeito da troca no cofre |
|---|---:|---:|---|
| Infraestrutura | 2 | 2 | Ambiente explícito prevalece; cofre é fallback. |
| UAZAPI | 2 | 2 | Carregador global prioriza o cofre. Tokens de instâncias são separados. |
| Gemini | 3 | 2 | Chave principal salva prevalece sobre o ambiente; nova leitura a cada carregamento. |
| ElevenLabs | 1 | 1 | Chave salva prevalece sobre o ambiente; nova leitura a cada carregamento. |
| Meta | 16 | 8 | OAuth lê o cofre; app secret/verify token de webhook priorizam ambiente quando configurado. |
| Google/OAuth e Ads | 16 | 0 | OAuth lê o cofre; tokens das conexões dos clientes são separados. |
| Google Maps | 3 | 2 | Carregador lê cofre e usa ambiente como fallback. |
| Supabase | 3 | 3 | A conexão real depende das variáveis da aplicação; salvar no cofre não migra banco/Auth. |
| R2 | 7 | 7 | Transporte S3 lê o cofre. Token administrativo Cloudflare não é usado por esse transporte. |
| Inngest | 2 | 2 | Cliente de eventos/assinatura usa variáveis de ambiente. |
| Push/VAPID | 3 | 3 | Ambiente prevalece sobre o cofre. |
| Asaas | 9 | 7 | Carregador prioriza cofre quando recebe cliente Supabase; chamadas sem cliente e alguns ajustes usam ambiente. |
| PagBank OAuth | 8 | 8 | Carregador mantém ambiente como prioridade. |
| Mercado Pago OAuth | 5 | 5 | Carregador mantém ambiente como prioridade. |
| PagBank Billing | 9 | 6 | Carregador mantém ambiente como prioridade. |
| Mercado Pago Billing | 8 | 8 | Carregador mantém ambiente como prioridade; renovação OAuth também atualiza o cofre. |

A correção de permissão cobre todos os campos. **Editar o cofre e ativar uma
credencial no processo são operações distintas nos casos com prioridade do
ambiente.** Esta rodada não muda essa prioridade: fazê-lo poderia ativar valores
antigos já guardados, especialmente de banco, assinatura e pagamentos. A troca
desses serviços deve atualizar também o ambiente vigente e publicar/reiniciar
o componente correspondente. Não há promessa de troca universal instantânea.

Metadados de revisão, IDs de conta e URLs informativas não substituem aprovação
ou configuração no fornecedor. Alterar uma chave de conta não transfere vozes,
arquivos, instâncias, assinaturas ou vínculos OAuth para a conta nova.

## Verificação

- Teste PostgreSQL/PGlite reproduz a recusa original e aplica a migration real.
  Exercita CRUD de todos os 97 campos com administrador sem organização/contrato;
  bloqueia usuário comum, anônimo, organização alheia e contrato expirado.
  Escopo global malformado e conversão para organização também são recusados.
- Regressões de contrato permanecem aprovadas. Testes dos carregadores Gemini e
  ElevenLabs comprovam a leitura de duas chaves sintéticas sucessivas, sem cache
  da antiga e com prioridade sobre o ambiente. Não chamam fornecedores.
- Ensaio transacional na VPS: administrador autenticado leu e executou atualização
  sem mudança de valor nas 66 credenciais reais; inserção e exclusão sintéticas
  passaram, usuário comum foi bloqueado. **ROLLBACK integral**, inclusive datas
  de atualização. Nenhum segredo foi exibido ou exportado por essa conferência.
- Backup de schema anterior, sem dados, na VPS:
  `/opt/connectyhub/maintenance/credential-guard-20260920/integration-credentials-before.sql`.

## Aplicação confirmada na VPS

Migration **0159** aplicada em transação e registrada em
`supabase_migrations.schema_migrations`. Uma comparação interna da totalidade
das linhas, antes/depois, confirmou preservação dos 70 registros, incluindo
valores e datas. Consulta posterior com papel `authenticated` e identidade de
administrador confirmou 66 globais visíveis (duas Gemini e uma ElevenLabs);
usuário não administrador continuou vendo zero globais. A política restritiva
publicada foi relida e conferida. A alteração entra em vigor no banco sem novo
deploy da aplicação.

**53 testes em quatro arquivos**, ESLint dos testes novos e build completo
Next.js/webpack com TypeScript e 109 páginas passaram. As rotas públicas de
listagem/salvamento e testes Gemini/ElevenLabs responderam 401 sem sessão.
Não houve teste de navegador autenticado nem chamada de geração aos provedores.

As novas chaves pessoais do titular não foram recebidas nem substituídas nesta
rodada. Atualizar o painel, inserir a nova chave e salvar deve agora ultrapassar
o bloqueio de RLS. A validade/permissões/quota da nova conta só ficam comprovadas
após o teste correspondente com a chave nova.

## Complemento: Supabase e Inngest conferidos e cofre alinhado

Em seguida, o titular pediu a conferência com a VPS e autorizou a correção do
Supabase no painel. Os três valores antigos do cofre foram substituídos pelos
valores atuais da VPS da ConnectyHub após validação da URL e autenticação real
da chave pública e da chave de serviço. A escrita foi transacional, com controle
de concorrência pelos hashes anteriores, auditoria sem segredos e confirmação
dos três valores criptografados após a gravação.

As duas chaves de Inngest já correspondem às do container em execução na VPS
(a assinatura tem prefixo de ambiente do SDK no cofre; normalizado, o conteúdo
é igual). Não foram alteradas. Nenhuma configuração de ambiente, banco de destino
ou serviço foi migrado nesta etapa; somente a cópia do Supabase no cofre mudou.
Não houve geração, cobrança nem evento de teste Inngest. Sem necessidade de
deploy ou código novo. Anotação mantida local para o próximo pacote.
