# ConnectyHub Voz — contrato em implementação

**Rascunho. Ainda não publicado.** Não executar chamadas reais até a confirmação.

Base `https://www.connectyhub.com.br/api/v1/voice`. Bearer de chave dedicada `ch_voice_…`, vinculada a projeto e organização, sem agente obrigatório. Não aceita segredo ElevenLabs, chave WhatsApp `ch_live_` nem reinterpreta permissões de uma chave LLM. A rotação preserva o projeto e seus artefatos. Conta pagadora usa carteira ConnectyHub existente.

## Geração

`GET /voices` devolve `{configured,partial,voices:[{voice_id,name,kind,status,preview_url,language}]}`. Voz comum autorizada é diferente de clone privado do projeto. IDs fora do catálogo não autorizam acesso.

`GET /models` devolve `{models:[{model_id,name,available,credits_per_character,minimum_credits}]}`. Indisponíveis contêm `reason`. Tarifa é obtida do mesmo resolvedor do painel para a operação equivalente; não confundir `text_to_speech` com `voice_reply_whatsapp`.

`POST /generations`, cabeçalho **Idempotency-Key obrigatório** (1–128 ASCII sem espaços):

```json
{"text":"Olá!","voice_id":"ID_DO_CATALOGO","model_id":"eleven_multilingual_v2","voice_settings":{"stability":0.45,"similarity_boost":0.8,"style":0.2,"use_speaker_boost":true}}
```

Recibo:

```json
{"id":"uuid","project_id":"uuid","status":"completed","operation":"text_to_speech","voice_id":"id","model_id":"eleven_multilingual_v2","usage":{"characters":4,"credits":5,"reserved_credits":0,"quoted_credits":5},"audio":{"path":"/api/v1/voice/generations/uuid/audio","content_type":"audio/mpeg","bytes":1234},"error":null,"replayed":false,"created_at":"ISO8601"}
```

Valores acima apenas ilustram o formato. Estados: reserved, processing, uncertain, completed, failed. `completed` significa áudio persistido e liquidação atômica concluída. Nunca inferir débito de um HTTP 200 isolado. Resultado incerto mantém a reserva até recuperação/conciliação.

Repetir POST com **mesma chave e mesmo corpo normalizado** consulta o recibo, inclusive após timeout sem ID; nunca gera novamente. Corpo diferente produz409. Failed permanece terminal: só uma decisão explícita de nova tentativa usa outra chave. GET `/generations/{id}` consulta e tenta recuperar mídia conhecida, sem outra síntese. GET `/generations/{id}/audio` exige a chave do mesmo projeto; não é URL pública e não recebe segredo em querystring.

4800 caracteres após normalização de espaços, MP3 44.1kHz128kbps,12MB por áudio,10 novas operações/minuto/carteira,2 em andamento/carteira. Projetos podem ter limite mensal. Não há garantia de retenção eterna do provedor; o resultado é persistido na infraestrutura ConnectyHub.

Erros JSON `{error:{code,message,request_id?}}`.401 chave inválida;403 acesso;404 recurso privado/ausente;409 conflito/áudio pendente;402 saldo;422 parâmetros;429 limites;502 provedor;503 serviço/recuperação/tarifa. Custos e chaves do fornecedor nunca integram o recibo público.

## Clonagem e documentação pública

Clonagem privada faz parte desta entrega, com criação/listagem/detalhe/edição/exclusão e geração estritamente limitadas ao projeto. Contrato multipart de criação e amostras será acrescentado após implementação; não inventar chamadas nem encaminhar diretamente ao fornecedor. Prévia incluída no fluxo existente não pode gerar segundo débito. A tarifa efetiva deve ser a mesma do painel; tarifa zerada provisória não é prova de gratuidade.

A documentação final será integrada à página existente `/docs/api`, com navegação, guia e OpenAPI de Voz. Este rascunho interno não substitui a documentação pública.
