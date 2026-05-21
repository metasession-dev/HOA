#!/usr/bin/env bash
#
# setup-railway.sh — Bootstrap the entire HOA.africa platform on Railway.
#
# Idempotent end-to-end:
#   1. Links the local checkout to Railway project
#      d436a63d-be9f-49dc-92a7-fd3215684a5f.
#   2. Provisions the Postgres + Redis addons if they're not already there.
#   3. Creates the four app services (hoa-api, hoa-enterprise,
#      hoa-residents, hoa-marketing) if they're not already there. When
#      GITHUB_OWNER is exported, the services are wired to their GitHub
#      repos so Railway auto-deploys on push; without it, they're created
#      empty and the operator wires the repo through the dashboard once.
#   4. Generates the high-entropy secrets locally (JWT_SECRET,
#      APP_ENCRYPTION_KEY, STORAGE_URL_SECRET, VAPID keypair) and pushes
#      them to each service. Cross-service URLs are set as Railway
#      reference variables (${{ Service.RAILWAY_PUBLIC_DOMAIN }}) so
#      renaming a service propagates automatically.
#
# Re-runs are safe — every step checks state before mutating. Secrets are
# only generated when the corresponding variable is currently empty on the
# service, so running this script twice doesn't rotate keys unexpectedly.
#
# The operator must still set manually (Railway dashboard → service →
# Variables) the API-KEY-shaped vars at the bottom of the summary, which
# we never want passing through a script:
#
#   - OPENAI_API_KEY            (HOA-API)
#   - ANTHROPIC_API_KEY         (HOA-API, optional)
#   - RESEND_API_KEY            (HOA-API)
#   - RESEND_WEBHOOK_SECRET     (HOA-API, optional)
#   - PAYSTACK_SECRET_KEY       (HOA-API)
#   - PAYSTACK_PUBLIC_KEY       (HOA-API)
#   - SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN (optional)
#   - POSTHOG_API_KEY / NEXT_PUBLIC_POSTHOG_KEY (optional)
#
# Prerequisites:
#   - Railway CLI v3.20+ (`railway --version`)
#     install:  `npm i -g @railway/cli`
#   - `railway login` already done
#   - Node 18+ on PATH (used to parse JSON + generate VAPID keys)
#   - openssl on PATH (used for secret generation)
#
# Optional env vars:
#   GITHUB_OWNER   — GitHub user/org owning the four repos. When set, each
#                    service is created with its repo wired (e.g. the
#                    hoa-api service connects to GITHUB_OWNER/HOA-API).
#                    Override per-service via HOA_API_REPO,
#                    HOA_ENTERPRISE_REPO, HOA_RESIDENTS_REPO,
#                    HOA_MARKETING_REPO when the repo name differs.
#
# Run from the repo root:
#   bash scripts/setup-railway.sh

set -euo pipefail

# ---------- constants ----------
PROJECT_ID="132485f6-967c-4586-a477-85c955fba43b"
API_SERVICE="hoa-api"
ENT_SERVICE="hoa-enterprise"
RES_SERVICE="hoa-residents"
MKT_SERVICE="hoa-marketing"
DB_SERVICE="Postgres"
REDIS_SERVICE="Redis"

# ---------- monorepo layout ----------
# All four apps live in a single GitHub repo. Each Railway service is
# pointed at its subfolder via --root-directory on create, with
# RAILWAY_ROOT_DIRECTORY as a build-time fallback.
GITHUB_OWNER="${GITHUB_OWNER:-metasession-dev}"
GITHUB_REPO="${GITHUB_REPO:-HOA}"
MONOREPO="${GITHUB_OWNER}/${GITHUB_REPO}"
API_ROOT="HOA-API"
ENT_ROOT="HOA-ENTERPRISE"
RES_ROOT="HOA-RESIDENTS"
MKT_ROOT="HOA-MARKETING"

