---
baseline_commit: ea917a1
---

# Story 13.8: Shell & misc trasversali — switcher lingua, icone sidebar, label reports, rimozione logo, precompile scadenze

Status: ready-for-dev

## Story

As a utente dell'app (ogni ruolo),
I want cambiare lingua dalla shell, icone sidebar coerenti, label dei report leggibili e un'impostazione club senza il campo logo inutilizzato,
so that la shell sia completa e le Impostazioni riflettano ciò che l'app usa davvero.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 8).

**Ratifiche PO (AskUserQuestion 2026-07-25)**: (a) item "reports month labels" = problema di LAYOUT confermato dall'utente (label compresse/sovrapposte nel bar chart) — NESSUN difetto nei nomi (`reports/page.tsx#shortMonthLabel` è UTC-parsed e locale-driven, ricognizione confermata); (b) il follow-up **F2 della review 13.3** (precompile data scadenza da `ExpiryType.validityMonths` nel `LiveExpiryEditor` condiviso) è ACCORPATO a questa story come AC dedicato.

## Acceptance Criteria

1. **(Switcher lingua IT/EN)** Nella top bar (`top-bar.tsx:62`), accanto al `ThemeToggle` e con la stessa taglia/stile di controllo, un controllo per passare IT↔EN che PRESERVA il pathname corrente (pattern già in app: `Link` di `@/i18n/navigation` con `locale={otherLocale}`, v. `ppr/page.tsx:52,69` — nel dashboard non esiste alcuno switcher oggi). Convenzione di casa: niente `useTranslations` nei client component — label/aria risolte server-side in `layout.tsx` e passate via prop. Nota icone: in `icons.tsx` NON esiste un 'globe' — decidere al dev tra chip testuale "IT/EN" (coerente col prototipo AirOps) o nuova icona; coerenza visiva col `ThemeToggle` adiacente.
2. **(Icone sidebar — aereo piccolo per Flotta)** `route-registry.ts:78`: `fleet` passa da `icon: 'fleet'` a `icon: 'plane'` (stessa icona che Movimenti usa già, `route-registry.ts:72` — item utente: "aereo piccolo per entrambe"). Verificare che la glifa `fleet` in `icons.tsx` resti usata altrove o segnalarla come orfana (non rimuoverla se fuori scope).
3. **(Reports — leggibilità label mesi)** Fix di LAYOUT (ratifica a): le label dell'asse X del bar chart in `reports-console.tsx` non devono comprimersi/sovrapporsi (verifica anche a viewport stretti ragionevoli per desktop — il mobile pass è 13.10). NESSUNA modifica a `shortMonthLabel`/logica date.
4. **(Rimozione logo club — UI + backend)** Il campo logo sparisce da `settings-form.tsx` (resta il solo nome; attenzione: `pdf-exports.spec.ts` pilota i testid di questo form) e dal backend: `airfieldBrandingSchema`/`AirfieldBrandingDto` perdono `logoDataUrl` (`src/lib/schemas/settings.ts` + `registry.ts` + `registry.test.ts` — wire change ratificato dalla punch-list), `getAirfieldBranding`/`setAirfieldBranding` diventano name-only (`app-settings.service.ts:174` + `AIRFIELD_LOGO_KEY`), l'adapter PDF (`src/server/adapters/pdf/document.tsx` + test) e i 6 call-site di `exports.service.ts` passano a branding name-only, `/ppr` (mark pubblico, `ppr/page.tsx:49`) e ogni altro consumer (`dashboard/layout.tsx:81`, `dashboard/page.tsx:182`, `logbook/page.tsx:102`, `settings/page.tsx:134`, route `settings/airfield`) fanno fallback al solo nome. Sweep i18n: chiavi `logo*` di SettingsPage rimosse SPECULARMENTE da it.json/en.json. La riga `AppSetting` `airfield.logo` eventualmente presente resta orfana nel DB (nessuna migrazione distruttiva richiesta) — ma il seed non deve più scriverla (verificare).
5. **(Precompile data scadenza — F2 review 13.3, ratifica b)** Nel `LiveExpiryEditor` condiviso (`src/components/dashboard/expiry-editor.tsx`): selezionando un `ExpiryType` con `validityMonths` valorizzato, il campo data si precompila a oggi+validityMonths (comportamento che il vecchio form a pagina aveva e che la 13.3 ha perso — feature-loss F2). La data resta EDITABILE (il precompile è un default, non un vincolo); tipo senza `validityMonths` → nessun precompile. Beneficia scheda persona + Piloti + Istruttori (stesso componente).
6. **(e2e + skill UI)** e2e: switcher lingua (click reale → URL/locale cambiano, pathname preservato), icona fleet, form settings senza logo (aggiornare gli spec che oggi toccano il logo — `pdf-exports.spec.ts` e affini — SENZA indebolire le altre assert), precompile scadenza (AC5). Selettori scoped/exact, mai hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps; verifica interattiva Playwright (MCP; fallback throwaway /tmp).

## Contesto (puntatori — ricognizione 2026-07-25, HEAD 418ce9f)

- Top bar: `src/components/shell/top-bar.tsx` (ThemeToggle a :62; client component, strings-by-prop). Switcher esistente da imitare: `src/app/[locale]/ppr/page.tsx:52,69`.
- Icone: `src/components/ui/icons.tsx` (`plane` :21, `fleet` :48; nessun `globe`).
- Reports: `src/app/[locale]/dashboard/reports/page.tsx:18-23` (`shortMonthLabel`, nessun difetto date) + `reports-console.tsx` (bar chart).
- Logo: consumer completi mappati sopra in AC4 (grep `getAirfieldBranding|AIRFIELD_LOGO_KEY` — 8 file src + 4 test file con `logoDataUrl`).
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, MAI push, MAI playwright install, NON toccare package.json). Commit: `feat(13.8): shell & misc — switcher lingua, icone sidebar, reports, rimozione logo, precompile scadenze` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.
- Precompile (AC5): `src/components/dashboard/expiry-editor.tsx`; `ExpiryType.validityMonths` già nel modello Prisma; il vecchio comportamento di riferimento era nel form della pagina `people/{id}` pre-13.3 (v. git history se serve).

## Fuori scope dichiarato

- Dark theme (13.9) e mobile (13.10): niente regressioni, ma la revisione trasversale è là.
- Ritiro stack legacy (13.11).
- Qualunque altra card di Impostazioni oltre alla parte identity (logo).

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
