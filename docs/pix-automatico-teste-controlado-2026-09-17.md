# Pix Automático: verificação e teste controlado

## Evidência de produção em 17/09/2026

Commit funcional `68a4356f63dad0f53fedeb8b891b0fe7303f6ff8` publicado pela master
no GitHub correto; Vercel success e health HTTP 200 com o mesmo SHA.
Flag `ASAAS_PIX_AUTOMATIC_ENABLED=true` em Production, schema 0153/0154 e webhook
autenticado com os nove eventos Pix presentes. Seis testes de disponibilidade e
ESLint aprovados; nenhuma operação financeira real executada nesta verificação.

Checkout inicial **real em produção**, já existente, foi inspecionado em sessão
administrativa assistida. Pix Automático estava habilitado e selecionável junto
de Cartão e Pix comum. Selecionar a aba mostrou R$ 694,00 inicial e R$ 497,00
mensal, explicação do primeiro pagamento e validação Asaas. Consentimento ficou
desmarcado e Gerar Pix Automático desabilitado. Não houve alteração do carrinho,
geração de QR, autorização, mandato ou pagamento. Esse checkout não foi designado
como alvo de teste financeiro; não usar seus valores nem o cliente sem aprovação.

No Asaas, conforme orientação do atendimento repassada pelo titular, foi aberto
o formulário Criar cobrança e selecionado Assinatura, sem preencher valor,
vencimento ou cliente. A opção Boleto Bancário / Pix apresentou a frase:
“Seu cliente pode autorizar o Pix Automático para os próximos pagamentos.”
Essa oferta visível confirma a disponibilidade operacional pelo critério informado
pelo atendimento. Não existe botão separado denominado Pix Automático nessa tela;
o recurso é descrito dentro de Boleto/Pix. Formulário fechado sem avançar.
Isso supera a ausência de indicação encontrada anteriormente no menu Pix do
pagador, mas não substitui teste de criação via API nem liquidação financeira.

## Proposta para aprovação antes de qualquer teste real

| Item | Proposta ainda não executada |
| --- | --- |
| Organização | Criar uma organização exclusiva do titular, `ConnectyHub QA Pix`, sem clientes, agentes ou créditos de terceiros. Não foi criada nesta rodada. |
| Plano | Start (`starter`), recorrência mensal, sem adicionais, campanha ou desconto variável. |
| Valor | R$ 97,00 inicial e R$ 97,00/mês, preço ativo lido no catálogo em 17/09 às 21:29 BRT. Conferir novamente antes da aprovação. |
| Dados | Nome, CPF/CNPJ, e-mail e telefone verdadeiros do titular responsável, fornecidos/confirmados por ele e em conta de teste sob seu controle. Não usar documentos fictícios na produção nem dados de cliente. |
| Banco pagador | Aplicativo bancário do próprio titular; ele revisa e autoriza o primeiro pagamento e a recorrência. |
| Limite | Uma tentativa de criação, um primeiro pagamento autorizado; nenhuma renovação antecipada, recarga ou adicional. |

Uma alternativa de valor menor exige configurar um plano isolado com preço
expressamente aprovado, mantendo recorrência fixa positiva. Não alterar preço de
plano público nem usar cobrança simbólica para simular troca de assinatura ativa.

## Sequência e pontos de parada

1. Obter aprovação explícita para organização, plano, valor inicial, valor mensal,
   dados do titular e criação de autorização real. Até então, não cadastrar
   contratação de teste, cliente Asaas, mandato ou cobrança.
2. Na organização aprovada, iniciar o checkout e conferir intenção initial,
   recorrência fixa, ausência de assinatura externa/campanha incompatível e valores.
   Abrir/selecionar Pix Automático permite conferir a oferta antes do consentimento.
3. O marco de criação externa é marcar o consentimento e clicar **Gerar Pix
   Automático**. O POST da ConnectyHub pode criar/localizar o cliente Asaas e
   criar a autorização com QR integrado ao primeiro pagamento. Parar antes desse
   clique enquanto não houver autorização específica. Não chamar POST /payments
   em paralelo nem tentar completar o fluxo manualmente no painel Asaas.
4. Após criação autorizada, registrar somente IDs, valores, horários e estados
   sanitizados. O QR/estado CREATED demonstra criação, ainda não ativação.
5. O titular revisa no app do banco e confirma pagamento + recorrência. O agente
   não assume essa autorização bancária pelo usuário.
6. Confirmar por consulta Asaas: autorização ACTIVE, pagamento CONFIRMED/RECEIVED,
   cliente/valor/vínculo corretos. Na ConnectyHub: efeitos concluídos uma vez,
   assinatura ativa, créditos do plano uma vez, próxima data/valor corretos e
   ausência de uma renovação concorrente pelo worker de cartão.
7. Recusa 400/403 definitiva: registrar código sanitizado e motivo; não repetir
   nem trocar de meio silenciosamente. Timeout/erro incerto: apenas conciliar por
   GET e investigar; não emitir outra autorização por falta de resposta.

## Encerramento e limpeza

- Sem criação: fechar o checkout; nenhum mandato externo a cancelar. Preservar
  registros internos da preparação até o responsável definir seu encerramento.
- Autorização criada e não paga: o titular/operador autorizado cancela a autorização
  específica por fluxo suportado; conferir estado terminal e ausência de pagamentos
  ou instruções futuras antes de encerrar a organização de teste.
- Após pagamento: cancelar a recorrência/mandato específico e confirmar no Asaas
  que não restou instrução futura. Estorno é outra operação financeira e precisa
  integrar a aprovação de encerramento; não presumir restituição de tarifas.
  Se houver estorno, confirmar REFUNDED e aplicação dos efeitos locais existentes.
- Preservar auditoria, IDs e histórico. Não apagar tabelas nem editar status por SQL
  para fabricar sucesso, desfazer saldo ou esconder uma autorização real. Não
  desativar o webhook global para limpar o teste. Desligar a flag só bloqueia novas
  criações; não cancela mandatos existentes.

Troca de assinatura ativa permanece indisponível e explicada: a jornada pública
exige primeiro pagamento, e não há confirmação de uma jornada compatível com
troca sem cobrança. A disponibilidade de novas contratações não altera essa regra.
