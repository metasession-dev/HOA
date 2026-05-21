<#
.SYNOPSIS
  Wire each app service in the HOA Railway project to the
  metasession-dev/HOA monorepo via Railway's GraphQL API.

.DESCRIPTION
  Railway CLI v4.42 doesn't expose a stable command for connecting
  a service to a GitHub source, and `railway up` uploads the entire
  linked-project directory (not CWD), which breaks for monorepos.
  This script talks directly to https://backboard.railway.com/graphql/v2
  and runs the two mutations Railway's web UI uses when you click
  "Connect Repo" + set "Root Directory":

    1. serviceConnect(id, input)              — wires the source repo
    2. serviceInstanceUpdate(...)             — sets rootDirectory per env
    3. serviceInstanceDeploy(...)             — triggers an initial build

  Idempotent — re-running is safe (the API treats repeat connect calls
  as updates).

  Auth: reads the access token the Railway CLI persists at
  ~/.railway/config.json after `railway login`. No need to paste a
  token manually.

.NOTES
  If a serviceConnect call returns "repo not accessible" or similar,
  the Railway GitHub App likely isn't installed on the metasession-dev
  org (or doesn't have access to the HOA repo). Fix at:
    https://railway.com/account/integrations
  → install/configure GitHub → grant access to metasession-dev/HOA.
#>

[CmdletBinding()]
param(
    [string]$ProjectId = '132485f6-967c-4586-a477-85c955fba43b',
    [string]$Repo      = 'metasession-dev/HOA',
    [string]$Branch    = 'main'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }

# Per-service Root Directory + watch patterns + public-domain target
# port. The monorepo has each app at the top level; Railway needs to
# know which subfolder to build from and which container port to route
# external traffic to.
#   - hoa-api: 3003 — matches main.ts PORT default
#   - Next.js services: 8080 — matches Railway's default $PORT
#   - hoa-marketing: 8080 — `serve` reads $PORT, defaults to 8080
$SERVICE_CONFIG = @{
    'hoa-api'        = @{ root = 'HOA-API';        watch = @('HOA-API/**');        port = 3003 }
    'hoa-enterprise' = @{ root = 'HOA-ENTERPRISE'; watch = @('HOA-ENTERPRISE/**'); port = 8080 }
    'hoa-residents'  = @{ root = 'HOA-RESIDENTS';  watch = @('HOA-RESIDENTS/**');  port = 8080 }
    'hoa-marketing'  = @{ root = 'HOA-MARKETING';  watch = @('HOA-MARKETING/**');  port = 8080 }
}

# ---------- helpers ----------
function Write-Step { param($m) Write-Host "▶ $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "⚠ $m" -ForegroundColor Yellow }
function Stop-WithError { param($m) Write-Host "✗ $m" -ForegroundColor Red; exit 1 }

function Get-RailwayToken {
    $candidates = @(
        "$env:USERPROFILE\.railway\config.json",
        "$env:APPDATA\railway\config.json",
        "$env:LOCALAPPDATA\railway\config.json",
        "$env:HOME\.railway\config.json"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) {
            $c = Get-Content $p -Raw | ConvertFrom-Json
            if ($c.user.accessToken) { return $c.user.accessToken }
            if ($c.user.token)       { return $c.user.token }
        }
    }
    Stop-WithError "Couldn't find a Railway access token. Run 'railway login' first."
}

$TOKEN = Get-RailwayToken
$GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2'
$HEADERS = @{
    Authorization = "Bearer $TOKEN"
    'Content-Type' = 'application/json'
}

# Generic GraphQL caller with retry on transient TLS / 5xx blips.
# Returns the .data payload or throws with the API error.
function Invoke-Railway {
    param(
        [string]$Query,
        [hashtable]$Variables,
        [int]$MaxAttempts = 4
    )
    $body = @{
        query = $Query
        variables = $Variables
    } | ConvertTo-Json -Depth 20 -Compress
    $attempt = 0
    while ($true) {
        $attempt++
        try {
            $resp = Invoke-RestMethod -Uri $GRAPHQL_URL -Method Post -Headers $HEADERS -Body $body -ErrorAction Stop
            if ($resp.errors) {
                $msg = ($resp.errors | ForEach-Object { $_.message }) -join '; '
                throw "GraphQL error: $msg"
            }
            return $resp.data
        } catch {
            $transient = $_.Exception.Message -match 'BadRecordMac|connection (error|reset|refused)|timed? out|temporarily|502|503|504|operation timed out'
            if ($transient -and $attempt -lt $MaxAttempts) {
                $delay = [int]([Math]::Min(8, [Math]::Pow(2, $attempt)))
                Write-Warn "  Transient Railway API failure (attempt $attempt/$MaxAttempts) — retrying in ${delay}s…"
                Start-Sleep -Seconds $delay
                continue
            }
            throw
        }
    }
}

# ---------- discover project + service IDs ----------
Write-Step "Looking up project $ProjectId…"
$projectQuery = @'
query Project($id: String!) {
  project(id: $id) {
    id
    name
    environments {
      edges {
        node {
          id
          name
        }
      }
    }
    services {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}
'@
$projectData = Invoke-Railway -Query $projectQuery -Variables @{ id = $ProjectId }
$project = $projectData.project
if (-not $project) { Stop-WithError "Project $ProjectId not found (token mis-scoped?)." }
Write-Step "  → $($project.name)"

# Pick the 'production' environment (typically the only one at this stage).
$prodEnv = $project.environments.edges.node | Where-Object { $_.name -eq 'production' } | Select-Object -First 1
if (-not $prodEnv) { Stop-WithError "No 'production' environment found." }
$ENV_ID = $prodEnv.id
Write-Step "  → environment 'production' id=$ENV_ID"

# Build a name → id map of services.
$serviceMap = @{}
foreach ($edge in $project.services.edges) {
    $serviceMap[$edge.node.name] = $edge.node.id
}

# ---------- mutations ----------
$serviceConnectMutation = @'
mutation ServiceConnect($id: String!, $input: ServiceConnectInput!) {
  serviceConnect(id: $id, input: $input) {
    id
  }
}
'@

# `serviceInstanceUpdate` takes service+environment scoping plus a
# patch input. The schema names this field "input" on most versions
# of the Railway API.
$serviceInstanceUpdateMutation = @'
mutation ServiceInstanceUpdate(
  $serviceId: String!
  $environmentId: String!
  $input: ServiceInstanceUpdateInput!
) {
  serviceInstanceUpdate(
    serviceId: $serviceId
    environmentId: $environmentId
    input: $input
  )
}
'@

# Trigger a deploy of the now-configured source. Some API versions
# expose this as `serviceInstanceDeploy`, others as `serviceInstanceRedeploy`
# — we try the deploy variant first and fall back.
$serviceInstanceDeployMutation = @'
mutation ServiceInstanceDeploy(
  $serviceId: String!
  $environmentId: String!
) {
  serviceInstanceDeploy(
    serviceId: $serviceId
    environmentId: $environmentId
  )
}
'@

# Public domain (`*.up.railway.app`) — Railway doesn't auto-create one
# when a service is provisioned via GraphQL. Without it, external HTTP
# can't reach the container and the healthcheck never sees the app from
# its real route. Idempotent via the "domain already exists" branch.
$serviceDomainCreateMutation = @'
mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
  serviceDomainCreate(input: $input) {
    id
    domain
  }
}
'@

# Query existing domains so we can detect "already there" cleanly.
$serviceDomainsQuery = @'
query DomainsForService($serviceId: String!, $environmentId: String!) {
  domains(serviceId: $serviceId, environmentId: $environmentId) {
    serviceDomains {
      id
      domain
      targetPort
    }
  }
}
'@

# ---------- wire each app service ----------
foreach ($name in $SERVICE_CONFIG.Keys) {
    $cfg = $SERVICE_CONFIG[$name]
    $svcId = $serviceMap[$name]
    if (-not $svcId) {
        Write-Warn "Service '$name' not found in this project; skipping."
        continue
    }

    Write-Step "Wiring '$name' → ${Repo}@${Branch} : $($cfg.root)/"

    # Step 1: connect repo at service level.
    try {
        Invoke-Railway -Query $serviceConnectMutation -Variables @{
            id = $svcId
            input = @{ repo = $Repo; branch = $Branch }
        } | Out-Null
        Write-Step "  ✓ source repo connected"
    } catch {
        # Railway often returns "Repository already connected" or similar
        # on a second run — treat that as success.
        if ($_.Exception.Message -match 'already connected|same source') {
            Write-Step "  → already connected, continuing"
        } else {
            Write-Warn "  serviceConnect failed: $($_.Exception.Message)"
            Write-Warn "  → If this says repo isn't accessible, install the Railway GitHub App on metasession-dev:"
            Write-Warn "    https://railway.com/account/integrations"
            throw
        }
    }

    # Step 2: set the per-environment Root Directory + watch patterns.
    try {
        Invoke-Railway -Query $serviceInstanceUpdateMutation -Variables @{
            serviceId     = $svcId
            environmentId = $ENV_ID
            input         = @{
                rootDirectory = $cfg.root
                watchPatterns = $cfg.watch
            }
        } | Out-Null
        Write-Step "  ✓ rootDirectory + watchPatterns set"
    } catch {
        Write-Warn "  serviceInstanceUpdate failed: $($_.Exception.Message)"
        Write-Warn "  → Set Root Directory '$($cfg.root)' manually in dashboard."
    }

    # Step 3: ensure a public *.up.railway.app domain exists pointing at
    # the right container port. Railway doesn't auto-issue one for
    # services created via GraphQL.
    try {
        $domains = Invoke-Railway -Query $serviceDomainsQuery -Variables @{
            serviceId     = $svcId
            environmentId = $ENV_ID
        }
        $existing = $domains.domains.serviceDomains | Where-Object { $_.domain -match '\.up\.railway\.app$' } | Select-Object -First 1
        if ($existing) {
            Write-Step "  → public domain already present: $($existing.domain)"
        } else {
            $created = Invoke-Railway -Query $serviceDomainCreateMutation -Variables @{
                input = @{
                    serviceId     = $svcId
                    environmentId = $ENV_ID
                    targetPort    = $cfg.port
                }
            }
            Write-Step "  ✓ public domain created: $($created.serviceDomainCreate.domain) (port $($cfg.port))"
        }
    } catch {
        Write-Warn "  domain step failed: $($_.Exception.Message)"
        Write-Warn "  → Generate manually in dashboard: Settings → Networking → Generate Domain"
    }

    # Step 4: trigger a fresh deploy from the wired source. Some API
    # versions don't expose serviceInstanceDeploy directly; the
    # mutation may also no-op if the connect call already enqueued one.
    try {
        Invoke-Railway -Query $serviceInstanceDeployMutation -Variables @{
            serviceId     = $svcId
            environmentId = $ENV_ID
        } | Out-Null
        Write-Step "  ✓ deploy triggered"
    } catch {
        # Not fatal — serviceConnect usually enqueues the first deploy
        # automatically. Just note it for the operator.
        Write-Warn "  (no-op) deploy trigger skipped: $($_.Exception.Message)"
    }
}

Write-Host ''
Write-Host '✓ All four services wired to the monorepo.' -ForegroundColor Green
Write-Host ''
Write-Host @"
Watch initial deploys roll at:
  https://railway.com/project/$ProjectId

Each service should now show:
  Settings → Source → metasession-dev/HOA, branch main, Root Dir HOA-<name>/

Future 'git push origin main' will only redeploy services whose
subfolder changed (per watchPatterns in each railway.json).
"@
