$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$docker = 'C:\Users\khale\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
$containerName = 'nuvik-dev-postgres'
$serverDir = Join-Path $root 'server'
$serverEnvPath = Join-Path $serverDir '.env'
$frontendEnvPath = Join-Path $root '.env.local'
$databaseEnvPath = Join-Path $root '.local\postgres.env'
$credentialsPath = Join-Path $root '.local\bootstrap-credentials.txt'

foreach ($file in @($serverEnvPath, $frontendEnvPath, $databaseEnvPath, $credentialsPath)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Required ignored local configuration is missing: $file"
  }
}

$serverEnv = Get-Content -LiteralPath $serverEnvPath -Raw
$frontendEnv = Get-Content -LiteralPath $frontendEnvPath -Raw
if ($serverEnv -notmatch '(?m)^DATABASE_URL=postgres://[^@\r\n]+@127\.0\.0\.1:55432/nuvik_dev\s*$') {
  throw 'server/.env must point to the local nuvik_dev database on 127.0.0.1:55432.'
}
if ($serverEnv -notmatch '(?m)^JWT_SECRET=(?!\s*$|CHANGE_ME\s*$).+') {
  throw 'server/.env must contain a generated JWT_SECRET.'
}
if ($frontendEnv -notmatch '(?m)^VITE_AUTH_STORAGE_KEY=nuvik_vet_auth_token\s*$') {
  throw '.env.local must contain the Nuvik Vet browser storage key.'
}

if (-not (Test-Path -LiteralPath $docker -PathType Leaf)) { throw 'Docker Desktop executable was not found.' }
$dockerVersion = & $docker version --format '{{.Server.Version}}' 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Docker Engine is not reachable. Start Docker Desktop and retry.' }

$container = & $docker ps -a --filter "name=^$containerName$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0 -or $container -ne $containerName) { throw 'The nuvik-dev-postgres container does not exist; use the isolated setup task first.' }
$running = & $docker inspect --format '{{.State.Running}}' $containerName
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Nuvik development database container.' }
if ($running -ne 'true') {
  & $docker start $containerName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start nuvik-dev-postgres.' }
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  & $docker exec $containerName pg_isready -U postgres -d nuvik_dev *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'nuvik_dev did not become ready.' }

$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4108, 5178 }
if ($listeners) { throw 'Port 4108 or 5178 is already in use. Close the existing app process before starting the demo.' }

Push-Location $serverDir
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Server build failed; the API was not started.' }
} finally { Pop-Location }

$apiCommand = "Set-Location -LiteralPath '$serverDir'; `$env:PORT='4108'; node .\dist\index.js"
$viteCommand = "Set-Location -LiteralPath '$root'; npm run dev -- --host 127.0.0.1 --port 5178"
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $apiCommand) -WorkingDirectory $serverDir | Out-Null
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $viteCommand) -WorkingDirectory $root | Out-Null

Write-Host 'Nuvik Vet demo started in separate API and Vite windows.'
Write-Host 'Frontend: http://localhost:5178'
Write-Host 'API: http://localhost:4108'
Write-Host 'Local credentials were read from ignored files and were not displayed.'
