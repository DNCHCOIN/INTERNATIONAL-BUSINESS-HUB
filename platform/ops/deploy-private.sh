#!/usr/bin/env bash
# Explicitly local staging only. Does not alter DNS, tunnels, firewall or DNCH System.
set -euo pipefail
umask 077
: "${DNCH_HOST_ROOT:?Existing client-hosting directory required}"
: "${DNCH_SOURCE_ROOT:?Parent of tested hub/trade/caspian checkouts required}"
: "${PG_BIN:?PostgreSQL bin directory required}"
[[ "$DNCH_HOST_ROOT" = /* && "$DNCH_SOURCE_ROOT" = /* && "$PG_BIN" = /* ]] || exit 2
[[ "$DNCH_HOST_ROOT$DNCH_SOURCE_ROOT$PG_BIN" != *' '* ]] || exit 2
curl --fail --silent --max-time 5 http://127.0.0.1:8083/ -o /dev/null
for repo in hub trade caspian; do
 [[ -z "$(git -C "$DNCH_SOURCE_ROOT/$repo" status --porcelain)" ]] || { printf 'Uncommitted source: %s\n' "$repo"; exit 2; }
done
export DNCH_RUNTIME="$DNCH_HOST_ROOT/runtime" DNCH_STATE="$DNCH_HOST_ROOT/runtime/state"
export PGHOST="$DNCH_HOST_ROOT/runtime/socket" PGPORT=18810 DNCH_CONFIG="$DNCH_HOST_ROOT/runtime/state/config.json"
export DNCH_HUB_SOURCE="$DNCH_SOURCE_ROOT/hub" DNCH_TRADE_SOURCE="$DNCH_SOURCE_ROOT/trade" DNCH_CASPIAN_SOURCE="$DNCH_SOURCE_ROOT/caspian"
export DNCH_BACKUP_DIR="$DNCH_HOST_ROOT/backups/business" DNCH_BACKUP_KEY="$DNCH_HOST_ROOT/runtime/backup-key"
mkdir -p "$DNCH_RUNTIME" "$DNCH_STATE" "$PGHOST" "$DNCH_BACKUP_DIR"
node_bin=$(command -v node)
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
backup="$DNCH_HOST_ROOT/backups/pre-business-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
cp "$unit_dir/dnch-client-hosting.service" "$backup/hosting.service"
for item in hub trade caspian server.mjs hub.revision trade.revision caspian.revision; do
 [[ ! -e "$DNCH_HOST_ROOT/$item" ]] || cp -a "$DNCH_HOST_ROOT/$item" "$backup/"
done
if command -v nix-store >/dev/null; then
 nix-store --add-root "$DNCH_RUNTIME/postgresql-package" --indirect -r "$(dirname "$PG_BIN")" > /dev/null
fi
if [[ ! -f "$DNCH_RUNTIME/pgdata/PG_VERSION" ]]; then
 "$PG_BIN/initdb" -D "$DNCH_RUNTIME/pgdata" --auth-local=peer --auth-host=scram-sha-256 > "$DNCH_RUNTIME/initdb.log"
 cat >> "$DNCH_RUNTIME/pgdata/postgresql.conf" <<CONF
listen_addresses = ''
port = 18810
unix_socket_directories = '$PGHOST'
unix_socket_permissions = 0700
shared_buffers = '32MB'
max_connections = 20
work_mem = '2MB'
maintenance_work_mem = '16MB'
max_parallel_workers = 0
autovacuum_max_workers = 1
max_wal_size = '256MB'
CONF
 cat > "$DNCH_RUNTIME/pgdata/pg_hba.conf" <<CONF
local all $USER peer
local dnch_identity dnch_identity_app scram-sha-256
local dnch_trade dnch_trade_app scram-sha-256
local dnch_caspian dnch_caspian_app scram-sha-256
local all all reject
CONF
fi
cat > "$unit_dir/dnch-client-postgres.service" <<UNIT
[Unit]
Description=DNCH Studio private business PostgreSQL
[Service]
Type=simple
ExecStart=$PG_BIN/postgres -D $DNCH_RUNTIME/pgdata
ExecStop=$PG_BIN/pg_ctl -D $DNCH_RUNTIME/pgdata -m fast -w stop
Restart=on-failure
RestartSec=3
MemoryMax=256M
CPUQuota=40%
NoNewPrivileges=true
UMask=0077
[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now dnch-client-postgres.service
for attempt in 1 2 3 4 5; do
 if "$PG_BIN/pg_isready" -h "$PGHOST" -p 18810; then break; fi
 [[ "$attempt" -lt 5 ]] || exit 1
 sleep 1
done
cd "$DNCH_SOURCE_ROOT/hub/platform"
[[ -f "$DNCH_CONFIG" ]] || node ops/bootstrap.mjs
node ops/migrate.mjs
rollback() {
 systemctl --user stop dnch-client-hosting.service || true
 cp "$backup/hosting.service" "$unit_dir/dnch-client-hosting.service"
 systemctl --user daemon-reload
 systemctl --user start dnch-client-hosting.service
}
trap rollback ERR
systemctl --user stop dnch-client-hosting.service
# The previous business release, if any, is backed up while stopped.
node ops/backup.mjs --application-stopped > "$DNCH_RUNTIME/last-backup.json"
cat > "$unit_dir/dnch-client-hosting.service" <<UNIT
[Unit]
Description=DNCH Studio private business staging
Requires=dnch-client-postgres.service
After=dnch-client-postgres.service
[Service]
Type=simple
ExecStart=$node_bin $DNCH_SOURCE_ROOT/hub/platform/src/server.mjs
Environment=DNCH_CONFIG=$DNCH_CONFIG
WorkingDirectory=$DNCH_SOURCE_ROOT/hub/platform
Restart=on-failure
RestartSec=3
MemoryMax=320M
CPUQuota=60%
NoNewPrivileges=true
UMask=0077
[Install]
WantedBy=default.target
UNIT
cat > "$DNCH_RUNTIME/backup.sh" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
export DNCH_CONFIG=$DNCH_CONFIG PG_BIN=$PG_BIN PGHOST=$PGHOST PGPORT=18810
export DNCH_BACKUP_DIR=$DNCH_BACKUP_DIR DNCH_BACKUP_KEY=$DNCH_BACKUP_KEY
systemctl --user stop dnch-client-hosting.service
trap 'systemctl --user start dnch-client-hosting.service' EXIT
$node_bin $DNCH_SOURCE_ROOT/hub/platform/ops/backup.mjs --application-stopped
SCRIPT
cat > "$unit_dir/dnch-client-backup.service" <<UNIT
[Unit]
Description=DNCH Studio encrypted consistent local backup
After=dnch-client-postgres.service
[Service]
Type=oneshot
ExecStart=/run/current-system/sw/bin/bash $DNCH_RUNTIME/backup.sh
UMask=0077
MemoryMax=192M
CPUQuota=25%
UNIT
cat > "$unit_dir/dnch-client-backup.timer" <<UNIT
[Unit]
Description=DNCH Studio daily private backup
[Timer]
OnCalendar=*-*-* 03:15:00 Europe/Sofia
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > "$unit_dir/dnch-client-monitor.service" <<UNIT
[Unit]
Description=DNCH Studio private staging health monitor
[Service]
Type=oneshot
ExecStart=$node_bin $DNCH_SOURCE_ROOT/hub/platform/ops/monitor.mjs
Environment=DNCH_CONFIG=$DNCH_CONFIG
Environment=DNCH_BACKUP_DIR=$DNCH_BACKUP_DIR
MemoryMax=96M
CPUQuota=10%
NoNewPrivileges=true
UMask=0077
UNIT
cat > "$unit_dir/dnch-client-monitor.timer" <<UNIT
[Unit]
Description=DNCH Studio minute health checks
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now dnch-client-hosting.service
for attempt in 1 2 3 4 5; do
 if curl --fail --silent --max-time 2 http://127.0.0.1:18803/api/health -o /dev/null; then break; fi
 [[ "$attempt" -lt 5 ]] || exit 1
 sleep 1
done
node ops/monitor.mjs
systemctl --user enable --now dnch-client-backup.timer dnch-client-monitor.timer
trap - ERR
printf 'Private business staging active; original static backup: %s\n' "$backup"