# ---------- helpers ----------
log()  { printf "\033[1;32m▶\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m⚠\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# Resolve a binary name across platforms. On Git Bash / WSL, Node-stack
# binaries are often installed as `node.exe` / `npx.cmd` and `command -v
# node` returns nothing. We try the bare name first, then common Windows
# suffixes, and stash the working invocation in a variable so callers
# don't have to care.
resolve_bin() {
  local name="$1"
  for cand in "$name" "${name}.exe" "${name}.cmd" "${name}.CMD"; do
    if command -v "$cand" >/dev/null 2>&1; then
      printf "%s" "$cand"
      return 0
    fi
  done
  return 1
}

need() {
  local resolved
  if resolved="$(resolve_bin "$1")"; then
    # Export the resolved name as <UPPER>_BIN so callers can use $NODE_BIN
    # / $OPENSSL_BIN / $NPX_BIN without re-discovering.
    local var
    var="$(printf "%s" "$1" | tr '[:lower:]' '[:upper:]')_BIN"
    eval "${var}=\"\$resolved\""
    return 0
  fi
  fail "Missing dependency: $1. Install it (Node.js 18+: https://nodejs.org, OpenSSL: bundled with Git for Windows / brew install openssl / apt install openssl) and ensure it is on PATH for *this* shell. If you're using WSL but Node is installed on Windows only, install it inside WSL too: 'sudo apt install nodejs npm'."
}

# List service names in the active project, one per line. Tolerant of
# CLI-version differences in `railway status --json` shape.
list_services() {
  "$RAILWAY_BIN" status --json 2>/dev/null | "$NODE_BIN" -e '
    let buf = "";
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      try {
        const d = JSON.parse(buf);
        const arr =
          d?.services?.edges?.map((e) => e.node?.name) ||
          d?.services?.map?.((s) => s.name) ||
          d?.project?.services?.edges?.map((e) => e.node?.name) ||
          [];
        for (const n of arr) if (n) process.stdout.write(n + "\n");
      } catch { /* unparseable → empty list, callers re-create */ }
    });
  '
}

service_exists() {
  local name="$1"
  list_services | grep -Fxq -- "$name"
}

# Create a database addon if it doesn't exist yet. Railway names the
# resulting service with a canonical name we reference downstream
# ('Postgres' / 'Redis' — case-sensitive in reference vars).
ensure_database() {
  local kind="$1" name="$2"
  if service_exists "$name"; then
    log "Database '${name}' already provisioned, skipping."
    return
  fi
  log "Provisioning ${name} (${kind}) addon…"
  # `railway add --database <kind>` provisions + names the service after
  # the kind by default. We don't pass --service because some CLI builds
  # treat that flag as "use this name" while others treat it as "attach
  # to this existing service" — letting Railway pick its canonical name
  # is the version-portable path.
  if ! "$RAILWAY_BIN" add --database "$kind" >/dev/null 2>&1; then
    fail "Failed to provision ${name}. Check 'railway add --database ${kind}' manually."
  fi
}

# Create an app service for the monorepo if it doesn't exist. Wires the
# GitHub repo + Root Directory on first create. If the v4 CLI doesn't
# honour --root-directory, falls back to setting RAILWAY_ROOT_DIRECTORY
# as a build-time variable. If neither sticks, the dashboard step is
# documented in the summary.
ensure_service() {
  local name="$1" repo="$2" root_dir="$3"
  if service_exists "$name"; then
    log "Service '${name}' already exists, skipping create."
    return
  fi
  if [[ -z "$repo" ]]; then
    log "Creating empty service '${name}' (no monorepo wired)…"
    "$RAILWAY_BIN" add --service "$name" >/dev/null 2>&1 \
      || fail "Could not create service '${name}'."
    return
  fi

  log "Creating service '${name}' wired to ${repo}:${root_dir}…"
  if "$RAILWAY_BIN" add --service "$name" --repo "$repo" --root-directory "$root_dir" >/dev/null 2>&1; then
    return
  fi

  warn "  --root-directory not honoured by this CLI; creating service then setting RAILWAY_ROOT_DIRECTORY as a build-time variable."
  if ! "$RAILWAY_BIN" add --service "$name" --repo "$repo" >/dev/null 2>&1; then
    warn "  Could not wire ${repo} (private/unauthorised?); creating empty service '${name}'."
    "$RAILWAY_BIN" add --service "$name" >/dev/null 2>&1 \
      || fail "Could not create service '${name}'."
  fi
  # `RAILWAY_ROOT_DIRECTORY` is documented as a build-time override for
  # the Source Root Directory. If a given CLI/control-plane version
  # doesn't honour it, the dashboard step in the summary takes over.
  rv "$name" RAILWAY_ROOT_DIRECTORY "$root_dir"
}

