# Métodos de pagamento da assinatura ConnectyHub

## Métodos de pagamento em Minha Conta — 16/09/2026

Implementado bloco visível em /dashboard/minha-conta, logo abaixo dos cards da conta:
cartões cadastrados, Padrão, Adicionar novo, Alterar cartão da próxima renovação e
Tornar padrão. Consentimento explícito e informação de que salvar não cobra agora.
A API aceita apenas titular/admin da organização autenticada, exige origem própria,
limita payload/tentativas e nunca recebe organização autorizadora do navegador.

Asaas: tokenização sem cobrança, reutilizando o customer do cartão ativo. Token AES-GCM
no cofre; PAN/CVV não persistidos, não auditados nem retornados. Bandeira/final/validade
somente para novos cadastros; o cartão legado permanece identificado como cadastrado
quando não possui metadados parciais. Acordos externos/compra avulsa/contrato não vigente
retornam bloqueio específico, sem criar checkout duplicado. Asaas 401/403 informa que
é preciso habilitar tokenização na conta da plataforma e mantém o cartão atual.

Migration 0152 aplicada em transação no banco da ConnectyHub, com histórico e infra_audit.
SHA-256 LF: 2e2621079525a4849f372d18d817daa18032ebc0664f5391678c641c44885df8.
Troca e recibo/auditoria atômicos, locks de organização/assinatura, revisão do cartão
padrão e período, idempotência por requestId. Pagamento em processamento/incerto bloqueia
a troca. Recarga já vinculada ao cartão anterior acompanha o novo padrão, preservando
enabled, consentimento e limites; não ativa recarga nova. Nenhuma fatura/job é criada.

Verificação de produção antes/depois da migration: fingerprint de status/plano/ciclo/
vencimento de todas as assinaturas permaneceu a2b020a9d628b75537f6a03440b235a9;
um cartão continuou ativo; authenticated sem EXECUTE na RPC. Leitura real pelo novo
código: Betel com um cartão padrão, elegibilidade sem bloqueio, vencimento 14/10/2026
preservado e nenhum campo token/customer_id/criptografia retornado. Não houve alteração
no banco Betel, tokenização real, cobrança real ou troca do cartão do titular.

73 testes em nove arquivos passaram; incluem SQL PostgreSQL descartável, rollback de
auditoria, isolamento, consentimento, replay, falha de tokenização e método da recarga.
ESLint, TypeScript e build webpack (108 páginas) passaram. Publicação será confirmada
pelo SHA servido e pela interface; homologação com novo cartão pertence ao titular.

Cockpit: cadastro Supabase/Storage Betel corrigido e auditado a partir dos destinos
verificados. UI separa quatro configurações obrigatórias SQL/jobs de complementos de
observabilidade/inventário (CH: três; Betel: sete). Vínculo organization_id não é erro
operacional enquanto client_access_enabled=false. Leituras CH 6/8 e Betel 5/8 seguem
saudáveis; não significa executor SQL/jobs ativo. Nenhum conector inseguro habilitado.

## Como testar sem cobrar

1. Entrar como titular da organização e abrir Minha Conta > Métodos de pagamento.
2. Conferir cartão Padrão e vencimento; clicar Adicionar novo ou Alterar cartão da próxima renovação.
3. O titular preenche os dados, lê a autorização e confirma Salvar e usar na próxima renovação.
4. Conferir mensagem de sucesso e marcador Padrão. O cartão anterior continua na lista,
   podendo voltar a ser padrão mediante nova autorização. Não usar checkout do ciclo já pago.
5. Falha Asaas deve manter cartão atual; 401/403 exige suporte habilitar tokenização,
   nunca uma cobrança fictícia para tentar contornar o bloqueio.

Salvar/tornar padrão não cobra agora, mas autoriza cobranças futuras conforme as condições
exibidas. Não realizar pagamento, renovação, recarga ou cartão de teste em produção nesta QA.

Referência oficial consultada em 16/09/2026: [Asaas: tokenização de cartão sem cobrança](https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito).
A disponibilidade em produção depende de habilitação da conta no provedor.
