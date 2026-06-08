<#
FX-Service simple validation script

Run from the repository root (PowerShell):
  pwsh .\services\fx-service\validate_fx.ps1

What it does:
 - Ensures fx-service container is running via docker compose
 - Waits for /health
 - Performs first request (cache miss expected)
 - Performs second request (cache hit expected)
 - Saves responses and collects recent logs

Outputs: files under services/fx-service/evidence/
#>

Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$evidenceDir = Join-Path $scriptDir 'evidence'
if (-not (Test-Path $evidenceDir)) { New-Item -ItemType Directory -Path $evidenceDir | Out-Null }

$compose = 'infra/docker-compose.local.yml'
$service = 'fx-service'
$baseUrl = 'http://localhost:8001'

Write-Host "Starting $service via docker compose (if not running)" -ForegroundColor Cyan
docker compose -f $compose up --build -d $service | Out-Null

Write-Host "Waiting for health..." -ForegroundColor Cyan
for ($i=0; $i -lt 30; $i++) {
    try { $h = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 2 -ErrorAction Stop; if ($h.status -eq 'ok') { Write-Host 'Healthy' -ForegroundColor Green; break } }
    catch { Start-Sleep -Seconds 1 }
}

$firstFile = Join-Path $evidenceDir 'first.json'
Write-Host 'Performing first request (expect cache miss)...' -ForegroundColor Yellow
try { $r1 = Invoke-RestMethod -Uri "$baseUrl/rates/USD/EUR" -TimeoutSec 15; $r1 | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 $firstFile; Write-Host "Saved $firstFile" -ForegroundColor Green } catch { Write-Error "First request failed: $_" }

Start-Sleep -Seconds 1

$secondFile = Join-Path $evidenceDir 'second.json'
Write-Host 'Performing second request (expect cache hit)...' -ForegroundColor Yellow
try { $r2 = Invoke-RestMethod -Uri "$baseUrl/rates/USD/EUR" -TimeoutSec 15; $r2 | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 $secondFile; Write-Host "Saved $secondFile" -ForegroundColor Green } catch { Write-Error "Second request failed: $_" }

$logsFile = Join-Path $evidenceDir 'fx_logs.txt'
Write-Host 'Collecting logs...' -ForegroundColor Cyan
try { docker compose -f $compose logs --tail 200 $service | Out-File -Encoding UTF8 $logsFile; Write-Host "Saved logs to $logsFile" -ForegroundColor Green } catch { Write-Warning 'Could not collect logs.' }

Write-Host 'Done. Evidence directory:' $evidenceDir -ForegroundColor Cyan
if ($null -ne $r1) { Write-Host "first.cached = $($r1.cached)" }
if ($null -ne $r2) { Write-Host "second.cached = $($r2.cached)" }