# Set a single variable on a service. Idempotent (Railway --set is upsert).
# Run a Railway CLI command, retrying transient TLS/network failures
# with exponential backoff. Railway's GraphQL endpoint occasionally
# returns BadRecordMac / connection-reset blips when traffic goes
# through corporate firewalls, flaky Wi-Fi, or aggressive TLS-inspecting
# antivirus — aborting the bootstrap on one bad TCP connection is the
# wrong default. Caller passes the full argv; output goes to stdout.
railway_retry() {
  local max=4 attempt=0 output rc
  local transient='BadRecordMac|Failed to fetch|connection (error|reset|refused)|client error \(SendRequest\)|timed? out|temporarily unavailable|502 Bad Gateway|503 Service|504 Gateway'
  while true; do
    attempt=$((attempt + 1))
    if output="$("$RAILWAY_BIN" "$@" 2>&1)"; then
      printf "%s" "$output"
      return 0
    fi
    rc=$?
    if [[ $attempt -lt $max ]] && printf "%s" "$output" | grep -qE "$transient"; then
      local delay=$((1 << attempt))     # 2, 4, 8, 16…
      [[ $delay -gt 8 ]] && delay=8
      warn "  Transient Railway failure (attempt ${attempt}/${max}) — retrying in ${delay}s…"
      sleep "$delay"
      continue
    fi
    printf "%s" "$output" >&2
    return "$rc"
  done
}

rv() {
  local svc="$1" key="$2" value="$3"
  railway_retry variables --service "$svc" --set "${key}=${value}" >/dev/null
}

# Set a variable ONLY if it isn't already set on the service. Used for
# high-entropy secrets so re-running the script doesn't rotate them and
# invalidate every active session.
rv_if_unset() {
  local svc="$1" key="$2" value="$3"
  local existing
  existing="$("$RAILWAY_BIN" variables --service "$svc" --json 2>/dev/null \
    | "$NODE_BIN" -e '
      let buf = "";
      process.stdin.on("data", (c) => (buf += c));
      process.stdin.on("end", () => {
        try {
          const d = JSON.parse(buf);
          // Railway exposes either a flat map or {edges:[{node:{name,value}}]}.
          const v =
            (d && typeof d === "object" && d["'"$key"'"]) ||
            d?.variables?.edges?.find?.((e) => e.node?.name === "'"$key"'")?.node?.value ||
            "";
          process.stdout.write(v || "");
        } catch { /* unset → empty, will set below */ }
      });
    ' || true)"
  if [[ -z "$existing" ]]; then
    rv "$svc" "$key" "$value"
    log "  → set ${key} on ${svc}"
  else
    log "  → ${key} already set on ${svc}, preserving"
  fi
}

# ---------- pre-flight ----------
need railway
need node
need openssl
need npx

log "Railway CLI version: $("$RAILWAY_BIN" --version)"

if ! "$RAILWAY_BIN" whoami >/dev/null 2>&1; then
  fail "Not logged in. Run 'railway login' first."
fi

log "Linking checkout to project ${PROJECT_ID}…"
# Railway CLI v4 dropped the positional project arg in favour of
# `--project <id>`. Try v4 first, then fall back to v3's positional
# form so older CLIs still work.
if ! "$RAILWAY_BIN" link --project "${PROJECT_ID}" >/dev/null 2>&1; then
  if ! "$RAILWAY_BIN" link "${PROJECT_ID}" >/dev/null 2>&1; then
    fail "Could not link project ${PROJECT_ID}. Run 'railway link --project ${PROJECT_ID}' manually to see the underlying error."
  fi
