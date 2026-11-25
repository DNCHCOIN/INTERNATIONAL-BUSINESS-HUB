# Private staging operations and acceptance record

25 November 2026. Development release; not customer acceptance or a production launch.

## Verified business outcomes

| Scenario | Evidence |
| --- | --- |
| Company registers once and uses all three applications | PostgreSQL-backed identity/session integration and browser registration/shared-session flow |
| Company controls its profile and employees | Owner permissions, expiring one-use invitations, role restrictions and disabled-member session revocation |
| Verification has evidence and a human decision | Document review gate; evidence bound to the legal revision; obsolete evidence cannot verify a changed identity |
| Supplier publishes and a buyer opens an inquiry | Owner CRUD/versioning; anonymous product-only response; verified-company contact access and inquiry/reply threads |
| Catalogue access is explicitly controlled | Quarantine → admin review → owner share; cross-company downloads gated by verified identity and a published current listing |
| Cargo has viable alternatives | Road/rail/sea options with per-leg synthetic costs, waiting, transfers, capacity and sensitivity scenarios |
| Cargo can be consolidated | Weight, volume, loading metres, origin/destination, date window, temperature and ADR; repeated allocation denied |
| Shipment timeline is attributable and durable | Idempotent manual synthetic events, conflicting replay denial, out-of-order protection, current-data export and restart persistence |
| Storage capacity is consistent | Serialized warehouse reservations and peak simultaneous occupancy, including adjacent/nonoverlapping intervals |
| Firms can request a broker | Explicit profile publication consent, company/certificate human review, approved directory, inquiry and recipient acceptance |
| Administrator can assess activity | Company status counts, aggregate counts from separate business DBs, company/broker review and identity audit |
| Recovery works | Encrypted archive extracted and restored into three new QA databases; restored document checksums and authenticated decryption match |

Latest complete QA: NixOS PostgreSQL 17.12 / Node 24.21.0; `/srv/dnch-data/dnch/client-hosting/qa-dnch.f0QGpE`, PID 302262, exit 0. `ops/qa.sh` applied migrations twice, passed 4 identity/security tests, 4 planning/adapter tests and **123 HTTP/security assertions**. Backup: 23089 bytes, authenticated AES-GCM; restored counts: 2 companies, 1 listing, 1 shipment and 3 identity documents with integrity checks. A tampered backup was rejected before extraction. Browser: 18 anonymous language/viewport/application combinations, an authenticated registration→trade CRUD→cargo→route→shipment→event→private document flow, 7 authenticated mobile views, no page errors. Existing tracking suite: 8/8 separately passed. These are scoped checks; neither professional translation nor independent penetration testing/customer acceptance is implied.

The broker review test found a PostgreSQL parameter-type conflict (42P08) in audit insertion; separate typed parameters fixed it and the complete suite was repeated. Earlier browser timing failures were fixed by waiting for completed form submissions and rendering. The interface now exposes busy state during saves.

## Deployment

Source directories: `client-hosting/development/{hub,trade,caspian}`. Runtime, private DB/configuration/documents and socket: `client-hosting/runtime`. Original static sites remain backed up and are retained at their existing paths. The business runtime serves the new workspace on localhost 18801/18802/18803; original static prototypes are available through `/preview`. DNCH System remains at 8083.

Use `ops/deploy-private.sh` only after a clean, tested, saved source checkout. Supply `DNCH_HOST_ROOT`, `DNCH_SOURCE_ROOT`, `PG_BIN` through the environment. It creates a Unix-socket-only PostgreSQL instance, three databases and restricted credentials, pins the existing Nix PostgreSQL package, migrates idempotently and updates the existing user hosting service with rollback to the previous unit on failure. It never changes Cloudflare, DNS, firewall or public production.

Services: `dnch-client-hosting`, `dnch-client-postgres`; scheduled `dnch-client-backup.timer` (03:15 Europe/Sofia) and `dnch-client-monitor.timer` (one minute). API/PG budgets: 320/256 MiB, CPU quotas 60/40% of one core. Monitoring checks all three APIs and DNCH 8083 and records private `state/monitor.json`. It is local health recording, not configured phone/push alert delivery. The consistent backup briefly stops only the business service and always restarts it using a shell trap.

## Accounts and recovery

No default or production administrator is created. Individual administrator credentials must be established with `ops/create-admin.mjs` using JSON on stdin. Do not put passwords into shell command arguments, Git, public demos or project-manager pages. Company owners can invite staff manually and change their passwords; changing a password revokes all prior sessions. Email delivery, ownership confirmation and email-based recovery are not configured.

`ops/backup.mjs --application-stopped` writes an encrypted archive only while the business service is stopped. It includes three custom-format dumps, encrypted documents and the private document key/configuration. The separate 32-byte backup key is not inside that archive. Keep that key and an encrypted backup in separately authorized durable storage before real client data. Current automated copies are local to the same server; offsite disaster recovery and retention policy are not configured.

To inspect recovery safely, use `ops/restore-extract.mjs ARCHIVE NEW_EMPTY_DIRECTORY` with `DNCH_BACKUP_KEY`; it does not modify databases. `ops/restore-drill.mjs` restores into fresh `dnch_restore_qa_*` databases on a disposable QA cluster and removes only those databases after comparing counts and file integrity. A real disaster restore must rebuild restricted roles from the private configuration, restore DBs without obsolete ownership/ACLs, apply migrations/grants, restore encrypted files and verify all business/permission scenarios before promotion. Do not point the QA drill at production.

## Remaining decisions and external launch dependencies

- Public hostname/layout, HTTPS and whether the eventual applications share one origin or use OIDC across domains. This release refuses production mode and changes no tunnel.
- Individual human administrator identity, MFA, email delivery/ownership/recovery and account/data-retention terms.
- Dedicated OS service account/process isolation; current services run under the existing authorized local user. Independent security review, full visual/accessibility/translation and load/power-restart acceptance remain open.
- Legally applicable company/broker verification sources and actual human-reviewed evidence. There are no real verified firms or real licensed brokers seeded by this release.
- Real tariffs/capacities, ferry/rail agreements and sandbox APIs, customs/accredited e-CMR/e-TIR provider and jurisdiction validation, historical/weather data and forecast calibration. Disabled adapters reject operations rather than fabricate confirmations.
- Matching/warehouse operation currently uses the firm's own private cargo and warehouse ledger. Cross-company freight participation, cargo disclosure, capacity publication, physical booking confirmation, cancellation and commercial responsibilities need an agreed operating policy and additional release. The full original network scope is retained and not marked complete.
- Real shipment acceptance tests remain explicitly deferred by Tsvetan. Apps, payments, AI helpers and mailbox services are not added or purchased.

Overall completion is unestimated. The release is a functioning private implementation of the stated scenarios, with the above launch/business gaps still open.
