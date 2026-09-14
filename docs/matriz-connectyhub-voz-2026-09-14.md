# ConnectyHub Voz — cobertura e dependências

Registro de 14/09/2026. Não confundir a API completa do fornecedor com o pacote implementado na ConnectyHub. Esta matriz permanece aberta até a validação de cada capacidade; presença no catálogo não é prova de execução.

## Pacote em validação

| Capacidade | Painel/API ConnectyHub | Validação e limite |
|---|---|---|
| TTS avulso, modelo/voz/configuração | Estúdio; `POST /api/v1/voice/generations` | Mesma tarifa `text_to_speech`; reserva e liquidação única. Teste real Betel ainda pendente. |
| Catálogo de modelos e preços | Estúdio/API | Catálogo privado filtrado por projeto; modelo sem tarifa avulsa aparece indisponível. |
| Clonagem instantânea | Estúdio; `POST /voices` multipart | Consentimento obrigatório; até 5 amostras / 3 MB. Sem clonagem real de teste. |
| Gestão do clone | Listar/detalhar/renomear/excluir, amostras autenticadas | Isolamento de organização e projeto testado. Importação de clone existente exige vínculo administrativo com evidência, sem falsa criação faturada. |
| Prévia de clone | Estúdio; `POST /voices/{id}/preview` | Uma prévia incluída, frase fixa; repetições recuperam recibo. Custo absorvido registrado. |
| Áudio e recibos | Ouvir/baixar/consultar/recuperar | Bucket privado da VPS; IDs não autorizam por si só. Resultado incerto conserva reserva; sem nova chamada de síntese automática. |
| Projetos/chaves | Painel API | Chave dedicada `ch_voice_`, apenas hash no banco; rotação conserva propriedade no projeto. |
| Gestão financeira | Cliente e administrador | Gráficos reais por dia/modelo/voz/operação; admin por cliente. Custo estimado separado de efetivo; valor dos créditos não representa necessariamente recebimento de caixa. |

## Capacidades adicionais do fornecedor

| Família | Situação ConnectyHub | Dependência concreta |
|---|---|---|
| TTS streaming e timestamps | Não implementado neste pacote | Adaptador e persistência/recuperação do alinhamento; download de MP3 não é streaming de síntese. Tarifa avulsa existente pode ser reutilizada somente para operação equivalente. |
| Diálogo com múltiplas vozes | Não implementado | Validar modelo habilitado e tarifa, IDs de todas as vozes e medição da operação. |
| Voice changer / speech-to-speech | Não implementado | Cadastro efetivo encontrado somente com tarifa zero por requisição; não há preço por duração comprovado. Não estender a exceção de clonagem para este recurso. |
| Speech-to-text / transcrição | Não implementado | Não há feature/tarifa efetiva correspondente identificada; adaptador de arquivo, duração e resultado necessário. |
| Speech-to-text em tempo real / WebSocket | Não implementado | Tarifa/duração de sessão, transporte persistente e limites por projeto. |
| Música | Não implementado | Feature/tarifa ausente; acesso comercial e medição da operação ainda não verificados. |
| Efeitos sonoros | Não implementado | Feature/tarifa por operação/duração ausente. |
| Isolamento de áudio | Não implementado | Feature/tarifa por duração ausente. |
| Dublagem e recursos de dublagem | Não implementado | Feature/tarifa, jobs assíncronos, posse dos arquivos e retenção. |
| Forced alignment | Não implementado | Feature/tarifa, transporte e persistência de alinhamento. |
| Voice design / remix | Não implementado | Tarifa de desenho/prévia/salvamento e consentimento de voz; não usar tarifa zero de biblioteca como autorização financeira. |
| Professional Voice Cloning e verificação | Não implementado | Fluxo específico de verificação do titular, elegibilidade do plano e tarifa. IVC não comprova PVC. |
| Biblioteca pública | Não habilitada indiscriminadamente | Direitos/acesso/custo de vozes compartilhadas; catálogo atual restringe vozes comuns premade e clones vinculados. |
| Dicionários de pronúncia | Não implementado | Propriedade por projeto, versões e associação às gerações; adaptador próprio. |
| Studio / projetos longos / capítulos | Não implementado | Recursos remotos por projeto, limites, jobs e medição de conversões; não equivale ao Estúdio simplificado ConnectyHub. |
| Audio Native | Não implementado | Hospedagem/widget, consentimento e controle de uso por domínio/projeto. |
| Agents / conversação / telefonia | Não implementado | Integração, sessões, tarifas e isolamento próprios; não confundir com agentes WhatsApp já existentes. |
| Administração do workspace fornecedor | Não exposta ao cliente | A chave global não pode conceder acesso à conta do fornecedor ou aos dados de terceiros. |
| Recursos criativos de imagem/vídeo | Não implementado | Escopo, acesso, tarifas e transporte específicos; não representados como parte já entregue de Voz. |

## Política de preços confirmada

O titular determinou usar o mesmo estilo e as tarifas efetivas do painel. Em leitura de produção em 14/09, `voice_clone` tinha tarifa ativa de zero por requisição. Essa taxa explícita é respeitada; ausência/inatividade é bloqueio. TTS avulso `eleven_multilingual_v2` tinha 0,008 crédito/caractere e mínimo 5; WhatsApp tem tarifas distintas. Estes valores são evidência datada, não preços fixados no código. Nenhuma tarifa foi criada ou alterada nesta entrega.

Termos OEM e acesso comercial são uma verificação contratual separada; não autorizam compra/mudança de plano e não bloqueiam desenvolver adaptadores já autorizados. Recursos sem tarifa comprovada não devem fazer chamadas faturáveis reais para descobrir preço.

Referências oficiais consultadas: [índice da API](https://elevenlabs.io/docs/api-reference/introduction), [TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), [transcrição](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [voice changer](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert), [Studio](https://elevenlabs.io/docs/api-reference/studio-api-information). As dependências da ConnectyHub foram identificadas no código e cadastro efetivo, não inferidas apenas dessas páginas.
