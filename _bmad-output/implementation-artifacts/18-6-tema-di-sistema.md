---
baseline_commit: 1f6ab3e
---

# Story 18.6: Il tema di sistema

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e`). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. Indipendente dall'Epic 17. Chiude anche il TD «color-scheme» della 15.10 (`sprint-status.yaml` action_items).

## Story

As an **utente con il telefono in scuro**,
I want che l'app apra scura,
so that senza cookie il tema segua `prefers-color-scheme` e i controlli nativi rispettino `color-scheme` (ui M12); il toggle continua a vincere.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.6»; `ui-review.md` M12.

## Stato su HEAD

- Il tema viene **solo dal cookie `am-theme`**: letto in `[locale]/layout.tsx:18` e `:74` (`dark` → scuro, **altrimenti chiaro**), sempre stampato su `<html data-theme>` (`:77`); riletto in `dashboard/layout.tsx:31` e `:85` per `initialTheme` dei **due** `ThemeToggle` (`top-bar.tsx:107`, `mobile-top-bar.tsx:90`), entrambi sempre nel DOM; il toggle (`theme-toggle.tsx:18-35`) ha stato locale e scrive `dataset.theme` + cookie per 1 anno. Difetto latente: i due toggle non si allineano (dopo un clic l'icona dell'altro è sbagliata).
- CSS: token in `html[data-theme="light"]` (`airops.css:15-39`) e `html[data-theme="dark"]` (`:41-64`) più **23 override di componente** sotto `html[data-theme="dark"]` (`:450-453`, `626`, `720-723`, `740-742`, `792-794`, `916-917`, `1218`, `1329-1330`, `1632`, `3631`); `:root` (`:2-13`) solo font e raggi; `prefers-color-scheme` e `color-scheme`: 0 occorrenze.
- CSP `script-src 'self' 'unsafe-inline'` (`next.config.ts`): uno script inline nel `<head>` è permesso.
- Baseline 11-02: sistema scuro e niente cookie → `data-theme=light`, `color-scheme: normal`.

## Acceptance Criteria

1. *Given* nessun cookie e sistema scuro *When* apro `/it/login` e `/it/dashboard` a 375 e 1280 *Then* lo sfondo è scuro **già al primo paint**, anche con i chunk JS bloccati (`page.route('**/_next/static/**', abort)`). Rosso su HEAD.
2. Nessun cookie e sistema chiaro → chiaro, invariato (`login.spec.ts:113` resta valido).
3. Cookie `light` con sistema scuro → chiaro; cookie `dark` con sistema chiaro → scuro (il toggle vince).
4. Sistema scuro senza cookie *When* premo «Cambia tema» *Then* chiaro + cookie `light`; icona corretta prima e dopo in **entrambe** le barre.
5. `getComputedStyle(html).colorScheme` = `dark` in scuro e `light` in chiaro. Rosso su HEAD (`normal`).
6. Nessun avviso di idratazione in console; un `router.refresh()` dopo un'azione non riporta il tema al chiaro.
7. Parità degli override: 4 campioni (toast-dot, badge.ok, fld-error, btn.accent) hanno lo stesso stile calcolato con «cookie scuro» e con «sistema scuro»; `mobile-ink-targets` (due temi) e `login.spec.ts:124-160` verdi.
8. Scelta «Automatico» e cambio del tema di sistema con l'app aperta: §PO Q-18.6-a/b.
9. `npm run gates` + e2e via `scripts/e2e.sh` verdi; nuovo `e2e/theme-system.spec.ts` nel project `chromium` (non scrive settings, nessuna catena).

## Dev Notes

**Decisioni tecniche della sessione principale**: script inline **sincrono** nel `<head>` del layout radice che, solo senza cookie, imposta `data-theme` da `matchMedia`; il server stampa l'attributo solo se c'è il cookie (`suppressHydrationWarning` solo su `<html>`); fallback CSS chiaro quando manca l'attributo (es. `html:not([data-theme="dark"])` sul blocco chiaro: stessa specificità, misurare la cascata — lezione 15.9); `color-scheme` per ciascun tema; entrambe le icone nel DOM scelte dal CSS (niente mismatch di idratazione, i due toggle restano allineati); il toggle calcola il prossimo tema da `dataset.theme`; i 23 override restano dove sono (fonte unica; una media query CSS pura richiederebbe di duplicare 24 blocchi). Nel commento dello script: se un giorno sparisce `'unsafe-inline'` servirà un hash o un nonce.

**Blast radius**: `[locale]/layout.tsx`, `dashboard/layout.tsx` (cookie a tre stati), `theme-toggle.tsx`, `top-bar.tsx`, `mobile-top-bar.tsx`, `airops.css`; e2e `login.spec.ts:103-122` (riscrivere il commento «default è chiaro") + spec nuovo. Il nome del cookie compare in 3 file.

**Misure** a 375 e 1280 × {sistema chiaro, scuro} × {nessun cookie, cookie chiaro, cookie scuro} su login, Panoramica, «Nuova voce» del Registro voli (orari nativi), Impostazioni (select): screenshot, `colorScheme`, `--bg`, primo paint con JS bloccato. **Mutanti** (solo su copia isolata): via lo script → AC 1 rosso; decisione in un `useEffect` → AC 1 con JS bloccato rosso; script che ignora il cookie → AC 3 rosso; via `color-scheme` → AC 5 rosso.

**Trappole**: qualunque decisione presa dopo l'idratazione lampeggia (FOUC); senza JS e senza attributo nessun token è definito → serve il fallback chiaro; `color-scheme: dark` cambia i controlli nativi (select, scrollbar, autofill, checkbox senza `accent-color`): misurare i form; Playwright emula `light` per default (gli spec che non impostano il cookie restano chiari); il glossario non ha voci sul tema: se nasce «Automatico» va aggiunto.

**Dimensione**: ~7-9 file, +250-400/−30 (≈ 0,15 della 19.7a). Nessuno split.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.6-a** = A: l'interruttore resta a due stati; dopo una scelta manuale vale su quel browser finché non la si cambia (niente «Automatico»).
- **Q-18.6-b** = A: se il sistema passa da chiaro a scuro con l'app aperta, l'app cambia subito (listener `matchMedia` attivo solo senza cookie).


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
