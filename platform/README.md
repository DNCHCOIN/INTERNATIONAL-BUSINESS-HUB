# Private business platform — development, 25 November 2026

This development branch continues the three original repositories. The public GitHub Pages prototypes and Grupaj.bg are not changed. Runtime requires Node 24 and PostgreSQL 17. Never serve this directory as a static website.

## Business architecture and sequencing

The owner's first operational outcome is a company that can register once, maintain its legal/contact information, control employees, and use both business platforms without disclosing other companies' private data. TRADE then supports a verified supplier publishing an opportunity and another verified business opening an inquiry. CASPIAN supports synthetic cargo → feasible route alternatives → consolidation → shipment timeline/documents → warehouse capacity.

The host has 4 GB RAM and also runs DNCH System. The development Keycloak compose example is preserved on its existing branch but is not deployed here. This implementation uses one lightweight trusted server with opaque PostgreSQL-backed sessions, shared only between the three private ports on the same hostname. It is **not OIDC and not cross-domain SSO**. Separate-domain deployment requires an OIDC provider and exact HTTPS callbacks, or a reviewed same-origin gateway. This dependency adaptation is technical, not a change to the agreed business scope.

| Task | Implementation | Acceptance boundary |
| --- | --- | --- |
| HUB-03/04, TR-01/02/03/08 | Registration, shared server session, company ownership, trader/dispatcher/viewer roles | Private synthetic staging only; public TLS/MFA/recovery still required |
| TR-04 | Private registration evidence, reviewer note, manual company decisions; legal edits require re-review | No live registry checks, legal certification or email ownership verification |
| HUB-05/07 | Company dashboard, password changes, team invitations, admin approvals, aggregate activity, audit | Individual production administrator accounts need provisioning and MFA |
| TR-05/06/07 | Database catalogue/filtering, owner CRUD/version checks, expiry, inquiry threads, private documents | Explicit reviewed-catalogue sharing implemented; human linguistic/visual acceptance remains |
| CL-DB-02, CL-01/04 | Existing CASPIAN PostgreSQL schema extended; multimodal route alternatives | Costs, times, waits, capacities are explicitly synthetic assumptions |
| CL-08/09 | Persistent milestone events, idempotency, late-event protection, timeline export; scenario delay buffers | No infrastructure feed or calibrated historical prediction model |
| CL-10/11 | Capacity/date/temperature/ADR matching, persisted groups; private warehouses and reservations | Own-company scope only; no external physical warehouse booking |
| CL-05/06 | Encrypted document upload, metadata, review/checklist | e-CMR/e-TIR upload is not issuance, acceptance or customs submission |
| CL-07 | Broker opt-in profile, certificate review, approved directory, inquiry/recipient acceptance | Manual evidence review, not automatic licence/accreditation validation |
| CL-02/03/05 | Disabled operator adapters and explicit capabilities | Operator agreements, sandbox APIs and accredited customs connections remain external dependencies |

## Security boundaries

- Three separate databases and three login roles, with database CONNECT restrictions. Runtime roles are not table owners, superusers or BYPASSRLS roles.
- Session tokens are random, hashed at rest; HttpOnly/SameSite cookies, 8-hour absolute/2-hour idle expiry, exact Origin and per-session CSRF. Local HTTP is accepted only on the explicitly private loopback deployment. Production mode is deliberately refused.
- Passwords use Node scrypt with random 16-byte salt, N=65536/r=8/p=1; concurrent derivations and login attempts are limited.
- Company and role come from the server session, never the body, query string, localStorage or a demo token. Company verification is never self-assigned. Suspended companies cannot use business APIs.
- TRADE guests receive product fields only. Contact profiles require a verified company. Public catalogue results also check the owner's current verification state.
- Business DB queries use transaction-local tenant context and RLS. Pool connections never retain a previous tenant's context. Write checks, optimistic versions, unique/FK constraints and row locks protect ownership and capacity.
- PDF/JPG uploads are limited to 5 MB, signature checked, quarantined, encrypted with AES-256-GCM outside web roots and downloaded as attachments after authorization. No antivirus or PDF structural validation is claimed; production requires a scanning/review policy.
- Administrative audit is append-only for runtime roles. No default administrator or plaintext credential is stored in source. Invite tokens are one-use, hashed and expire after 24 hours; delivery is manual.
- This is application/database isolation under the existing OS user. It is not full process/OS isolation from other DNCH services. A dedicated service account is required before real client data.

## Run and test

`npm ci` in `platform/`; `npm test` for focused security tests. Run `node --test service/planning.test.mjs` in CASPIAN. `test/integration.mjs` requires `DNCH_TEST_CONFIG` pointing to a disposable `qa-` configuration, not production or a real customer database.

`ops/bootstrap.mjs` provisions three fresh databases through a private PostgreSQL Unix socket, creates restricted login roles and writes private configuration once. It refuses to overwrite existing configuration or roles. `ops/migrate.mjs` applies the independent migrations using the local DB owner; runtime uses only restricted roles. The CASPIAN original schema is preserved and extended by `service/002_platform.sql`.

Required private config fields: `mode=private-staging`, `sources.{hub,trade,caspian}`, `ports.{hub,trade,caspian}`, `databases.{identity,trade,caspian}`, absolute `documents` path and random 32-byte hex `document_key`. Configuration and documents must have mode 600/700 and be outside every served directory.

Create individual administrator accounts with `ops/create-admin.mjs`, using JSON on stdin; never use command-line passwords or public example accounts. No email is sent. An email provider, ownership confirmation, recovery and retention policy remain launch dependencies.

## Required release gates

Authenticated business integration tests, two-company negative tests, concurrency/capacity tests, restart persistence, backup/restore, browser desktop/mobile/BG/EN/ZH tests, performance budget, independent security review and client acceptance. A successful development test is not production acceptance. Public domains, Cloudflare Tunnel, production and real shipments stay outside this change.

See [OPERATIONS.md](OPERATIONS.md) for the verified scenarios, latest test evidence, deployment/recovery steps and remaining launch decisions.