fi

# ---------- provision services ----------
log "Ensuring database addons…"
ensure_database postgres "$DB_SERVICE"
ensure_database redis    "$REDIS_SERVICE"

log "Ensuring app services (all from ${MONOREPO})…"
ensure_service "$API_SERVICE" "$MONOREPO" "$API_ROOT"
ensure_service "$ENT_SERVICE" "$MONOREPO" "$ENT_ROOT"
ensure_service "$RES_SERVICE" "$MONOREPO" "$RES_ROOT"
ensure_service "$MKT_SERVICE" "$MONOREPO" "$MKT_ROOT"

# Set RAILWAY_ROOT_DIRECTORY unconditionally so services created on a
# prior run (when --root-directory wasn't honoured) still get the path.
# Idempotent — `--set` is upsert.
rv "$API_SERVICE" RAILWAY_ROOT_DIRECTORY "$API_ROOT"
rv "$ENT_SERVICE" RAILWAY_ROOT_DIRECTORY "$ENT_ROOT"
rv "$RES_SERVICE" RAILWAY_ROOT_DIRECTORY "$RES_ROOT"
rv "$MKT_SERVICE" RAILWAY_ROOT_DIRECTORY "$MKT_ROOT"

# ---------- generate high-entropy secrets ----------
# These get used only when the corresponding variable is currently unset
# on the API service. Generating ahead of the check keeps the code simple;
# unused values are discarded harmlessly when this script re-runs.
log "Generating candidate secrets (only applied if currently unset)…"
JWT_SECRET="$("$OPENSSL_BIN" rand -hex 32)"
# AES-256-GCM key — 32 raw bytes, base64-encoded for env transport.
APP_ENCRYPTION_KEY="$("$OPENSSL_BIN" rand -base64 32)"
STORAGE_URL_SECRET="$("$OPENSSL_BIN" rand -hex 32)"

# VAPID keypair (web push). Generated together because the two halves
# must match — rotating only the public key would break every existing
# device subscription.
log "Generating candidate VAPID keypair (only applied if currently unset)…"
VAPID_JSON="$("$NPX_BIN" --yes web-push generate-vapid-keys --json)"
VAPID_PUBLIC_KEY="$("$NODE_BIN" -e "process.stdout.write(JSON.parse(process.argv[1]).publicKey)" "$VAPID_JSON")"
VAPID_PRIVATE_KEY="$("$NODE_BIN" -e "process.stdout.write(JSON.parse(process.argv[1]).privateKey)" "$VAPID_JSON")"

# ---------- HOA-API ----------
log "Setting HOA-API (${API_SERVICE}) variables…"

# Reference variables: ${{ Service.VAR }} is resolved by Railway at deploy
# time. DATABASE_URL comes from the Postgres addon, REDIS_URL from Redis.
# RAILWAY_PUBLIC_DOMAIN is the auto-assigned *.up.railway.app hostname.
rv "$API_SERVICE" DATABASE_URL "\${{ ${DB_SERVICE}.DATABASE_URL }}"
rv "$API_SERVICE" REDIS_URL    "\${{ ${REDIS_SERVICE}.REDIS_URL }}"

rv "$API_SERVICE" NODE_ENV        production
rv "$API_SERVICE" JWT_EXPIRES_IN  24h
# Explicit PORT so it matches the public-domain targetPort the wiring
# script creates. Railway's default is 8080 but the API's main.ts
# already documents 3003 — pinning here keeps everything aligned.
rv "$API_SERVICE" PORT            3003
# Bind the Nest listener to all interfaces. main.ts defaults to '0.0.0.0'
# when HOST is unset, but pinning it explicitly here documents intent and
# matches what we do for the Next.js services below.
rv "$API_SERVICE" HOST            0.0.0.0
# Railway terminates TLS one hop in front of the container, so X-Forwarded-*
# headers carry the real client IP. main.ts refuses to boot in production
# unless TRUST_PROXY_HOPS > 0 — without this, the throttler buckets collapse
# to one global bucket and the IP allowlist matches every request against
# the proxy's address. Set to 1 for a single-proxy chain (Railway alone) or
# 2 when Cloudflare sits in front.
rv "$API_SERVICE" TRUST_PROXY_HOPS 1

