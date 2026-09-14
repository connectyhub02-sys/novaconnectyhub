# Links WhatsApp no domínio do cliente

O servidor pode selecionar uma origem HTTPS por organização usando `WHATSAPP_TRACKING_ORIGINS_JSON`, um objeto JSON de UUID da organização para origem. A identidade vem da reserva de entrega, nunca do Host ou do payload recebido. Sem entrada para a organização, permanece a origem da ConnectyHub. Somente novos links usam a configuração; links antigos e os recibos de replay permanecem válidos.

## Adaptador do cliente

O backend `/w/[id]` do cliente consulta `/api/v1/links/{id}/resolve` da ConnectyHub com sua chave WhatsApp existente (Bearer, escopo `instances:read`). A organização é derivada da chave. Não usar chave de Voz/LLM nem encaminhar essa credencial ao navegador ou ao destino.

- GET de navegação: resposta `200 {"ok":true,"destination":"..."}`; registra abertura no mecanismo existente de rastreamento. Só então o adaptador redireciona o visitante.
- HEAD de validação/prévia: `302` com `Location`, corpo vazio e sem contagem. O fetch do backend precisa usar `redirect: "manual"`.
- Bot ou prévia: preferir HEAD; o GET também reconhece User-Agent e Purpose/Sec-Purpose. Encaminhar esses indicadores do visitante, não substituí-los pelos do servidor.
- IDs inválidos, inexistentes ou de outra organização: 404; autenticação inválida: 401/403; falha de consulta/registro: 503.
- Respostas privadas, sem cache, sem referrer e sem indexação. O destino vem exclusivamente do registro existente, preservando assinatura e parâmetros. A API não busca o destino.

Cada GET humano é uma abertura, não um visitante único. Não repetir automaticamente um GET de resultado incerto; isso pode contar novamente. O registro não é uma cobrança. Consultas HEAD não contam cliques, mas podem atualizar o último uso da chave no gateway existente.

## Ativação Betel

Origem: `https://betel-leil-es.vercel.app`. O adaptador anterior foi publicado e passou na validação conjunta de oito HEADs, sem incremento de cliques, antes da ativação do mapa na produção CH. Commit `2e0409c2`, Vercel `dpl_FMNemmo5JCcZtTXouewovymz7MBw` Ready / Production, criada em 14/09 às 17:07:55 BRT. Nenhum envio real.

Depois dessa ativação, o titular refinou o escopo: novos links/CRM da Betel serão nativos do cliente, com CH apenas transporte. [Novo contrato](betel-transporte-nativo-2026-09-14.md). Este resolvedor permanece para links históricos; a extensão de eventos CH foi cancelada.

Validação local: isolamento por organização, destino persistido, rejeição de destinos inseguros/loop, origem confiável, HEAD/prévias sem cliques, preservação do arquivo e envio idempotente. Sem envio real de WhatsApp, clique real ou mudança de tarifas. Não declarar o domínio ativo apenas pela existência do código.
