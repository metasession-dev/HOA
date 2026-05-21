<#
.SYNOPSIS
  Bootstrap the HOA.africa monorepo on Railway from Windows PowerShell.

.DESCRIPTION
  Idempotent end-to-end. All four apps live in a single GitHub repo
  (github.com/metasession-dev/HOA) with this folder layout:

      HOA-API/           → Railway service: hoa-api
      HOA-ENTERPRISE/    → Railway service: hoa-enterprise
      HOA-RESIDENTS/     → Railway service: hoa-residents
      HOA-MARKETING/     → Railway service: hoa-marketing

  Steps:
    1. Links the local checkout to Railway project
       132485f6-967c-4586-a477-85c955fba43b.
    2. Provisions the Postgres + Redis addons if they're not already there.
    3. Creates the four app services if they're not already there, all
       wired to the same GitHub repo. Each service gets its build Root
       Directory set to its subfolder (HOA-API/, HOA-ENTERPRISE/, ...)
       via the --root-directory CLI flag where supported, falling back
       to RAILWAY_ROOT_DIRECTORY as a build-time variable. If neither
       takes effect, the dashboard step is documented in the summary.
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
  Optional override for the GitHub owner. Defaults to 'metasession-dev'
  (the canonical home of the monorepo). Also honours $env:GITHUB_OWNER.

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
    # Defaults to the canonical monorepo owner. Override only if you
    # forked or mirrored the repo somewhere else.
    [string]$GithubOwner = $(if ($env:GITHUB_OWNER) { $env:GITHUB_OWNER } else { 'metasession-dev' }),
    # The repo name within the owner. Override if your fork uses a
    # different name than the canonical 'HOA'.
    [string]$Repo = $(if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { 'HOA' })
)

# Stop on any unhandled error — equivalent to `set -e` in bash.
$ErrorActionPreference = 'Stop'

# Force UTF-8 so ▶ / ⚠ / ✗ render cleanly in both Windows PowerShell 5.1
# and PowerShell 7+. Some hosts default to the legacy ACP and would
# garble the glyphs otherwise.
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
$OutputEncoding = [System.Text.UTF8Encoding]::new()

# ---------- constants ----------
$PROJECT_ID    = '132485f6-967c-4586-a477-85c955fba43b'
$API_SERVICE   = 'hoa-api'
$ENT_SERVICE   = 'hoa-enterprise'
$RES_SERVICE   = 'hoa-residents'
$MKT_SERVICE   = 'hoa-marketing'
$DB_SERVICE    = 'Postgres'
$REDIS_SERVICE = 'Redis'

