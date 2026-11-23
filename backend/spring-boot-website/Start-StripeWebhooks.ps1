# Start local, test-mode Stripe webhook forwarding without printing credentials.
$ErrorActionPreference = 'Stop'
$backendRoot = $PSScriptRoot
$settingsPath = Join-Path $backendRoot 'src/main/resources/application.properties'
$settings = [IO.File]::ReadAllText($settingsPath)
$testKeyMatch = [regex]::Match($settings, '(?m)^stripe\.key\.secret\s*=\s*(sk_test_[A-Za-z0-9]+)\s*$')
if (-not $testKeyMatch.Success) { throw 'A Stripe test secret key must be configured locally. Live keys are not accepted.' }
$portMatch = [regex]::Match($settings, '(?m)^server\.port\s*=\s*(\d+)\s*$')
if (-not $portMatch.Success) { throw 'A local backend server.port must be configured.' }
$cliPath = Join-Path $backendRoot 'target/stripe-cli/node_modules/.bin/stripe.cmd'
if (-not (Test-Path -LiteralPath $cliPath)) {
    throw 'Install the official CLI with: npm install --prefix target/stripe-cli --no-save --package-lock=false @stripe/cli'
}
$listenerRunning = $false
$pidPath = Join-Path $backendRoot 'target/stripe-listener.pid'
if (Test-Path -LiteralPath $pidPath) {
    $listenerId = [int]([IO.File]::ReadAllText($pidPath).Trim())
    $listenerProcess = Get-Process -Id $listenerId -ErrorAction SilentlyContinue
    if ($listenerProcess) { $listenerRunning = $true }
}
$stdoutPath = Join-Path $backendRoot 'target/stripe-listener.stdout.log'
$stderrPath = Join-Path $backendRoot 'target/stripe-listener.stderr.log'
$previousApiKey = $env:STRIPE_API_KEY
if (-not $listenerRunning) {
try {
    $env:STRIPE_API_KEY = $testKeyMatch.Groups[1].Value
    $endpoint = 'https://localhost:' + $portMatch.Groups[1].Value + '/api/checkout/webhook'
    $listener = Start-Process -FilePath $cliPath -WorkingDirectory $backendRoot -WindowStyle Hidden -PassThru -ArgumentList @(
        'listen', '--events', 'payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed,payment_intent.requires_action,payment_intent.canceled',
        '--forward-to', $endpoint, '--skip-verify'
    ) -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    [IO.File]::WriteAllText($pidPath, [string]$listener.Id)
} finally { $env:STRIPE_API_KEY = $previousApiKey }
}
function Read-ListenerLog([string]$LogPath) {
    if (-not (Test-Path -LiteralPath $LogPath)) { return '' }
    try {
        $stream = [IO.FileStream]::new($LogPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $reader = [IO.StreamReader]::new($stream)
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } catch [IO.IOException] { return '' }
}
$signingSecret = $null
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 250
    $log = ''
    $log += Read-ListenerLog $stdoutPath
    $log += Read-ListenerLog $stderrPath
    $secretMatch = [regex]::Match($log, 'whsec_[A-Za-z0-9]+')
    if ($secretMatch.Success) { $signingSecret = $secretMatch.Value; break }
}
if (-not $signingSecret) { throw 'Listener did not become ready. Inspect the ignored target/stripe-listener logs locally; do not share credentials.' }
if ($settings -match '(?m)^stripe\.webhook\.secret\s*=') {
    $settings = [regex]::Replace($settings, '(?m)^stripe\.webhook\.secret\s*=.*$', 'stripe.webhook.secret=' + $signingSecret)
} else { $settings += "`nstripe.webhook.secret=" + $signingSecret + "`n" }
[IO.File]::WriteAllText($settingsPath, $settings)
Write-Output 'Test-mode Stripe webhook forwarding is ready. The signing secret was saved in ignored local application.properties.'
Write-Output 'Restart the backend to load the secret. Listener credentials/logs remain under the ignored target folder.'
