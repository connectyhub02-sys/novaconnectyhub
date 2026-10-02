# Estúdio de Voz — relatório das fases A a E — 02/10/2026

Origem: [auditoria de paridade com a ElevenLabs](auditoria-paridade-elevenlabs-estudio-2026-10-02.md).
Objetivo do titular: ser para os clientes o que a ElevenLabs é para a ConnectyHub,
cobrando pelo uso, exatamente como ela nos cobra, através do centro de custo
existente (`billing_rates` → `meterUsageEvent` → `debit_credit_wallet`). Não há
teto por cliente além do saldo; toda operação longa é orçada e reservada antes
de começar e liquidada uma única vez ao terminar.

## Publicações

| Fase | Commit | Migration | Slot |
|---|---|---|---|
| A. Textos longos (e-books) e preço por modelo | `1e886298` | 0184 | — |
| B. Compositor no estilo ElevenLabs | `8d3e967e` | — | — |
| C. API para desenvolvedores | `00775189` | 0185 | — |
| D. Efeitos sonoros, música e remix de voz | `f7a87e75` + `813def32` | 0186 | — |
| E. Agentes de voz em tempo real | `655b21da` + `3b4445f0` | 0187 | b (ativo) |

Cada migration teve um ensaio com rollback no banco de produção, foi aplicada,
registrada em `schema_migrations` e recarregada no PostgREST. Inngest foi
sincronizado após a fase E. Para retornar à versão anterior: `release.sh activate a`.

O commit `3b4445f0` regenerou o `package-lock.json` com o npm da imagem de build.
O npm local (11.6) tinha removido `@emnapi/runtime`, e o `npm ci` da VPS recusou
o lock.

## Tabela de preços (1 crédito = R$ 0,01; regra US$ × 6 × 4)

| Recurso | Custo ElevenLabs | Preço ao cliente | Exemplo |
|---|---|---|---|
| Voz v2 / v3 (Multilingual, Eleven v3) | US$ 0,10 / 1 mil caracteres | 0,24 crédito/caractere | 1 mil caracteres = 240 créditos (R$ 2,40) |
| Voz Flash / Turbo | US$ 0,05 / 1 mil caracteres | 0,12 crédito/caractere | 1 mil caracteres = 120 créditos |
| Efeitos sonoros | US$ 0,12 / min | 288 créditos/min | 2 s = 9,6 créditos |
| Música | US$ 0,15 / min | 360 créditos/min | 10 s = 60 créditos |
| Remix de voz | US$ 0,10 / 1 mil caracteres | 0,24 crédito/caractere | — |
| Agente de voz | US$ 0,08 / min (motor de voz) | 192 créditos/min, ou o custo total informado × 4, o que for maior | 5 min = 960 créditos |

Mínimo de 5 créditos por operação nova. Com o dólar a R$ 5,23 (hoje), o
multiplicador real fica em cerca de 4,6x.

## O que o cliente ganhou

### A — Textos longos (e-books)

- Textos de até 240 mil caracteres por operação, divididos em partes por
  frase/parágrafo:
  - v3 até 2.400 caracteres por parte;
  - demais modelos até 4.000;
  - continuidade de entonação com `previous_text` / `next_text`.
- Fluxo da cobrança:
  - o orçamento é calculado no servidor;
  - o saldo precisa cobrir o trabalho inteiro, senão a resposta é 402 com mensagem clara;
  - a reserva é feita antes da geração;
  - a liquidação acontece uma vez ao montar o arquivo.
- Partes idempotentes (repetir não gera custo duplicado). O resultado é baixado
  como um MP3 único, sem tags ID3 no meio.

### B — Compositor

- Biblioteca de vozes com filtros (gênero, sotaque, uso) e prévia.
- Preço por caractere visível para cada modelo.
- Controles de voz:
  - estabilidade, similaridade e estilo;
  - velocidade (0,7–1,2);
  - speaker boost;
  - idioma;
  - tags de emoção do v3.
- Caixa de texto sem limite prático:
  - até 4.800 caracteres a geração é direta;
  - acima disso vira e-book com orçamento.
- Importação de `.txt`, saldo convertido em minutos e histórico.

### C — API para desenvolvedores

- Formatos de saída:
  - MP3 (128/64/32);
  - PCM (16/22/24 kHz);
  - μ-law 8 kHz (telefonia);
  - Opus.
