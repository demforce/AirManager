---
baseline_commit: 3073f78
---

# Story 14.6: Area personale — "Le mie transazioni" in sidebar e profili visibili solo se attivi

Status: done (review Opus 5 shippable-with-fixes, zero major — fix F1-F7 `3587c77`, arbitro 289/289, 0 flaky — 2026-07-29)

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

Reviewer adversarial (Opus 5), 2026-07-29. Perimetro: `git diff 4c9410a..HEAD` (commit `3a4e1da` feat, `95af7cd` docs) — 12 file. Verifica **empirica**: 5 sessioni HTTP reali (admin/staff/istruttore/pilota/allievo) + 1 login senza persona, ispezione `psql` diretta, driving UI reale (Playwright throwaway `playwright-core`, il MCP non è disponibile su questa macchina), build prod + `next start`.

**Esito: shippable-with-fixes.** Nessun blocker, nessun major. La proprietà centrale della story — l'isolamento self — **tiene sotto ogni vettore provato**. I rilievi sono 3 minor + 4 nit, tutti fuori dal cuore di sicurezza.

### Full suite

Arbitrata dalla sessione principale e accettata: DB fresco, build prod, `CI=1 npx playwright test` → **288 passed (9.5m), exit 0, 0 flaky**. Non rieseguita (nessun motivo di dubbio: i test nuovi sono discriminanti — vedi D3).

Eseguito da me:
- `npm run gates` → `PASS lint (30s) / PASS typecheck (5s) / PASS test (14s) — 1571 passed / PASS build (41s)`.
- `npx playwright test e2e/my-account.spec.ts e2e/home-dashboard.spec.ts --workers=1` contro build prod **su DB volutamente sporcato dagli attacchi** → **12 passed (29.2s)**.

> ⚠️ Il DB locale è rimasto sporco per effetto delle fixture d'attacco (persona "Vittima Bersaglio" con conto 999,00 €; user `orphan@example.test` ora ADMIN senza persona; aeromobile `I-REV146`; 26 movimenti + 1 volo su pilot@). Profili seed disattivati durante i test sono stati **riattivati**. Reset DB obbligatorio prima di qualunque run finale.

### Deviazioni del dev

| # | Verdetto | Evidenza chiave |
|---|---|---|
| **D1** | **ACCETTATA** | `GET /people/<own>/account/movements` da sessione pilota → **200**; con id altrui → **403 FORBIDDEN**. `assertReadAccess` (`accounts.service.ts:97-103`) consentiva già il self dalla 13.3; l'e2e AD-5 non è stato toccato. `getOwnAccountOverview`/`listOwnAccountMovements` non hanno davvero un parametro personId → IDOR impossibile per costruzione, confermato: `?personId=<victim>`, `?id=<victim>`, `?page=…` → 200 e **zero** occorrenze del marker del conto altrui. |
| **D2** | **ACCETTATA** | Export con id altrui forzato: xlsx **403**, PDF **403** (gate `assertReadAccess` prima di ogni lettura, `exports.service.ts:348`/`:524`). Sul proprio id: xlsx con **4 sole colonne** (niente "Registrato da"), PDF 200. Nessun oracolo di esistenza (id inesistente vs altrui: stesso 403, stesso timing). `pageSize` capped a 100. |
| **D3** | **CORRETTA**, enumerazione **incompleta** (→ F2) | Istruttore con profilo disattivato: da "Buongiorno, Ines" + KPI compensi + "La mia giornata" → landing pilota. In DB `User.roles` resta `{INSTRUCTOR}` ⇒ il vecchio gate avrebbe tenuto la faccia istruttore ⇒ il nuovo e2e è **genuinamente discriminante**. Grep indipendente su `roles.includes|roles.some|primaryRole`: nessun'altra superficie self-service *portatrice di dati* gated sul ruolo. Ma `canBook` passa da `hasPermission` e sfugge al grep → F2. |
| **D4** | **ACCETTATA** come residuo | La chip etichetta il RUOLO, che è ancora davvero INSTRUCTOR: non è falsa, solo di grana diversa. Zero dati. |
| **AC5** | **CONFERMATA** | Login PILOT reale con `personId: null`: 200, "Nessun conto attivo", 0 righe, **nessun link di export renderizzato**, nessun errore nel log prod. Coerente, non rotta. |

### Findings