# Secrets — preserved across reruns so we don't invalidate live sessions.
rv_if_unset "$API_SERVICE" JWT_SECRET         "$JWT_SECRET"
rv_if_unset "$API_SERVICE" APP_ENCRYPTION_KEY "$APP_ENCRYPTION_KEY"
rv_if_unset "$API_SERVICE" STORAGE_URL_SECRET "$STORAGE_URL_SECRET"
rv_if_unset "$API_SERVICE" VAPID_PUBLIC_KEY   "$VAPID_PUBLIC_KEY"
rv_if_unset "$API_SERVICE" VAPID_PRIVATE_KEY  "$VAPID_PRIVATE_KEY"

# CORS allow-list — comma-separated. Uses Railway's auto-injected public
# domain for the two Next.js apps + marketing so renaming a service or
# moving environments self-heals here without operator intervention.
rv "$API_SERVICE" CORS_ORIGIN \
  "https://\${{ ${ENT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }},https://\${{ ${RES_SERVICE}.RAILWAY_PUBLIC_DOMAIN }},https://\${{ ${MKT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"

# Email link bases — emails (invites, password reset) need fully-qualified
# URLs so users can click from any inbox.
rv "$API_SERVICE" APP_ENTERPRISE_URL "https://\${{ ${ENT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$API_SERVICE" APP_RESIDENTS_URL  "https://\${{ ${RES_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"

rv "$API_SERVICE" VAPID_SUBJECT      "mailto:notifications@hoa.africa"
rv "$API_SERVICE" OPENAI_MODEL       "gpt-4o-mini"
rv "$API_SERVICE" ANTHROPIC_MODEL    "claude-3-5-sonnet-20241022"
rv "$API_SERVICE" MAIL_FROM          "HOA.africa <noreply@metasession.co>"

# File storage — must point at an attached Volume mount path. Until the
# operator attaches a Volume in Settings → Volumes, file uploads fail
# loudly at runtime (intentional — silent fallback to ephemeral disk
# would lose every upload on next deploy).
rv "$API_SERVICE" STORAGE_ROOT       "/data/storage"

# ---------- HOA-ENTERPRISE ----------
log "Setting HOA-ENTERPRISE (${ENT_SERVICE}) variables…"

rv "$ENT_SERVICE" NODE_ENV production
rv "$ENT_SERVICE" NEXT_PUBLIC_API_URL         "https://\${{ ${API_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$ENT_SERVICE" NEXT_PUBLIC_ENTERPRISE_URL  "https://\${{ ${ENT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$ENT_SERVICE" NEXT_PUBLIC_RESIDENTS_URL   "https://\${{ ${RES_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$ENT_SERVICE" NEXT_PUBLIC_MARKETING_URL   "https://\${{ ${MKT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$ENT_SERVICE" NEXT_PUBLIC_POSTHOG_HOST    "https://us.i.posthog.com"

# ---------- HOA-RESIDENTS ----------
log "Setting HOA-RESIDENTS (${RES_SERVICE}) variables…"