- Streaming em `/generations/stream`, com replay idempotente.
- `with_timestamps` e `/generations/{id}/alignment`.
- `seed` e normalização de texto.
- `/usage` com consumo por período.
- Webhooks assinados (HMAC `ConnectyHub-Signature`) com proteção contra SSRF e
  reenvio a cada 2 minutos.
- Exemplos curl, JS e Python no painel. OpenAPI 1.2.0.

### D — Efeitos sonoros, música, remix

- Formulários no Estúdio e endpoints na API.
- Cobrança por duração (efeitos e música) e por caractere (remix).

### E — Agentes de voz

- Na aba **Agentes de voz**, cada agente do WhatsApp da empresa vira um agente
  de voz em tempo real com a mesma identidade e prompt, mais regras de fala:
  - frases curtas;
  - não lê links;
  - diz que é IA se perguntado.
- O dono ou admin escolhe a voz, a primeira fala, o idioma e a duração máxima
  (2–30 min).
- **Testar por voz** usa o microfone do navegador, com SDK `@elevenlabs/client`
  e URL assinada.
- A chamada só começa se o saldo cobrir a duração máxima.
- Um cron (2 min) cobra cada conversa encerrada uma única vez (idempotente pelo
  id da conversa), pelo maior entre 192 créditos/min e o custo real informado
  pelo provedor × 4.
- Na API pública:
  - `GET /agents`;
  - `POST /agents/{id}/session`, que retorna a URL assinada para apps do cliente.

## Validações reais em produção

Projeto QA interno, com créditos de teste internos:

| Teste | Resultado |
|---|---|
| E-book de 2 partes | 562,56 créditos, MP3 limpo de 5:42 (0 erros de decodificação no ffmpeg) |
| Saldo insuficiente para e-book | 402 antes de gerar, sem débito |
| TTS curto com velocidade | OK |
| Streaming em μ-law 8 kHz + replay | OK, uma cobrança |
| Timestamps / alinhamento | OK |
| `/usage` | OK |
| Efeito sonoro 2 s | 9,6 créditos |
| Música 10 s | 60 créditos |
| Agentes: `GET /agents`, sessão inexistente, rotas sem login | `{"agents":[]}`, 404 `agent_unavailable`, 401 |

A chave QA temporária foi **revogada** ao final (confirmado 401). O saldo
restante do projeto QA interno é de 783,48 créditos de teste.

Testes automatizados: suíte de voz/estúdio com 92 testes passando (os SQL
pesados rodaram em série por limite de tempo do PGlite em paralelo). Também
passaram typecheck, lint e build.

## Pendências e limites

1. **Cota da ElevenLabs.** O plano Creator tem 131 mil caracteres/mês, sem
   excedente, e renova em 20/10.
   - Um único e-book no limite (240 mil caracteres) passa da cota mensal inteira.
   - Agentes de voz também consomem a cota.
   - Antes de divulgar e-books ou agentes para clientes, subir o plano (confirmar a cota no painel da ElevenLabs;
     o Pro anunciava 500 mil caracteres) ou aceitar que, ao esgotar, as gerações falham sem
     cobrança até a renovação.
2. **Primeiro agente de voz real.** Ainda não foi criado nenhum agente na
   ElevenLabs: a conta interna não tem agente de WhatsApp para espelhar.
   - O primeiro uso real é clicar em **Criar agente de voz** numa conta com
     agente e depois **Testar por voz**.
   - Esse primeiro teste confirma o modelo de linguagem aceito (Gemini 2.5
     Flash, com reserva GPT-4o mini) e a primeira cobrança pelo cron.
3. **Telefonia** (número Twilio/SIP, ligações de entrada e saída) não foi
   implementada. Exige a conta Twilio do cliente e implica ligações reais;
   fica para uma etapa com autorização específica.
4. **Clonagem profissional (PVC)** e **transcrição em tempo real** não foram
   implementadas. A clonagem instantânea já existe.
5. **Webhooks**: assinatura e regras testadas em unidade; a entrega ponta a
   ponta para um endpoint real do cliente ainda não foi exercitada.
6. Limites atuais:
   - e-book até 240 mil caracteres e 250 MB;
   - geração direta até 4.800 caracteres;
   - arquivos da API até 40 MB.
