# Estúdio de Voz — lacunas para paridade com a ElevenLabs — 02/10/2026

Análise de código e documentação, sem chamadas ao fornecedor, sem gerações e sem
alteração de banco, tarifa ou deploy. Estado de produção não foi reconferido
nesta leitura (ver "Confirmações pendentes").

## O que já existe

| Capacidade | Onde | Observação |
|---|---|---|
| TTS avulso com idempotência, reserva/liquidação e recibo | `POST /api/v1/voice/generations`, `src/lib/voice-api/generations.ts` | Só `eleven_multilingual_v2` tem tarifa `text_to_speech`; MP3 44.1k/128 fixo; 4.800 caracteres |
| Clonagem instantânea (IVC) com consentimento, prévia e gestão | `/voices`, `clones.ts` | Clones arquivados no reset de 20/09 |
| Transcrição Scribe v2 (JSON/SRT/VTT, diarização) | `/operations`, `studio-contract.ts` | Arquivo até 20 MB / 30 min |
| Limpeza, troca de voz, alinhamento, diálogo v3, desenho/salvamento de voz, dublagem v1, dicionários, Gemini TTS | `/operations` | Dublagem: 1 idioma de destino, sem edição; dicionário com provisão de custo |
| Projetos, chaves `ch_voice_`, limite mensal, carteira, gráficos de uso | `voice-console.tsx`, `/api/dashboard/voice` | Admin separado em `/admin/voz` |
| Documentação pública + OpenAPI | `/docs/api#voz` | |

## Lacunas da API (entrega para desenvolvedores)

1. **Modelos de baixa latência e v3 na TTS avulsa** — Flash v2.5/Turbo só têm tarifa do canal WhatsApp; `eleven_v3` só existe no diálogo. `voiceRates` exige `text_to_speech`, então aparecem indisponíveis.
2. **Streaming** — sem TTS por streaming HTTP nem WebSocket de entrada; a geração é síncrona (timeout 90 s) e só devolve o MP3 completo. Bloqueia apps em tempo real e agentes de voz.
3. **TTS com timestamps** (alinhamento por caractere) — ausente no endpoint de TTS.
4. **Formatos de saída** — fixo `mp3_44100_128`; faltam PCM, μ-law 8 kHz (telefonia), Opus, WAV.
5. **Parâmetros de TTS** — sem `language_code`, `seed`, `previous_text`/`next_text` (continuidade entre trechos), `speed`, normalização de texto.
6. **Limites** — 4.800 caracteres; 10 req/min e 2 simultâneas por carteira. Baixo para revenda B2B; não há faixas por plano.
7. **Webhooks** — operações assíncronas (dublagem, transcrição) só por polling.
8. **Uso e histórico pela API** — sem endpoint público de saldo/consumo; histórico limitado a 50 itens, sem paginação.
9. **Entrada por URL** — STT/dublagem só por upload; limites de 20 MB / 30 min.
10. **Escopos por chave** — chave dá acesso total ao projeto; sem escopo por operação nem limite por chave.
11. **SDKs** (JS/Python) e coleção de exemplos executáveis.

## Lacunas de produto (famílias inteiras ausentes)

- Efeitos sonoros (text-to-sound-effects)
- Música
- STT em tempo real
- Voice remix
- Clonagem profissional (PVC) com verificação
- Biblioteca de vozes da comunidade (hoje só vozes premade + clones/desenhos do projeto)
- Studio para conteúdo longo (audiobook/capítulos/projetos)
- Audio Native (player incorporável)
- **Agentes de voz conversacionais e telefonia (SIP/Twilio)** — maior diferencial possível, porque já existem agentes WhatsApp com CRM/agenda/checkout

## Lacunas de usabilidade no painel

- A tela de TTS não expõe estabilidade, similaridade, estilo, velocidade nem speaker boost (a API aceita, o painel não mostra).
- Sem biblioteca navegável com filtros (gênero, sotaque, idioma, uso), prévia e favoritos.
- Histórico sem player por item, regenerar, comparar versões nem baixar em lote.
- Sem editor de tags de áudio do v3 (`[sussurra]`, `[ri]`) nem atalhos de pausa/ênfase.
- Sem editor de transcrição (corrigir texto e reexportar legenda).
- Sem playground de API (testar requisição e copiar código).

## Riscos comerciais e operacionais

