# INTERNATIONAL BUSINESS HUB — Project 3
Standalone demonstration portal for the independent TRADE and CASPIAN LOGISTICS projects.

## Live demonstration
https://dnchcoin.github.io/INTERNATIONAL-BUSINESS-HUB/

## Available
- Responsive desktop/mobile landing page.
- Bulgarian, English and Simplified Chinese; persistent language choice and direct ?lang=bg / en / zh links.
- Real links to TRADE (with its supported language parameter), CASPIAN LOGISTICS and Grupaj.bg.
- Mobile navigation and accessible informational single-sign-in dialog.
- Clearly marked implemented versus planned capabilities.

## Not implemented
Central registration, company profiles, authentication, roles, API synchronization, shared sessions, payments and real transport operations.
No account is created by this demo. No registration form collects personal data.
LOGISTICS is linked in its current language; its source and behavior have not been changed.

## Independence
Only this new repository is modified. TRADE-TSVETAN, CASPIAN-LOGISTICS and Grupaj.bg remain untouched.
The hub does not embed their applications or read/write their storage.
No dependencies, external fonts, analytics, cookies or third-party scripts. Only the language preference is stored locally.

## Run
Serve the repository with any static HTTP server, or open index.html.
No build or package installation is needed.
GitHub Pages: Settings → Pages → Deploy from a branch → main → / (root).
See ARCHITECTURE.md for the proposed next stage.

