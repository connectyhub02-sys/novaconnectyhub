# Fechamento do escopo do Estúdio — 14/09/2026

Complemento à [ativação e custos](plano-custos-estudio-audio-2026-09-14.md).
Não representa uma auditoria de todos os módulos da ConnectyHub.

| Área | Evidência e estado |
|---|---|
| Home comercial | Seção `/#estudio-voz`, CTA para painel e documentação, ferramentas e aviso de disponibilidade/tarifa por modalidade. Incluída em `7fd9fe3c`, preservada na produção `2befee97`. |
| Planos, inclusive gratuito/teste | Grade compartilhada da home e `/dashboard/planos` informa contrato, créditos e armazenamento, inclusive free/trial; acesso gratuito não promete geração ilimitada. Não foi criado plano nem alterada tarifa nesta conferência. |
| Documentação API | `/docs/api#voz`, OpenAPI JSON e guia Markdown documentam contratos e exigem catálogo autenticado `available=true`. Existência de rota não significa modalidade ativa. Rótulo incorreto do download OpenAPI corrigido neste complemento. |
| SEO/GEO/AEO | Metadados e links de descoberta já existiam. Complemento adiciona Voz ao JSON-LD da home/documentação, entidade WebAPI e relações do artigo; `llms.txt`/`llms-full.txt` explicam disponibilidade, privacidade e créditos. JSON-LD gerado foi lido e validado como JSON. Não comprova indexação, posicionamento nem resposta de buscadores/assistentes. |
| Admin API de AI | Console de operação, projetos/chaves e configuração comercial; acesso protegido por `isPlatformAdmin`, sem ferramentas de geração. Separação em `c12ac9d4`, publicada no pacote `94d34012` e preservada nos posteriores. |
| Admin Estúdio | Gerenciamento, consumo e ativação por tarifa/evidência. Geração e `StudioTools` restritos ao ramo cliente `!admin`. Verificado no código publicado e testes dirigidos; não foi refeito login administrativo nesta rodada. |
| Nomes | Cliente: “Estúdio de Voz e Áudio AI”; admin: “Estúdio de Voz e Áudio”; navegação de integração: “Projetos e chaves API”. |
| Recursos desativados | Interface informa indisponibilidade e bloqueia geração; documentação manda consultar capabilities. Dicionário e Gemini 2.5 Flash/Pro continuam desativados. Home descreve disponibilidade condicionada, sem prometer ativação total. |

## Publicações e validação

- Separação administrativa: `94d34012`, Vercel `dpl_J5eiTWsuSiX7F1jVFGYPJtTRNHV4`, Ready.
- Expansão do Estúdio: `47c58ab5` incluindo `7fd9fe3c`, Vercel `dpl_JTpZ5ytexd1WK7ySgka9mY11ZU7D`, Ready.
- Clareza de cotação e recuperação: `2befee97`, Vercel `dpl_GyTvdz29hRAD8juJSFoeYtJsN3M8`, Ready, ambos os domínios.
- Complemento SEO/texto: ESLint dos cinco arquivos, sete testes existentes de documentação/admin e build webpack (TypeScript e 108 páginas) aprovados. Publicação deste complemento deve ser confirmada no estado operacional.
- Oito operações reais de áudio passaram no worker/carteira, com limites descritos no relatório de custos. Esta conferência complementar não repetiu gerações nem consumiu a margem do teto de US$1.

## Pendências delimitadas

**Dicionário de pronúncia:** transporte e permissão funcionaram (HTTP200), mas ausência de cabeçalho de custo ou de variação instantânea de créditos não prova tarifa zero. Falta uma tabela/condição contratual vigente da conta Creator/API que cubra criação, atualização/versões e eventual armazenamento, ou confirmação escrita do fornecedor sobre a cobrança aplicável. Pode ser obtida na documentação comercial/contrato da conta ou enviada pelo titular. Contato com suporte só com autorização específica. Manter desativado; não usar o saldo de testes para tentar inferir gratuidade.

**Gemini 2.5 Flash/Pro de voz:** faltam tarifas comerciais correspondentes confirmadas e cadastradas; manter desativados. Gemini 3.1 já está habilitado com tarifas verificadas.

Os testes sintéticos comprovam os percursos descritos, não todos os formulários/rotas públicas com chave, cenários de carga ou integrações de clientes. Não há execução independente pendente para as oito modalidades habilitadas; uma certificação mais ampla requer cenários próprios. Evidências privadas e materiais de teste não devem ser versionados.
