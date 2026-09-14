# ConnectyHub Voz — plano de execução

Status: em implementação. Base master 4c84800, aritmética decimal preservada. Aplicação na Vercel; banco/Auth/Storage na VPS. Trabalho concorrente de sessão assistida/reset deve ser integrado antes da publicação sem sobrescrita.

## Objetivo e decisões

Oferecer voz por Estúdio e API aos clientes, inclusive quem não usa agentes, com conta/carteira responsável ConnectyHub e credencial ElevenLabs somente nos servidores. Preservar tarifas por modelo/caractere existentes, sem importar multiplicador Gemini. Não trocar planos, criar recargas ou enviar áudio a leads como teste. A integração Betel deve manter preferências de voz e usar contrato público documentado, sem credencial ElevenLabs no projeto cliente.

## Etapas executáveis

1. Auditar catálogo, TTS, credencial, armazenamento, tarifas e acesso existentes; inventariar APIs oficiais e registrar cobertura em matriz. Confirmar tarifas/configuração por leitura sem imprimir segredos.
2. Definir contrato público de autenticação, catálogo/modelos, geração, recuperação, download, idempotência, erros e consumo. Comunicar cedo à tarefa Betel. Reutilizar chaves existentes quando seu escopo permitir e oferecer chave de voz para uso independente.
3. Implementar registro de operação e reserva/liquidação atômicas na carteira existente, limites concorrentes, isolamento cliente/projeto, armazenamento privado e recuperação sem regenerar quando entrega/resultado estiver incerto. Reutilizar geração/credencial/catálogo e tarifas; não chamar dois mecanismos de débito pela mesma geração.
4. Implementar seção Voz: Estúdio (voz, texto, estimativa, gerar, ouvir, baixar); API (projetos/chaves, exemplos e documentação); gestão (histórico, estados, erros, uso por período/voz/modelo, saldo e gráficos com registros reais). Administração com agregados por cliente, saúde/erros, custo estimado identificado, receita e margem; sem expor custos internos a clientes.
5. Testes de autorização/isolamento, reserva, saldo insuficiente, resposta/falha/timeout, repetição sem novo débito, armazenamento/recuperação e UI. TypeScript/lint/build e revisão antes de migrations/publicação.
6. Publicar banco e aplicativo, verificar domínio/contrato, coordenar uma geração real útil com Betel e conciliar um débito, mídia reproduzível e reservas. Registrar o que foi observado e as lacunas; não encerrar por publicação parcial.

## Escopo ampliado e critérios

O inventário deve cobrir TTS, streaming/timestamps, modelos/vozes e biblioteca, clonagem, speech-to-speech, speech-to-text, isolamento, efeitos, música, dublagem, projetos/Studio e Agents conforme API oficial. Cada capacidade ficará marcada como integrada/publicada/validada ou pendente com motivo concreto. Ausência de tarifa/acesso para uma nova modalidade exige decisão específica, não preço inventado nem bloqueio das demais frentes. Gráficos devem derivar de operações reais do escopo autenticado, não dados fictícios. Paridade com o painel comercial do fornecedor não é presumida.

## Limite comercial separado

Os [termos OEM oficiais](https://elevenlabs.io/oem-terms), consultados em 14/09/2026, vinculam oferta integrada a condições de plano/contrato específicos. O direito comercial da conta atual não foi conferido nesta conversa. Engenharia segue autorizada; não se registra aprovação contratual inexistente, não se contrata plano nem se contata o fornecedor. Recursos sem API e permissões específicas serão identificados na matriz.

## Estado inicial

`src/lib/voice/tts.ts` chama o gerador e depois meterUsageEvent; reutilizar esse wrapper diretamente numa liquidação nova duplicaria cobrança. `src/lib/elevenlabs/tts.ts` separa geração/armazenamento do débito, porém o caminho atual usa URL R2 pública e não tem recibo idempotente. Catálogo filtra clones privados por organização. A API nova precisa preservar essa separação, validar voz antes da geração e manter artefatos protegidos. Nenhum recurso novo publicado ainda.
