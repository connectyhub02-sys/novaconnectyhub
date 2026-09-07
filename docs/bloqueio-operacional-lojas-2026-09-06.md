# Suspensão operacional das lojas — 06/09/2026

## Problema e correção

O painel e a execução principal dos agentes já conferiam o contrato. Os acessos públicos por produto e sessão de checkout não tinham a mesma verificação. Uma loja suspensa ainda podia apresentar o formulário, e algumas operações podiam alterar o pedido antes de a geração da cobrança verificar o contrato.

A autorização pública agora consulta `resolve_organization_contract_access` antes de carregar catálogo, dados do comprador, ofertas e recursos de pagamento. A resolução considera a organização responsável pelo contrato, inclusive empresas vinculadas à mesma conta. Erros de consulta não liberam acesso.

- Loja, listagem, carrinho, produto direto e checkout antigo mostram **Loja temporariamente indisponível**, sem revelar inadimplência.
- APIs de compra, Pix, cartão, status, entrega, order bump, upsell, ofertas e cadastro na loja verificam o contrato antes das operações comerciais.
- A sessão do agente nas páginas também exige contrato válido, antes de carregar ou persistir seu contexto operacional.
- Páginas abertas verificam a disponibilidade ao ganhar visibilidade e a cada 15 segundos; na suspensão, recarregam para retirar os controles. A proteção do servidor independe desse intervalo.
- Follow-up, recuperação de pedidos abandonados, encaminhamento humano, retomada após reconexão e avisos comerciais conferem o contrato na execução. Envios e publicação no Instagram recebem uma nova conferência imediatamente antes da chamada externa.
- O despachante de campanhas, a execução dos agentes, a API de integração e a publicação social mantêm suas verificações existentes. A sincronização da API pausa chaves e webhooks; chamadas já são recusadas pelo gateway sem aguardar a sincronização.
- As políticas restritivas de banco da migração 0087 continuam exigindo contrato operacional nas tabelas de recursos, inclusive para chamadas autenticadas diretas ao banco.
- Um cron a cada minuto inspeciona as filas WhatsApp das instâncias suspensas e pede `stop` nas campanhas `scheduled` ou `sending`. Preserva campanhas concluídas, pausas manuais, configurações e histórico. Não exclui instâncias. Campanhas interrompidas ficam pausadas para revisão após regularização, evitando disparos antigos inesperados.

## Exceções necessárias

Continuam disponíveis a regularização do plano e os produtos avulsos pagos. Configurações, pedidos, histórico e arquivos do lead não são apagados. A confirmação financeira e a conciliação de pagamentos iniciados antes do bloqueio continuam registrando os fatos. Esses processos não concedem autorização para novas vendas pela loja suspensa.

Não é possível recolher uma mensagem já entregue nem desfazer uma requisição já aceita por um provedor externo. A fila remota depende da execução do cron e da resposta do provedor; falhas de consulta/pausa ficam como erro no Inngest para nova tentativa, sem serem registradas como sucesso.

## Verificação

- 642 testes aprovados (84 arquivos), incluindo 20 cenários novos de suspensão, reativação, checkout antigo, ausência de mutações/envios e pausa de filas.
- TypeScript sem erros; lint sem erros, com oito avisos preexistentes fora desta alteração.
- Compilação de produção aprovada. Navegação local com os dados atuais verificou seis links existentes da BuffaloMass: loja, catálogo, carrinho, produto direto, produto dentro da loja e checkout. Todos exibiram a indisponibilidade, sem campos de compra. Status e tentativa de cartão sem dados financeiros retornaram HTTP 503. Tela conferida em 390 × 844 e 1366 × 900, sem transbordamento horizontal.
- Leitura de 581 organizações, incluindo cadastros históricos e organizações internas: BuffaloMass resolvida como `paid_expired`. O mesmo resolvedor é usado pela proteção pública, sem exceção por nome, usuário, agente ou loja.
- Operação de fila baseada no contrato do OpenAPI Uazapi incluído no repositório e na [documentação do provedor para controle de campanha](https://www.postman.com/augustofcs/uazapi-v2/request/8d4umi5/editar-pasta-de-envio).
