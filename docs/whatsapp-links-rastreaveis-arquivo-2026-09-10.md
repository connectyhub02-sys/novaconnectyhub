# WhatsApp: links rastreáveis e arquivo do lead

Data: 10/09/2026. Implementação local; migrações e publicação em produção pendentes. Nenhuma mensagem real foi enviada nesta validação.

## Regra implementada

Os envios realizados pela plataforma passam por `src/lib/whatsapp/outbound-delivery.ts`. Antes de chamar o provedor, o sistema identifica a empresa pela instância remetente e preserva o conteúdo no arquivo do destinatário. Se não conseguir registrar, não inicia o envio.

Para destinatários individuais com telefone, cria o lead quando necessário e reutiliza o existente sem alterar consentimento, atendimento humano ou agendamentos. Cada envio mantém sua identificação, origem, destinatário, conteúdo, horários e estado: preparado, em confirmação, agendado no provedor, enviado, falhou ou entrega incerta. “Enviado” significa aceito pelo provedor; não comprova leitura pela pessoa.

URLs HTTP/HTTPS visíveis no texto, legendas e ações de navegação recebem uma URL opaca `/w/<uuid>`, vinculada à mensagem e ao lead. O destino original é preservado, incluindo parâmetros de pagamento e assinaturas. Uma mesma campanha recebe links diferentes para cada destinatário. Downloads internos de mídia e ações de copiar Pix não são tratados como links de navegação.

Texto com links vira mensagem com botões. Quando o formato exige, como mídia ou menus com respostas rápidas, os botões são enviados em uma mensagem complementar. Links numerosos são divididos em grupos de até três botões. Botões de URL já existentes são reaproveitados. Falha na mensagem complementar é registrada separadamente; o transporte não repete a mensagem principal já aceita.

O arquivo do lead apresenta os estados de envio e a seção “Links enviados e cliques”, com contagem e último clique. O redirecionamento registra um evento de inteligência e não aceita trocar o destino pela query string. HEAD e prévias reconhecidas não contam como clique; a identificação de robôs é heurística, portanto a contagem não equivale a pessoas únicas.

## Caminhos integrados

- Atendimento dos agentes e respostas manuais no painel.
- Follow-up, retomadas comerciais, agenda e lembretes personalizados.
- Cobranças da plataforma, pós-pagamento e revisão de pagamentos.
- Avisos de transferência para responsáveis.
- Verificação de cadastro (o registro preparado pelo transporte protege o conteúdo do código).
- Console administrativo e operações de canais.
- API WhatsApp nativa, catálogo de operações avançadas e campanhas simples/avançadas.
- Executor interno de operações Uazapi.

O executor interno exige chave interna e `whatsappInstanceId` para envios. Carrega a credencial da instância cadastrada e rejeita uma credencial fornecida que não corresponda a ela. Consultas ao provedor continuam usando o comportamento anterior. Não há nova configuração exigida nas telas normais do cliente.

Os webhooks reconciliam os recibos de envios identificados e continuam alimentando o histórico de conversas. Arquivos binários seguem a fila de preservação de mídia já existente; o registro do envio não significa que a cópia binária já terminou.

## Sair da lista

A implementação acompanha a migração 0123 de preferências de contato. Follow-up e lembretes ao lead incluem a opção de saída; a escolha é persistida no lead e cancela as retomadas automáticas cobertas por essa implementação. Links dessa opção também passam pelo rastreamento. Abrir o link não cancela automaticamente: a página solicita confirmação, evitando cancelamentos por prévia de link.

Detalhes de escopo e auditoria: `docs/auditoria-follow-up-agenda-opt-out-2026-09-10.md`.

## Limites explícitos

- Status do WhatsApp não oferece o botão exigido. Publicação de Status com link é bloqueada com orientação para enviar por mensagem.
- Grupos, Status e identificadores sem telefone só podem ser associados a um lead se houver uma conversa já vinculada. O envio permanece registrado na empresa; não se inventa um lead para cada possível visualizador.
- Mensagens enviadas diretamente pelo celular, fora dos caminhos da plataforma, podem entrar pelo webhook, mas seus links não podem ser convertidos retroativamente.
- Os novos registros não recuperam automaticamente cliques de links antigos.
- Falhas de confirmação permanecem identificadas como pendentes/incertas. A camada de transporte não faz uma repetição automática para tentar obter um recibo.

## Publicação

1. Aplicar `supabase/migrations/0123_lead_contact_opt_out.sql`.
2. Aplicar `supabase/migrations/0124_whatsapp_outbound_tracking_archive.sql` (depende também do arquivo de jornada já criado pela 0081).
3. Publicar a aplicação com as rotas públicas `/contato/preferencias/[key]` e `/w/[key]`.
4. Conferir a URL pública configurada na aplicação; ela é usada nos links enviados.
5. Fazer uma validação autorizada em um destinatário de teste: envio com botão, clique, arquivo do lead e saída da lista.

Não publicar o código antes das migrações: a falta das tabelas impede novos envios e a consulta ampliada do arquivo do lead.

## Validação executada

- Suíte completa: 129 arquivos e 1.049 testes aprovados.
- `npm run build`: compilação de produção e TypeScript aprovados.
- SQL executado em PostgreSQL local PGlite com a migração real 0081 e a nova 0124: arquivo, isolamento por empresa, reutilização de lead, preservação de metadados, cliques e privilégios.
- Teste SQL repetido e aprovado após o ajuste para concorrência entre criação de lead no webhook e preparação de envio.
- Testes de transporte: registro antes de HTTP, bloqueio quando o arquivo falha, resultado incerto sem repetição, falha de botão complementar, campanha por destinatário, proteção do registro de código e bloqueio de Status com link.
- Testes de redirecionamento: destino exato, sem substituição pelo visitante, prévias, HEAD e indisponibilidade.
- Testes do executor interno: autenticação, instância obrigatória e correspondência entre credencial e arquivo da empresa.

Esses testes usam dados locais e HTTP simulado. A entrega e a renderização em aparelhos reais ainda precisam da validação de publicação.
