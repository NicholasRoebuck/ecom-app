# Stop only the listener started by this project's helper.
$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $PSScriptRoot 'target/stripe-listener.pid'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Output 'No project listener PID is recorded.'; exit 0 }
$listenerId = [int]([IO.File]::ReadAllText($pidPath).Trim())
$process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listenerId)
if (-not $process) { Write-Output 'The recorded listener has already stopped.'; exit 0 }
$expectedCliPath = Join-Path $PSScriptRoot 'target/stripe-cli/node_modules/.bin/stripe.cmd'
if (-not $process.CommandLine -or -not $process.CommandLine.Contains($expectedCliPath)) {
    throw 'The recorded PID no longer identifies this project listener. No process was stopped.'
}
& taskkill.exe /PID $listenerId /T /F
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the project listener.' }
Remove-Item -LiteralPath $pidPath
Write-Output 'The project Stripe listener stopped.'