- **Direito de revenda**: plano Creator; termos OEM vinculam oferta integrada a plano/contrato específico. A conta trocou em 20/09 — confirmar plano e direito de revenda da conta atual antes de vender como produto.
- **Chave única do fornecedor**: cota, concorrência e limites de taxa são compartilhados entre todos os clientes; um cliente pode esgotar a capacidade dos demais.
- **Preço comparável**: tarifa de API v2 com multiplicador 4 fica bem acima do preço público por caractere da ElevenLabs. O valor precisa vir de cobrança em reais/Pix, português, suporte e integração com WhatsApp/CRM.

## Confirmações pendentes (não verificadas nesta leitura)

- Flags `STUDIO_OPERATIONS_ENABLED`/`STUDIO_ASSETS_ENABLED`, volume privado e FFmpeg na imagem da VPS após a migração de 28/09 (os testes de 14/09 rodaram com worker na Vercel).
- Percurso com chave pública `ch_voice_` de ponta a ponta na VPS.
- Plano/limites da nova conta ElevenLabs e ativação das tarifas v2 revisadas.

## Cobrança: Estúdio x atendimento WhatsApp (verificação de código, 02/10)

Tarifas vivas não foram lidas no banco nesta verificação (sem acesso de leitura
local); valores abaixo vêm dos registros de 14/09.

**Igual ao ecossistema:** mesmo centro de custo (`provider_cost_centers` →
`provider_features` → `provider_models` → `billing_rates`), mesmo resolvedor
`resolveActiveBillingRates` pelo plano da organização pagadora (contratos
personalizados usam `base_plan_code`), mesmo cálculo `calculateMeteredUsageCharge`
(unidades × preço, com mínimo), mesma carteira compartilhada, mesmos
`usage_events`/`credit_transactions` e ciclo. Tarifa ausente bloqueia. Painel do
Estúdio e API pública passam pelo mesmo `voiceRoute`, logo cobram igual.

| Uso | Feature | Preço registrado |
|---|---|---|
| Áudio do agente WhatsApp v2 / Flash v2.5 | `voice_reply_whatsapp` | 0,24 cr/caractere mín. 50 / 0,12 mín. 5 |
| TTS Estúdio/API v2 | `text_to_speech` | 0,24 cr/caractere mín. 5 (custo compartilhado com a tarifa do agente) |
| Gemini (agente e Estúdio) | `voice_generation_audio` | mesmas linhas por token |
| Ferramentas do Estúdio | `studio_*` | 8,8/min transcrição e alinhamento; 288/min limpeza e troca; 0,24/caractere diálogo e desenho; 5 salvar; 1.200/min dublagem; 5 dicionário (provisão) |
| Clonagem / prévia | `voice_clone` | 0 explícito / absorvida |

**Divergências encontradas:**

1. `finish_voice_generation` (0147) e `finish_studio_operation` (0149) debitam a
   carteira diretamente, sem `debit_credit_wallet`: não atualizam
   `billing_cycles.overage_credits`, ignoram `allow_overage`, não disparam na hora o
   alerta de saldo (só a rotina periódica do Inngest o alcança) nem o aviso de
   trial sem créditos, e gravam `billing_mode='customer_billable'`
   fixo (organizações internas/gratuitas seriam debitadas).
2. `usage_events.organization_id` recebe a organização pagadora, não a executora
   (que fica só em metadata). Em carteira compartilhada, a organização vinculada
   não vê seu consumo de Estúdio em Minha conta.
3. `usagePublicCategory` (`src/app/api/dashboard/account/route.ts`) classifica a
   maioria das features `studio_*` e `voice_clone` como "Atendimento IA".
4. Flash v2.5 tem preço só no canal WhatsApp; Estúdio/API não podem usá-lo.
5. Confirmar no banco se as versões corrigidas de 14/09 (v2 API 0,24; Flash 0,12)
   estão ativas.

## Ordem sugerida

1. **Base de produção** — contrato/plano; flags e teste ponta a ponta na VPS; controles de voz no painel; tarifas Flash v2.5 e v3 para API; formatos de saída; limite de texto maior; histórico com regenerar.
2. **Paridade para desenvolvedores** — streaming HTTP e WebSocket, timestamps, webhooks, endpoint de uso, escopos/limites por chave, faixas de rate limit por plano, SDK e playground.
3. **Catálogo** — biblioteca de vozes, efeitos sonoros, música, remix, STT em tempo real, PVC.
4. **Diferencial** — agentes de voz e telefonia integrados aos agentes WhatsApp, CRM e agenda.
