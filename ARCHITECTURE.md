# Current private implementation

See [platform/README.md](platform/README.md) for the implemented architecture on this development branch. The earlier OIDC proposal below remains the future separate-domain target. The current private staging uses a lightweight server session across three loopback ports, separate PostgreSQL databases and server-enforced company roles. It is not cross-domain OIDC SSO.

# Proposed next stage — not implemented
## Current boundary
The hub is a static navigation portal. Its outgoing HTTPS links do not create technical integration.
Each existing project retains its source, design, storage and deployment.
Grupaj.bg is an external link only. No migration, account transfer or production change is part of this project.

## Central identity, separate applications
An OIDC identity provider would issue authenticated sessions through Authorization Code + PKCE.
Each application must be explicitly registered as a separate client with exact redirect URIs.
Shared company identity would use company_id and user membership records, without combining application databases.
Do not share authentication tokens through query strings, browser localStorage or broadly scoped cross-domain cookies.
Use secure HttpOnly application sessions; server-side authorization must verify issuer, audience, expiry, membership and scopes.
The current static demos cannot enforce these rules. Separate approval, backend implementation and verification are required before enabling any login.

## Proposed roles
| Role | Intended access |
| --- | --- |
| Company owner | Manage company profile, invite employees and assign company roles |
| Trader | Manage authorized company trade listings and trade requests |
| Logistics operator | Manage authorized company logistics inquiries |
| Platform administrator | Approvals and operational administration, with audit logs |
No role grants access across companies. Administrator access needs a separately controlled policy.

## Proposed API contracts (not live endpoints)
- GET /v1/me: current user and permitted company memberships
- GET /v1/companies/{company_id}: approved shared company fields
- POST /v1/companies/{company_id}/logistics-inquiries: explicit handoff from a trade opportunity
- POST /v1/events: authenticated server-to-server change notifications
Use versioned schemas, field allowlists, scoped credentials, short-lived tokens and tenant checks.
Keep separate Trade and Logistics databases. Publish only approved fields through owned APIs.
A trade listing must not automatically create a transport request. Require an explicit action and review.
Events require signatures, timestamp/replay checks, idempotency keys, retries and audit logging.
Use exact CORS origin allowlists and rate limits; never embed server credentials in the frontend.
No endpoint above is called by this demonstration.

## Implementation and acceptance order
1. Agree company fields, roles, ownership, consent and data retention rules.
2. Build identity and company service in a separate protected test environment.
3. Implement independent application adapters, with no production migration.
4. Verify login/logout, session expiry, denied scopes and cross-company isolation.
5. Test opt-in API handoff, retries, duplicates and audit trails with synthetic data.
6. Obtain a separate rollout decision for any changes to Projects 1 and 2.
Grupaj.bg remains outside technical integration until a separate decision is made.

## Visual direction
Navy and gold carry forward the TRADE identity; teal carries forward CASPIAN LOGISTICS.
No branding or source changes are applied to either existing project.
Grupaj.bg was visually checked in the browser: a navy and white layout, yellow highlights and international language navigation. The hub echoes its clear business navigation and warm accent while keeping its own identity.

