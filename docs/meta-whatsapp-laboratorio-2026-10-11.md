# Laboratório WhatsApp oficial — 11/10/2026

> Atualização posterior: o remetente de teste foi transferido para a empresa
> exclusiva de avaliação; o histórico antigo permanece interno. Ver
> [conta e revisão](meta-revisao-conta-dedicada-2026-10-11.md) antes de reimportar
> o piloto ou usar o painel admin para novos envios.

## Implementação

- Admin: `/admin/meta`, com número técnico interno, modelos, envio individual e histórico. A empresa interna é resolvida no servidor; o administrador não reutiliza uma empresa trial nem escolhe livremente o tenant pela URL.
- Clientes: `/dashboard/chat-meta` e cartão em integrações. Proprietário/administrador da empresa, sessão, acesso contratual e origem da requisição são validados no servidor.
- Manutenção: campos separados para configuração Embedded Signup, token técnico de teste, WABA e Phone Number ID. Tokens de clientes ficam criptografados por organização, sem retorno ao navegador.
- Facebook/Instagram: login existente reaberto e acesso próprio do administrador; `/admin/meta/publicacoes` reutiliza publicações/calendário no escopo interno. Concessões reais do OAuth continuam sendo a fonte das capacidades da conexão.
- WhatsApp: código OAuth de uso único ligado à sessão/empresa e cookie de curta duração; validação do app, permissões e propriedade do número; assinatura da WABA; modelos de texto; respostas na janela de 24 horas; consentimento para modelos; opt-out integrado ao CRM; recibos monotônicos; idempotência antes da chamada externa.
- Número oficial separado do número UAZAPI. Nenhum fallback para envio não oficial. Envio em lote, cobrança adicional e coexistência não estão habilitados nesta etapa.
- Arquivamento no lead e conversa com provider `meta_whatsapp`. Mídias recebidas aparecem identificadas, mas o download/arquivamento binário ainda não faz parte deste laboratório. Links de saída são bloqueados até a integração dos botões rastreáveis oficiais, preservando a regra central de entrega.
- Login Google também recebeu redirecionamento relativo: foi observado retorno indevido para `0.0.0.0:3000` atrás do proxy durante a validação do admin.

## Configuração externa confirmada

- App `1002348522666389`, portfólio `293619797157346`.
- Termos da Cloud API aceitos com autorização específica do titular.
- Conta de teste `1077354978498958`, Phone Number ID `1373711385827414`, número `+1 555-649-4174`.
- Token validado por `debug_token`: app correto e permissões `whatsapp_business_management`, `whatsapp_business_messaging` e `public_profile`. Renovado pela troca oficial, mantendo os mesmos escopos; expiração observada em **10/12/2026 07:15:32 UTC**. Guardado criptografado no cofre; não é uma credencial permanente.
- Consultas reais de números e modelos: HTTP 200. Cinco modelos de teste aprovados retornaram.
- Embedded Signup: configuração `1802160894354148`, nome `ConnectyHub WhatsApp oficial`, domínio canônico adicionado à lista do SDK. Cadastro de uma empresa cliente de ponta a ponta ainda precisa de teste com o titular do número.
- Assinatura do app `whatsapp_business_account`, campo `messages`, Graph v25.0, callback `https://www.connectyhub.com.br/api/webhooks/meta`: API retornou `success:true` e leitura posterior confirmou `active:true`.
- O portal declara que empresas externas dependem de App Review e Access Verification. Liberação da interface não equivale à aprovação dessas permissões.

## Banco e validação

