# Meta — primeira etapa de conexão, 11/10/2026

## Estado externo observado e alterado

App ConnectyHub Connect `1002348522666389`, portfólio ConnectyHub
`293619797157346`. Trabalho autorizado pelo titular no chat; operação pelo
navegador autenticado, sem registrar tokens ou segredos neste relatório.

- Access Verification enviada como SaaS, site `https://www.connectyhub.com.br`,
  informando que a plataforma ainda vai iniciar a gestão de clientes e hoje
  usa o próprio portfólio. Informação confirmada pelo titular. Resultado:
  **Submitted / In review**. A tela indica contato em até cinco dias se forem
  necessárias informações; não é promessa de aprovação nesse prazo.
- Adicionados e confirmados oito casos de uso: métricas de anúncios, Lead Ads,
  Instagram, Messenger, Pages, WhatsApp, catálogos e Ads MCP. Marketing Ads já
  existia. Casos cadastrados não equivalem a acesso avançado aprovado.
- Aceite dos Tech Provider Terms como **Independent Tech Provider** executado
  após confirmação específica do titular. Resultado: onboarding iniciado,
  **1 of 2 steps complete**, Business Verification **Approved**.
- A tela seguinte exige vídeos distintos de envio/recepção de mensagem
  (`whatsapp_business_messaging`) e criação de template
  (`whatsapp_business_management`). O resumo de onboarding exibe **In review**,
  mas o detalhe de App Review confirma **Not submitted** para os novos pedidos:
  `whatsapp_business_messaging`, `whatsapp_business_management`,
  `pages_manage_metadata`, `pages_messaging`, `leads_retrieval`,
  `instagram_basic` e `ads_mcp_management`. Nenhuma demonstração foi enviada.
  A verificação de acesso do provedor está em análise; a revisão dessas novas
  permissões ainda está em rascunho, sem aprovação.
- Identificada opção **Meta-hosted embedded signup / Generate link**. O modal
  sugere o callback genérico existente. Não criada nova configuração: primeiro
  implementar retorno específico que registre WABA e número, depois configurar
  o link. Não há número de cliente integrado nem homologação de Embedded Signup.

O controle do navegador foi reiniciado durante o trabalho e alterou os IDs
dos perfis. Houve uma consulta ao perfil secundário que mostrava Testador;
a sessão administradora correta foi localizada no perfil Connecty. Não há
pendência para o titular conceder um novo papel de administrador.

## Condição comercial registrada

Os [termos](https://www.facebook.com/legal/BM-tech-provider-terms), atualizados
em 31/07/2026 e lidos autenticado, seção 5, restringem revenda e cobrança pelo
uso da plataforma WhatsApp no enquadramento padrão. A seção 9 prevê direitos
diferentes por acordo aplicável. O titular autorizou o cadastro independente,
mantendo a margem por mensagem pendente de acordo compatível. Não habilitada
cobrança 2×. Não contratado Solution Partner, não conectado cartão, não comprado
crédito e não iniciado gasto em anúncios.

## Código da primeira entrega

Endurecimento das rotas de OAuth existentes, sem ativar a expansão comercial:

- Nonce aleatório de 256 bits, hash SHA-256 persistido, cookie host-only,
  HttpOnly, Secure em HTTPS e SameSite=Lax, com duração de dez minutos.
- Callback exige o mesmo usuário e navegador, ainda verifica papel e empresa,
  recusa estado vencido/futuro e consome o hash por atualização condicional
  antes de trocar o código. Callback concorrente/repetido não troca novamente.
- Permissões efetivamente concedidas são consultadas em `/me/permissions`,
  paginadas no endpoint confiável, ignorando recusadas/expiradas. Falha nessa
  leitura impede persistir a nova credencial. Scopes solicitados ficam apenas
  como metadados da solicitação; grants reais alimentam conexão e growth.
- Sem migration. OAuth iniciado antes da mudança precisa ser reiniciado;
  conexões já concluídas não são migradas nem têm tokens revogados.

Validação local: 68 testes Meta em 13 arquivos aprovados, incluindo 14 novos
testes de OAuth, TypeScript e ESLint aprovados. Dependências externas e banco
foram simulados nos testes de rota; isso não demonstra envio real, aprovação
de escopos ou autorização de clientes externos.

Formato de retorno, paginação e estados das permissões conferidos na
[referência oficial](https://developers.facebook.com/docs/graph-api/reference/user/permissions/)
via navegador autenticado. A ferramenta de busca recebeu 429 nessa referência.

## Publicação da primeira entrega

Commit `ca2849e74e1accb9caa46bf3bb3f3573141654b9`, enviado ao GitHub e
publicado às 03h18 BRT, slot a/3130. Build Docker aprovado. Candidata e
domínio público conferidos com SHA correto: home/login/assets 200, logout
303 para `/`, cookie assistido expirado, painéis/API protegidos, Inngest GET
assinado 200 autenticado e rotas OAuth Meta sem sessão recusadas com 401.
Slot b com `55f2e6e0` preservado para retorno; builder parado após publicação.
Sem migration nem alteração das credenciais/configuração de produção.
Não foi exercitado OAuth autenticado real ou envio de mensagem por essa versão.

## Próxima entrega e limites

Implementar seleção explícita e paginação de ativos, permissões progressivas,
configuração/callback exclusivo de Embedded Signup, persistência isolada de
WABA/phone_number_id, webhook assinado, adaptador Cloud API e chat oficial.
Preparar número piloto, template, vídeos e teste consentido de ponta a ponta.
O bloqueio global de lançamento Meta permanece até homologação por capacidade.
Calendário expandido, campanhas oficiais, cobrança e execução de Ads/MCP ainda
não foram entregues. Não apresentar esta primeira etapa como integração Meta
completa nem como WhatsApp oficial operacional.
