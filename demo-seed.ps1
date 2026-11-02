param([switch]$Reset)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$serverDir = Join-Path $root 'server'
$serverEnvPath = Join-Path $serverDir '.env'
if (-not (Test-Path -LiteralPath $serverEnvPath -PathType Leaf)) { throw 'server/.env is required.' }
$databaseLine = Get-Content -LiteralPath $serverEnvPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $databaseLine) { throw 'DATABASE_URL is missing from server/.env.' }
$sourceUrl = $databaseLine.Substring('DATABASE_URL='.Length).Trim().Trim('"')
$sourceUri = [Uri]$sourceUrl
if ($sourceUri.Host -notin @('127.0.0.1','localhost') -or $sourceUri.Port -ne 55432 -or $sourceUri.AbsolutePath -ne '/nuvik_dev') {
  throw 'Demo seed requires the expected local nuvik_dev connection as its source URL.'
}
$builder = [UriBuilder]$sourceUri
$builder.Path = '/nuvik_demo'
$env:DATABASE_URL = $builder.Uri.AbsoluteUri
$env:NUVIK_DOCKER_PATH = 'C:\Users\khale\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
Push-Location $serverDir
try {
  if ($Reset) { npm run demo:seed -- --reset } else { npm run demo:seed }
  if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed. Check the non-secret error above.' }
} finally { Pop-Location }
