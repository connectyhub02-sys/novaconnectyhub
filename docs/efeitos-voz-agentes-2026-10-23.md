# Efeitos e ambientação automática dos agentes — 23/10/2026

## Escopo e compatibilidade

Extensão dos controles expressivos publicados em `469f91cb`. Cliente e administração
compartilham a seção Voz do agente. Efeitos são opcionais, desligados por padrão e
só passam ao atendimento após salvar o comportamento. Não há migration nem atualização
em massa de agentes. A configuração antiga sem `effects` mantém o mesmo caminho e
fingerprint; desligar preserva o rascunho dos efeitos.

Filtros, ambiente acústico, fundo, distância, reverberação e pan usam o catálogo e
o transporte HTTP do Estúdio. Não há síntese separada de ruídos. O catálogo real foi
consultado em leitura: HTTP 200, seis filtros, sete ambientes e quatro fundos
(central de atendimento, café, cidade e teclado). Etiquetas são compartilhadas.

Fonte do contrato: [TTS — efeitos](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
e [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
consultados em 23/10/2026. O fornecedor documenta fundo em loop e ausência de adicional
por efeitos. Geração dos agentes continua em MP3. Estéreo pode ser reduzido na
conversão do WhatsApp; não há slider fictício de volume independente do fundo.

## Seleção automática

Ambiente e fundo têm modos desligado, fixo e automático independentes. Cliente
marca o conjunto permitido; não se amplia silenciosamente o conjunto quando
opções somem. Filtro permanece manual. Frequência: por conversa (padrão), por
períodos locais de seis horas, ou por resposta em áudio. Fuso é exibido/editável;
padrão America/Sao_Paulo. Seleção determinística usa organização, agente e escopo;
não chama LLM nem afirma localização física do agente. Escolhas podem se repetir.

Partes da resposta usam o mesmo run; período usa a data persistida do run para
evitar troca ao cruzar o horário. Sem conversa, usa lead ou solicitação como escopo.
Campanha mantém o áudio único por item. IDs são validados no catálogo antes do
claim e os efeitos resolvidos ficam no snapshot privado `quote.audioEffects`.
Reenvio/recuperação reutilizam áudio e consumo. Falha incerta não causa fallback
para voz seca nem segunda síntese. Limites do recibo/reserva da primeira etapa
continuam descritos em `voz-expressiva-agentes-2026-10-23.md`.

Prévia recebe apenas configurações/voz/frase/amostra, sob as mesmas verificações
de empresa ou setor. Servidor define organização e classificação de consumo.
Sortear amostra não gera áudio; a combinação é exibida antes de Ouvir teste.
Contagem efetiva, mínimo, arredondamento e snapshot de tarifa são os do Estúdio;
nenhuma tarifa é alterada.

## Verificação

Testes de defaults, salvamento/pausa, seleção permitida, tempo/fuso, isolamento,
chunks, snapshot antes do provedor, recuperação do consumo, ausência de retry,
transporte de todos os efeitos e paridade de preço. Suíte de voz e regressões:
141 testes em 25 arquivos passaram. TypeScript e ESLint aprovados.

UI real em fixture local, APIs simuladas: 1366/390 px, seleção manual/automática,
período/fuso, sorteio sem geração, prévia, desativação preservando escolhas,
ausência de overflow e erros JavaScript. Não equivale a entrega real pelo WhatsApp.

Amostras reais com o código candidato empacotado em script isolado no container,
organização interna da plataforma, voz pública padrão e todos os efeitos: v2
58 caracteres/13,92 créditos equivalentes/74.439 bytes; v3 dramático 69 caracteres/
16,56 créditos equivalentes/76.947 bytes. Ambas `internal_shadow`, sem débito de
carteira de cliente, com mídia e uso persistidos. Repetição de cada chave retornou
exatamente o mesmo áudio e evento; duas gerações, sem regeneração no replay.
Nenhum agente/configuração foi atualizado e nenhuma mensagem foi enviada.

## Publicação e limites

Publicado às 16h50 BRT: `094d167d8e45c7a37842753dc273dca22ee96bfd`,
slot b/3131. Anterior `469f91cb` permanece saudável em a/3130 para rollback.
Build Linux: webpack, TypeScript e 120 páginas aprovados. Candidata e HTTPS
público: saúde/SHA, 19 assets, bundle dos controles completos, GET/POST protegidos
(inclusive catálogo de efeitos), rota de fixture ausente e Inngest assinado com
58 funções. Builder parado ao concluir. Sem migration ou alteração de tarifas.

Auditoria SQL dos testes: dois recibos completed, dois eventos internal_shadow
completed (30,48 créditos equivalentes), zero lançamentos de carteira vinculados.
FFprobe: ambas MP3 44,1 kHz estéreo, durações 4,57 s e 4,75 s; decodificação e
conversão local para Opus mono sem erros. São testes reais de síntese, armazenamento,
consumo e replay. Não houve envio para lead/WhatsApp; avaliação auditiva do fundo
após a conversão do transportador e homologação de voz clonada específica continuam
pendentes de teste escolhido pelo cliente. Catálogo indisponível/ID removido bloqueia
a geração configurada, sem sorteio de sons não autorizados.

Disco da VPS: cerca de 6,1 GiB livres, 98% ocupado ao concluir. Continua pendência
operacional separada; não houve limpeza manual de imagens, dados ou filas.
