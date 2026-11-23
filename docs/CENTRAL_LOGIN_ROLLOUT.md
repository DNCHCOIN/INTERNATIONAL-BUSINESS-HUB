# Shared sign-in rollout plan (not yet implemented)

## Present state
The BUSINESS HUB is a static GitHub Pages portal. Its account modal contains a disabled,
localized sign-in preview beneath the roadmap. Neither a password nor username is submitted,
stored or transmitted. This is intentional until a backend identity service exists.

## Intended system
- Two temporary personal administrators: nedka-admin and tsvetan-admin.
- Their access is separate from company registration and business roles.
- One central OpenID Connect identity provider; Authorization Code + PKCE.
- TRADE and CASPIAN LOGISTICS stay independent (separate application databases,
  server-side authorization policies and API deployments).
- Each app is an OIDC client with exact redirect URIs and client-specific scopes.
- A valid login to one app enables redirect-based SSO to the other, NOT shared
  passwords in app databases or tokens in the URL.
- Sessions use Secure, HttpOnly, SameSite cookies, carefully matched to each app domain.
- Display an active login button only after a real trusted authorization endpoint is configured
  AND verified in staging. Do not fake successful authentication.

## Before enabling remote access
1. Choose identity hosting that the client can own/export/move; document domain + DNS and backup.
2. Establish separate staging hosting with HTTPS and a PostgreSQL instance under project control.
3. Enroll two administrators via secure secret provisioning. Rotate any password shared in chat
   before public or remote access, use distinct credentials and preferably MFA.
4. Add independent clients and permission checks in TRADE and CASPIAN LOGISTICS.
5. Verify login/logout, expirations, revoked users, cross-platform SSO and refusal of unauthorized
   role/tenant requests. Test secure account recovery and administration audit trail.
6. Perform a full backup and restore on a DIFFERENT hosting environment.
7. Only then enable the visible login controls.

## Isolation
No integration with Grupaj.bg. No automatic sharing of business/transport data.
No changes to TRADE, CASPIAN LOGISTICS or the published HUB main branch in this step.
