#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${PG_BIN:?PostgreSQL 17 bin directory required}"
: "${DNCH_SOURCE_ROOT:?Parent of hub, trade and caspian checkouts required}"
export DNCH_QA_ROOT=$(mktemp -d "${DNCH_QA_PARENT:-/tmp}/qa-dnch.XXXXXX")
export DNCH_STATE="$DNCH_QA_ROOT/state" PGHOST="$DNCH_QA_ROOT/socket" PGPORT=18811
export DNCH_CONFIG="$DNCH_STATE/config.json" DNCH_TEST_CONFIG="$DNCH_STATE/config.json"
export DNCH_HUB_SOURCE="$DNCH_SOURCE_ROOT/hub" DNCH_TRADE_SOURCE="$DNCH_SOURCE_ROOT/trade" DNCH_CASPIAN_SOURCE="$DNCH_SOURCE_ROOT/caspian"
mkdir -p "$PGHOST"
"$PG_BIN/initdb" -D "$DNCH_QA_ROOT/pgdata" --auth-local=peer --auth-host=scram-sha-256 > "$DNCH_QA_ROOT/initdb.log"
cat >> "$DNCH_QA_ROOT/pgdata/postgresql.conf" <<CONF
listen_addresses = ''
port = 18811
unix_socket_directories = '$PGHOST'
unix_socket_permissions = 0700
shared_buffers = '32MB'
max_connections = 16
work_mem = '2MB'
max_parallel_workers = 0
CONF
cat > "$DNCH_QA_ROOT/pgdata/pg_hba.conf" <<CONF
local all $USER peer
local dnch_identity dnch_identity_app scram-sha-256
local dnch_trade dnch_trade_app scram-sha-256
local dnch_caspian dnch_caspian_app scram-sha-256
local all all reject
CONF
"$PG_BIN/pg_ctl" -D "$DNCH_QA_ROOT/pgdata" -l "$DNCH_QA_ROOT/postgres.log" -w start
trap '"$PG_BIN/pg_ctl" -D "$DNCH_QA_ROOT/pgdata" -m fast -w stop >/dev/null' EXIT
cd "$DNCH_HUB_SOURCE/platform"
node ops/bootstrap.mjs
node ops/migrate.mjs
node ops/migrate.mjs
node --test test/core.test.mjs
node --test "$DNCH_CASPIAN_SOURCE/service/planning.test.mjs"
node test/integration.mjs > "$DNCH_QA_ROOT/integration.log" 2>&1 || { cat "$DNCH_QA_ROOT/integration.log"; exit 1; }
cat "$DNCH_QA_ROOT/integration.log"
export DNCH_BACKUP_DIR="$DNCH_QA_ROOT/backups" DNCH_BACKUP_KEY="$DNCH_QA_ROOT/backup-key"
node ops/backup.mjs --application-stopped > "$DNCH_QA_ROOT/backup.log"
cat "$DNCH_QA_ROOT/backup.log"
DNCH_QA_BACKUP=$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).backup' "$DNCH_QA_ROOT/backup.log")
node ops/restore-extract.mjs "$DNCH_QA_BACKUP" "$DNCH_QA_ROOT/restore"
node ops/restore-drill.mjs "$DNCH_QA_ROOT/restore"
export DNCH_QA_BACKUP
node test/backup-integrity.mjs
if [[ -n "${DNCH_PUPPETEER:-}" && -n "${CHROME:-}" ]]; then
 node test/browser.mjs > "$DNCH_QA_ROOT/browser.log" 2>&1 || { cat "$DNCH_QA_ROOT/browser.log"; exit 1; }
 cat "$DNCH_QA_ROOT/browser.log"
fi
printf 'QA_ROOT=%s\n' "$DNCH_QA_ROOT"
