# Renovação das fotos de leads — 26/10/2026

## Causa confirmada

A foto do perfil da conta e a foto do lead usam sincronizações diferentes. O
atendimento ignorava o lead sempre que existia alguma URL salva, mesmo vencida.
Os links de Andre Sampaio e Magno Gomes datavam de 12/10 e retornavam HTTP 403.
O perfil da conta de Andre já tinha atualização em 26/10. Consulta de detalhes
na própria conexão WhatsApp forneceu imagem nova com HTTP 200. Não era ausência
de foto nem problema de permissão para ver dados de outra organização.

## Correção

O carregamento do CRM/atendimento e a entrada de mensagens renovam links do CDN
WhatsApp após 24 horas ou perto do vencimento explícito. Imagens estáticas e
uploads permanecem preservados. Consulta sem foto aguarda seis horas antes de
nova tentativa. O CRM consulta até seis leads por abertura, em paralelo, somente
por conexões ativas da organização; cada chamada externa tem limite de cinco
segundos. O polling ao vivo não repete consultas de foto.

Migration 0219 adiciona reserva exclusiva por dois minutos, intervalo de dez
minutos entre tentativas e conclusão atômica limitada a campos de foto. Não
sobrescreve nome, notas ou intervenção humana alterados durante a consulta. Uma
foto recebida por webhook depois do início da busca prevalece sobre o resultado
mais antigo. Funções exclusivas de service_role, com vínculo lead/instância na
mesma organização; anon e authenticated não podem chamá-las.

O provedor atual respondeu 405 ao antigo fallback /contact/avatar. A atualização
usa /chat/details, validado com a conexão real. Não reinicia WhatsApp nem envia
mensagem ao contato. Iniciais continuam como fallback quando não há foto disponível.

## Validação e publicação

62 testes em dez arquivos passaram: validade da URL, atualização, recuo de
consulta, reserva concorrente, isolamento de organizações, permissões SQL,
preservação de metadados e ingestão/CRM existentes. TypeScript, ESLint e diff
sem erros. Migration ensaiada com ROLLBACK e aplicada após backup privado de
schema e dos dois leads, espelhado com SHA-256 conferido.

Atualização pontual das duas fotos executada pelos novos RPCs; ambas retornaram
HTTP 200 de imagem. Comparação com backup confirmou mudança somente em URL e
datas de sincronização/tentativa. Navegador autenticado confirmou as fotos na
lista e a de Andre no cabeçalho, mantendo nomes e histórico. Nenhuma mensagem,
cobrança ou recarga foi disparada como teste.

Publicado `0c19c471` no slot b às 19h05 BRT, preservando `04314db0` no slot a.
Build de 120 páginas e smoke no candidato/HTTPS aprovados: saúde e versão,
19 assets, rotas privadas protegidas e GET assinado Inngest com 59 funções.
Nova abertura do atendimento após ativação confirmou as duas fotos na lista e
a de Magno no cabeçalho. A foto de Andre no cabeçalho já havia sido conferida
após a atualização pontual. Não foi simulado o vencimento de uma foto em produção;
essa condição foi coberta nos testes. Disponibilidade futura depende de o WhatsApp
fornecer a foto à conexão da organização. Não houve mudança em funções Inngest.
