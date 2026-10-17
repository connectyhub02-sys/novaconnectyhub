# Voz: efeitos, qualidade e interpretação por áudio — 17/10/2026

## Escopo autorizado

Continuação das etapas 5 e 6 do plano desta conversa. O titular pediu implementar
o restante e fazer a escuta conjunta depois. Testes técnicos e publicação nesta
entrega; testes pagos de qualidade com o clone do André continuam pendentes.

## Implementação

- Efeitos no editor de texto: filtro, ambiente, som de fundo, distância,
  reverberação e posição estéreo. Catálogo autenticado do fornecedor, cache de
  cinco minutos e validação de IDs antes da reserva. Falha no catálogo não impede
  geração sem efeitos. `VOICE_EFFECTS_ENABLED=false` suspende efeitos no servidor.
- Efeitos e qualidade acompanham prévia, roteiro, rascunho e reuso. São enviados
  na mesma solicitação TTS; sem segunda geração nem nova tarifa de efeitos.
- MP3 32/64/128 kbps no painel. Automático mantém 128 para fala curta e 64 para
  textos longos. Partes longas usam o mesmo formato, efeitos e perfil; montagem
  continua MP3. Em 128 kbps, até 120 mil caracteres por volume, com reserva de
  armazenamento ampliada. Outros formatos já aceitos na API curta permanecem;
  reverberação/estéreo são rejeitados com PCM/ulaw antes de gerar. WAV/192 kbps não
  foram habilitados no painel nem foi presumido acesso a planos superiores.
- Nova entrada **Usar minha interpretação**: gravação local de até cinco minutos
  ou upload de áudio, player da seleção, voz de destino, semelhança/estabilidade,
  formato e cotação antes de transformar. Microfone é encerrado ao parar/sair;
  arquivo local e URL temporária não são usados como persistência do histórico.
- Reutiliza upload privado com duração aferida, `voice_change`, reserva,
  idempotência, worker e liquidação existentes. Gravação só sai do dispositivo
  ao clicar Enviar referência. Upload aceita até 20 MB/30 min; transformação em
  MP3 128 limita a 20 min para respeitar o limite de saída. Sem limpeza adicional
  de ruído e sem aplicação silenciosa de efeitos de TTS nessa modalidade.
- Histórico da transformação recolhível, rolagem limitada e paginação; recupera
  resultado e referência/ajustes. Referência excluída não é inventada nem enviada
  novamente. Reprodução/consulta não geram outra transformação.
- API e documentação atualizadas. Repetições de recibos anteriores com formato
  explícito continuam recuperando resultados, sem nova chamada ou cobrança.

## Evidência do fornecedor e da conta

Leitura autenticada da conta em 17/10: `/v1/audio-effects/catalog` 200, com seis
filtros, sete ambientes e quatro fundos; `/v1/models` 200, confirmando conversão
no `eleven_multilingual_sts_v2`. Nenhum áudio foi enviado nessa consulta.
Produção: uploads e operações habilitados; `voice_change` habilitado com tarifa
confirmada de 288 créditos/minuto e mínimo de cinco. Não alteramos essa tarifa.

Documentação oficial consultada:

- [Catálogo de efeitos](https://elevenlabs.io/docs/api-reference/audio-effects/get-catalog).
- [TTS: parâmetros, formatos e efeitos](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
- [Transformação de voz por áudio](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert).

## Verificação e publicação

80 testes distintos aprovados: 67 de contratos/worker/histórico/documentação e
13 SQL de migrações, reservas e liquidação. TypeScript e ESLint aprovados.
Componentes reais no navegador com APIs simuladas: cursor, marcas, estilos,
prévia com efeitos, qualidade, rascunho/reload, busca/paginação/reuso, isolamento,
conflito entre abas, gravação com microfone sintético, upload, transformação,
consulta sem repetir geração e histórico de referências. Layout sem overflow
em 1920/1366/390 px; evidências locais em `.codex-screens`.

Migration `0209_voice_reference_history.sql` amplia apenas a view privada do
histórico, preservando grants e `security_invoker`. Aplicação/ativação pendentes
da verificação final da candidata.

Nenhuma síntese, conversão real ou débito de teste. Qualidade, emoção e semelhança
dependem da voz e da referência; a escuta com o titular foi adiada por solicitação.
Reverberação pode deixar cauda entre partes longas. Rollback precisa preservar
worker compatível com trabalhos novos que incluam efeitos ou formato explícito;
concluir esses trabalhos antes de retornar a uma versão que ignore os campos.
Não restaurar banco para desfazer publicação de aplicativo.
