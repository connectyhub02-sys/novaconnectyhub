# Padronização dos arquivos no R2 — 24/10/2026

Autorização do titular: arquivos persistentes de API/clientes no Cloudflare R2,
sem ampliar o disco da VPS. Implementação publicada e conferida às 13h23 BRT.

## Diagnóstico e preservação

O maior consumo identificado no incidente era de históricos técnicos Inngest:
aproximadamente 119 GiB Vision e 37 GiB ConnectyHub antes da retenção. Arquivos
locais de clientes eram muito menores; a migração evita crescimento futuro,
mas não substitui a limpeza/compactação desses históricos.

| Origem | Arquivos | Bytes | Resultado |
|---|---:|---:|---|
| Supabase Storage ConnectyHub | 627 | 230.015.860 | R2 privado, todos conferidos por hash via API |
| Relay privado do Estúdio | 66 | 9.928.937 | R2 privado, hashes do banco e leitura na imagem conferidos |
| Supabase Storage Vision | 0 | 0 | Backend R2 habilitado e CRUD privado testado |

693 arquivos preservados, 239.944.797 bytes (aproximadamente 229 MiB).
Originais locais mantidos como cópia estática; a migração não foi apresentada
como liberação desse espaço. Novos uploads desses caminhos gravam no R2.
Nenhuma alteração de clientes, conversas, saldos, cobranças, resultados ou filas.

## Publicação

Supabase Storage passa a usar backend S3 nativo, conservando nomes lógicos,
metadados, versões, API, autenticação, links e RLS. ConnectyHub usa novo bucket
`connectyhub-storage-private`, confirmado sem r2.dev público ou domínio customizado.
Vision usa sua própria conta e as credenciais do bucket privado já existente
`vision-voice-private`, em prefixo `vision-demo/`; mídias existentes preservadas.
O token de mídia Vision não permite criar buckets: usado o destino privado
existente sem ampliar permissões. Bucket provisório vazio na conta ConnectyHub
foi removido após os testes, sem arquivos de clientes.

Mídias públicas já iam para R2. O relay passou a usar o mesmo bucket privado da
ConnectyHub, prefixo `studio-relay/assets/`, com tickets e cotas preservados.
Imagem `connectyhub-ai-relay:r2-7f422cfb`, fonte commit `7f422cfb`. Produção recusa
iniciar assets sem configuração R2; falha do R2 não escreve payload na VPS.
Recibos mínimos de conciliação continuam locais. Gemini Files usa cópias temporárias
no provedor para inferência; esse caminho transitava em memória e não ocupa disco.

Troca do Storage ConnectyHub levou aproximadamente 20 segundos; relay 12 segundos
até recriação. Sem sessões Live recentes ou uploads do Estúdio em processamento
na conferência imediatamente anterior à troca. Nenhum deploy do Next.js:
aplicação continua `094d167d`; nenhum banco de negócio foi reiniciado.

## Evidências

- Todos os 627 arquivos lidos pela API Storage após a troca, hashes idênticos;
  leitura adicional pelo domínio HTTPS público também idêntica.
- Em ambos os Storage: criar/ler/apagar arquivo sintético, download assinado,
  range HTTP 206, rejeição de acesso público, anon e usuário sem vínculo.
- S3 nativo: PUT/GET/cópia/multipart ensaiados. Relay: 66 arquivos lidos e
  conferidos na candidata; CRUD real no R2 com controle sintético, zero payload
  local novo. Leitura/hash também conferidos na imagem já publicada.
- 20 testes do relay aprovados, incluindo ticket, falha de armazenamento,
  resultado incerto e confirmação após reinício. Primeira seleção também capturou
  cópias antigas em `tmp/voice-check-env` sem dependências; repetição restrita aos
  quatro arquivos relevantes passou integralmente.
- Banco/Auth/REST/Storage ConnectyHub e Vision saudáveis; Inngest dos dois
  respondeu HTTP 200. App público, Auth health/admin, REST e relay HTTP 200.
  Isso não comprova login pessoal do titular nem todas as entregas aos clientes.

Configuração/dump de metadados antes da troca e manifests com hashes guardados
privadamente. Nenhum segredo ou nome de arquivo de cliente está neste relatório.
Procedimentos e cuidados de retorno em [deploy/storage-r2](../deploy/storage-r2/README.md).

## Capacidade e pendências

Às 13h23 BRT: 17.698.484.224 bytes livres (16,48 GiB), `df -h` arredondando
para 17 GiB e 95% de uso, contra cerca de 7,8 GiB/98% no diagnóstico inicial.
Arquivamento Vision e controlador de compactação ainda ativos; retenção diária
continua habilitada. O arquivamento ConnectyHub já concluiu e duas tabelas foram
compactadas. [Acompanhamento da recuperação](retencao-historicos-vps-2026-10-24.md).

Não foi contratado espaço adicional. Não há motivo para comprar disco apenas
para receber novos arquivos nesses caminhos: o destino agora é R2. A folga
definitiva para bancos/fila depende de concluir a recuperação e observar crescimento.
R2 tem cobrança própria de armazenamento/operações; não significa custo zero.
Backup independente de objetos contra exclusão e validação dos serviços de backup
que falharam no incidente seguem pendências, não cobertas pelo simples cutover.
