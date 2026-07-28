---
baseline_commit: 3073f78
---

# Story 14.6: Area personale — "Le mie transazioni" in sidebar e profili visibili solo se attivi

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a pilota o allievo,
I want una pagina in sidebar con TUTTE e SOLO le mie transazioni, e viste personali che mostrano solo i profili attivati per me,
so that controllo il mio estratto conto in autonomia senza vedere (né confondermi con) ciò che non mi riguarda.

**Riferimenti vincolanti**: piano epic 14 (item 10, 15, 16; decisione D2: profili visibili = solo quelli ATTIVI della persona).

## Acceptance Criteria

1. **(Voce sidebar)** Nuova voce in `route-registry.ts` (unica fonte di verità NAV_ITEMS) — es. id `my-account`, href `/dashboard/my-account`, gruppo coerente — visibile ai ruoli **PILOT e STUDENT** (l'istruttore avrà la SUA pagina compensi nella 14.7; admin/staff hanno già Contabilità e scheda persona). Label i18n IT/EN (es. "Le mie transazioni"/"My transactions").
2. **(Percorso di lettura SELF)** Oggi `GET /api/v1/people/{id}/account/movements` è staff-only ANCHE sul proprio conto (e2e AD-5 esistente lo asserisce). Serve il percorso self-service: servizio/route gated `self.read` che risolve SEMPRE il personId dell'ACTOR (mai un id arbitrario dal client — niente IDOR: l'id non viaggia o, se viaggia, viene ignorato/verificato = actor.personId). L'e2e AD-5 esistente sul 403 resta VALIDO per gli id altrui (mai indebolirlo).
3. **(La pagina)** Estratto conto personale: saldo corrente + lista movimenti (data, tipo, descrizione, importo — prospettiva PILOTA-centrica come la scheda persona, NON quella club della Contabilità), paginazione. Riuso dei pattern/renderer esistenti della sezione estratto conto di `people/[id]` dove ragionevole (mai duplicare la logica di formattazione). AirOps + i18n + dark + mobile.
4. **(Profili solo attivi — D2, item 16)** Le viste self-service (landing per ruolo in `dashboard/page.tsx` e ogni altra superficie personale enumerata dal dev) mostrano SOLO le sezioni/card dei profili ATTIVI della persona (un pilota senza profilo istruttore non vede la card/sezione istruttore, ecc.). Enumerazione delle superfici nel Dev Agent Record.
5. **(Privacy/perimetro)** La pagina mostra SOLO i movimenti dell'actor: mai un selettore persona, mai dati di altri conti; un utente senza persona collegata (admin puro) non vede la voce in sidebar (o vede uno stato vuoto coerente — scelta motivata). RBAC invariato per tutto il resto.
6. **(Test)** Unit sul servizio self (actor→own personId, 403/isolamento per id altrui); e2e: pilota vede i SUOI movimenti (fixture con ricarica+volo), allievo idem, la voce sidebar appare solo ai ruoli giusti, IDOR-probe (id altrui → 403/404); full suite CI=1 verde.

## Contesto (puntatori — ricognizione 2026-07-28)

- Sidebar: `src/components/shell/route-registry.ts` (NAV_ITEMS con `roles`, gruppi; ALL_ROLES/STAFF_ROLES).
- Permessi: `self.read` esiste già (`rbac.ts:36,:63`) — è il gate naturale del percorso self.
- Estratto conto esistente (staff-facing): scheda persona `people/[id]` + `account-section.tsx`; API `GET /api/v1/people/{id}/account/movements` (staff-only, e2e `people-management.spec.ts`/`account-adjustments.spec.ts` con AD-5).
- Landing per ruolo: `dashboard/page.tsx` (story 12.12) — sede probabile dell'item 16 (card/sezioni per profilo).
- Route fuori registry documentate in CLAUDE.md — la nuova pagina invece È in registry (aggiorna la Route map di CLAUDE.md se la convenzione lo richiede: il registry resta l'unica fonte, CLAUDE.md non elenca — verifica).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md` (inclusa lezione 14.8: spec singoli su next dev a `--workers=1`; gate vero = suite CI=1 prod). Story UI → `design-taste-frontend` + `ui-ux-pro-max`. Commit su `dev`: `feat(14.6): area personale — le mie transazioni in sidebar, profili solo attivi` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Pagina compensi istruttore e toggle prenotazione (story 14.7).
- Qualsiasi cambiamento alla Contabilità/scheda persona staff-facing.
- Export dell'estratto personale (se non banale col riuso esistente — decisione del dev, motivata).

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
