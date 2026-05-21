<#
.SYNOPSIS
  Bootstrap the entire HOA.africa platform on Railway from Windows PowerShell.

.DESCRIPTION
  Idempotent end-to-end:
    1. Links the local checkout to Railway project
       d436a63d-be9f-49dc-92a7-fd3215684a5f.
    2. Provisions the Postgres + Redis addons if they're not already there.
    3. Creates the four app services (hoa-api, hoa-enterprise,
       hoa-residents, hoa-marketing) if they're not already there. When
       $env:GITHUB_OWNER is set, services are wired to their GitHub repos
       so Railway auto-deploys on push.
    4. Generates the high-entropy secrets locally (JWT_SECRET,
       APP_ENCRYPTION_KEY, STORAGE_URL_SECRET, VAPID keypair) and pushes
       them to each service — only when the variable is currently unset,
       so re-runs never rotate live secrets.
    5. Wires every cross-service URL as a Railway reference variable
       ('${{ Service.RAILWAY_PUBLIC_DOMAIN }}') so renaming a service
       self-heals every consumer.

  All secret generation uses .NET's System.Security.Cryptography —
  no openssl required. Re-running is safe.

.PARAMETER GithubOwner
  Optional GitHub user/org. When supplied, each service is created with
  its repo wired on first create. Falls back to $env:GITHUB_OWNER.

.EXAMPLE
  .\scripts\setup-railway.ps1

.EXAMPLE
  $env:GITHUB_OWNER = 'kolagrey'
  .\scripts\setup-railway.ps1

.EXAMPLE
  .\scripts\setup-railway.ps1 -GithubOwner kolagrey

.NOTES
  Prerequisites:
    - Railway CLI v3.20+ ('railway --version' must work)
      install:  npm i -g @railway/cli
    - 'railway login' already done
    - Node 18+ on PATH (used only for VAPID keypair generation via
      'npx web-push generate-vapid-keys'). All other crypto is .NET-native.

  This script is the PowerShell twin of scripts/setup-railway.sh. Pick
  whichever fits the shell you're in — both produce the same result.
#>

[CmdletBinding()]
param(
    [string]$GithubOwner = $env:GITHUB_OWNER
)

# Stop on any unhandled error — equivalent to `set -e` in bash.
$ErrorActionPreference = 'Stop'

# Force UTF-8 so ▶ / ⚠ / ✗ render cleanly in both Windows PowerShell 5.1
# and PowerShell 7+. Some hosts default to the legacy ACP and would
# garble the glyphs otherwise.
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
$OutputEncoding = [System.Text.UTF8Encoding]::new()

# ---------- constants ----------
$PROJECT_ID    = 'd436a63d-be9f-49dc-92a7-fd3215684a5f'
$API_SERVICE   = 'hoa-api'
$ENT_SERVICE   = 'hoa-enterprise'
$RES_SERVICE   = 'hoa-residents'
$MKT_SERVICE   = 'hoa-marketing'
$DB_SERVICE    = 'Postgres'
$REDIS_SERVICE = 'Redis'

# ---------- repo linkage (optional) ----------
function Resolve-Repo {
    param([string]$EnvName, [string]$DefaultRepoName)
    $explicit = [Environment]::GetEnvironmentVariable($EnvName)
    if ($explicit) { return $explicit }
    if ($GithubOwner) { return "$GithubOwner/$DefaultRepoName" }
    return ''
}
$HOA_API_REPO        = Resolve-Repo 'HOA_API_REPO'        'HOA-API'
$HOA_ENTERPRISE_REPO = Resolve-Repo 'HOA_ENTERPRISE_REPO' 'HOA-ENTERPRISE'
$HOA_RESIDENTS_REPO  = Resolve-Repo 'HOA_RESIDENTS_REPO'  'HOA-RESIDENTS'
$HOA_MARKETING_REPO  = Resolve-Repo 'HOA_MARKETING_REPO'  'HOA-MARKETING'

# ---------- helpers ----------
function Write-Step { param($Msg) Write-Host "▶ $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "⚠ $Msg" -ForegroundColor Yellow }
function Stop-WithError {
    param($Msg)
    Write-Host "✗ $Msg" -ForegroundColor Red
    exit 1
}

function Assert-Tool {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Stop-WithError "Missing dependency: $Name. Install it and make sure it's on PATH for this PowerShell session. Node.js: https://nodejs.org. Railway CLI: 'npm i -g @railway/cli'."
    }
}

