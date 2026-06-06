param(
  [Parameter(Position = 0)]
  [ValidateRange(1, 12)]
  [int]$Part = 1,

  [switch]$List
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sqlPath = Join-Path $root "supabase\migrations\0005_billing_cost_centers.sql"

if (-not (Test-Path -LiteralPath $sqlPath)) {
  throw "Arquivo nao encontrado: $sqlPath"
}

$parts = @(
  @{ Part = 1;  Start = 1;   End = 91;  Label = "Tipos e tabelas provider_cost_centers/provider_features" },
  @{ Part = 2;  Start = 93;  End = 156; Label = "Tabelas provider_models, billing_rates, credit_wallets e limites" },
  @{ Part = 3;  Start = 157; End = 232; Label = "Tabelas usage_events, credit_transactions, customer_voices e generated_media" },
  @{ Part = 4;  Start = 233; End = 291; Label = "Indices e triggers" },
  @{ Part = 5;  Start = 292; End = 378; Label = "Funcao ensure_credit_wallet e grant_credit_wallet" },
  @{ Part = 6;  Start = 380; End = 463; Label = "Funcao debit_credit_wallet" },
  @{ Part = 7;  Start = 465; End = 519; Label = "RLS e policies de catalogo/rates" },
  @{ Part = 8;  Start = 520; End = 581; Label = "Policies de carteiras, eventos, vozes e midias" },
  @{ Part = 9;  Start = 583; End = 619; Label = "Seed dos centros de custo Gemini e ElevenLabs" },
  @{ Part = 10; Start = 621; End = 662; Label = "Seed dos recursos faturaveis" },
  @{ Part = 11; Start = 664; End = 714; Label = "Seed dos modelos Gemini e ElevenLabs" },
  @{ Part = 12; Start = 716; End = 752; Label = "Seed das tarifas iniciais" }
)

if ($List) {
  $parts | ForEach-Object {
    "{0,2}. linhas {1}-{2}: {3}" -f $_.Part, $_.Start, $_.End, $_.Label
  }
  exit 0
}

$selected = $parts | Where-Object { $_.Part -eq $Part } | Select-Object -First 1
$lines = Get-Content -LiteralPath $sqlPath
$sql = ($lines[($selected.Start - 1)..($selected.End - 1)] -join [Environment]::NewLine) + [Environment]::NewLine

Set-Clipboard -Value $sql

"Parte $Part copiada para a area de transferencia."
"Linhas $($selected.Start)-$($selected.End): $($selected.Label)"
"Agora cole no Supabase SQL Editor e rode."
