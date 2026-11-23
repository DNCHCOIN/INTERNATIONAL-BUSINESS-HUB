# DNCH Studio — Language completeness standard (BG / EN / ZH)

Status: required acceptance policy for this three-platform ecosystem and reusable for all future client projects.

## Non-negotiable
Every **developer-authored user-facing string** must appear entirely in the selected language:
navigation, workspace, onboarding, headings, branding taglines (not registered brand names),
buttons, form labels and hints, placeholders, tooltips, accessibility labels, filters,
tables, demo/sample content, dashboards, dates, number/unit formatting,
success/error notifications, confirmation dialogs, settings, documents,
admin interfaces, Android and Windows applications, footers, metadata,
and any server/API validation messages presented to users.

Brand names, registered company names, user-generated text and international document
codes (e.g. e-CMR, e-TIR, FTL, LTL) must not be silently translated or rewritten.
User-generated text translation requires a separate explicitly described feature.

## Architecture
- Use translation keys and dictionaries instead of hard-coded UI strings.
- Store neutral business IDs, country/city IDs and enum values separately from translated display strings.
- Keep all three platforms on the chosen language when navigating from Business Hub.
- On switching language, rerender all dynamic data and notices; do not keep stale translated DOM.
- Format dates, quantities, numbers and currency using the selected locale.
- Mark html lang correctly; English en, Bulgarian bg, Simplified Chinese zh-CN.
- Missing translations are build/test errors, not a silent pass.
- Avoid translating user input, stored IDs, route data or API data in-place.
- Do not introduce new copy unless BG/EN/ZH entries accompany the change.

## Mandatory acceptance tests (each release)
1. Open each public page and its subpages on desktop and mobile in BG, EN and ZH.
2. Navigate all menu entries, modals, search, empty/error/success/loading states and forms.
3. Create/edit/delete sample data, route calculations, tracking results and document checklists.
4. Switch BG -> EN -> ZH -> BG without refresh; revisit all sections.
5. Navigate Hub -> Trade and Hub -> Caspian; confirm language continuity.
6. Scan static markup and dynamically rendered text for foreign-language leftovers.
7. Verify locale-aware dates, numeric units and accessibility labels; check CJK text layout.
8. Verify data integrity before and after switch; no mutation of user-entered content.
9. Verify JS syntax plus automated tests AND visual browser checks on deployed build.
10. Publish as client-ready only after checklist passes; log any remaining defects openly.

Existing GitHub Pages demos are prototypes and MUST NOT be labeled production-ready
without separate verification of authentication, security, hosting and functional tests.
