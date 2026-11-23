# DNCH Business Hub — independent identity service (development)

This is the first **self-hostable identity foundation** for INTERNATIONAL BUSINESS HUB.
It is independent of the DNCH Community database and all three static demos.

## Included
- Keycloak 26.8.2 (OIDC identity provider), pinned instead of `latest`
- Dedicated PostgreSQL 16 and persistent Docker volume
- Bound to localhost:8086 only; DB is not exposed on host
- No account credentials, master secrets or client secrets in this repository

## Local development
1. Install Docker and Docker Compose.
2. Create a private `identity/.env` from `.env.example`.
3. Fill all secret fields with **strong unique local secrets**; do not use the password disclosed in chat or any sample passwords.
4. From the identity directory run `docker compose --env-file .env up -d`.
5. Visit http://127.0.0.1:8086 for *local testing only*. The admin console is local.
6. Create an isolated realm named `business-hub` manually, **without publicly accessible client redirect URIs**.
7. Create clients `hub-web`, `trade-web`, `caspian-web` with Authorization Code flow + PKCE (S256), no implicit flow.
8. Once dedicated backend deployments exist, register their **exact HTTPS callback URLs** and configure issuer validation.

## Important restrictions
This container uses `start-dev` and is suitable only for isolated local development.
It is NOT a production deployment, remote staging environment, or functional SSO integration.
In particular, it does NOT make the current GitHub Pages login secure.
Do not send real users, companies, client secrets or real passwords to the static demo.
Do not use GitHub Pages as an OIDC secret-bearing backend.

## Before real online login
- Replace start-dev with production-grade HTTPS deployment and externally controlled DNS.
- Use secrets manager, encrypted backups + restore drills, monitoring and patch policy.
- Replace the browser-only demo login with a verified OIDC login flow.
- Add app-specific server-side token and permission enforcement; never authorize by JavaScript localStorage.
- Enable MFA for administrators, recovery and audit trails; provide account deletion/retention terms.
- Store platform user data separately from the identity service.
- Run cross-platform login/logout, denied-role and session-expiry integration tests before promotion.
- Ensure a full backup/restore and data export on a different hosting provider.

## Ownership
The buyer can own the domain and infrastructure. The compose setup and Postgres volume are portable,
but portability must be tested via backup/restore; a Docker volume alone is not a backup.
No production change has been made to TRADE, CASPIAN LOGISTICS or Grupaj.bg.
