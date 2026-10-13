# Diagnóstico de capacidade da VPS — 13/10/2026

Inspeção somente leitura via SSH entre aproximadamente 07h40 e 07h52 BRT.
Titular relata lentidão desde 12/10 na ConnectyHub e Vision Home. Nenhuma
limpeza, reinicialização, alteração de limites ou contratação foi executada.

## Evidência observada

- Host `vmi3571281`: 8 CPUs, 23,47 GiB de RAM, sem swap; 67 containers ativos.
- Sistema de arquivos raiz: 290 GiB totais, 274 GiB usados, 16 GiB disponíveis,
  95% ocupado; inodes em 11%. Espaço precisa de manutenção, mas isso não prova,
  isoladamente, a causa de toda a lentidão.
- Memória disponível na amostra inicial: 9,4 GiB. Histórico sar de 12/10:
  CPU ociosa média 53,93%; 13/10 entre 06h e 10h40 UTC: 54,13% ociosa.
  Carga média aumentou frente a 11/10. Há picos, sem saturação global contínua
  demonstrada. Sem OOM ou erro de disco no kernel nas últimas 24 horas.
- `docker system df`: imagens 43,21 GB, dos quais 24,11 GB classificados como
  recuperáveis; 454 containers totais, 67 ativos. Recuperável não significa
  autorizado para exclusão: conferir imagens de rollback e política de retenção.
- Volumes do Inngest: Vision 53 GiB e ConnectyHub 26 GiB. Bancos lógicos de
  aproximadamente 52 e 25 GiB; principais tabelas são `spans`, `traces` e
  `history`. WAL de 256 e 80 MiB respectivamente, sem locks não concedidos na
  amostra. Portanto, o volume é principalmente histórico/telemetria persistida,
  não acúmulo de WAL. Não foi auditada a política de retenção do Inngest.
- Volume do builder ConnectyHub: 9,7 GiB; backups em `/var/backups`: cerca de
  20 GiB. Não somar esses números cegamente ao resumo Docker: há categorias
  sobrepostas. Levantamentos recursivos de alguns diretórios foram limitados por
  timeout; inventário completo de releases da Vision não concluído.
- Banco Inngest Vision limitado a 512 MiB e 0,25 CPU (`cpu.max 25000 100000`).
  Em amostra de 10 segundos, consumiu 2,489 segundos de CPU e sofreu throttling
  em 99 de 100 períodos. Evidência direta de restrição de processamento desse
  serviço, mesmo com folga global. Não prova causalidade para renderização da
  home nem para todos os painéis. Aplicação Vision sem limite explícito de CPU
  ou RAM, usando cerca de 4,3 GiB na amostra inicial.
- Aplicação ConnectyHub ativa com limite de 2 CPUs / 4 GiB; sem throttling na
  mesma amostra de 10 segundos. Histórico cumulativo contém throttling anterior,
  sem estabelecer que tenha coincidido com a reclamação.

## Respostas HTTP e limites do diagnóstico

Na máquina do usuário, duas rodadas de GET completas com curl retornaram 200:
login ConnectyHub em 0,60–0,61 s; home ConnectyHub em 0,72 s; home Vision no
domínio sem www em 0,95–0,98 s. Com www, incluindo redirecionamento, Vision em
1,38–1,59 s. Na VPS, health/login ConnectyHub e home Vision responderam 200
em cerca de 0,11–0,15 s em probes que leem apenas o início do corpo.

Esses testes medem HTTP/HTML; não validam carregamento de todas as mídias,
hidratação, navegação autenticada ou consultas dos painéis. Não houve teste
de envio WhatsApp, geração paga ou cobrança. Contagens de palavras de erro
nos logs não foram tratadas como diagnóstico causal.

## Próximos passos

1. Preparar limpeza com lista exata de imagens/releases obsoletos, preservando
   versões ativas, rollback, volumes e backups necessários. Não executar prune
   amplo ou excluir históricos sem definir retenção.
2. Revisar limite do banco Inngest Vision e preparar ajuste reversível no compose
   correto, considerando janela de recriação e preservação dos dados.
3. Definir retenção suportada para histórico/telemetria do Inngest e crescimento
   dos backups. Não executar DELETE/TRUNCATE/VACUUM FULL como atalho.
4. Se persistir a lentidão, medir os percursos autenticados indicados pelo titular
   e o carregamento de mídia/JavaScript da Vision Home. Reavaliar expansão da VPS
   após separar espaço recuperável, crescimento real e limites por serviço.