# Reference-variable helper. Railway resolves '${{ Service.VAR }}' at
# deploy time, so renaming a service self-heals every consumer that
# references it. The literal `$` would expand in PowerShell double-quoted
# strings, so we always build these via concatenation off a single-quoted
# template.
function Get-RailwayRef {
    param([string]$Service, [string]$Var)
    return '${{ ' + $Service + '.' + $Var + ' }}'
}

# Capture stdout from a native command without losing the exit code.
# Out-String pipelines occasionally insert a trailing CRLF that breaks
# JSON parsing on PS 5.1, so we trim defensively.
function Invoke-Native {
    param([string]$Exe, [string[]]$ArgList, [switch]$IgnoreStderr)
    $stderrTarget = if ($IgnoreStderr) { 'SilentlyContinue' } else { 'Continue' }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Exe @ArgList 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return [PSCustomObject]@{
        Output   = ($output | Out-String).TrimEnd()
        ExitCode = $exitCode
    }
}

# ---------- service discovery ----------
function Get-RailwayServices {
    $result = Invoke-Native 'railway' @('status','--json') -IgnoreStderr
    if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.Output)) {
        return @()
    }
    try {
        $data = $result.Output | ConvertFrom-Json
    } catch {
        return @()
    }
    # Railway CLI output shape varies by version. Try the known shapes;
    # an unknown shape returns empty and the caller will attempt to
    # provision (which would itself fail loudly on a real conflict).
    $services = @()
    if ($data.services -and $data.services.edges) {
        $services = $data.services.edges | ForEach-Object { $_.node.name }
    } elseif ($data.services -is [System.Array]) {
        $services = $data.services | ForEach-Object { $_.name }
    } elseif ($data.project -and $data.project.services -and $data.project.services.edges) {
        $services = $data.project.services.edges | ForEach-Object { $_.node.name }
    }
    return @($services | Where-Object { $_ })
}

function Test-RailwayService {
    param([string]$Name)
    return ((Get-RailwayServices) -contains $Name)
}

function Confirm-Database {
    param([string]$Kind, [string]$Name)
    if (Test-RailwayService $Name) {
        Write-Step "Database '$Name' already provisioned, skipping."
        return
    }
    Write-Step "Provisioning $Name ($Kind) addon…"
    # `railway add --database <kind>` provisions + names the service
    # after the kind by default ('Postgres', 'Redis') — case matches
    # the reference vars downstream.
    $r = Invoke-Native 'railway' @('add','--database',$Kind) -IgnoreStderr
    if ($r.ExitCode -ne 0) {
        Stop-WithError "Failed to provision ${Name}. Run 'railway add --database $Kind' manually to see the underlying error."
    }
}

function Confirm-AppService {
    param([string]$Name, [string]$Repo)
    if (Test-RailwayService $Name) {
        Write-Step "Service '$Name' already exists, skipping create."
        return
    }
    if ($Repo) {
        Write-Step "Creating service '$Name' wired to $Repo…"
        $r = Invoke-Native 'railway' @('add','--service',$Name,'--repo',$Repo) -IgnoreStderr
        if ($r.ExitCode -ne 0) {
            # Fallback to empty service so the bootstrap doesn't bail —
            # operator can wire the repo via UI afterward.
            Write-Warn "Could not wire $Repo (private repo / unauthorised?); creating empty service '$Name'."
            $r = Invoke-Native 'railway' @('add','--service',$Name) -IgnoreStderr
            if ($r.ExitCode -ne 0) { Stop-WithError "Could not create service '$Name'." }
        }
    } else {
        Write-Step "Creating empty service '$Name' (no GITHUB_OWNER set)…"
        $r = Invoke-Native 'railway' @('add','--service',$Name) -IgnoreStderr
        if ($r.ExitCode -ne 0) { Stop-WithError "Could not create service '$Name'." }
    }
}

# ---------- variable helpers ----------
function Set-RailwayVar {
    param([string]$Service, [string]$Key, [string]$Value)
    # `railway variables --set "KEY=VALUE"` is an upsert; safe to re-run.
    $r = Invoke-Native 'railway' @('variables','--service',$Service,'--set',"$Key=$Value") -IgnoreStderr
    if ($r.ExitCode -ne 0) {
        Stop-WithError "Failed to set $Key on $Service. Railway said: $($r.Output)"
    }
}

