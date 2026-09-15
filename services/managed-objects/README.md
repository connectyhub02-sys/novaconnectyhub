# Objetos privados — etapa local

Sidecar independente em Node, sem SDK pago e sem credenciais de produção. Não está implantado na VPS. O catálogo e a autorização ficam na migration 0151; os bytes ficam em diretório privado do sidecar.

O backend valida a sessão e RLS, reserva quota e emite uma capability HMAC de curta duração vinculada a projeto, objeto, método, tamanho e SHA-256. Essa capability circula somente entre backend e sidecar. A chave de assinatura e caminhos privados não são enviados ao navegador.

O serviço aceita no máximo dois pedidos simultâneos e objetos de 20 MiB; a rota atual da aplicação limita cada envio a **1 MiB**. Objetos são imutáveis. Repetir o mesmo identificador e conteúdo não duplica uso; outro conteúdo é recusado. A exclusão grava tombstone antes de remover bytes, impedindo ressurreição por upload atrasado. Estados `pending` e `deleting` retêm quota até confirmação. Quotas incluem os arquivos anteriores do piloto.

## Execução local

`node scripts/managed-projects/pilot-objects.mjs` inicia listener somente em loopback 3081 e diretório temporário fictício. O piloto Vite usa credencial explicitamente fictícia. Nunca transportar essa configuração para produção.

`node scripts/managed-projects/object-smoke.mjs` verifica o percurso HTTP real da aplicação local ao sidecar. Os testes de objetos/catálogo cobrem integridade, isolamento, idempotência e exclusão. O teste `managed-joint-recovery` restaura catálogo e diretório em destinos separados, com escritores da fixture parados; não representa um backup online da produção.

## Limites e fechamento futuro

Ainda são necessários: coordenação operacional do backup, cópia externa privada, retenção, limpeza controlada de reservas abandonadas, teste de carga, montagem/permissões do volume no runtime alvo e política de rotação dos segredos. O upload pelo seletor do Chrome não foi validado porque a extensão recusou acesso ao arquivo local; o transporte HTTP e a renderização da lista foram testados separadamente. Nenhum serviço externo de armazenamento ou cliente real foi migrado.