rv "$RES_SERVICE" NODE_ENV production
rv "$RES_SERVICE" NEXT_PUBLIC_API_URL         "https://\${{ ${API_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$RES_SERVICE" NEXT_PUBLIC_ENTERPRISE_URL  "https://\${{ ${ENT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$RES_SERVICE" NEXT_PUBLIC_RESIDENTS_URL   "https://\${{ ${RES_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$RES_SERVICE" NEXT_PUBLIC_MARKETING_URL   "https://\${{ ${MKT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$RES_SERVICE" NEXT_PUBLIC_POSTHOG_HOST    "https://us.i.posthog.com"
# Resident PWA needs the VAPID public key client-side to subscribe. The
# matching private key stays on the API. Re-uses whatever JUMP got set on
# the API service (NOT the candidate we generated above) to stay in sync.
EFFECTIVE_VAPID_PUBLIC="$("$RAILWAY_BIN" variables --service "$API_SERVICE" --json 2>/dev/null \
  | node -e '
    let buf = "";
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      try {
        const d = JSON.parse(buf);
        process.stdout.write(d?.VAPID_PUBLIC_KEY || "");
      } catch {}
    });
  ' || echo "$VAPID_PUBLIC_KEY")"
rv "$RES_SERVICE" NEXT_PUBLIC_VAPID_KEY "${EFFECTIVE_VAPID_PUBLIC:-$VAPID_PUBLIC_KEY}"

# ---------- HOA-MARKETING ----------
log "Setting HOA-MARKETING (${MKT_SERVICE}) variables…"

rv "$MKT_SERVICE" NODE_ENV production
rv "$MKT_SERVICE" VITE_ENTERPRISE_URL "https://\${{ ${ENT_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"
rv "$MKT_SERVICE" VITE_RESIDENTS_URL  "https://\${{ ${RES_SERVICE}.RAILWAY_PUBLIC_DOMAIN }}"

# ---------- summary ----------
printf "\n\033[1;32m✓ Project bootstrapped.\033[0m\n\n"
cat <<EOF
Still required (set these manually in the Railway dashboard → service → Variables):

  HOA-API (${API_SERVICE}):
    OPENAI_API_KEY          ← https://platform.openai.com/api-keys
    ANTHROPIC_API_KEY       ← (optional fallback)
    RESEND_API_KEY          ← https://resend.com/api-keys
    RESEND_WEBHOOK_SECRET   ← (optional, if Resend webhook is wired)
    PAYSTACK_SECRET_KEY     ← https://dashboard.paystack.com/#/settings/developer
    PAYSTACK_PUBLIC_KEY     ← (same dashboard)
    SENTRY_DSN              ← (optional)
    POSTHOG_API_KEY         ← (optional)
    METRICS_BEARER          ← (optional; locks /metrics scrape)

  HOA-ENTERPRISE (${ENT_SERVICE}):
    NEXT_PUBLIC_SENTRY_DSN  ← (optional)
    NEXT_PUBLIC_POSTHOG_KEY ← (optional)

  HOA-RESIDENTS (${RES_SERVICE}):
    NEXT_PUBLIC_SENTRY_DSN  ← (optional)
    NEXT_PUBLIC_POSTHOG_KEY ← (optional)

Next steps:
  1. Set the manual vars above.
  2. Attach a Volume to ${API_SERVICE} at mount path /data/storage
     (Settings → Volumes → New Volume, 5GB+). The Railway CLI doesn't
     manage volumes yet, so this stays a one-click UI step.
  3. Verify each service's Root Directory in the Railway dashboard
     (Service → Settings → Source → Root Directory). Should be:
       ${API_SERVICE}        → ${API_ROOT}
       ${ENT_SERVICE} → ${ENT_ROOT}
       ${RES_SERVICE}  → ${RES_ROOT}
       ${MKT_SERVICE}  → ${MKT_ROOT}
     If the --root-directory CLI flag was honoured (or the
     RAILWAY_ROOT_DIRECTORY build-time variable is respected), these
     are already set. If not, click into each service and set it once.
  4. Trigger an initial deploy: push to ${MONOREPO}'s connected branch,
     or run \`railway up --service <name>\` from each app's directory.
  5. (Optional) Map custom domains: \`api.hoa.africa\`, \`admin.hoa.africa\`,
     \`app.hoa.africa\`, \`hoa.africa\` — then overwrite the CORS_ORIGIN +
     APP_*_URL vars to point at them instead of *.up.railway.app.

See RAILWAY_DEPLOY.md for the full operator runbook.
EOF