function Get-RailwayVar {
    param([string]$Service, [string]$Key)
    $r = Invoke-Native 'railway' @('variables','--service',$Service,'--json') -IgnoreStderr
    if ($r.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($r.Output)) {
        return ''
    }
    try {
        $data = $r.Output | ConvertFrom-Json
    } catch {
        return ''
    }
    # Railway may emit a flat map { KEY: VALUE } or an edge list.
    if ($data -and ($data.PSObject.Properties.Name -contains $Key)) {
        return [string]$data.$Key
    }
    if ($data -and $data.variables -and $data.variables.edges) {
        $node = $data.variables.edges | Where-Object { $_.node.name -eq $Key } | Select-Object -First 1
        if ($node) { return [string]$node.node.value }
    }
    return ''
}

# Set ONLY if currently unset. High-entropy secrets use this so re-running
# the script doesn't rotate them and invalidate live sessions.
function Set-RailwayVarIfUnset {
    param([string]$Service, [string]$Key, [string]$Value)
    $existing = Get-RailwayVar $Service $Key
    if ([string]::IsNullOrEmpty($existing)) {
        Set-RailwayVar $Service $Key $Value
        Write-Step "  → set $Key on $Service"
    } else {
        Write-Step "  → $Key already set on $Service, preserving"
    }
}

# ---------- secret generators (.NET, no openssl needed) ----------
function New-HexSecret {
    param([int]$Bytes = 32)
    $buf = [byte[]]::new($Bytes)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return ([System.BitConverter]::ToString($buf) -replace '-','').ToLowerInvariant()
}

function New-Base64Secret {
    param([int]$Bytes = 32)
    $buf = [byte[]]::new($Bytes)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return [Convert]::ToBase64String($buf)
}

# ---------- pre-flight ----------
Assert-Tool 'railway'
Assert-Tool 'node'
Assert-Tool 'npx'

$railwayVersion = (Invoke-Native 'railway' @('--version') -IgnoreStderr).Output
Write-Step "Railway CLI version: $railwayVersion"

$whoami = Invoke-Native 'railway' @('whoami') -IgnoreStderr
if ($whoami.ExitCode -ne 0) {
    Stop-WithError "Not logged in. Run 'railway login' first."
}

Write-Step "Linking checkout to project $PROJECT_ID…"
# Railway CLI v4 dropped the positional project arg in favour of
# `--project <id>`. Try v4 first, fall back to v3's positional syntax
# so the script keeps working for operators on older CLI versions.
$link = Invoke-Native 'railway' @('link','--project',$PROJECT_ID) -IgnoreStderr
if ($link.ExitCode -ne 0) {
    $link = Invoke-Native 'railway' @('link',$PROJECT_ID) -IgnoreStderr
}
if ($link.ExitCode -ne 0) {
    Stop-WithError "Could not link project $PROJECT_ID. Railway said: $($link.Output)"
}

# ---------- provision services ----------
Write-Step "Ensuring database addons…"
Confirm-Database 'postgres' $DB_SERVICE
Confirm-Database 'redis'    $REDIS_SERVICE

Write-Step "Ensuring app services…"
Confirm-AppService $API_SERVICE $HOA_API_REPO
Confirm-AppService $ENT_SERVICE $HOA_ENTERPRISE_REPO
Confirm-AppService $RES_SERVICE $HOA_RESIDENTS_REPO
Confirm-AppService $MKT_SERVICE $HOA_MARKETING_REPO

# ---------- generate candidate secrets ----------
Write-Step "Generating candidate secrets (only applied if currently unset)…"
$JWT_SECRET         = New-HexSecret 32
$APP_ENCRYPTION_KEY = New-Base64Secret 32   # 32-byte AES-256 key
$STORAGE_URL_SECRET = New-HexSecret 32

Write-Step "Generating candidate VAPID keypair (only applied if currently unset)…"
$vapidRaw = (Invoke-Native 'npx' @('--yes','web-push','generate-vapid-keys','--json') -IgnoreStderr).Output
try {
    $vapid = $vapidRaw | ConvertFrom-Json
    $VAPID_PUBLIC_KEY  = $vapid.publicKey
    $VAPID_PRIVATE_KEY = $vapid.privateKey
} catch {
    Stop-WithError "VAPID generation failed. 'npx --yes web-push generate-vapid-keys --json' returned: $vapidRaw"
}

