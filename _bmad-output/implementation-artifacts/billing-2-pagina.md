---
baseline_commit: TBD-alla-chiusura-di-billing-1
---

# Story Billing-2: La pagina — tre riquadri, registro entrate/uscite, secchiello, card tesoreria

Status: draft (parte DOPO la chiusura di Billing-1 sullo stesso branch `billing-rework`)

## Story

As a gestore dell'aviosuperficie,
I want una pagina Contabilità con risultato economico, liquidità e acconti piloti in tre riquadri distinti e un registro a colonne entrate/uscite,
so that non devo più decifrare una colonna firmata che mescola ricavi, costi e debiti verso i piloti.

**Riferimenti vincolanti**: design approvato `docs/superpowers/specs/2026-07-26-billing-rework-design.md` (§5 la pagina, §6 cosa NON cambia, §8 rischi). I numeri arrivano da `getBillingSummary` (Billing-1): questa story è presentazione + le rifiniture di contorno elencate sotto.

**Ratifiche PO (AskUserQuestion 2026-07-26, durante Billing-1)**:
1. **D1**: `getBillingKpis` è sopravvissuto a Billing-1 solo come wrapper per la pagina attuale — QUESTA story lo CANCELLA (export, usi, test) sostituendo il KPI-row con i tre riquadri su `getBillingSummary`.
2. **D5**: Billing-1 ha registrato solo `PUT /api/v1/settings/treasury`. Se la card Impostazioni legge i valori correnti via API serve il `GET` (registrato in OpenAPI + testato); se legge via server component, il GET non serve — scelta al dev, motivata.
3. Terminologia (spec §1): gli acconti sono un **debito verso i piloti** (acconti da clienti, passivo) — le label UI devono dirlo senza connotarlo come negativo.

## Acceptance Criteria

1. **(Tre riquadri)** Il KPI-row attuale di `billing/page.tsx` (5 tile da `getBillingKpis`) è sostituito dai tre riquadri dello spec §5, alimentati da UNA chiamata a `getBillingSummary`: **Risultato <mese>** (ricavi, costi, utile/perdita), **Liquidità** (cassa, banca, "di cui acconti", disponibile, + secchiello non attribuiti quando ≠ 0), **Acconti piloti** (totale, esposizione, n. conti in rosso, link al dettaglio). `getBillingKpis` e i suoi test/usi CANCELLATI (ratifica 1). Il tile "Istruttori" attuale (owed MTD): ricollocato o rimosso coerentemente col design — decisione visiva del dev, motivata nel record.
2. **(Registro entrate/uscite)** La tabella movimenti della console perde la colonna firmata: due colonne **Entrate**/**Uscite** (il flip `-row.amountCents` di `toAccountRow` muore con lei — spec §1) + colonna **Tipo** (ricavo · costo · acconto · giroconto) derivata server-side, che è anche filtro. Le righe di acconto restano visibili, marcate "non incide sul risultato" (spec §5). Paginazione/ordinamento/export esistenti invariati (§6: le route export non cambiano).
3. **(Secchiello non attribuiti)** I movimenti con `paymentMethod IS NULL` sono raggiungibili dalla pagina (filtro dedicato o vista) e un admin può assegnare il metodo al singolo movimento storico: serve un endpoint di riclassificazione (`PATCH` sul movimento, solo `paymentMethod`, gated `finance.manage`, OpenAPI + test) — unico pezzo di backend nuovo di questa story. Il secchiello è VISIBILE finché non è vuoto (spec §8: mai nascosto).
4. **(Card tesoreria in Impostazioni)** Nuova card nel pattern delle esistenti (`club-card`, `smtp-card`): saldi di apertura cassa/banca (in euro, persistiti in cents) + data di apertura, su `getTreasurySettings`/`setTreasurySettings` di Billing-1 (ratifica 2 per il GET). Validazione client coerente con lo schema Zod.
5. **(AirOps + i18n)** Tutto nel design system AirOps (token, primitive `KPI`/`Badge`/`SlideOver`...), bilingue IT/EN (`messages/it.json` + `en.json`), dark theme verificato (lezione 13.9: contrasto misurato, non giudicato).
6. **(e2e)** Scenari e2e nuovi: tre riquadri con numeri veri da scenario seminato (ricarica + volo + payout → i tre blocchi mostrano i valori attesi), filtro tipo, riclassificazione di un movimento dal secchiello (il saldo cassa/banca si aggiorna), card tesoreria (set apertura → la Liquidità cambia). Full suite CI=1 verde.
7. **(Invarianti §6)** Estratto conto della scheda persona INTATTO (pilota-centrico); export e route esistenti INTATTI; nessun cambiamento a come nascono i movimenti.

## Contesto (puntatori — ricognizione 2026-07-26, da rifinire alla partenza)

- Pagina: `src/app/[locale]/dashboard/billing/page.tsx` (276 righe, server component — KPI-row a `:145-149`, `getBillingKpis` chiamato a `:87`); console/tabella: `billing-console.tsx` (735 righe); form: `transaction-editor.tsx` (ha già il Select metodo dal Billing-1).
- Flip di segno da rimuovere: `transactions.service.ts#toAccountRow` (`-row.amountCents`).
- Card Impostazioni: pattern in `src/app/[locale]/dashboard/settings/*-card.tsx` + `page.tsx` (322 righe).
- Servizio: `billing-summary.service.ts#getBillingSummary` (Billing-1) — shape `result`/`treasury`/`deposits`/`byCategory`.
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md` (DB fresco al dispatch, gates, JOBS_SECRET export, e2e foreground su file, MAI push/playwright install). Story UI → skill `design-taste-frontend` + `ui-ux-pro-max`, verifica interattiva Playwright.
- Lezioni applicabili: 13.7/13.10 (geometria + hit-test negli e2e di clipping/popover), 13.9 (contrasto computazionale), "il gemello va misurato" (ogni esemplare di pattern toccato va enumerato).
- **Nota F6 (review Billing-1)**: nella pagina attuale `revenueByKind`/`chargesCount` di `getBillingKpis` restano Σ-positivi legacy (deliberato — annotato nel codice): dopo uno storno il pannello "per categoria" è incoerente col KPI. Questa story lo risolve alla radice cancellando `getBillingKpis` e ricostruendo il dettaglio su `getBillingSummary.byCategory`.

## Fuori scope dichiarato

- Riclassificazione di massa dei non attribuiti (si fa movimento per movimento; un bulk è YAGNI finché l'utente non lo chiede).
- Competenza al consumo per i pacchetti ore (feature ritirata in 12.13 — i marker storici restano come sono).
- Qualsiasi cambiamento al modello dati oltre al PATCH di riclassificazione (AC3).

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