# ---------- monorepo layout ----------
# Single GitHub repo houses all four apps. Each Railway service builds
# from its own subfolder, configured via --root-directory on create
# (with RAILWAY_ROOT_DIRECTORY as a fallback env var if the CLI flag
# isn't recognised — see Confirm-AppService).
$MONOREPO       = "$GithubOwner/$Repo"
$API_ROOT       = 'HOA-API'
$ENT_ROOT       = 'HOA-ENTERPRISE'
$RES_ROOT       = 'HOA-RESIDENTS'
$MKT_ROOT       = 'HOA-MARKETING'

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
#
# Retries transient-looking failures (TLS handshake glitches like
# BadRecordMac, 5xx, connection-reset) with exponential backoff — these
# show up sporadically when hitting Railway's GraphQL endpoint through
# corporate firewalls or flaky home Wi-Fi, and aborting the whole
# bootstrap because of one bad TCP connection is the wrong default.
function Invoke-Native {
    param(
        [string]$Exe,
        [string[]]$ArgList,
        [switch]$IgnoreStderr,
        [int]$MaxAttempts = 4
    )
    $transientPattern = 'BadRecordMac|Failed to fetch|connection (error|reset|refused)|client error \(SendRequest\)|timed? out|temporarily unavailable|502 Bad Gateway|503 Service|504 Gateway'
    $attempt = 0
    while ($true) {
        $attempt++
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $output = & $Exe @ArgList 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previous
        }
        $combined = ($output | Out-String).TrimEnd()

        if ($exitCode -eq 0) {
            return [PSCustomObject]@{ Output = $combined; ExitCode = $exitCode }
        }

        $isTransient = $combined -match $transientPattern
        if ($isTransient -and $attempt -lt $MaxAttempts) {
            $delay = [int]([Math]::Min(8, [Math]::Pow(2, $attempt)))
            Write-Warn "  Transient Railway failure (attempt $attempt/$MaxAttempts) — retrying in ${delay}s…"
            Start-Sleep -Seconds $delay
            continue
        }
        return [PSCustomObject]@{ Output = $combined; ExitCode = $exitCode }
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
    param(
        [string]$Name,
        [string]$Repo,
        [string]$RootDirectory   # subfolder within the monorepo to build from
    )
    if (Test-RailwayService $Name) {
        Write-Step "Service '$Name' already exists, skipping create."
        return
    }
    if (-not $Repo) {
        Write-Step "Creating empty service '$Name' (no monorepo wired)…"
        $r = Invoke-Native 'railway' @('add','--service',$Name) -IgnoreStderr
        if ($r.ExitCode -ne 0) { Stop-WithError "Could not create service '$Name'." }
        return
    }

    # Monorepo path: try the v4 --root-directory flag first so the
    # subfolder is wired on initial create. Falls back step-by-step so
    # the bootstrap never bails — any missing piece is documented in
    # the summary for the operator to fix in the dashboard.
    Write-Step "Creating service '$Name' wired to ${Repo}:${RootDirectory}…"
    $r = Invoke-Native 'railway' @(
        'add','--service',$Name,'--repo',$Repo,'--root-directory',$RootDirectory
    ) -IgnoreStderr
    if ($r.ExitCode -eq 0) { return }

    # CLI may not recognise --root-directory. Try without it.
    Write-Warn "  --root-directory not honoured by this CLI; creating service then setting RAILWAY_ROOT_DIRECTORY as a build-time variable."
    $r = Invoke-Native 'railway' @('add','--service',$Name,'--repo',$Repo) -IgnoreStderr
    if ($r.ExitCode -ne 0) {
        Write-Warn "  Could not wire $Repo (private repo / unauthorised?); creating empty service '$Name'."
        $r = Invoke-Native 'railway' @('add','--service',$Name) -IgnoreStderr
        if ($r.ExitCode -ne 0) { Stop-WithError "Could not create service '$Name'." }
    }
    # `RAILWAY_ROOT_DIRECTORY` is documented as a build-time override for
    # the Source Root Directory. If a given CLI/control-plane version
    # doesn't honour it, the dashboard step in the summary takes over.
    Set-RailwayVar $Name 'RAILWAY_ROOT_DIRECTORY' $RootDirectory
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

Write-Step "Ensuring app services (all from $MONOREPO)…"
Confirm-AppService $API_SERVICE $MONOREPO $API_ROOT
Confirm-AppService $ENT_SERVICE $MONOREPO $ENT_ROOT
Confirm-AppService $RES_SERVICE $MONOREPO $RES_ROOT
Confirm-AppService $MKT_SERVICE $MONOREPO $MKT_ROOT

# Make RAILWAY_ROOT_DIRECTORY a no-op rerun guarantee: services already
# created on a prior pass need this set regardless of how they were
# initially wired, otherwise Railway would try to build from the repo
# root and fail. Setting is idempotent (upsert).
Set-RailwayVar $API_SERVICE 'RAILWAY_ROOT_DIRECTORY' $API_ROOT
Set-RailwayVar $ENT_SERVICE 'RAILWAY_ROOT_DIRECTORY' $ENT_ROOT
Set-RailwayVar $RES_SERVICE 'RAILWAY_ROOT_DIRECTORY' $RES_ROOT
Set-RailwayVar $MKT_SERVICE 'RAILWAY_ROOT_DIRECTORY' $MKT_ROOT

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
  3. Verify each service's Root Directory in the Railway dashboard
     (Service → Settings → Source → Root Directory). Should be:
       $API_SERVICE        → $API_ROOT
       $ENT_SERVICE → $ENT_ROOT
       $RES_SERVICE  → $RES_ROOT
       $MKT_SERVICE  → $MKT_ROOT
     If the --root-directory CLI flag was honoured (or the
     RAILWAY_ROOT_DIRECTORY build-time var is respected), these are
     already set. If not, click into each service and set it once.
  4. Trigger an initial deploy: push to $MONOREPO's connected branch,
     or run 'railway up --service <name>' from each app's directory.
  5. (Optional) Map custom domains: api.hoa.africa, admin.hoa.africa,
     app.hoa.africa, hoa.africa — then overwrite CORS_ORIGIN +
     APP_*_URL to point at them instead of *.up.railway.app.

See RAILWAY_DEPLOY.md for the full operator runbook.
"@