# ---------- HOA-API ----------
Write-Step "Setting HOA-API ($API_SERVICE) variables…"

# Reference variables (resolved by Railway at deploy time).
Set-RailwayVar $API_SERVICE 'DATABASE_URL' (Get-RailwayRef $DB_SERVICE    'DATABASE_URL')
Set-RailwayVar $API_SERVICE 'REDIS_URL'    (Get-RailwayRef $REDIS_SERVICE 'REDIS_URL')

Set-RailwayVar $API_SERVICE 'NODE_ENV'       'production'
Set-RailwayVar $API_SERVICE 'JWT_EXPIRES_IN' '24h'

# Secrets — preserved across reruns so live sessions don't die.
Set-RailwayVarIfUnset $API_SERVICE 'JWT_SECRET'         $JWT_SECRET
Set-RailwayVarIfUnset $API_SERVICE 'APP_ENCRYPTION_KEY' $APP_ENCRYPTION_KEY
Set-RailwayVarIfUnset $API_SERVICE 'STORAGE_URL_SECRET' $STORAGE_URL_SECRET
Set-RailwayVarIfUnset $API_SERVICE 'VAPID_PUBLIC_KEY'   $VAPID_PUBLIC_KEY
Set-RailwayVarIfUnset $API_SERVICE 'VAPID_PRIVATE_KEY'  $VAPID_PRIVATE_KEY

# CORS allow-list — comma-separated, built from reference vars so renaming
# any of the three front-ends propagates without touching CORS.
$corsParts = @(
    'https://' + (Get-RailwayRef $ENT_SERVICE 'RAILWAY_PUBLIC_DOMAIN'),
    'https://' + (Get-RailwayRef $RES_SERVICE 'RAILWAY_PUBLIC_DOMAIN'),
    'https://' + (Get-RailwayRef $MKT_SERVICE 'RAILWAY_PUBLIC_DOMAIN')
)
Set-RailwayVar $API_SERVICE 'CORS_ORIGIN' ($corsParts -join ',')

# Email links — must be fully-qualified so users can click from any inbox.
Set-RailwayVar $API_SERVICE 'APP_ENTERPRISE_URL' ('https://' + (Get-RailwayRef $ENT_SERVICE 'RAILWAY_PUBLIC_DOMAIN'))
Set-RailwayVar $API_SERVICE 'APP_RESIDENTS_URL'  ('https://' + (Get-RailwayRef $RES_SERVICE 'RAILWAY_PUBLIC_DOMAIN'))

Set-RailwayVar $API_SERVICE 'VAPID_SUBJECT'   'mailto:notifications@hoa.africa'
Set-RailwayVar $API_SERVICE 'OPENAI_MODEL'    'gpt-4o-mini'
Set-RailwayVar $API_SERVICE 'ANTHROPIC_MODEL' 'claude-3-5-sonnet-20241022'
Set-RailwayVar $API_SERVICE 'MAIL_FROM'       'HOA.africa <noreply@metasession.co>'
# Storage must be a mounted Volume path. Attach the volume in the
# Railway dashboard (Settings → Volumes → New Volume, mount /data/storage).
Set-RailwayVar $API_SERVICE 'STORAGE_ROOT'    '/data/storage'

# ---------- HOA-ENTERPRISE ----------
Write-Step "Setting HOA-ENTERPRISE ($ENT_SERVICE) variables…"
$apiBase = 'https://' + (Get-RailwayRef $API_SERVICE 'RAILWAY_PUBLIC_DOMAIN') + '/api'
$entBase = 'https://' + (Get-RailwayRef $ENT_SERVICE 'RAILWAY_PUBLIC_DOMAIN')
$resBase = 'https://' + (Get-RailwayRef $RES_SERVICE 'RAILWAY_PUBLIC_DOMAIN')
$mktBase = 'https://' + (Get-RailwayRef $MKT_SERVICE 'RAILWAY_PUBLIC_DOMAIN')

Set-RailwayVar $ENT_SERVICE 'NODE_ENV'                    'production'
Set-RailwayVar $ENT_SERVICE 'NEXT_PUBLIC_API_URL'         $apiBase
Set-RailwayVar $ENT_SERVICE 'NEXT_PUBLIC_ENTERPRISE_URL'  $entBase
Set-RailwayVar $ENT_SERVICE 'NEXT_PUBLIC_RESIDENTS_URL'   $resBase
Set-RailwayVar $ENT_SERVICE 'NEXT_PUBLIC_MARKETING_URL'   $mktBase
Set-RailwayVar $ENT_SERVICE 'NEXT_PUBLIC_POSTHOG_HOST'    'https://us.i.posthog.com'