| # | Sev | Titolo | File:riga |
|---|---|---|---|
| F1 | minor | `/dashboard/my-account` è l'unica voce di registry role-restricted **servita** ai ruoli esclusi → breadcrumb **vuoto** per admin/staff/istruttore (ogni altra route fa 307 → `/dashboard`) | `my-account/page.tsx:34-41`, `layout.tsx:113`, `top-bar.tsx:61-62` |
| F2 | minor | AC4: `renderPilotLanding` dichiarata "AUDITATA, nessun fix necessario" ma la CTA "Prenota volo" è **role-gated** mentre il dominio richiede il profilo ATTIVO → vicolo cieco 403 (preesistente e sistemico, ma l'affermazione di audit è falsa) | `dashboard/page.tsx:635,654` |
| F3 | minor | `statementBasePath` — l'unica modifica di comportamento al componente condiviso — ha **zero copertura**: le fixture creano 2 movimenti ⇒ `totalPages === 1` ⇒ la paginazione non è mai renderizzata in test | `account-section.tsx:182`, `my-account.spec.ts:185` |
| F4 | nit | A 390px l'**importo è fuori viewport** (griglia a colonne fisse, `overflow-x:auto` senza affordance). Identico alla scheda persona ⇒ ereditato, non regressione; ma "mobile verificato" è sovrastimato | `account-section.tsx:199` |
| F5 | nit | Il KPI "Saldo conto" della landing pilota punta ancora a `people/{id}/account` (→ 307 → scheda persona staff-shaped), non alla nuova pagina | `dashboard/page.tsx:664` |
| F6 | nit | `table.recordedBy`/`table.actions` popolate ma mai renderizzabili — contraddice la regola che il dev applica a `topUp`/`adjustments` due righe sotto | `my-account/page.tsx:101-102` |
| F7 | nit | Colonna "Azioni": `cols`/header su `canManageFinance`, cella di riga su `canManageFinance && labels.adjustments` → disallineamento latente reso rappresentabile dalla nuova opzionalità | `account-section.tsx:199,266,297` |

### Cosa ha retto (verificato, non letto)

- **Isolamento self**: JSON, xlsx, PDF, payload RSC, query manipolate, scritture. Zero fughe.
- **Nessun leak da cache**: stessa URL da 6 identità → 6 payload corretti, `Cache-Control: private, no-store`.
- **Percorso staff invariato**: "Registrato da" + entrambi i bottoni presenti su `people/[id]`; zero righe di diff su quella pagina.
- **Aritmetica contro il DB**: `SUM(amountCents)=52500` (psql) = "525,00 €" a schermo; volo 30' @120 €/h ⇒ `FLIGHT_CHARGE -6000` ⇒ "−60,00 €" in `var(--bad)`, saldo 465,00 € — prospettiva pilota, non club (`/transactions` lo classifica `REVENUE`).
- **Paginazione** su 26 movimenti: 20/6, clamp di `?page=999` e `?page=abc/-1/0`.
- **RBAC sidebar** inclusi ruoli composti: INSTRUCTOR+PILOT la vede, ADMIN no.
- **i18n**: parità totale it/en (0 chiavi orfane), `/en/…` completamente tradotta.

### Fix post-review (2026-07-29, chirurgici in sessione principale — commit `3587c77`)

Nessun major: l'isolamento self ha retto a OGNI vettore provato dal reviewer (6 identità reali, probe su JSON/xlsx/PDF/payload RSC/query manipolate/scrittura, cache RSC per-identità) — il marker segreto del conto vittima non è mai comparso.

- **F1 fixed** — i titoli di pagina derivano dal registry COMPLETO (`NAV_ITEMS`) e non dai soli item visibili al ruolo: il breadcrumb vuoto su una route role-restricted ma servita (my-account per un admin) è chiuso come CLASSE, non come istanza.
- **F2 fixed (il più sostanzioso)** — la CTA "Prenota volo" della landing pilota era gated sul PERMESSO (= ruolo) mentre `createBooking` richiede un PROFILO ATTIVO (`bookings.service.ts:485`): un pilota con profilo disattivato finiva in un vicolo cieco 403. Ora gated su `person.activePilotLicenseType !== null` (segnale esatto: `PilotProfile.licenseType` è non-nullable, quindi non-null ⟺ profilo attivo; un attore che raggiunge QUESTA landing non ha profilo istruttore attivo per costruzione). Il bottone gemello su `/dashboard/bookings` è PRE-esistente e fuori perimetro → TD. **La dichiarazione "renderPilotLanding AUDITATA, nessun fix necessario" del Dev Agent Record era falsa** ed è corretta qui.
- **F3 fixed** — `statementBasePath` (unica riga di comportamento nuovo nel componente condiviso) aveva zero copertura: e2e con 21 movimenti che asserisce href della paginazione, navigazione che RESTA su `/dashboard/my-account` e clamp di `?page=999`.
- **F5 fixed** — il KPI saldo della landing punta alla pagina self-service invece che alla scheda persona staff-shaped. **Questo fix ha rotto un e2e della story 3.2** che asseriva la vecchia destinazione: aggiornato al valore CORRETTO (`/dashboard/my-account`) mantenendo tutti gli assert sostanziali (saldo, movimenti, assenza "Registrato da"); il redirect `/account`→scheda persona della 13.3 resta coperto da 6 altri punti della suite — nessuna copertura persa. Preso SOLO dalla full suite: i run mirati mostravano invece 2 flake di login.
- **F6/F7 fixed** — `table.recordedBy`/`table.actions` resi opzionali col pattern già usato da `topUp`/`adjustments` (niente stringhe morte oltre il confine RSC); una sola condizione `showActions` per i 3 punti della colonna Azioni (con narrowing preservato sulla cella).
- **F4 → TD** — estratto conto non responsive sotto ~700px (importo fuori schermo, scroll orizzontale senza affordance): difetto EREDITATO dal componente condiviso, identico byte per byte sulla scheda persona preesistente. La dichiarazione "mobile verificato" del Dev Record era sovrastimata; tracciato come TD.

**Gates post-fix**: PASS lint/typecheck/test/build — 1571 unit.

**Full suite finale (arbitro = sessione principale, build prod, DB fresco)**:

```
289 passed (9.5m)
```
Exit code `0`, zero flaky. (Run precedente: 273 passed + 1 FALLIMENTO REALE causato dal fix F5, corretto sopra.)

**Esito finale: tutti i findings chiusi (F4 e la CTA di `/dashboard/bookings` tracciati come TD). Story DONE.**
