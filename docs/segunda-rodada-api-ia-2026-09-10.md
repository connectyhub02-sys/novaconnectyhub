# API de IA — segunda rodada, referência 1.5.0

## Entrega

- 37 caminhos e 62 operações HTTP, com uma página por operação gerada do OpenAPI.
- Campos de entrada e saída, objetos aninhados, enums, obrigatoriedade e estados.
- 12 tutoriais com cURL, JavaScript e Python; seleção de linguagem na página pública.
- Guias de escolha de interface, documentos, cobrança por recurso, recuperação, versões e conexão em tempo real.
- Webhooks próprios por projeto, com HMAC, segredo criptografado, histórico e até oito tentativas.
- Agendamentos cron com fuso IANA, pausa, histórico e revalidação da chave original.

A página, o JSON e o guia Markdown compartilham a mesma fonte. A referência
pública usa nomes ConnectyHub e créditos. IDs técnicos necessários ao protocolo
continuam descritos; nomes e credenciais de infraestrutura não são publicados.

## Cobrança e execução

Cada horário passa pelo mesmo gateway de Interações: acesso da conta, chave,
modelo, tarifa, reserva, solicitação e liquidação. O agendamento guarda o ID da
chave, não seu segredo. A identidade da ocorrência permanece nas recuperações.
Horários perdidos ou sobrepostos não geram uma fila retroativa de cobranças.
O executor é assíncrono: a ocorrência fica registrada até ser processada; não há
garantia de execução no segundo exato do horário.

O webhook é enfileirado transacionalmente quando a solicitação passa a concluída
ou falha. O evento contém os créditos registrados e o ID para consulta, sem prompt,
resultado ou chave. Repetir a entrega não repete a IA nem seu débito. URLs exigem
HTTPS e DNS público IPv4; a conexão fixa o endereço validado e não segue redirects.

Configurações, consulta de resultados e leitura da documentação não são gerações.
Gerações, ferramentas, indexação e armazenamento faturável mantêm a cobrança em
créditos conforme as regras e tarifas da operação. Não há débito fictício por ler
o mesmo resultado novamente. Consumo incerto mantém a recuperação financeira.

## Banco

`0129_ai_automation_delivery.sql` aplicada em produção pelo navegador em 10/09/2026.
Banco anterior: 0128. Cria quatro tabelas com RLS e funções restritas a service_role.
Aplicação e registro do SQL no histórico ocorreram na mesma transação.
Verificação posterior: hash do SQL normalizado confere; RLS das quatro tabelas
ativo; anon sem execução das funções; authenticated sem leitura direta; serviço
com permissão de execução. Nenhum saldo ou dado histórico de consumo foi alterado.

Os executores `connectyhub-ai-triggers` e `connectyhub-ai-webhooks` são registrados
no endpoint Inngest e precisam aparecer na sincronização do ambiente publicado.

## Validação

- Suíte completa: 1.169 testes passaram; um detectou o guia local desatualizado durante a edição. Após regenerar, os quatro arquivos afetados passaram (30 testes).
- Dois testes adicionais do transporte verificaram DNS privado, fixação do IP e ausência de redirecionamento. Arquivo de automações: 10 testes aprovados.
- Cobrança única, reserva insuficiente, exclusão entre trabalhadores, recuperação, pausa e assinatura exercitadas em PostgreSQL local/PGlite e fronteiras HTTP simuladas.
- TypeScript, ESLint dos arquivos de IA e build de produção aprovados. O build exigiu acesso ao Supabase para o sitemap público.
- Navegador: página pública sem login, navegação e seleção de exemplo Python verificadas em viewport móvel.

## Limites operacionais ainda existentes

Após o push `586ce3c`, a Vercel concluiu o deploy de produção. O OpenAPI público
retornou 1.5.0, 37 caminhos e 62 operações. GET sem chave em /webhooks e /triggers
retornou HTTP 401, sem executar IA ou alterar créditos.

Na conferência operacional, o Inngest exibiu **Execution Limit Reached**:
106.334 execuções mensais usadas para um limite Hobby de 50.000. Não considerar
agendamentos e entregas automáticas plenamente operacionais enquanto esse
impedimento não for resolvido e a sincronização das funções for confirmada.
Foi solicitada a escolha entre regularizar o serviço atual e migrar os novos
executores de IA. Nenhuma contratação de plano foi realizada.

A sincronização automática do deploy `586ce3c` falhou com “We could not reach your
URL” para o endereço individual da Vercel. O aplicativo existente ainda mostrava
41 funções e última sincronização bem-sucedida em 09/09, 21:31. Foi preparada uma
ressincronização para `https://www.connectyhub.com.br/api/inngest`, mas a revisão
automática de aprovação bloqueou a confirmação pelo excesso do plano e pelas
falhas de sincronização. A ação não foi executada por outro caminho. A ativação
das duas novas funções depende de resolver essa condição e autorizar a continuação.

O serviço WebSocket de tempo real existe em `services/ai-relay`, mas sua hospedagem
persistente ainda precisa ser indicada e configurada. Não afirmar que está ativo
apenas pela presença do endpoint ou dos exemplos. A pergunta sobre o ambiente foi
enviada ao responsável durante esta rodada.

Modelos experimentais sem tarifa/acesso confirmado continuam bloqueados. Não foi
inventado preço para liberá-los. Não foram feitas gerações pagas reais de todas as
famílias nem teste de carga. Webhooks e agendamentos são implementações próprias
que passam pela carteira, não espelhos irrestritos dos serviços administrativos
externos. Não há promessa de paridade integral com todo o contrato do fornecedor.

## Referências de implementação

- [Interações e formatos oficiais](https://ai.google.dev/api/interactions-api)
- [Eventos assíncronos](https://ai.google.dev/gemini-api/docs/webhooks)
- [Agendamentos](https://ai.google.dev/api/triggers)
- [Cron e fusos](https://github.com/harrisiirak/cron-parser)
