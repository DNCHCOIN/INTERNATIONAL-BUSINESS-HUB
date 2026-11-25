#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DNCH_CONFIG:?Private configuration required}"
marker="$(dirname "$DNCH_CONFIG")/backup-in-progress"
touch "$marker"
cleanup() {
 local result=0
 systemctl --user start dnch-client-hosting.service || result=$?
 rm -f "$marker"
 return "$result"
}
trap cleanup EXIT
systemctl --user stop dnch-client-hosting.service
"${DNCH_NODE:-node}" "$(dirname "$0")/backup.mjs" --application-stopped
