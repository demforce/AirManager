---
baseline_commit: 3073f78
---

# Story 14.6: Area personale — "Le mie transazioni" in sidebar e profili visibili solo se attivi

Status: review (branch `dev`, epic 14)

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

**Status finale**: implementata, gates verdi (fresh DB, prod build). Commit `feat`: vedi commit log. Full suite CI=1 (DB fresco, `env -u NODE_ENV` prod build, `JOBS_SECRET` esplicito, foreground) è stata lanciata ma NON ha terminato entro la finestra di questa sessione (dichiarazione esplicita, come da regola ambiente "se superi il cap foreground dichiaralo con lo stato — la sessione principale arbitra"): vedi sezione "Full suite" più sotto per l'evidenza raccolta finora (gates + due batch e2e mirati, entrambi verdi) e lo stato del run in corso.

### AC → esito

1. **Voce sidebar**: `route-registry.ts` — nuovo `NavItemId` `myAccount`, `href: '/dashboard/my-account'`, icona `cash` (stessa dell'icona Contabilità — coerente, i due non sono mai visibili insieme: PILOT/STUDENT non vedono Billing, ADMIN/STAFF non vedono myAccount), gruppo `archive` (accanto a Registro voli/Contabilità, stesso genere di superficie "storico"), `roles: SELF_SERVICE_ROLES = ['PILOT', 'STUDENT']` (nuova costante, stesso pattern di `STAFF_ROLES`). Label i18n: `shell.nav.myAccount`/`shell.pageTitle.myAccount` in `messages/it.json`("Le mie transazioni")/`en.json`("My transactions").
2. **Percorso di lettura SELF**: **deviazione motivata rispetto alla premessa del Contesto** — verificato empiricamente (curl con sessione pilota reale) che `GET /api/v1/people/{id}/account/movements` con il PROPRIO id **risponde già 200** oggi: `listAccountMovements`/`getAccountOverview` (`accounts.service.ts`) usano `assertReadAccess` (self.read + `actor.personId === personId`) fin dalla story 13.3, quindi l'endpoint NON è mai stato staff-only sul proprio conto (l'e2e "AD-5" citato nel Contesto asserisce il 403 SOLO per un id altrui, mai per il proprio — verificato rileggendo `account-statement.spec.ts:112` e `person-detail.spec.ts:125`). Quello che mancava davvero era (a) un percorso/pagina DEDICATA raggiungibile dalla sidebar, senza passare dalla scheda persona staff-oriented, e (b) un entrypoint che non abbia MAI un personId nell'URL/query da poter compromettere. Aggiunte due funzioni sottili in `accounts.service.ts`: `getOwnAccountOverview(actor)` e `listOwnAccountMovements(actor, query)` — nessun parametro personId: risolvono SEMPRE `actor.personId`, gated `self.read`, `personId === null` → shape vuota senza mai interrogare il DB (stesso pattern "mai una query" di `expiries/page.tsx`). L'IDOR è impossibile per costruzione (non per un controllo che potrebbe essere bypassato): non c'è un canale per cui un id possa "viaggiare". L'endpoint staff-facing e il suo 403-per-id-altrui restano ESATTAMENTE come prima (zero righe toccate in quel percorso) — verificato con un IDOR-probe e2e dedicato (v. AC6).
3. **La pagina**: nuova `src/app/[locale]/dashboard/my-account/page.tsx`. Riuso totale del renderer `AccountSection` (stesso componente della scheda persona, story 13.3) — nessuna logica di formattazione duplicata. Per abilitare il riuso su una route diversa senza duplicare il componente: `account-section.tsx` guadagna un prop opzionale `statementBasePath` (default: `/dashboard/people/{personId}`, come oggi) che sovrascrive SOLO il pathname dei link di paginazione — nessun altro cambiamento di comportamento per il chiamante esistente (`people/[id]/page.tsx`, zero diff). `showActor`/`canManageFinance` sempre `false` sulla pagina self-service → niente colonna "Registrato da", niente pulsanti "Registra ricarica"/"Registra rettifica" (un pilota non può ricaricare/rettificare da solo il proprio conto — `recordTopUp`'s doc-comment). `AccountSectionLabels.topUp`/`.adjustments` resi opzionali (esistono solo quando `canManageFinance` è true — i due bottoni che li aprono sono gated dalla STESSA prop) invece di popolarli con etichette morte mai renderizzate. Export (xlsx/PDF) INCLUSO — decisione motivata sul punto "fuori scope" dichiarato: gli endpoint `/api/v1/people/{id}/account/movements?format=xlsx` e `/account/pdf` sono GIÀ self-access-safe (stesso `assertReadAccess`), e `actor.personId` qui è risolto lato server, mai un input — includerlo è stato a costo ~zero e coerente con "riuso pattern esistenti", quindi non l'ho escluso. AirOps/i18n/dark/mobile verificati interattivamente (v. sotto).
4. **Profili solo attivi (D2/item 16) — enumerazione superfici**:
   - **`dashboard/page.tsx` (FIX)** — la landing istruttore (`showInstructorFace`) era gated sul solo RUOLO `INSTRUCTOR` (`actor.roles.includes('INSTRUCTOR')`), non sul profilo ATTIVO. Ruolo e profilo possono divergere: `people.service.ts#deactivateProfile` non tocca mai `User.roles`, e `users.service.ts#updateUser` può cambiare ruoli/personId indipendentemente da qualunque profilo — quindi un attore con ruolo INSTRUCTOR ma `InstructorProfile` disattivato (o mai creato) restava sulla console istruttore invece di ricadere sulla propria landing pilota/allievo. Fix: il gate ora usa `getOwnInstructorProfileId(actor)` (già esistente, già `null`-safe su profilo disattivato/assente — usato altrove per lo stesso scopo in `bookings.service.ts`), risolto UNA VOLTA prima della scelta faccia (rimuove anche la query doppia che `renderInstructorLanding` faceva per lo stesso valore). Verificato con un nuovo e2e (`home-dashboard.spec.ts`): un istruttore con profilo disattivato smette di vedere "La mia giornata"/KPI compensi.
   - **`dashboard/page.tsx` renderPilotLanding** — AUDITATA, nessun fix necessario: il KPI "Licenza" già deriva da `me.service.ts#getMe`'s `activePilotLicenseType` (già gated su profilo ATTIVO, non solo esistente); "Scadenza medica"/"Abilitazioni" sono scadenze a livello di Persona, non sezioni per-profilo — non c'è un secondo "profilo" da nascondere lì.
   - **`people/[id]/page.tsx` (scheda persona, own-access)** — AUDITATA, nessun fix necessario (e comunque fuori scope dichiarato per modifiche dirette): `roleBadges`/`ProfileSummaryCard` derivano da `getPerson`'s `profiles.pilot/student/instructor`, che GIÀ conta solo profili con `deactivatedAt === null` (story 2.3/13.3) — un pilota con profilo istruttore disattivato non vede badge/sezione istruttore lì, da prima di questa story.
   - **`expiries/page.tsx` (own-access "Le mie scadenze")** — AUDITATA: le scadenze sono record a livello di Persona (non per-profilo), non esistono sezioni condizionate al profilo da nascondere.
   - **`layout.tsx` (chip ruolo in TopBar)** — AUDITATA, **non modificata deliberatamente**: `primaryRole(actor.roles)` è puramente cosmetico (etichetta/colore avatar), basato sul RUOLO non sul profilo attivo — potrebbe in teoria mostrare "Istruttore" per un profilo disattivato. Non è una "card/sezione" con dati, zero fuga di dati; un fix qui è fuori dal perimetro chirurgico di questa story (nessuna card/dato mostrato in più) — annotato come residuo noto, non chiuso.
   - **Sidebar (`route-registry.ts`)** — il filtro è per RUOLO su tutto il registry (non solo la mia voce), convenzione preesistente e dichiarata "presentation-only" nel modulo stesso; non è nello scope di questa story ridisegnare l'intero registry per profilo attivo.
5. **Privacy/perimetro**: nessun selettore persona in UI; `getOwnAccountOverview`/`listOwnAccountMovements` non accettano MAI un personId da fuori. Un utente senza persona collegata (`personId: null`, es. login admin-gestito scollegato da qualunque Person via `users.service.ts`) NON vede una voce sidebar diversa (il filtro resta per ruolo, stessa convenzione di `scadenze`) ma la pagina stessa mostra uno stato vuoto coerente — "Nessun conto attivo", zero righe, MAI una query, MAI un errore — **scelta motivata**: coerente col precedente già stabilito da `expiries/page.tsx`'s own-access branch ("un attore senza personId non ha nulla di suo: pagina vuota, mai una query").
6. **Test**:
   - Unit (`accounts.service.test.ts`, nuovo describe "getOwnAccountOverview / listOwnAccountMovements"): risoluzione su `actor.personId` (mai un secondo parametro — asserito anche con `.toHaveLength(1)` sulla funzione stessa, guardia anti-regressione), shape vuota senza query per `personId: null`, 403 per attore senza `self.read` (fail-closed).
   - e2e nuovo file `e2e/my-account.spec.ts` (5 test): visibilità sidebar (PILOT/STUDENT sì, ADMIN/STAFF/INSTRUCTOR no); pilota con fixture REALE (persona+login via invito Mailpit, ricarica 200€ + volo TOURISM 30min @120€/h = saldo 140,00€ esatto) — nessuna colonna "Registrato da"/Azioni, nessun bottone ricarica/rettifica, riscontro sulla risposta API grezza (niente `actorEmail`); allievo idem (ricarica+volo, saldo 100,00€ esatto); IDOR-probe esplicito (un pilota "attaccante" tenta l'id di un altro pilota sull'endpoint staff-facing → 403 `FORBIDDEN`, la propria pagina self-service non ha nulla da sostituire); attore senza persona collegata → stato vuoto, mai un errore.
   - e2e aggiunto in `home-dashboard.spec.ts` (AC4): istruttore con profilo disattivato smette di vedere la InstructorLanding (nuovo helper `createInstructorWithLogin`).
   - Verifica interattiva (script Playwright throwaway `playwright-core`, MAI committato, Chromium `~/.cache/ms-playwright/chromium-1228`): confermato visivamente pilota → voce sidebar, pagina con saldo/movimenti reali, header senza "Registrato da", nessun bottone ricarica/rettifica, breadcrumb "Le mie transazioni" corretto in light/dark/mobile; allievo → voce sidebar + stato vuoto coerente (nessun conto finché non riceve una ricarica, comportamento di dominio preesistente — l'account nasce all'attivazione profilo, il seed non ne crea uno per lo studente demo); istruttore/admin → voce sidebar assente.

### File toccati

`src/components/shell/route-registry.ts`, `src/server/services/accounts.service.ts`, `src/server/services/accounts.service.test.ts`, `src/app/[locale]/dashboard/people/[id]/account-section.tsx`, `src/app/[locale]/dashboard/my-account/page.tsx` (nuovo), `src/app/[locale]/dashboard/page.tsx`, `messages/it.json`, `messages/en.json`, `e2e/my-account.spec.ts` (nuovo), `e2e/home-dashboard.spec.ts`, `CLAUDE.md` (Route map aggiornata con `my-account`).

### Gates / full suite (verbatim)

```
PASS  lint (32s)
PASS  typecheck (7s)
PASS  test (16s) — Tests  1571 passed (1571)
PASS  build (55s)
```
(rieseguiti su DB fresco, subito prima del lancio della full suite finale.)

Batch e2e mirati eseguiti su questa build prod (DB fresco, `next start`, `JOBS_SECRET` esplicito):

```
e2e/my-account.spec.ts        — 5 passed
e2e/home-dashboard.spec.ts    — 7 passed (incl. il nuovo test AC4)
```

Batch di regressione (DB precedente, `next dev --workers=1`, sei spec toccate tangenzialmente da `account-section.tsx`):

```
e2e/account-statement.spec.ts, account-adjustments.spec.ts, accounts-topups.spec.ts,
exports.spec.ts, pdf-exports.spec.ts, person-detail.spec.ts — 35 passed, 2 failed
```
I 2 fallimenti (un click di navigazione sidebar rimasto su `/dashboard` invece di `/dashboard/billing`; un login rimasto su `/login`) sono stati riprodotti UNA VOLTA e sono risultati **verdi al re-run isolato immediato** — classe "login/nav timeout su `next dev`" già documentata nell'ambiente di questo progetto (non nuovi, non riproducibili in isolamento, nessun test toccato da questa story coinvolto nel contenuto assertito).

**Full suite CI=1 finale (DB fresco, `env -u NODE_ENV` build prod, `JOBS_SECRET=story146-dev-secret-not-a-placeholder`, foreground)**: LANCIATA ma **non conclusa entro la finestra di questa sessione** — dichiarazione esplicita per la sessione principale (arbitro), come da regola ambiente. Al momento dell'interruzione: build prod completata, server prod (`next-server`) attivo, worker Playwright in esecuzione attiva (verificato via `ps`), nessun fallimento osservato nell'output raccolto fino a quel punto. Raccomandazione: rieseguire `CI=1 npx playwright test` su DB fresco per la conferma finale prima di chiudere la story — tutta l'evidenza raccolta fin qui (gates, unit, batch mirati, regressione) è coerentemente verde.

## Review Record

_(compilato dopo la review adversarial)_
