# Betel: preparação do destino definitivo — 15/09/2026

O titular autorizou a migração definitiva, transmitida pela tarefa coordenadora.
O ensaio anterior não equivale ao corte da produção nem à validação comercial
dos 12 handlers. A origem continua preservada enquanto se preparam os gates.

## Cadastro confirmado no portal

O portal autenticado foi conferido no navegador. A empresa Betel Leiloes já
existia na ConnectyHub (`66cb4c5a-35f2-4c08-9982-38bd72d2b9be`), com o projeto
Betel Voz (`db9ec5c3-458b-451e-aad3-d42f0a6bbc34`). Consulta somente leitura
confirmou a identidade por ID, slug e vínculo do projeto de voz.

Criado no banco independente do portal o projeto `Betel Leilões`, slug
`betel-leiloes`, ID `9349f704-bdaa-41f1-957f-23f3317ba969`, na mesma identidade
de organização. Estado **draft / Rascunho**; limite de armazenamento zero e
nenhum acesso de cliente concedido. A lista autenticada mostra os dois projetos,
Betel em rascunho e ConnectyHub conectada.

Esse cadastro é preparação, não conexão operacional: ainda não coleta banco,
consumo ou automações reais da Betel. Nenhum saldo, preço, chave, pagamento ou
cadastro original da ConnectyHub foi alterado. Procedimento limitado e
idempotente: `services/managed-portal/runtime/prepare-betel.py`.

## Plano de transição em execução

- Destino proposto: aplicação completa na VPS, em `betel.connectyhub.com.br`,
  com API Supabase própria em `betel-supabase.connectyhub.com.br`. O único
  domínio de produção atualmente confirmado pela tarefa Betel é
  `betel-leil-es.vercel.app`; os novos nomes ainda dependem da preparação DNS/TLS.
- Registrar os 12 contratos reais somente após validar broker, isolamento e
  pausas. O broker atual aceita exclusivamente a função sintética do ensaio.
- Preparar versão de produção com pausa global das automações; nenhum envio,
  consumo pago ou reexecução de trabalho incerto como teste.
- Congelar escrita da origem de forma coordenada, atualizar snapshot/delta,
  verificar conteúdo/contagens/referências, guardar cópia externa e reversão.
- Preservar links e entradas da Vercel após corte por encaminhamento seguro,
  sem manter dois bancos recebendo escrita e sem encaminhar callbacks antigos
  do Inngest Cloud para a nova execução.
- Conectar métricas e consumo no portal com identidade e permissões da Betel;
  ausência de coleta não pode aparecer como consumo zero ou produção saudável.

Este registro descreve preparação. Não autoriza apagar origem, cancelar dados
ou apresentar testes simulados como aceite de todos os fluxos comerciais.

Preparação concluída posteriormente: consulte [migração final e limites](betel-migracao-vps-2026-09-15.md). Este documento preserva o estágio anterior.