- Aplicação `2426cede7deefd7b08df68d8d0ec1aaca2505d80` publicada no slot b/3131 às 04h20 BRT. Correção de banco `d9cf92f7` aplicada diretamente como migration; não muda o bundle. Slot a com `ca2849e7` mantido para retorno.
- Candidata e domínio público: health/SHA, home/login/assets 200; logout de cliente/admin 303 para `/`; painéis sem sessão 307 e API oficial 401; GET assinado Inngest autenticado. Builder interrompido após terminar a publicação.
- No navegador autenticado, importação do número do cofre confirmou conexão e assinatura da conta. Modelo `connectyhub_demo_oficial_20261011` criado pela UI: resposta real `PENDING` e presença na lista consultada da Meta.
- Consulta posterior confirmou **APPROVED**, ID `2861965057524081`, idioma `pt_BR`. Essa aprovação é do modelo, não das novas permissões do aplicativo.
- POST técnico vazio no webhook público: assinatura inválida 401; assinatura válida 200 com `stored:0`. Não gerou mensagem, lead ou comprovante de entrega.
- Embedded Signup abriu a janela oficial pelo SDK no domínio canônico. Fluxo cancelado sem cadastrar número adicional. A janela também apresenta termos de Marketing Messages API e Business Tools; cadastro real ainda depende do titular e dos aceites específicos que aparecerem naquele momento.
- Rascunho orgânico interno criado e arquivado pela UI do admin, sem aprovação nem publicação em rede social.
- Login social do admin chegou à seleção dos ativos próprios: Página ConnectyHub, Instagram `connectyhub.ai` (`852436201282509`) e conta de anúncios Connecty (`447324504473617`). Aceite da Política de Não Discriminação/continuação do vínculo ficou aguardando confirmação específica solicitada ao titular, conforme a política de controle do navegador. Nenhum ativo de outros portfólios foi autorizado. Será necessário reiniciar o OAuth se o state expirar antes da resposta.

- Migrations `0189` e `0190` aplicadas transacionalmente na VPS. Tabelas e RPCs exclusivas de service role; sem acesso direto de clientes a tokens/mensagens.
- `0190` adapta o arquivo ao índice real de mensagens por provider/instância/ID, inclusive instância nula. Ensaio no banco real arquivou a mesma mensagem duas vezes e produziu exatamente um registro; transação de teste revertida.
- 93 testes Meta passaram em 16 arquivos, além de TypeScript e lint dos arquivos novos. Teste de banco ajustado para representar o índice parcial real.
- Testes simulados e transacionais não comprovam entrega a um telefone. Não houve disparo para destinatários externos nesta validação.

## Roteiro das demonstrações

1. Abrir `/admin/meta` com conta administradora, importar o número técnico do cofre e mostrar a identidade da conexão.
2. Criar um modelo de texto de demonstração e mostrar seu ID/status retornado pela Meta. Gravar este fluxo separadamente para a permissão de gerenciamento.
3. Cadastrar/verificar um destinatário próprio na lista de teste da Meta. Depende do código no aparelho do titular.
4. Selecionar um modelo aprovado e compatível, registrar consentimento de teste, enviar pelo painel e mostrar o recebimento no WhatsApp do destinatário.
5. Responder pelo aparelho, conferir a entrada no Chat Meta e no arquivo do lead, responder pelo painel dentro da janela de 24 horas e conferir recibos.
6. Gravar esse fluxo real para a permissão de mensagens. Somente depois anexar os vídeos e concluir os rascunhos do App Review.

## Limites que permanecem

Não tratar como operacionais: disparos de 10 mil mensagens, faturamento/revenda por mensagem, agentes de IA no chat oficial, mídia oficial completa, coexistência UAZAPI, MCP de anúncios, novas permissões de comentários/DM/Messenger, TikTok e YouTube. O plano de expansão mantém essas entregas separadas. Os termos de Tech Provider independente continuam incompatíveis com presumir autorização comercial para margem sobre o uso do WhatsApp.

A auditoria do portal também mostrou o callback de desautorização apontando para a rota de retorno OAuth e o campo de pedido de exclusão de dados vazio. A revisão completa de desautorização/exclusão, incluindo identificação do usuário Meta, revogação e retenção adequada do histórico, permanece uma pendência técnica antes da disponibilização comercial ampla.