# ---------- HOA-RESIDENTS ----------
Write-Step "Setting HOA-RESIDENTS ($RES_SERVICE) variables…"
Set-RailwayVar $RES_SERVICE 'NODE_ENV'                    'production'
Set-RailwayVar $RES_SERVICE 'NEXT_PUBLIC_API_URL'         $apiBase
Set-RailwayVar $RES_SERVICE 'NEXT_PUBLIC_ENTERPRISE_URL'  $entBase
Set-RailwayVar $RES_SERVICE 'NEXT_PUBLIC_RESIDENTS_URL'   $resBase
Set-RailwayVar $RES_SERVICE 'NEXT_PUBLIC_MARKETING_URL'   $mktBase
Set-RailwayVar $RES_SERVICE 'NEXT_PUBLIC_POSTHOG_HOST'    'https://us.i.posthog.com'

# Source the VAPID public key from whatever ended up persisted on the API
# (not the candidate we just generated) so the resident PWA's public key
# always matches the API's private key, even across reruns.
$effectivePublic = Get-RailwayVar $API_SERVICE 'VAPID_PUBLIC_KEY'
if ([string]::IsNullOrEmpty($effectivePublic)) { $effectivePublic = $VAPID_PUBLIC_KEY }
Set-RailwayVar $RES_SERVICE 'NEXT_PUBLIC_VAPID_KEY' $effectivePublic

# ---------- HOA-MARKETING ----------
Write-Step "Setting HOA-MARKETING ($MKT_SERVICE) variables…"
Set-RailwayVar $MKT_SERVICE 'NODE_ENV'             'production'
Set-RailwayVar $MKT_SERVICE 'VITE_ENTERPRISE_URL'  $entBase
Set-RailwayVar $MKT_SERVICE 'VITE_RESIDENTS_URL'   $resBase

# ---------- summary ----------
Write-Host ''
Write-Host '✓ Project bootstrapped.' -ForegroundColor Green
Write-Host ''
Write-Host @"
Still required (set these manually in the Railway dashboard → service → Variables):

  HOA-API ($API_SERVICE):
    OPENAI_API_KEY          ← https://platform.openai.com/api-keys
    ANTHROPIC_API_KEY       ← (optional fallback)
    RESEND_API_KEY          ← https://resend.com/api-keys
    RESEND_WEBHOOK_SECRET   ← (optional, if Resend webhook is wired)
    PAYSTACK_SECRET_KEY     ← https://dashboard.paystack.com/#/settings/developer
    PAYSTACK_PUBLIC_KEY     ← (same dashboard)
    SENTRY_DSN              ← (optional)
    POSTHOG_API_KEY         ← (optional)
    METRICS_BEARER          ← (optional; locks /metrics scrape)

  HOA-ENTERPRISE ($ENT_SERVICE):
    NEXT_PUBLIC_SENTRY_DSN  ← (optional)
    NEXT_PUBLIC_POSTHOG_KEY ← (optional)

  HOA-RESIDENTS ($RES_SERVICE):
    NEXT_PUBLIC_SENTRY_DSN  ← (optional)
    NEXT_PUBLIC_POSTHOG_KEY ← (optional)

Next steps:
  1. Set the manual vars above.
  2. Attach a Volume to $API_SERVICE at mount path /data/storage
     (Settings → Volumes → New Volume, 5GB+). Railway CLI doesn't
     manage volumes yet, so this is a one-click UI step.
  3. If you didn't pass -GithubOwner / `$env:GITHUB_OWNER, connect each
     app service to its GitHub repo via Settings → Source. Otherwise
     deploys are already wired and trigger on every git push.
  4. Trigger an initial deploy: push to the linked branch, or run
     'railway up --service <name>' from each app's directory.
  5. (Optional) Map custom domains: api.hoa.africa, admin.hoa.africa,
     app.hoa.africa, hoa.africa — then overwrite CORS_ORIGIN +
     APP_*_URL to point at them instead of *.up.railway.app.

See RAILWAY_DEPLOY.md for the full operator runbook.
"@
