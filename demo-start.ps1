$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$docker = 'C:\Users\khale\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
$containerName = 'nuvik-dev-postgres'
$serverDir = Join-Path $root 'server'
$serverEnvPath = Join-Path $serverDir '.env'
$frontendEnvPath = Join-Path $root '.env.local'
$databaseEnvPath = Join-Path $root '.local\postgres.env'
$credentialsPath = Join-Path $root '.local\demo-credentials.txt'
$processIdsPath = Join-Path $root '.local\demo-processes.json'

function Stop-LauncherProcesses([int[]]$rootIds) {
  $processes = Get-CimInstance Win32_Process
  $ownedIds = New-Object 'System.Collections.Generic.HashSet[int]'
  foreach ($rootId in $rootIds) {
    $rootProcess = $processes | Where-Object { $_.ProcessId -eq $rootId }
    if ($rootProcess -and $rootProcess.Name -eq 'powershell.exe') { [void]$ownedIds.Add($rootId) }
  }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $processes) {
      if ($ownedIds.Contains([int]$process.ParentProcessId) -and -not $ownedIds.Contains([int]$process.ProcessId)) {
        [void]$ownedIds.Add([int]$process.ProcessId)
        $changed = $true
      }
    }
  }
  foreach ($processId in @($ownedIds | ForEach-Object { $_ })) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
}

foreach ($file in @($serverEnvPath, $frontendEnvPath, $databaseEnvPath, $credentialsPath)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Required ignored local configuration is missing: $file"
  }
}

$serverEnv = Get-Content -LiteralPath $serverEnvPath -Raw
$frontendEnv = Get-Content -LiteralPath $frontendEnvPath -Raw
if ($serverEnv -notmatch '(?m)^DATABASE_URL=postgres://[^@\r\n]+@127\.0\.0\.1:55432/nuvik_dev\s*$') {
  throw 'server/.env must contain the expected local database connection on 127.0.0.1:55432.'
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
  & $docker exec $containerName pg_isready -U postgres -d nuvik_demo *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'nuvik_demo did not become ready.' }
$demoExists = & $docker exec $containerName psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='nuvik_demo'"
if ($LASTEXITCODE -ne 0 -or -not $demoExists) { throw 'nuvik_demo is missing. Run .\demo-seed.ps1 first to create and seed it.' }

$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4108, 5178 }
if ($listeners) { throw 'Port 4108 or 5178 is already in use. Close the existing app process before starting the demo.' }

Push-Location $serverDir
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Server build failed; the API was not started.' }
} finally { Pop-Location }

$apiCommand = @"
Set-Location -LiteralPath '$serverDir'
`$line = Get-Content -LiteralPath '.env' | Where-Object { `$_ -match '^DATABASE_URL=' } | Select-Object -First 1
`$sourceUri = [Uri](`$line.Substring('DATABASE_URL='.Length).Trim().Trim('"'))
`$builder = [UriBuilder]`$sourceUri
`$builder.Path = '/nuvik_demo'
`$env:DATABASE_URL = `$builder.Uri.AbsoluteUri
`$env:API_HOST = '127.0.0.1'
`$env:PORT = '4108'
node .\dist\index.js
"@
$viteCommand = "Set-Location -LiteralPath '$root'; npm run dev -- --host 127.0.0.1 --port 5178"
$apiProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $apiCommand) -WorkingDirectory $serverDir -PassThru
$viteProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $viteCommand) -WorkingDirectory $root -PassThru
@{ apiPowerShellPid = $apiProcess.Id; vitePowerShellPid = $viteProcess.Id } | ConvertTo-Json | Set-Content -LiteralPath $processIdsPath

$apiHealthy = $false
$viteHealthy = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  if (-not $apiHealthy) { try { $apiBody = & curl.exe --noproxy '*' --silent --show-error --max-time 2 'http://127.0.0.1:4108/api/health'; $apiHealthy = ($LASTEXITCODE -eq 0 -and $apiBody -match '"ok"\s*:\s*true') } catch {} }
  if (-not $viteHealthy) { try { $viteCode = & curl.exe --noproxy '*' --silent --output NUL --write-out '%{http_code}' --max-time 2 'http://127.0.0.1:5178'; $viteHealthy = ($LASTEXITCODE -eq 0 -and $viteCode -eq '200') } catch {} }
  if ($apiHealthy -and $viteHealthy) { break }
  Start-Sleep -Seconds 1
}
if (-not ($apiHealthy -and $viteHealthy)) {
  Stop-LauncherProcesses @($apiProcess.Id, $viteProcess.Id)
  throw 'Demo server health check failed; the API/Vite processes started by this launcher were stopped.'
}

Write-Host 'Nuvik Vet demo started in separate API and Vite windows.'
Write-Host 'Frontend: http://localhost:5178'
Write-Host 'API: http://localhost:4108'
Write-Host 'Demo login credentials are in the ignored .local/demo-credentials.txt file; values were not displayed.'
