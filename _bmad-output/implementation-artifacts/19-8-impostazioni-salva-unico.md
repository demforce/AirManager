---
baseline_commit: a7e960e
---

# Story 19.8: Impostazioni a Salva unico

Status: **review** — dev 2026-11-02 (commit `72ad09e`), Dev Agent Record sotto. Scritta: ready-for-dev 2026-11-01. **Nessuna domanda PO aperta**: le scelte di §0.3 sono di resa UI o tecniche, ognuna ricondotta a una ratifica chiusa (R-19-i/j/k/m, A17) o a un precedente del codice (19.3/19.4); la sessione principale può portarle al PO se lo ritiene. **Modello dev: Opus 5 xhigh (UI)** — la story riscrive l'intera pagina Impostazioni (9 sezioni, due facce desktop/mobile) attorno a uno stato in bozza, aggiunge un endpoint composito transazionale, estrae i core di scrittura di tre service, e riscrive 6 spec e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Un solo dev subagent. Chiave sprint-status: `19-8-impostazioni-salva-unico`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` di questo file è misurato su **`a7e960e`** (i file delle Impostazioni sono identici a `869c9cf`). Il dev della 19.8 parte **DOPO il commit di 19.1…19.7**:
> - **19.1** (committata, `08eb558`) ha già tolto tassa e istruzioni PPR dalla card Club (oggi 3 PUT, non 5) e la serie PPR delle impostazioni: nulla di PPR deve ricomparire.
> - **19.7** (`19-7a-scadenze-modello-regole-quota-currency.md`, scritta in parallelo a questa) consegna il **backend** di currency, quota e visite mediche senza ambito. **Contratti concordati col writer della 19.7 il 2026-11-01** (da riverificare sul codice committato al T0: la review della 19.7 può rinominarli; ogni differenza si annota nel Dev Agent Record §A — cambia il nome, non il disegno):
>
> | Contratto 19.7 | Forma | Uso qui |
> |---|---|---|
> | Currency — chiavi | AppSetting `currency.minFlights` (X, intero **1…99**, default **1**) e `currency.windowDays` (Y, intero **1…3650**, default **90**); chiave assente o valore invalido = default (R-19-i) | sezione «Currency» (AD-6), limiti del mirror client (AD-9) |
> | Currency — service | `getCurrencySettings(): Promise<{ minFlights: number; windowDays: number }>` **senza gate** (la leggono i check di voli/prenotazioni di qualunque attore, come `getSchedulingSettings`; valore salvato fuori limiti → default con `console.warn`) e `setCurrencySettings(actor, input)` gated `settings.manage`; schema `currencySettingsSchema` + tipo `CurrencySettingsInput` in **`src/lib/schemas/settings.ts`**; costanti `CURRENCY_DEFAULTS` nel modulo **puro** `src/lib/currency.ts` (non importa `settings.ts`, niente env eager) — è da lì che il mirror client di AD-9 legge default (e limiti, se la 19.7 li esporta lì; altrimenti li si aggiunge lì, mai duplicati a mano). **Firma richiesta al dev della 19.7** (lo story file della 19.7, §5.10, rimanda a questa riga): esportare anche `writeCurrencySettingsCore(tx: Prisma.TransactionClient, input: CurrencySettingsInput): Promise<void>` (solo upsert su `tx`, nessun `authorize` dentro) e scrivere `setCurrencySettings` come `authorize(actor, 'settings.manage')` + core; la firma pubblica del setter resta quella della 19.7, **nessun** parametro `tx` opzionale. Se al T0 il core manca, lo estrae questa story con lo stesso nome | AD-2: blocco `currency` del composito; AD-3 |
> | Currency — route singola | la 19.7 **non** aggiunge route né UI: **questa story** aggiunge `GET`/`PUT /api/v1/settings/currency` (+ OpenAPI, `registry.test.ts`) sul modello di `settings/scheduling/route.ts` — `GET` senza gate come il getter (D-8: ogni blocco del composito ha la sua route singola) | D-8, AC 7 |
> | Quota — importo | chiave **invariata** `membership.annualFeeCents`, `getMembershipFeeCents` (`finance.manage`) / `setMembershipFeeCents` (`settings.manage`), `PUT /api/v1/settings/membership-fee` invariata; validità **fissa 12 mesi** nel service, non configurabile (R-19-k) | sezione «Quota associativa» (AD-6) |
> | Quota — tipo di scadenza | nuovo valore **`ExpiryTypeKind.MEMBERSHIP`** sulla riga «Quota associativa» (un solo tipo MEMBERSHIP, indice unico parziale); create/PATCH con `kind: 'MEMBERSHIP'` → 422 `VALIDATION_ERROR` (`expiryTypeKindInputSchema` = `RATING \| MEDICAL`); `PATCH`/`DELETE` sul tipo quota (anche `{ isActive: false }`) → **409 `MEMBERSHIP_TYPE_LOCKED`** (dopo il 404, prima di ogni altra regola) | AD-4/AD-7: lo snapshot espone solo i tipi `RATING` e `MEDICAL` (la card Ratings filtra già per `kind`, `page.tsx:162`); nel composito `kind` del create è l'enum ristretto `RATING \| MEDICAL`; i rifiuti della 19.7 vivono nei **core** estratti (AD-3), così valgono identici dal composito (409/422 con `details.item`) |
> | Visite mediche senza ambito | **invariante dei dati** (19.7 D-3): `kind = MEDICAL ⇒ scope = 'ALL' ∧ blocksBooking = true` (migrazione + CHECK); su `POST` `scope` e `blocksBooking` diventano **opzionali** e il service li risolve per `kind` (MEDICAL omessi → `ALL`/`true`; espliciti e diversi → **422 `MEDICAL_TYPE_FIELDS`**; RATING: `scope` omesso = `ALL`, `blocksBooking` omesso = `false`); `PATCH` valuta lo stato **risultante** (stesso 422). Regola «almeno una visita valida di qualsiasi classe» | AD-7: la lista «Visite mediche» ha **solo** nome, validità (mesi) e attiva — **niente** «Ambito» e **niente** «Blocca prenotazioni e voli» su nessuna faccia; il create di un MEDICAL manda **solo** `{ name, kind: 'MEDICAL', validityMonths }`, un update solo `name`/`validityMonths`/`isActive` |
> | Ratings | invariati: ambito + «Blocca prenotazioni e voli» + validità | AD-7 |
> | Licenza | tipo e righe cancellati in migrazione dalla 19.7 (seed `:365`) | nessun lavoro qui: sparisce dalla lista Ratings da sé |
>
> - **Tocco transitorio della 19.7 (D-18)**: nel form di `ratings-card.tsx` con `kind === 'MEDICAL'` la 19.7 toglie il select dell'ambito e il checkbox «Blocca prenotazioni» e non li manda nel body; la colonna ambito della tabella (che mostra «Tutti») e lo sheet mobile restano a questa story. La 19.7 adatta anche `expiry-types.spec.ts:48-58`, `:114-122` (visite «Tutti», quota assente dai rating, nessuna scelta d'ambito): **partire dal suo stato**, non da quello di `a7e960e`.
>
> Prima di scrivere una riga: `git log --oneline -10` (19.1…19.7 committate); leggere lo story file **e il codice committato** della 19.7; rieseguire i **censimenti di §3** (sono comandi, non elenchi da fidarsi) e annotare gli scostamenti nel Dev Agent Record §A.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (convenzioni e2e — catena serializzata degli spec che scrivono AppSettings, `getByLabel` substring, mai `Escape` per chiudere un popup dentro un pannello, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, unit test ed env eager, gates); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §2.3 «Salva unico», §4.0 **R-19-i**, **R-19-j**, **R-19-k**, **R-19-m**, §4.2 riga 19.8, §4.5, §4.6, §4.10 **A17**; gli story file **19.3** e **19.4** (i gemelli a Salva unico: D-3 diff, D-5 Salva disabilitato, D-6 nessun dirty-guard, D-8 route singole che restano); **15-8b** (faccia mobile di questa pagina, R-15.8b-d). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`) — coerenza AirOps, nessun linguaggio visivo nuovo.

---

## ❓ Domande PO aperte

**Nessuna.** Le ratifiche di dominio che questa story consuma sono tutte chiuse (R-19-i currency X/Y configurabili, R-19-j visite mediche senza ambito, R-19-k quota a sé con l'importo, R-19-m tutto dal Salva unico comprese le liste, A17 composito atomico). Le scelte su delega sono in §0.3; le due che toccano più da vicino il testo del PO («un solo tasto salva alla fine della pagina») sono **D-7** (le liste si modificano senza nessun bottone di conferma di riga) e **D-4** (barra del Salva in fondo alla pagina, appiccicata al bordo inferiore): se la sessione principale le ritiene assunzioni da ratificare, le opzioni scartate sono scritte accanto.

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che la pagina Impostazioni abbia **un solo «Salva», in fondo alla pagina**, che salva insieme — **tutto o niente** — Club (nome, ICAO, email di contatto, stazione METAR), Quota associativa (importo), Currency (X voli negli ultimi Y giorni), Pianificazione, Email SMTP, Tesoreria e le tre liste Ratings, Visite mediche (senza ambito) e Categorie di cassa, che restano in bozza finché non premo Salva; mentre «Invia email di prova» resta un'azione a parte,

so that non debba più ricordarmi quale delle otto card ho salvato e quale no (punti PO 7 e 12, R-19-m), un errore in una sezione non lasci mai le impostazioni salvate a metà (A17), e le regole operative nuove (currency R-19-i, quota R-19-k) si configurino dove si configura tutto il resto.

### Il perché

Oggi la pagina è un mosaico di **otto salvataggi indipendenti** (inventario completo in §3.1): il nome dell'aviosuperficie ha il suo «Salva» dentro la card Club, che ne ha un secondo per ICAO/email/METAR/quota (3 PUT in `Promise.all`, **non atomici**: `club-card.tsx:73-89`); Pianificazione, SMTP e Tesoreria hanno un «Salva» ciascuna; le tre liste (Ratings, Visite mediche, Categorie di cassa) scrivono **immediatamente** a ogni «Crea», «Salva», «Disattiva/Riattiva» ed «Elimina → Sì». La R-19-m supera questo modello: niente si salva finché non si preme Salva, comprese le liste.

### Fatti misurati che vincolano il design (su `a7e960e`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| La card Club fa 3 PUT in parallelo e legge solo `.ok` | `club-card.tsx:73-89` (`settings/club`, `settings/metar-station`, `settings/membership-fee`), esito `:108` | il precedente che A17 vieta di replicare: **una** richiesta, una transazione (AD-1, AD-2) |
| Ogni setter scrive su `prisma` con le sue `$transaction` a batch | `setSchedulingSettings` `app-settings.service.ts:185`, `setSmtpSettings` `:265`, `setTreasurySettings` `:474-490`; `setAirfieldIcao` `:92-96`, `setAirfieldContactEmail` `:116-120`, `setMetarStation` `:321-325`, `setMembershipFeeCents` `:367-371`, `setAirfieldBranding` `:384-388` | per comporli in **una** transazione servono core che ricevono `tx` (AD-3); i setter pubblici li chiamano, le route singole non cambiano comportamento |
| Le liste hanno 9 funzioni di scrittura su `prisma` | `createExpiryType`/`updateExpiryType`/`deleteExpiryType` `expiry-types.service.ts:98-208`; `createCashCategory`/`renameCashCategory`/`deactivateCashCategory`/`reactivateCashCategory`/`deleteCashCategory` `cash.service.ts:98-230` | stessi core `tx` (AD-3); **una** implementazione per regola (nome unico, «in uso», categoria di sistema) |
| Tutte le scritture sono `settings.manage`; ADMIN ha tutto | ogni setter/CRUD sopra fa `authorize(actor, 'settings.manage')`; le **letture** sono più larghe (`getMembershipFeeCents` `finance.manage` `:347`, `listCashCategories` `finance.manage` `cash.service.ts:76`, `listExpiryTypes` `expiries.manage` `expiry-types.service.ts:74`); `rbac.ts`: `ADMIN: ALL_PERMISSIONS` | il composito autorizza **una** volta `settings.manage` prima di ogni query (AD-2 passo 1); nessun RBAC per blocco (karpathy: nessun attore reale ne avrebbe bisogno) |
| `settings.ts` importa `@/lib/env` (validazione **eager**) | `src/lib/schemas/settings.ts:1` (SSRF dell'host SMTP, `:132-143`); le card importano da lì **solo tipi** (`import type`, `smtp-card.tsx:6`, `settings-form.tsx:6`) | il client non può importare gli schemi: la validazione client è un **mirror** in un modulo puro (AD-9); i test di un service che importa `app-settings.service` devono mockare la catena env (CLAUDE.md, §3.5) |
| Il 422 di forma raggruppa per **prima chiave** | `validationErrorResponse` → `z.flattenError` (`src/lib/api/handler.ts:45-49`); `parseApiError` legge solo i nomi delle chiavi (`src/lib/api-field-errors.ts:29-37`) | con blocchi annidati la chiave sarebbe `smtp`, non `host`: il composito produce `fieldErrors` a **percorso puntato** (`smtp.host`, AD-1) — l'SSRF dell'host è una regola che il client **non può** rispecchiare (`env.SMTP_HOST`) |
| I 409 delle liste sono tutti `CONFLICT` generico | `expiry-types.service.ts:105,115,147,166,193,200`; `cash.service.ts:109,127,145,171,186,212,215,222`; `cash-register.spec.ts:183` asserisce `CONFLICT` sulla route singola | il codice resta `CONFLICT` (contratto); la causa e la riga viaggiano in `details` (`reason`, `item` — AD-5), additivi anche sulle route singole |
| Il body ha un tetto di 64 KB | `MAX_BODY_BYTES` `handler.ts:103`, letto solo se c'è un `bodySchema` (`:384-403`) | array del composito con `.max()` (AD-1); la route dichiara comunque un `bodySchema` per avere il tetto (AD-1) |
| Su un'installazione nuova Pianificazione e SMTP mostrano **default non salvati** | `scheduling-card.tsx:37` (`DEFAULTS`, «never written implicitly»), `smtp-card.tsx:54-55` (porta 587, `STARTTLS`) | la baseline del diff si calcola dai **valori mostrati** (default compresi), altrimenti la pagina nascerebbe «modificata» e un Salva qualsiasi scriverebbe i default (trappola 3) |
| Altri spec scrivono le stesse chiavi globali via API | `booking-window.spec.ts:63`, `reports.spec.ts:184,304` (`sched.*`), `membership-fee.spec.ts` ×6, `mobile-metar.spec.ts` ×4, `treasury-settings.spec.ts:63`, `pdf-exports.spec.ts:235` | il client manda **solo i blocchi toccati** (D-3): uno spec che tocca una lista (`expiry-types.spec.ts`, progetto `chromium` `fullyParallel`) non riscrive `sched.*` e resta **fuori** dalla catena serializzata |
| `airfield.contactEmail` ha un consumer | `smtp-test-email.service.ts:23` (destinatario dell'email di prova); il TD 19.1-a lo dichiarava senza consumer | TD 19.1-a **chiuso** come falso positivo: il campo resta, con un hint che dice a cosa serve (AC 12) |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.8)

| # | Requisito |
|---|---|
| **P1** | **Una sola pagina, un solo «Salva» in fondo**: nessun altro bottone della pagina scrive dati. |
| **P2** | Sezioni: **Club** (nome aviosuperficie, ICAO, email di contatto, stazione METAR), **Quota associativa** (importo), **Currency** (X voli negli ultimi Y giorni), **Pianificazione**, **Email SMTP**, **Tesoreria**, liste **Ratings** (con ambito), **Visite mediche** (senza ambito), **Categorie di cassa**. |
| **P3** | Le liste sono **in bozza fino al Salva**: aggiungere, modificare, disattivare/riattivare ed eliminare una voce non scrive nulla (R-19-m). |
| **P4** | Un **endpoint composito atomico**: una richiesta, una transazione, validazione completa della forma prima di qualunque scrittura, **nessun salvataggio parziale** (A17). |
| **P5** | Password SMTP inviata **solo se digitata** (vuota = invariata, come oggi). |
| **P6** | «**Invia email di prova**» resta un'azione separata (R-19-m). |
| **P7** | Il Salva unico vale anche sulla faccia **mobile** (story 15.8b). |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-m** | Tutti i dati dal Salva unico, nelle Impostazioni anche le liste; restano azioni solo quelle con effetti propri (qui: Email di prova). | P1, P3, P6. |
| **R-19-i** | Currency: current con almeno X voli negli ultimi Y giorni, X e Y configurabili dall'admin in Impostazioni (predefiniti 1 e 90). | Sezione Currency (AD-6), blocco `currency` (AD-1). |
| **R-19-k** | Quota associativa 12 mesi dal pagamento, per tutti; fuori dalla card Ratings, sezione propria in Impostazioni con l'importo. | Sezione Quota (AD-6); la riga «Quota associativa» non è nella lista Ratings (AD-7). |
| **R-19-j** | Visite mediche senza ambito: basta una visita valida di qualsiasi classe. | Lista Visite mediche senza «Ambito» (AD-7). |
| **A17** | Endpoint compositi atomici, mai N richieste orchestrate dal client; `club-card.tsx` (oggi `:73-89`) non va replicato. | AD-1, AD-2; AC 1-6. |

**Ratifiche/AC storici SUPERATI da questa story** (da non «ripristinare»): story **12.11** AC 2 limitatamente al «Salva» per card (e l'adattamento «un Salva per la card Club su più endpoint», `club-card.tsx:36-46`); story **13.1** AC 3 e **6.1** limitatamente alla scrittura **immediata** del catalogo tipi di scadenza; story **12.13** review F2 limitatamente alla scrittura immediata delle categorie di cassa; story **Billing-2** AC 4 limitatamente al «Salva» proprio della card Tesoreria; story **15.8b** AC 4 (le card di form «scrivono con gli stessi endpoint») e AC 5/6 limitatamente alla conferma a due passi di «Elimina» nello sheet (`secondStep`, `ratings-card.tsx:472-493`) — la conferma serviva perché l'eliminazione era immediata e irreversibile; ora è reversibile fino al Salva.

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | Il composito è **`PATCH /api/v1/settings`** (path nuovo, oggi libero) con **blocchi opzionali**; ogni blocco scalare è **esattamente il body della route singola** corrispondente (`airfield`, `club`, `metarStation`, `membershipFee`, `currency`, `scheduling`, `smtp`, `treasury`), le liste sono `expiryTypes`/`cashCategories` con `create`/`update`/`delete`. | Precedente 19.3/19.4 («PATCH sulla risorsa con blocchi opzionali»); per la futura app Flutter la regola è una sola: «il composito è un batch atomico dei body che già conosci» | `PUT` con l'intero documento: obbligherebbe a mandare tutto (contro D-3) e a ridefinire la forma |
| **D-2** | Risposta **200** = lo **snapshot completo** delle impostazioni (stessa forma con cui la pagina si carica, AD-4). | Il client riallinea baseline e bozza da un'unica fonte, senza un secondo GET | rispondere `{ ok }` e fare `router.refresh()`: lo stato in bozza del client non si reinizializza dalle props |
| **D-3** | Il client manda **solo i blocchi modificati** (un blocco scalare intero se almeno un suo campo cambia; per le liste solo le voci create/modificate/eliminate, e di una voce modificata solo i campi cambiati). | 19.4 D-3 (protegge ciò che l'utente non ha toccato da un form aperto da tempo); **e2e**: tiene `expiry-types.spec.ts` fuori dalla catena serializzata (Fatti misurati) | mandare tutto: sovrascrive in silenzio le chiavi globali scritte da altri e costringe ogni spec che tocca la pagina a entrare in catena |
| **D-4** | Il «Salva» vive in una **barra in fondo alla pagina** (`settings-save-bar`, ultimo figlio del form), `position: sticky; bottom: 0` — sempre visibile al bordo inferiore e, a pagina scrollata fino in fondo, ferma sotto l'ultima sezione; sul telefono sopra la tab bar. Mostra lo stato: «Nessuna modifica» / «Modifiche non salvate: Club, Ratings». | Testo del PO («un solo tasto salva alla fine della pagina») + 9 sezioni: un Salva solo in fondo, non appiccicato, costringerebbe a scorrere tutta la pagina dopo ogni modifica in alto; idioma esistente: `.so-actions` sticky (`airops.css:1925-1931`) | Salva solo in fondo, statico (alla lettera ma scomodo); Salva nell'header della pagina (non è «alla fine») |
| **D-5** | Salva **disabilitato** quando la bozza è uguale alla baseline o una richiesta è in volo. | 19.4 D-5 | Salva sempre attivo: un click senza modifiche manderebbe un body vuoto (422) |
| **D-6** | **Nessun avviso** «modifiche non salvate» uscendo dalla pagina; nessun «Annulla modifiche» (per scartare si ricarica la pagina). | 19.4 D-6 (i gemelli a Salva unico non ne hanno); l'unico meccanismo economico (`beforeunload`) copre ricarica/chiusura ma **non** i link della sidebar (l'App Router non ha un'API per bloccare la navigazione client): mezzo guardiano che insegna una falsa sicurezza; inoltre Playwright chiude d'ufficio i dialog e bloccherebbe ogni `page.goto` da una pagina sporca (3 spec lo fanno). L'indicatore della barra (D-4) è sempre visibile | `beforeunload` (mezzo guardiano, rompe e2e); intercettare ogni `Link` (sproporzionato) |
| **D-7** | Le liste si modificano **senza nessun bottone di conferma**: «Aggiungi» crea subito una voce in bozza e apre il **pannello di modifica in linea** (lo stesso nodo di oggi sopra la tabella, `ratings-card.tsx:277-289`) **legato alla voce**: ogni campo scrive nella bozza mentre si digita; il pannello ha solo «Chiudi». Disattiva/Riattiva ed Elimina/Ripristina sono **interruttori della bozza**, senza conferma a due passi (reversibili fino al Salva). Ogni voce mostra il suo stato: «Nuova», «Modificata», «Da eliminare». | R-19-m + 19.4 D-7 («un bottone "Salva" di riga che non salva sarebbe ingannevole»; due livelli di «salva» nella stessa superficie) | un sotto-form con «Applica»: secondo livello di conferma che il PO può leggere come un secondo «salva»; righe della tabella tutte editabili: griglia densa a 5 colonne di input, e sul telefono un secondo editor da inventare |
| **D-8** | Le **route singole restano tutte** (le 8 `PUT /settings/*`, `POST/PATCH/DELETE /expiry-types`, il CRUD di `/cash-categories`, `POST /settings/smtp/test-email`), con lo stesso comportamento e gli stessi codici: chiamano gli **stessi core** del composito. La pagina non le chiama più (salvo l'email di prova). | API-first (futura app Flutter: aggiornare un solo valore resta una chiamata semplice); ~25 spec e2e le usano via API per preparare e ripristinare lo stato (`membership-fee.spec.ts` ×6, `booking-window.spec.ts`, `reports.spec.ts`, `mobile-metar.spec.ts`, `cash-register.spec.ts`, i ripristini in `afterAll`…) | toglierle: rottura di contratto e di decine di helper e2e, nessun beneficio |
| **D-9** | «Invia email di prova» usa **la configurazione salvata** ed è **disabilitato** finché il blocco `smtp` o l'email di contatto hanno modifiche non salvate, con l'hint «Salva le modifiche prima di inviare l'email di prova.». L'endpoint non cambia. | L'email di prova serve a provare il mailer **in vigore** (quello che spedirà inviti e avvisi) verso il destinatario **salvato**; una prova sulla bozza proverebbe una configurazione che non è in vigore | mandare la bozza al test-email: cambia il contratto, porta in giro una password non salvata e convaliderebbe una config che le email reali non usano; salvare automaticamente prima della prova: un secondo modo di salvare |
| **D-10** | L'ordine delle sezioni: Club · Quota associativa · Currency · Pianificazione · Email SMTP · Tesoreria · Ratings · Visite mediche · Categorie di cassa. | Le due sezioni nuove accanto all'identità del club; le liste in fondo (sono le più lunghe) come oggi | — |
| **D-11** | Nessun `GET /api/v1/settings`: la pagina legge lo snapshot server-side (`getSettingsSnapshot`), e lo snapshot è comunque descritto in OpenAPI come risposta del PATCH. Aggiungerlo il giorno in cui la app Flutter lo chiede è una route di tre righe. | karpathy (nessun consumer oggi); precedente `treasury` senza GET (D5 di Billing-2) | GET speculativo |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Contratto: `PATCH /api/v1/settings`

Schema Zod nuovo in `src/lib/schemas/settings.ts`, **riusando** gli schemi esistenti (forma, non lettera):

```ts
const id = z.string().trim().min(1);

const expiryTypeUpdateItemSchema = z.object({ id }).extend(updateExpiryTypeSchemaShape /* name?, scope?, isActive?, blocksBooking?, validityMonths? — kind NON modificabile da qui */)
  .refine(atLeastOneFieldBesidesId);
const cashCategoryUpdateItemSchema = z.object({
  id,
  name: createCashCategorySchema.shape.name.optional(),
  isActive: z.boolean().optional(),
}).refine(atLeastOneFieldBesidesId);

export const updateSettingsSchema = z.object({
  airfield: airfieldBrandingSchema.optional(),          // { name }
  club: clubIdentitySchema.optional(),                  // { icao, contactEmail }
  metarStation: metarStationInputSchema.optional(),     // { station }  ('' = usa l'ICAO)
  membershipFee: membershipFeeSettingSchema.optional(), // { annualFeeCents }
  currency: currencySettingsSchema.optional(),          // 19.7: { minFlights, windowDays }
  scheduling: schedulingSettingsSchema.optional(),      // i 5 campi, refine closeTime > openTime
  smtp: smtpSettingsInputSchema.optional(),             // pass? opzionale: assente/vuota = invariata (P5)
  treasury: treasurySettingsSchema.optional(),
  expiryTypes: z.object({
    create: z.array(createExpiryTypeSchema.extend({ kind: expiryTypeKindInputSchema /* 19.7: RATING | MEDICAL */ })).max(50).optional(), // kind OBBLIGATORIO qui: niente default implicito, mai MEMBERSHIP (trappola 12); scope/blocksBooking opzionali come nella 19.7
    update: z.array(expiryTypeUpdateItemSchema).max(200).optional(),
    delete: z.array(id).max(200).optional(),
  }).optional(),
  cashCategories: z.object({
    create: z.array(createCashCategorySchema).max(50).optional(),
    update: z.array(cashCategoryUpdateItemSchema).max(200).optional(),
    delete: z.array(id).max(200).optional(),
  }).optional(),
}).refine(atLeastOneBlock)
  // per lista: id unici in update, unici in delete, nessun id in entrambi;
  // nomi (trim) unici fra create, e fra create e i `name` di update.
```

- **422 di forma a percorso puntato**: la route dichiara `bodySchema: z.unknown()` (per avere il tetto dei 64 KB e il parse JSON di `apiRoute`, `handler.ts:384-403`) e valida nel `handle` con `updateSettingsSchema.safeParse`; un fallimento lancia `new ValidationError('Invalid input.', { fieldErrors })` con le chiavi **puntate** costruite dalle `issues` (`club.contactEmail`, `smtp.host`, `scheduling.closeTime`, `airfield.name`, `expiryTypes.create.0.name`, `cashCategories.update.2.name`; un errore di radice va sotto `''`). Codice `VALIDATION_ERROR` e involucro AD-8 invariati (`domainErrorResponse` emette i `details` di un `ValidationError`, `handler.ts:59-65`): cambia solo la granularità delle chiavi, scritta nella description OpenAPI. Helper puro e testato (`flattenIssuesByPath`), locale alla route o in `src/lib/api/`.
- **Response 200**: `settingsSnapshotSchema` (AD-4).
- **Errori** (involucro AD-8): 401; **403** `FORBIDDEN` senza `settings.manage` (prima di qualunque query); **422** `VALIDATION_ERROR` (forma, sopra; o regola di dominio di una voce — `details.item`); **409** `CONFLICT` con `details: { reason, item }` (AD-5); i codici propri della 19.7 passano **invariati** con `details.item` aggiunto: **409 `MEMBERSHIP_TYPE_LOCKED`**, **422 `MEDICAL_TYPE_FIELDS`**. Nessun 404: una voce `update` inesistente è un 409 `reason: 'NOT_FOUND'` (la risorsa `/settings` esiste sempre), una voce `delete` inesistente è un no-op.
- **OpenAPI** (`registry.ts`, accanto ai path delle impostazioni `:1563-1759`): `registry.register('UpdateSettingsRequest', updateSettingsSchema)`, `registry.register('SettingsSnapshot', settingsSnapshotSchema)`; path `patch /api/v1/settings`, summary «Save the settings page in one atomic request (story 19.8)», description che dice: atomicità (tutto o niente), «each block is the body of the matching single-setting PUT», solo i blocchi presenti si scrivono (assente = invariato), semantica delle liste (ordine `delete → update → create`, `delete` di un id assente = no-op, `update` di un id assente = 409 `NOT_FOUND`), `pass` assente/vuota = invariata, chiavi puntate dei `fieldErrors`, `details.reason`/`details.item` dei 409, permesso `settings.manage`; `errorResponses(401, 403, 409, 422)`. `registry.test.ts`: il path compare nell'elenco, request/response referenziano i due schemi, i 4 codici d'errore sono documentati.
- **Idempotency-Key**: non richiesta. I blocchi scalari sono assegnazioni (idempotenti); `update` è un'assegnazione, `delete` di un id assente è un no-op; `create` **non** è idempotente — un retry dopo una risposta persa trova il nome già preso e risponde 409 `NAME_TAKEN` **senza** scrivere due volte (vincolo unico sul nome). Dichiararlo nella description.

### AD-2 — Service: `saveSettings(actor, patch)` in `src/server/services/settings.service.ts` (nuovo)

Ordine **vincolante**:

**Fuori dalla transazione** (nessuna scrittura):
1. `authorize(actor, 'settings.manage')` — prima di qualunque query (la forma è già stata validata dalla route).

**Dentro UNA `prisma.$transaction(async (tx) => …)`** (ogni scrittura passa da `tx`, nessuna da `prisma`):
2. Blocchi scalari presenti, ognuno col suo core (AD-3): `airfield` → `writeAirfieldBrandingCore`; `club` → `writeAirfieldIcaoCore` + `writeAirfieldContactEmailCore`; `metarStation` → `writeMetarStationCore`; `membershipFee` → `writeMembershipFeeCore`; `currency` → `writeCurrencySettingsCore`; `scheduling` → `writeSchedulingSettingsCore`; `smtp` → `writeSmtpSettingsCore` (cifra `pass` solo se non vuota, come `:254-263`); `treasury` → `writeTreasurySettingsCore`.
3. `expiryTypes`: **`delete` → `update` → `create`**, ogni voce col suo core; poi `cashCategories` nello stesso ordine. L'ordine rende legale, in un solo Salva, «elimina X e crea un nuovo X» e «rinomina A in B poi crea A». Lo **scambio** di nomi fra due voci esistenti nello stesso Salva fallisce al primo rename (vincolo unico non differibile) con 409 `NAME_TAKEN`: dichiarato nella description, nessun lavoro per supportarlo.
4. Ogni errore di dominio di una voce esce **arricchito** con `details.item = { list, op, index, id? }` (`index` = posizione nell'array della richiesta) da un piccolo helper (`withItem(error, item)`) che ricostruisce lo stesso tipo d'errore unendo i `details` — mai un `catch` che inghiotte: l'errore **propaga** fuori da `$transaction` e il rollback annulla tutto, blocchi scalari compresi.

**Dopo il commit**: `return getSettingsSnapshot(actor)` (AD-4).

«**Validazione completa prima di scrivere**» significa: forma dell'intero body (route) e permesso (passo 1) prima di qualunque query; le regole che dipendono dallo stato del DB (nome unico, voce in uso, categoria di sistema, voce esistente) si valutano **dentro** la transazione, e un loro fallimento annulla anche ciò che era già stato scritto nella stessa transazione. Nessun salvataggio parziale è osservabile (AC 3-4, prova discriminante §4.3).

**Concorrenza**: nessun lock. Le chiavi AppSetting sono righe singole (ultimo che scrive vince per chiave, come oggi; con D-3 vince solo sui blocchi che ha toccato); le liste hanno il vincolo unico sul nome come backstop (P2002 → 409 `NAME_TAKEN`) e il FK `RESTRICT` sui movimenti/scadenze (P2003 → 409 `IN_USE`), già gestiti nei core. Un P2002/P2003 dentro una transazione interattiva la rende inutilizzabile: va **rilanciato** (mai «recuperato» per proseguire), e questo è proprio il comportamento voluto.

**Env eager**: `settings.service.ts` importa `app-settings.service` (→ `secret-box` → `@/lib/env`): i suoi unit test mockano `@/lib/env` come `app-settings.service.test.ts:10` (§3.5).

### AD-3 — Core con `tx`, mai copie

Ogni regola di scrittura vive in **un** punto. Per ogni funzione sotto si estrae un core `(tx, …)` che fa le query e i controlli (senza `authorize`); la funzione pubblica esistente resta con la stessa firma: `authorize` + `prisma.$transaction(async (tx) => core(tx, …))` (o chiamata diretta del core con `prisma` dove la funzione oggi non è transazionale e non serve che lo diventi — scelta del dev, annotata in §G). Le route singole non cambiano: stessi status, stessi codici, stessi body.

| Funzione pubblica (resta) | Core estratto | Nota |
|---|---|---|
| `setAirfieldBranding` `:381-391` | `writeAirfieldBrandingCore(tx, { name })` | |
| `setAirfieldIcao` `:89-99`, `setAirfieldContactEmail` `:113-123` | `writeAirfieldIcaoCore(tx, icao)`, `writeAirfieldContactEmailCore(tx, email)` | il blocco `club` del composito li chiama entrambi nella sua transazione; la route singola `settings/club` (`route.ts:28-31`, due setter in `Promise.all`) **non si tocca** (chirurgia: la sua non-atomicità su due chiavi è preesistente e fuori dalla richiesta — annotarla come TD nel record) |
| `setMetarStation` `:318-328` | `writeMetarStationCore(tx, station)` | il setter continua a rispondere `getMetarStation()` (fallback ICAO) |
| `setMembershipFeeCents` `:364-374` | `writeMembershipFeeCore(tx, cents)` | |
| `setCurrencySettings` (19.7) | `writeCurrencySettingsCore(tx, input)` | se la 19.7 l'ha già scritto con un nome diverso, si usa il suo |
| `setSchedulingSettings` `:174-188` | `writeSchedulingSettingsCore(tx, input)` | da batch `$transaction([...])` a upsert su `tx` |
| `setSmtpSettings` `:236-268` | `writeSmtpSettingsCore(tx, input)` | `encryptSecret` solo se `input.pass` non vuota (P5); il setter continua a rispondere `getSmtpSettings(actor)` |
| `setTreasurySettings` `:471-493` | `writeTreasurySettingsCore(tx, input)` | |
| `createExpiryType` / `updateExpiryType` / `deleteExpiryType` `expiry-types.service.ts:98-208` | `createExpiryTypeCore(tx, input)`, `updateExpiryTypeCore(tx, id, input)`, `deleteExpiryTypeCore(tx, id, { missingOk })` | `missingOk: true` dal composito (delete assente = no-op), `false` dalla route singola (404 come oggi) |
| `createCashCategory` / `renameCashCategory` / `deactivateCashCategory` / `reactivateCashCategory` / `deleteCashCategory` `cash.service.ts:98-230` | `createCashCategoryCore(tx, { name })`, `updateCashCategoryCore(tx, id, { name?, isActive? })`, `deleteCashCategoryCore(tx, id, { missingOk })` | nel composito `isActive` è **dichiarativo**: `false` su una categoria già inattiva = no-op (le route singole `deactivate`/`reactivate` tengono il loro 409 «already inactive/active», `:170-172`, `:185-187`); rename di una categoria di sistema → 409 `SYSTEM_CATEGORY` (la disattivazione resta ammessa, come oggi `:48-49`) |

### AD-4 — Snapshot: una sola lettura per pagina e risposta

`getSettingsSnapshot(actor): Promise<SettingsSnapshot>` in `settings.service.ts`, gated `settings.manage`, compone i getter esistenti (che tengono i loro gate: ADMIN li ha tutti):

```ts
{
  airfield: { name },                       // getAirfieldBranding
  club: { icao, contactEmail },             // getAirfieldIcao + getAirfieldContactEmail
  metarStation: { station },                // la stazione DIGITATA dall'admin, '' = usa l'ICAO — stessa regola di oggi (page.tsx:185: `station === icao ? '' : station`)
  membershipFee: { annualFeeCents },        // getMembershipFeeCents
  currency: { minFlights, windowDays },     // 19.7 (default applicati)
  scheduling: SchedulingSettingsDto,        // campi null finché mai salvati
  smtp: SmtpSettingsDto,                    // mai `pass`, solo hasPassword
  treasury: TreasurySettingsDto,
  expiryTypes: ExpiryTypeItem[],            // includeInactive; solo kind RATING e MEDICAL (la «Quota associativa» è MEMBERSHIP, 19.7)
  cashCategories: CashCategoryItem[],       // includeInactive
}
```

- `page.tsx` sostituisce il `Promise.all` di 10 getter (`:144-156`) con **una** chiamata a `getSettingsSnapshot(actor)`; il redirect su `settings.manage` (`:139-142`) resta.
- `settingsSnapshotSchema` in `settings.ts` (riusa `schedulingSettingsDtoSchema`, `smtpSettingsDtoSchema`, `treasurySettingsDtoSchema`, `expiryTypeItemSchema`, `cashCategoryItemSchema`), registrato in OpenAPI (AD-1).

### AD-5 — Errori: codici, `details`, mappatura per sezione

| Esito | Forma | Dove si mostra |
|---|---|---|
| 422 `VALIDATION_ERROR`, `fieldErrors` puntati | AD-1 | sul **campo** (`aria-invalid` + messaggio del `Field`) e nella sezione: `airfield.name` → «Campo obbligatorio.» sul nome; `club.contactEmail` → «Inserisci un indirizzo email valido.» (copy esistente `club.invalidEmail`); `scheduling.closeTime` → `scheduling.invalidRange`; `smtp.host` → `smtp.invalidHost`; `treasury.*` → `invalidAmount`/`requiredDate`; `expiryTypes.<op>.<i>.<campo>` / `cashCategories.…` → sulla **voce** (riga/card + campo del pannello se aperto); altro campo → messaggio generico della sezione |
| 409 `CONFLICT` `details.reason` ∈ `NAME_TAKEN` · `IN_USE` · `SYSTEM_CATEGORY` · `NOT_FOUND`, `details.item = { list, op, index, id? }` | i core lanciano `ConflictError(message, { reason })` (il codice resta `CONFLICT`: i `details` sono **additivi** anche sulle route singole, `cash-register.spec.ts:183` resta verde); il composito aggiunge `item` (AD-2 passo 4) | sulla **voce** indicata da `item`: `NAME_TAKEN` → «Esiste già un tipo con questo nome.» / «Esiste già una categoria con questo nome.» (copy esistenti `form.conflictError`); `IN_USE` → `feedback.deleteInUseError` (copy esistenti); `SYSTEM_CATEGORY` → nuova («Categoria di sistema: non si può rinominare né eliminare.»); `NOT_FOUND` → nuova («Questa voce è stata eliminata da un altro utente: ricarica la pagina.») |
| 422 `MEDICAL_TYPE_FIELDS` / 409 `MEMBERSHIP_TYPE_LOCKED` (codici della 19.7), o altro 422 di dominio di una voce | stesso codice, `details.item` aggiunto dal composito | sulla voce, col messaggio generico della sezione (la UI non li può produrre: non manda mai `scope`/`blocksBooking` per un MEDICAL e non espone il tipo quota — arrivano solo da un client API) |
| 403 | `FORBIDDEN` | messaggio nella barra del Salva |
| rete / 5xx / altro | — | messaggio generico nella barra del Salva («Non è stato possibile salvare. Riprova.», copy esistente `club.error`) |

Lato client: **una** funzione pura (in `src/lib/settings-draft.ts`, AD-9) che, dato l'esito, restituisce `{ fields: Map<path, messageKey>, items: Map<rowKey, messageKey>, sections: Set<section>, bar?: messageKey }`; la pagina mostra i messaggi, porta il focus sul primo elemento invalido (`focusFirstInvalid`, `src/lib/dom-focus.ts:19`) e **non** tocca la bozza. Un `item.index` di `create` si ricollega alla voce nuova tramite l'ordine con cui il client ha costruito l'array (il client conserva la mappa `index → rowKey` della richiesta in volo).

### AD-6 — Pagina: un form, nove sezioni, una barra

```
<main class="page">
  page-head (titolo, sottotitolo)                                     ← invariato
  <form id="settings-form" data-testid="settings-form" noValidate onSubmit={save}>
    Club                 [card settings-card club-settings-card]      nome (wrapper airfield-settings-form), ICAO, email (+hint), METAR
    Quota associativa    [membership-settings-card]                   importo
    Currency             [currency-settings-card]                     X voli, Y giorni
    Pianificazione       [scheduling-settings-card]                   come oggi, senza Salva
    Email SMTP           [smtp-settings-card]                         come oggi, senza Salva; «Invia email di prova» type="button" (D-9)
    Tesoreria            [treasury-settings-card]                     come oggi, senza Salva
    Ratings              [ratings-settings-card]                      lista in bozza (AD-7)
    Visite mediche       [medical-settings-card]                      lista in bozza, senza Ambito (AD-7)
    Categorie di cassa   [cash-categories-settings-card]              lista in bozza (AD-7)
    <div class="settings-save-bar" data-testid="settings-save-bar">   ← ultimo figlio (D-4)
      <span data-testid="settings-dirty-summary" aria-live="polite">Nessuna modifica | Modifiche non salvate: …</span>
      [errore della barra: data-testid="settings-save-error" role="alert"]
      <button type="submit" class="btn primary" data-testid="settings-save" disabled={clean || saving}>Salva</button>
    </div>
  </form>
</main>
```

- **Stato**: un componente client (`settings-console.tsx`, nuovo) tiene `baseline` (dallo snapshot, normalizzata per la UI — default di Pianificazione/SMTP compresi, importi come stringhe a 2 decimali) e `draft`; le sezioni diventano **controllate** (`value`/`onChange`/errori via props) e perdono fetch, feedback e «Salva» propri. `settings-form.tsx` confluisce nella sezione Club (file eliminato), conservando i testid `airfield-settings-form` (wrapper) e `airfield-name-input`.
- **Diff** (D-3): un blocco scalare è sporco se il suo payload **normalizzato** (es. `parseCents('60') === parseCents('60.00')`, ICAO maiuscolo, trim dove lo fa lo schema) differisce da quello della baseline; un valore non interpretabile (importo «abc») conta come sporco, così il Salva si abilita e la validazione lo segnala. La password SMTP rende sporco il blocco `smtp` solo se non vuota.
- **Salva**: validazione client (AD-9) → se fallisce: errori sui campi/voci, focus, **nessuna richiesta**; altrimenti **una** `PATCH /api/v1/settings` col diff. Successo → toast «Impostazioni salvate.» (`useToast`, copy esistente), `baseline = draft = normalizza(snapshot della risposta)`, password svuotata e `hasPassword` aggiornato, errori azzerati, Salva disabilitato, pannello di lista chiuso, `router.refresh()` (aggiorna il nome/ICAO della shell, che li legge server-side). Errore → AD-5, bozza intatta.
- **Sezione Club**: i 4 campi in un'unica griglia (l'intestazione «Identità» e il separatore fra i due vecchi blocchi spariscono, `club-card.tsx:118-123`); l'email di contatto prende l'`hint` «Riceve l'email di prova SMTP.» (chiude TD 19.1-a, AC 12); l'importo della quota **esce** (`club-membership-fee-input` sparisce).
- **Sezione Quota associativa** (R-19-k): un campo importo (`membership-settings-fee-input`, `inputMode="decimal"`), hint «Vale 12 mesi dal pagamento. Precompila l'azione «Quota associativa» in Scadenze.».
- **Sezione Currency** (R-19-i): due interi (`currency-min-flights-input` «Voli minimi», `currency-window-days-input` «Finestra (giorni)»), con suffisso (`InputGroup`), hint statico «Chi non ha almeno questo numero di voli nella finestra può volare solo con un istruttore.» (nessuna interpolazione: niente plurali da gestire client-side). Limiti della 19.7: X 1…99, Y 1…3650.
- **Email SMTP**: il bottone «Invia email di prova» resta nell'intestazione della card (`smtp-test-email-button`, `type="button"`, fuori dalla logica del form); disabilitato con hint (`smtp-test-email-hint`) secondo D-9; il suo esito resta in `smtp-test-email-feedback`.
- **Mobile** (P7): la barra è sopra la tab bar (`position: fixed` della tab bar, `airops.css:1740-1748`; `.main` riserva `100px` in fondo, `:1705`): `bottom` pari all'altezza della tab bar + safe-area, misurata e scritta una volta (mai a occhio), bottone a tutta larghezza ≥ 44px. Le regole mobili delle card che servivano i «Salva» per card (`airops.css:3288-3290`, il `:only-child` delle righe di salvataggio) si tolgono o si riscrivono se restano senza bersaglio; le altre regole della 15.8b restano.

### AD-7 — Liste in bozza (Ratings, Visite mediche, Categorie di cassa)

Comune alle tre, su entrambe le facce (desktop: tabella `.students`; telefono: card + `BottomSheet`):

- **Voce in bozza**: `{ rowKey, id?, …campi, isActive, removed }`; stato derivato `saved | new | changed | removed`, esposto come `data-state` sulla riga desktop **e** sulla card mobile, e come badge testuale «Nuova» / «Modificata» / «Da eliminare» (nessun badge per `saved`). Lo stato «Attivo/Disattivato» mostrato è quello della **bozza**.
- **Aggiungi** (`ratings-add-button`, `medical-add-button`, `cash-category-add-button`, invariati): crea una voce `new` con i default del form di oggi (`ratings-card.tsx:527-532`: nome vuoto, ambito «Tutti», validità 0, blocca prenotazioni no; visita medica: nome vuoto, validità 0; categoria: nome vuoto), la mette in cima alla lista e apre il pannello su di essa col focus sul nome.
- **Pannello in linea** (lo stesso nodo di oggi sopra la tabella, testid `rating-form` / `medical-form` / `cash-category-form` conservati ma **non più `<form>`**: un `<div role="group" aria-label=…>` dentro il form della pagina — i form annidati sono HTML non valido): campi **legati alla voce** (scrivono nella bozza a ogni modifica): nome, ambito, validità, «Blocca prenotazioni e voli» (Ratings); nome, validità (Visite mediche); nome (Categorie). Un solo bottone «Chiudi» (`rating-form-close` / `medical-form-close` / `cash-category-form-close`). Spariscono `*-form-submit` e il loro «Annulla». Una categoria di **sistema** ha il nome in sola lettura nel pannello (oggi il server rifiuta il rename con 409; ora il client non lo propone e il 409 `SYSTEM_CATEGORY` resta la difesa).
- **Azioni di riga** (desktop) e **dello sheet** (telefono): «Modifica» (apre il pannello; sul telefono chiude lo sheet e porta il pannello in vista, meccanismo di oggi `ratings-card.tsx:440-443`, `:175-179`), «Disattiva»/«Riattiva» (interruttore della bozza), «Elimina»/«Ripristina» (interruttore della bozza; per una voce `new` «Elimina» la toglie e basta). **Nessuna conferma a due passi**: il `secondStep` dello sheet e la conferma inline desktop (`ratings-card.tsx:332-341`, `:472-493`; `cash-categories-card.tsx:236-245`, `:362-383`) spariscono. Una categoria di sistema non ha «Elimina» (assente, non disabilitato — regola 15.8b invariata). Gli esiti delle azioni non producono toast (non è successo nulla sul server): parla lo stato della voce.
- **Validazione client** (AD-9) prima della richiesta: nome obbligatorio (trim); nomi unici nella lista finale (voci `saved` non rimosse + `changed` + `new`, confronto dopo trim, maiuscole comprese come il vincolo DB); validità intero 0…600. L'errore va sulla voce (`data-invalid` + messaggio nella riga/card, `role="alert"`) e sul campo del pannello se aperto; il focus va al primo.
- **Costruzione del diff**: `create` = voci `new` non rimosse (senza `rowKey`); `update` = voci `saved` cambiate, coi **soli** campi cambiati (`isActive` compreso); `delete` = voci `saved` con `removed`. Un tipo **MEDICAL** nuovo porta `kind: 'MEDICAL'` e **omette** `scope` e `blocksBooking` (la 19.7 li risolve a `ALL`/`true`; mandarli diversi darebbe 422 `MEDICAL_TYPE_FIELDS`); un update di un MEDICAL non li manda mai; la lista Ratings porta `kind: 'RATING'`: il `kind` non è mai un campo editabile.
- **Visite mediche senza ambito né «blocca»** (R-19-j + contratto 19.7: `blocksBooking` non è più letto per i MEDICAL): nessuna colonna «Ambito» né badge «Blocca prenotazioni» nella tabella (le colonne si ricalcolano, `COLS` `ratings-card.tsx:122`), nessuno dei due campi nel pannello, nessuno dei due segmenti nella sotto-riga/sheet mobile (`expiryTypeSubLine`/`expiryTypeSheetSub`, `src/lib/mobile-settings.ts:32-46`, con l'ambito opzionale: `joinSegments` omette i segmenti assenti), nessuna riga «Blocca prenotazioni e voli» nello sheet.
- **Quota associativa**: è `kind MEMBERSHIP` (19.7) e non compare in nessuna lista; lo snapshot espone solo `RATING`/`MEDICAL`, e i rifiuti della 19.7 (create/PATCH MEMBERSHIP, delete/disattivazione del tipo quota) restano nei core, quindi un composito che puntasse a quell'id via API riceve lo stesso errore, con `details.item`.
- `ratings-card.tsx` resta **un** componente per Ratings e Visite mediche (R-13.1-a), con la differenza dell'ambito guidata dal `kind`.

### AD-8 — Testid (nessun selettore `^=` coinvolto: `grep -rn 'data-testid\^=' e2e/` su HEAD non ne ha di `settings`/`rating`/`medical`/`cash-category`/`club`)

- **Nuovi**: `settings-form`, `settings-save-bar`, `settings-save`, `settings-dirty-summary`, `settings-save-error`; `membership-settings-card`, `membership-settings-fee-input`; `currency-settings-card`, `currency-min-flights-input`, `currency-window-days-input`; `smtp-test-email-hint`; `rating-form-close`, `medical-form-close`, `cash-category-form-close`; sulle righe/card: `data-state`; errori di voce `rating-row-error` / `medical-row-error` / `cash-category-row-error` (dentro la riga) e gli stessi con `-mobile` nella card; pulsanti di riga desktop `rating-toggle-button`, `rating-delete-button` (+ `medical-*`, `cash-category-toggle-button`; `cash-category-delete-button` esiste già) — oggi senza testid, servono agli e2e riscritti invece di `getByRole('button', { name: 'Elimina' })`.
- **Spariscono**: `club-settings-save`, `club-settings-feedback`, `club-membership-fee-input`, `airfield-settings-save`, `airfield-settings-feedback`, `scheduling-settings-save`, `scheduling-settings-feedback`, `smtp-settings-save`, `smtp-settings-feedback`, `treasury-settings-save`, `treasury-settings-feedback`, `rating-form-submit`, `medical-form-submit`, `cash-category-form-submit`, `rating-form-error`, `medical-form-error`, `cash-category-form-error`, `ratings-feedback`, `medical-feedback`, `cash-categories-feedback`, `rating-delete-confirm-mobile`, `rating-delete-cancel-mobile`, `medical-delete-confirm-mobile`, `medical-delete-cancel-mobile`, `cash-category-delete-confirm-mobile`, `cash-category-delete-cancel-mobile`, `medical-scope-select`.
- **Restano** (stesso nome, stesso nodo unico a 375 e 1280 — matrice di `mobile-settings.spec.ts:677-710`): card e input esistenti, `airfield-settings-form`, `airfield-name-input`, `smtp-test-email-button`, `smtp-test-email-feedback`, i `*-add-button`, `rating-form`/`medical-form`/`cash-category-form` (ora gruppi), `rating-name-input`, `rating-scope-select`, `rating-validity-input`, `medical-name-input`, `medical-validity-input`, `cash-category-name-input`, `rating-row`/`medical-row`/`cash-category-row`, le card mobile `*-row-mobile`, gli sheet `mobile-*-sheet`, `*-edit-button`/`*-edit-button-mobile`, `*-toggle-button-mobile`, `*-delete-button-mobile`, le liste/empty mobile.

### AD-9 — Modulo puro della bozza: `src/lib/settings-draft.ts`

Client-safe (nessun import da `settings.ts`, che trascina `env`; solo `import type`), testato in isolamento (`src/lib/settings-draft.test.ts`, verificabile con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/settings-draft.test.ts`):
- `toDraft(snapshot)` (normalizzazione per la UI, default di Pianificazione `DEFAULTS` e SMTP 587/`STARTTLS` compresi: le costanti si spostano qui da `scheduling-card.tsx:37`/`smtp-card.tsx:54-55`);
- `buildSettingsPatch(baseline, draft): UpdateSettingsBody | null` (D-3; `null` = niente da salvare) e `dirtySections(baseline, draft)` per la barra;
- `validateDraft(draft, patch)`: il **mirror** delle regole client-rispecchiabili — nome aviosuperficie obbligatorio, email vuota o sintatticamente valida, `closeTime > openTime` e interi nei limiti di `schedulingSettingsSchema` (`settings.ts:45-53`), SMTP host/from obbligatori e porta 1…65535 **se il blocco è nel patch**, importi interpretabili (`parseCents`) e nei limiti (quota ≥ 0; tesoreria anche negativa, data obbligatoria), currency X intero 1…99 e Y intero 1…3650 (limiti della 19.7), regole delle liste (AD-7). L'SSRF dell'host **non** si rispecchia (dipende da `env.SMTP_HOST`): resta al server, 422 `smtp.host` (AD-5);
- `mapSaveError(status, body, requestIndexMap)` (AD-5).

---

## §2 — Acceptance Criteria

### Endpoint composito (P4, P5)

1. **Forma e permesso**: `PATCH /api/v1/settings` da un PILOTA (e da un ISTRUTTORE) → **403** `FORBIDDEN` senza alcuna scrittura (e2e); body vuoto `{}` → 422; un body con `smtp.host: '127.0.0.1'` → **422** `VALIDATION_ERROR` con `details.fieldErrors['smtp.host']` (chiave **puntata**, e2e); `scheduling` con `closeTime ≤ openTime` → `fieldErrors['scheduling.closeTime']`; `club.contactEmail: 'not-an-email'` → `fieldErrors['club.contactEmail']`; due `create` con lo stesso nome nella stessa lista → 422. Unit: `authorize` chiamata prima di qualunque metodo di `prisma`; `flattenIssuesByPath` su issues annidate (blocco, array, radice).
2. **Ogni blocco scalare scrive le sue chiavi e nient'altro** (unit, mock di `tx`): `airfield` → `airfield.name`; `club` → `airfield.icao` + `airfield.contactEmail`; `metarStation` → `metar.station`; `membershipFee` → `membership.annualFeeCents`; `currency` → le due chiavi della 19.7; `scheduling` → le 5 `sched.*`; `smtp` → 5 chiavi + `smtp.pass` **cifrata** solo se `pass` non vuota (`pass` assente o `''` → nessuna upsert di `smtp.pass`); `treasury` → le 3 `treasury.*`. Un blocco assente non produce nessuna upsert delle sue chiavi.
3. **Atomicità — prova sul DB reale** (e2e API, in `settings.spec.ts`, catena serializzata): (a) letto lo stato, `PATCH { metarStation: { station: <valore run-unique> }, scheduling: <finestra run-unique valida>, expiryTypes: { create: [{ name: <nome di un tipo esistente>, kind: 'RATING', scope: 'ALL' }] } }` → **409** `CONFLICT`, `details.reason: 'NAME_TAKEN'`, `details.item: { list: 'expiryTypes', op: 'create', index: 0 }`; `GET /settings/metar-station` e `GET /settings/scheduling` **invariati**. (b) `PATCH { membershipFee: { annualFeeCents: <run-unique> }, cashCategories: { create: [{ name: <run-unique> }], delete: [<id di una categoria con movimenti>] } }` → **409** `reason: 'IN_USE'`, `item.op: 'delete'`; la categoria nuova **non** esiste (`GET /cash-categories?includeInactive=true`), l'importo della quota è **invariato**. (c) `update` di un id inesistente → 409 `reason: 'NOT_FOUND'`, nulla scritto.
4. **Atomicità — prova nel codice** (unit): con un `tx` **distinto** da `prisma` nel mock di `$transaction`, un `saveSettings` che tocca tutti i blocchi e tutte le liste non chiama **nessun** `prisma.<modello>.create/update/upsert/delete*` fuori da `tx`; un errore lanciato dall'ultimo core (es. `deleteCashCategoryCore`) **propaga** fuori da `$transaction` (nessun `catch` che lo inghiotta) con `details.item` aggiunto; ordine verificato: `delete` → `update` → `create` per lista.
5. **Liste — semantica** (e2e API + unit): in **un** PATCH si crea un tipo, se ne rinomina un altro e se ne disattiva un terzo, si crea/rinomina/disattiva/elimina una categoria → 200 e lo snapshot di risposta li riflette tutti; `delete` di un id già eliminato → **200 no-op**; `update` di una categoria con `isActive: false` già inattiva → 200 no-op; rename di «Ricariche» → 409 `SYSTEM_CATEGORY`; eliminazione di un tipo **in uso** → 409 `IN_USE`; «elimina X e crea un nuovo X» nello stesso PATCH → 200. Le route singole restano identiche: `cash-register.spec.ts:153-183` e i test API di `expiry-types.spec.ts:184-193` verdi **senza modifiche** (il `code` resta `CONFLICT`; `details.reason` è additivo).
6. **Risposta = snapshot** (D-2): il 200 contiene i 10 campi di AD-4; `smtp` senza `pass` (asserito con `not.toHaveProperty('pass')`) e con `hasPassword: true` dopo un PATCH con password; `expiryTypes` senza la «Quota associativa»; la pagina caricata subito dopo mostra gli stessi valori (stessa fonte, `getSettingsSnapshot`).
7. **OpenAPI servito**: `GET /api/v1/openapi.json` descrive `patch /api/v1/settings` con `UpdateSettingsRequest` (i 10 blocchi) e response `SettingsSnapshot`, errori 401/403/409/422; `registry.test.ts` lo asserisce e il path entra nell'elenco di «includes every existing endpoint» (`registry.test.ts:19-…`). Le route singole restano tutte documentate più le nuove `GET`/`PUT /api/v1/settings/currency` di questa story (D-8): `PUT` con `currencySettingsSchema`, errori 401/403/422; `GET` senza gate.

### Pagina (P1-P3, P6)

8. **Un solo Salva**: a 1280 e a 375, nella pagina c'è **un** bottone che salva (`settings-save`, `type="submit"`, dentro `settings-save-bar`, ultimo figlio di `settings-form`); count **0** per ogni testid di §AD-8 «spariscono» e per `getByRole('button', { name: 'Salva', exact: true })` fuori dalla barra. «Invia email di prova» è l'unico altro bottone che fa una richiesta di scrittura.
9. **Una richiesta, tutte le sezioni**: in una sola sessione si cambiano nome dell'aviosuperficie, ICAO, email, stazione METAR, importo quota, X e Y della currency, la finestra di Pianificazione, il mittente SMTP (gli altri campi SMTP restano su Mailpit, §3.4), la tesoreria, si aggiunge un rating, si disattiva una visita medica creata dal test e si rinomina una categoria creata dal test; **un** click su Salva fa **una sola** richiesta di scrittura verso `/api/v1/` (conteggio delle richieste non-GET con `page.on('request')`, filtrando l'URL `/api/v1/` — `router.refresh()` fa richieste RSC che non sono API) = `PATCH /api/v1/settings`; toast «Impostazioni salvate.»; dopo un **reload** tutte le modifiche sono presenti (e2e in `settings.spec.ts`, che ripristina in `afterAll` ciò che scrive — §3.4).
10. **Diff** (D-3, D-5): pagina appena aperta → Salva **disabilitato**, barra «Nessuna modifica»; una modifica lo abilita e la barra elenca la sezione; riportare a mano il valore originale (incluso «60» ↔ «60.00» sull'importo) lo disabilita di nuovo; dopo un Salva riuscito torna disabilitato. Il body del PATCH contiene **solo** i blocchi toccati (e2e: `request.postDataJSON()` → `Object.keys` esatto): toccare solo la lista Ratings manda `{ expiryTypes: … }` e basta. Su un **DB fresco** (nessuna chiave `sched.*`/`smtp.*`) la pagina nasce pulita (unit su `toDraft`/`buildSettingsPatch` con snapshot a campi `null` → patch `null`).
11. **Errore in una sezione, nulla salvato** (P4, AD-5): (a) l'utente cambia l'ICAO e scrive `127.0.0.1` come host SMTP → Salva → 422: host marcato (`aria-invalid="true"`, «host» con il messaggio `smtp.invalidHost`), focus sull'host, la bozza conserva ICAO e host; dopo un reload l'ICAO è quello **vecchio**. (b) l'utente aggiunge un tipo col nome di un tipo esistente creato dal test **via API dopo il caricamento della pagina** (così il controllo client non lo vede) e cambia la stazione METAR → 409 `NAME_TAKEN`: errore sulla **riga** nuova (`rating-row-error`, «Esiste già un tipo con questo nome.»), METAR invariata dopo reload. (c) un'email di contatto non valida è fermata **dal client** (zero richieste) con «Inserisci un indirizzo email valido.» come **un solo** nodo nella pagina (`settings.spec.ts` lo legge page-level).
12. **Club e TD 19.1-a**: la sezione Club ha nome, ICAO, email di contatto (con l'hint «Riceve l'email di prova SMTP.»), stazione METAR (placeholder = ICAO della bozza, come oggi `club-card.tsx:144`); non ha l'importo della quota; il nome vuoto è fermato dal client sul campo. Il TD 19.1-a è chiuso nel Dev Agent Record come falso positivo (consumer: `smtp-test-email.service.ts:23`).
13. **Quota associativa e Currency** (R-19-k, R-19-i): la sezione Quota mostra l'importo salvato (2 decimali) e lo salva nel blocco `membershipFee`; la sezione Currency mostra X e Y salvati (su un DB senza chiavi: **1** e **90**, i default della 19.7) e li salva nel blocco `currency`; valori fuori dai limiti fermati dal client sul campo. Dopo il Salva, l'azione «Quota associativa» di Scadenze precompila il nuovo importo (asserzione esistente di `membership-fee.spec.ts` adattata, se legge l'importo dalla pagina Impostazioni).
14. **Liste in bozza** (P3, D-7): per Ratings, Visite mediche e Categorie di cassa, a 1280 **e** a 375: «Aggiungi» → voce `data-state="new"` col pannello aperto sul nome; digitare nei campi del pannello (Ratings: nome/ambito/validità/«Blocca prenotazioni»; Visite mediche: nome/validità; Categorie: nome) aggiorna la voce mentre si scrive; «Chiudi» chiude il pannello e la voce resta; «Modifica» su una voce salvata + cambio di un campo → `data-state="changed"`; «Disattiva» → stato mostrato «Disattivato» e `changed`; «Elimina» su una voce salvata → `data-state="removed"` con «Ripristina»; «Elimina» su una voce nuova la toglie. **Zero** richieste di scrittura durante tutte queste azioni (conteggio come AC 9); dopo il Salva e un reload la lista è quella attesa. Nome vuoto o duplicato → errore sulla voce **prima** di qualunque richiesta.
15. **Visite mediche senza ambito né «blocca»** (R-19-j, contratto 19.7): nessun «Ambito» e nessun «Blocca prenotazioni» nella tabella, nel pannello (nessun `medical-scope-select`, nessun checkbox nel `medical-form`), nella card mobile e nello sheet (`bottom-sheet-k` di una visita: `['Validità', 'Stato']`); il create di una visita manda `kind: 'MEDICAL'` **senza** `scope` né `blocksBooking` (e2e: `postDataJSON()` del PATCH). La lista Ratings mantiene ambito e «Blocca prenotazioni e voli» (sheet: `['Ambito', 'Validità', 'Stato', 'Blocca prenotazioni e voli']`, come oggi `mobile-settings.spec.ts:442`).
16. **Email di prova** (D-9): con `smtp` o email di contatto modificati e non salvati il bottone è disabilitato con `smtp-test-email-hint` visibile; dopo il Salva si abilita e l'invio reale arriva su Mailpit al contatto salvato (riscrittura di `settings.spec.ts:167-197`). Cliccarlo non invia né perde la bozza delle altre sezioni.
17. **Password SMTP** (P5): lasciata vuota → il blocco `smtp` (se sporco per altri campi) non contiene `pass` e la password salvata resta (`hasPassword: true` invariato); digitata → `pass` nel body, dopo il Salva il campo si svuota e il placeholder dice «configurata». La password **non** compare mai in nessuna risposta (snapshot, GET).

### Mobile, regressioni, contratti

18. **Mobile** (P7): a 320/375/390 la barra del Salva è visibile **sopra** la tab bar (sonda `COVERED` di `mobile-settings.spec.ts:216-230`: nessun controllo coperto `by: 'tabbar'`, anche col corpo scrollato in fondo), `settings-save` ≥ 44px e a tutta larghezza della barra; nessun overflow orizzontale (`scrollWidth - clientWidth = 0`), nessuno scroller nascosto, nessun testo tagliato (sonde esistenti); i controlli della pagina, con i pannelli di lista aperti, tutti ≥ 44px (`SMALL_TARGETS`); le nove testate di card non superano il pre-fix (sonda `headHeights`, ora con `toHaveLength(9)`). Lo sheet di una voce ha «Modifica», «Disattiva/Riattiva», «Elimina/Ripristina» ≥ 44px e **nessun** `secondStep`.
19. **Pagina admin-only invariata**: `/dashboard/settings` reindirizza pilota, allievo e istruttore a `/dashboard` a 375 e 1280 (`mobile-settings.spec.ts:836-863`, `settings.spec.ts:95-99`, `treasury-settings.spec.ts:123-127` verdi).
20. **Catena e2e**: nessuno spec nuovo entra in catena oltre a quelli che già ci sono (`settings`, `treasury-settings`, `mobile-settings`); i test nuovi che scrivono AppSettings vivono in `settings.spec.ts`; `expiry-types.spec.ts` resta nel progetto `chromium` e **asserisce** che i suoi PATCH contengono solo `expiryTypes` (è la condizione che lo tiene legittimamente fuori dalla catena, AC 10). `pdf-exports.spec.ts:205-228` (nome aviosuperficie, progetto `chromium`) asserisce che il suo PATCH contiene solo `airfield`.
21. **Nessun residuo** (0 righe, escluse `src/generated/`, `_bmad-output/`, `docs/`):
    - `grep -rnE "fetch\(['\`]/api/v1/(settings/(airfield|club|metar-station|membership-fee|scheduling|smtp|treasury|currency)|expiry-types|cash-categories)" 'src/app/[locale]/dashboard/settings'` — la pagina non chiama più le route singole di scrittura (l'unica fetch rimasta è `POST /api/v1/settings/smtp/test-email` e la `PATCH /api/v1/settings`)
    - `grep -rnE "club-settings-save|airfield-settings-save|scheduling-settings-save|smtp-settings-save|treasury-settings-save|(rating|medical|cash-category)-form-submit|(ratings|medical|cash-categories)-feedback|-delete-confirm-mobile|-delete-cancel-mobile|club-membership-fee-input|medical-scope-select|settings-feedback\b" src e2e`
    - `grep -rn "SettingsForm\b\|settings-form.tsx" src e2e` → 0 (file confluito)
    - `grep -rn "Promise.all" 'src/app/[locale]/dashboard/settings'` → 0
22. **i18n**: chiavi orfane rimosse da **entrambi** i file (§3.6), nuove presenti in entrambi, parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/en.json | sort)` vuoto), conteggio chiavi prima/dopo riportato (oggi `SettingsPage` = 208 per locale). Copy nuove secondo il glossario A20; revisione finale: 19.12.
23. **Gate**: `npm run gates` verde; e2e mirati verdi via `scripts/e2e.sh start <spec…>` (§4.2); l'arbitro full-suite su DB fresco lo esegue la sessione principale. Delta test unit ed e2e dichiarato nel record.
24. **Verifica UI interattiva** (Playwright MCP o script throwaway in `/tmp`, CLAUDE.md), screenshot a **1280** e **375** di: pagina pulita (barra «Nessuna modifica», Salva disabilitato); pagina con modifiche in tre sezioni e in una lista (barra con l'elenco, righe `new`/`changed`/`removed`); errore di campo (host SMTP) e errore di voce (nome duplicato); pannello di lista aperto; sheet di una voce; la barra fermata sopra la tab bar col corpo scrollato in fondo; tema scuro almeno a 1280. Nessun overflow, nessun linguaggio visivo nuovo (solo token e primitive AirOps esistenti).

---

## §3 — Dev Notes

### 3.1 — Inventario su HEAD `a7e960e` (cosa c'è oggi)

| # | Sezione | Controllo di salvataggio | Righe | Chiamata | Dopo 19.8 |
|---|---|---|---|---|---|
| 1 | Club — nome | `SettingsForm`, «Salva» `airfield-settings-save` | `settings-form.tsx:36-68`, bottone `:101-103` | `PUT /settings/airfield` `:46-50` | campo della sezione Club, blocco `airfield` |
| 2 | Club — ICAO, email, METAR, quota | «Salva» `club-settings-save` | `club-card.tsx:56-109`, bottone `:167-171` | 3 PUT in `Promise.all` `:73-89` (`club`, `metar-station`, `membership-fee`) | blocchi `club`, `metarStation`; la quota va nella sua sezione (`membershipFee`) |
| 3 | Pianificazione | «Salva» `scheduling-settings-save` | `scheduling-card.tsx:56-85`, bottone `:137-141`; `DEFAULTS` `:37` | `PUT /settings/scheduling` `:61-71`, 422 `closeTime` `:75-82` | blocco `scheduling` |
| 4 | Email SMTP | «Salva» `smtp-settings-save` | `smtp-card.tsx:66-94`, bottone `:185-187`; default `:54-55`; `pass` solo se non vuota `:74` | `PUT /settings/smtp` `:71-75`, 422 `host` `:85-92` | blocco `smtp` |
| 5 | Email SMTP — prova | «Invia email di prova» `smtp-test-email-button` | `smtp-card.tsx:96-113`, bottone `:121-123` | `POST /settings/smtp/test-email` | **azione** invariata, disabilitata a bozza sporca (D-9) |
| 6 | Tesoreria | «Salva» `treasury-settings-save` | `treasury-card.tsx:52-92` (validazione client `:56-82`), bottone `:148-152` | `PUT /settings/treasury` `:84-88` | blocco `treasury` |
| 7 | Ratings / Visite mediche | «Aggiungi» → `ExpiryTypeForm` «Crea»/«Salva» `rating-form-submit`; riga: «Modifica», «Disattiva/Riattiva», «Elimina» → «Sì» | `ratings-card.tsx:266-268`, form `:518-612` (fetch `:548-550`), riga `:332-353`; mobile: card `:367-408`, sheet `:417-495`, `secondStep` `:472-493` | `POST/PATCH/DELETE /expiry-types` (`:197-201`, `:209`) | lista in bozza (AD-7), blocco `expiryTypes` |
| 8 | Categorie di cassa | idem: «Crea»/«Rinomina», «Disattiva/Riattiva», «Elimina» → «Conferma» | `cash-categories-card.tsx:180-182`, form `:404-458` (fetch `:419-421`), riga `:235-261`; sheet `:311-385` | `POST/PATCH/DELETE /cash-categories`, `POST …/{deactivate,reactivate}` (`:112`, `:120`) | lista in bozza (AD-7), blocco `cashCategories` |

Totale oggi: **8** azioni di salvataggio + 3×3 scritture immediate di lista + 1 azione (prova). Dopo: **1** Salva + 1 azione.

`page.tsx`: `Promise.all` di 10 getter `:144-156`; split per `kind` `:162-163`; labels `:37-103`, `:187-208`, `:213-233`, `:238-258`, `:265-277`, `:312-362`; doc-comment `:105-129` (da riscrivere: descrive le card a salvataggio proprio).

### 3.2 — Server e contratti

| File | Righe | Cosa |
|---|---|---|
| `src/server/services/settings.service.ts` | nuovo | `getSettingsSnapshot` (AD-4), `saveSettings` (AD-2), `withItem` |
| `src/server/services/app-settings.service.ts` | setter `:89-99`, `:113-123`, `:174-188`, `:236-268`, `:318-328`, `:364-374`, `:381-391`, `:471-493` | core `write*Core(tx, …)` (AD-3); i setter li chiamano; doc-comment di modulo `:16-26` («each caller gets its own narrow get/set pair») aggiornato col composito |
| `src/server/services/expiry-types.service.ts` | `:98-208` | core `tx` (AD-3); `ConflictError(…, { reason })` (AD-5) |
| `src/server/services/cash.service.ts` | `:98-230` | core `tx`, `updateCashCategoryCore` dichiarativo (AD-3); `reason` nei 409 |
| `src/lib/schemas/settings.ts` | `:18-214` | `updateSettingsSchema`, `settingsSnapshotSchema` + tipi (AD-1, AD-4); `currencySettingsSchema` della 19.7 |
| `src/app/api/v1/settings/route.ts` | nuovo | `PATCH` (AD-1): `bodySchema: z.unknown()`, parse nel `handle`, `fieldErrors` puntati |
| `src/app/api/v1/settings/currency/route.ts` | nuovo (la 19.7 non aggiunge route, D-8) | `GET`/`PUT` sul modello di `scheduling/route.ts` |
| `src/lib/schemas/registry.ts` + `registry.test.ts` | `:233-261`, `:1563-1759`; test `:19-…`, `:80-93` | AD-1 |
| `src/app/[locale]/dashboard/settings/page.tsx` | `:144-163` | `getSettingsSnapshot`; labels delle sezioni nuove |

### 3.3 — UI

| File | Cosa |
|---|---|
| `settings/settings-console.tsx` (nuovo) | stato `baseline`/`draft`, form unico, barra del Salva, salvataggio, mappatura errori (AD-6) |
| `settings/club-card.tsx` | controllata; assorbe il nome (`settings-form.tsx` eliminato); via quota, via `Promise.all` e `parseApiError` locale |
| `settings/membership-card.tsx`, `settings/currency-card.tsx` (nuovi) | AD-6 (stessa struttura `card settings-card` / `card-head` / `form-grid` delle card esistenti) |
| `settings/scheduling-card.tsx`, `smtp-card.tsx`, `treasury-card.tsx` | controllate, senza fetch/feedback/Salva; `smtp-card` tiene l'azione «prova» (D-9) |
| `settings/ratings-card.tsx`, `cash-categories-card.tsx` | liste in bozza (AD-7) su entrambe le facce; via `router.refresh`/`useToast` per azione, via `secondStep` |
| `src/lib/settings-draft.ts` (+ `.test.ts`) | AD-9 |
| `src/lib/mobile-settings.ts` (+ test) | ambito opzionale nella sotto-riga/sheet dei tipi di scadenza (AD-7) |
| `src/styles/airops.css` | barra del Salva (desktop + `@media` mobile sopra la tab bar), stile degli stati di voce (`data-state`) **solo** con token esistenti (`--ink-3`, `--border`, badge esistenti); rimozione delle regole mobili rimaste senza bersaglio (`:3288-3290`) — verificare con un grep sui selettori prima di togliere |

### 3.4 — e2e: censimento e destino

Comando: `grep -rlnE "club-settings|airfield-settings|airfield-name-input|club-(icao|contact|metar|membership)|scheduling-(settings|open|close|min|turnaround|max)|smtp-(settings|host|port|security|from|user|pass|test)|treasury-(settings|opening)|ratings-(settings|add)|rating-(row|edit|form|name|scope|validity|toggle|delete)|medical-|mobile-(rating|medical|cash-category)|cash-categor(y|ies)-|dashboard/settings" e2e` → su HEAD: `billing-global`, `expiry-registration`, `expiry-types`, `mobile-ink-targets`, `mobile-settings`, `pdf-exports`, `settings`, `treasury-settings` (+ i commenti di `billing-global`: nessun flusso).

| Spec (progetto) | Righe | Oggi | Dopo |
|---|---|---|---|
| `settings.spec.ts` (catena `settings`) | `:101-125` Club, `:127-142` email malformata, `:144-165` Pianificazione, `:167-197` SMTP + prova | 4 «Salva» per card, asserzioni sulle risposte dei PUT | **riscritti** su `settings-save` asserendo il body e la **risposta del PATCH** (stessa richiesta, nessuna finestra per un writer concorrente — il motivo per cui oggi si asserisce la risposta, `:112-115`, vale identico); l'email malformata diventa il caso client di AC 11(c) + un caso API 422 puntato; SMTP: salva, poi prova (D-9). **Nuovi**: AC 1 (403/422 puntati), 3 (atomicità a/b/c), 5 (liste via API), 6 (snapshot), 9 (una richiesta), 10 (diff), 11(a/b), 16, 17. `afterAll`: oltre alla finestra permissiva (`:88-93`) ripristina con le route singole METAR `''`, quota `0`, currency ai default della 19.7 (dopo la 19.9 una currency stretta lasciata qui farebbe scattare l'avviso sui voli solisti degli spec a valle della catena), tesoreria `0/0/'2000-01-01'` (lo stesso ripristino neutro di `treasury-settings.spec.ts:57-65`), e non lascia tipi di scadenza **bloccanti** (le fixture dei test sono non bloccanti o eliminate in `finally`). Il test di AC 9 cambia SMTP **solo** in valori che puntano ancora a Mailpit (`host` = `SMTP_HOST` dell'env, porta `1025`, `NONE` — come `:177-182`; si cambia il `from`), altrimenti ogni email successiva della catena (e dei run locali seguenti sullo stesso DB) fallirebbe |
| `settings.spec.ts` (stesso file) | `:213-280` Categorie di cassa | CRUD immediato, 409 «in uso» | **riscritti** in bozza: crea → Salva; rinomina → Salva; disattiva/riattiva → Salva; elimina → Salva; doppione → errore client sulla voce, zero richieste; «in uso» → Salva → 409 sulla voce, riga ancora presente dopo reload |
| `expiry-types.spec.ts` (`chromium`) | `:35-102`, `:104-140`, `:142-156`, `:158-182` (righe di `a7e960e`; la 19.7 ne adatta `:48-58`, `:114-122`) | form con submit, «Disattiva», «Elimina» → «Sì» | **riscritti** in bozza + `settings-save`, con l'asserzione «body = solo `expiryTypes`» (AC 20); `:104-140` senza `medical-scope-select` (R-19-j) e senza l'asserzione «Piloti»; `:35-102`: la riga «Quota associativa» **non** è più nella card Ratings (asserzione invertita) e le visite mediche non mostrano più l'ambito (`:47-52`); fixture run-unique **non bloccanti**, o eliminate. `:184-193`, `:195-205` invariati |
| `treasury-settings.spec.ts` (catena) | `:67-89`, `:91-121` | `treasury-settings-save` + risposta del PUT | **riscritti** su `settings-save` + risposta del PATCH (`treasury` dello snapshot, body = solo `treasury`); la riapertura che riprecompila resta; `afterAll` via route singola invariato |
| `mobile-settings.spec.ts` (catena) | `:255-328` (bersagli + 5 «Salva» a tutta larghezza `:316-327`), `:330-406` (scritture per card) | 5 «Salva», 3+1+1+1 PUT | **riscritti**: bersagli con la barra (un solo Salva a tutta larghezza, ≥ 44px) e `headHeights` a 9; scritture dal telefono con **un** PATCH per caso (email client, `closeTime` 422 puntato, host 422 puntato, tesoreria fermata dal client con zero PATCH) — ogni caso parte da una pagina pulita (reload, nessun dirty-guard: D-6) |
| `mobile-settings.spec.ts` | `:408-466` (sheet, `secondStep` `:446-454`), `:502-570` (CRUD tipo con 409 a toast), `:572-629` (tipo bloccante → 422 volo), `:631-675` (categorie) | azioni immediate, toast, conferma a due passi | **riscritti** in bozza: lo sheet ha Modifica/Disattiva/Elimina-Ripristina senza `secondStep`; il 409 «in uso» arriva al **Salva** (route mockata sul `PATCH /api/v1/settings` con `details.reason: 'IN_USE'` e `item`), errore sulla card; il tipo bloccante creato dal telefono passa dal Salva e resta eliminato in `finally` (via route singola) |
| `mobile-settings.spec.ts` | `:677-710` matrice testid | 39 singleton + assenti | **aggiornata** con AD-8 (nuovi, spariti, restati) |
| `mobile-settings.spec.ts` | `:712-741`, `:743-791`, `:793-834`, `:836-863` | geometria, discriminanti, regole confinate, admin-only | geometria e discriminanti estesi alla barra (la sonda `COVERED` la include già); la discriminante (iii) del pavimento 44px include `settings-save`; il resto invariato |
| `pdf-exports.spec.ts` (`chromium`) | `:205-228` | `airfield-settings-save` + feedback | `settings-save`, body = solo `airfield`, GET di verifica invariato |
| `expiry-registration.spec.ts` (`chromium`) | `:170-184` | «Elimina» → «Sì» → «in uso»; «Disattiva» | in bozza: Elimina → Salva → 409 sulla riga; «Ripristina» → «Disattiva» → Salva → «Disattivato» |
| `mobile-ink-targets.spec.ts` | `:318` | trigger del calendario in Impostazioni (Tesoreria) | **invariato** (il `DateInput` resta) |
| `cash-register.spec.ts`, `membership-fee.spec.ts`, `mobile-membership-fee.spec.ts`, `mobile-metar.spec.ts`, `booking-window.spec.ts`, `reports.spec.ts`, `api-v1.spec.ts`, `helpers.ts` | — | route singole via API | **invariati** (D-8) |

**Fixture e trappole e2e**: nomi run-unique (`uniqueSuffix()`), mai nomi che contengano una label di campo (lezione 12.11 F2: niente «Nome», «Ambito», «Validità», «Finestra»…); `getByLabel('Blocca prenotazioni')` oggi è un nodo solo (`mobile-settings.spec.ts:707`): con più pannelli o voci aperte va **scopato** al pannello; mai `Escape` per chiudere il popover del `DateInput` della Tesoreria; i conteggi delle richieste filtrano `method !== 'GET'` e l'URL `/api/v1/`; prima di attribuire un fallimento di login alla flake nota, la query `LoginAttempt` di CLAUDE.md (TD-6). Un tipo di scadenza **bloccante** lasciato nel DB fa fallire i `POST /flights` di tutta la suite (TD noto, `mobile-settings.spec.ts:624-626`): ogni fixture bloccante si elimina in `finally`.

### 3.5 — Unit

- `settings.service.test.ts` (nuovo): AC 1 (ordine authorize → query), 2, 4, 5 (no-op, `missingOk`, ordine delle operazioni), 6. Mock: `@/lib/env` (come `app-settings.service.test.ts:10`), `@/server/db/prisma` con `$transaction` che invoca la callback con un `tx` **distinto**.
- `app-settings.service.test.ts`: i casi esistenti dei setter restano verdi dopo l'estrazione dei core (aggiornare solo dove assertano la forma «batch» di `$transaction([...])`, annotandolo); `expiry-types.service.test.ts` / `cash.service.test.ts` (se esistono: `ls src/server/services/*.test.ts`): idem + `details.reason`.
- `settings-draft.test.ts` (nuovo): `toDraft` (default, DB fresco → pulito), `buildSettingsPatch` (solo blocchi toccati, normalizzazione importi, password, liste: create/update coi soli campi cambiati/delete, `kind` per lista), `validateDraft` (ogni regola), `mapSaveError` (422 puntato, 409 per `reason`/`item`, 403, rete).
- `mobile-settings.test.ts`: ambito assente.
- `registry.test.ts`: AC 7.
- Verifica env eager (CLAUDE.md): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/settings.service.test.ts src/server/services/app-settings.service.test.ts src/lib/settings-draft.test.ts src/lib/mobile-settings.test.ts` verde.

### 3.6 — i18n (in **entrambi** `messages/it.json` e `messages/en.json`)

Da rimisurare al T0 (la 19.7 tocca `SettingsPage.medical.*` e forse la quota). Orientamento:
- **Orfane probabili** (togliere solo se davvero senza uso — `grep`): `SettingsPage.club.{save,saved,identityHeading,membershipFee,membershipFeeHint}`, `club.form.{save,saved,error}`; `scheduling.{save,saved,error}`; `smtp.{save,saved,error}`; `treasury.{save,saved,error}`; `ratings|medical.form.{submitCreate,submitSave,cancel,createTitle?,editTitle?,genericError?}`, `ratings|medical.feedback.{created,updated,deactivated,reactivated,deleted,genericError}`, `ratings|medical.actions.{confirmDelete,confirmYes,confirmCancel}`, `medical.{table.scope,form.scope,scope.*,form.blocksBooking,form.blocksBookingHint,blocksBooking.yes,mobile.yes,mobile.no}` (R-19-j e contratto 19.7 — verificare i consumer: le label sono costruite da `expiryTypeCardLabels`, `page.tsx:37-103`, che va reso per-`kind` o tollerante alle chiavi assenti); `cashCategories.form.{submitCreate,submitRename,cancel}`, `cashCategories.feedback.{created,renamed,deactivated,reactivated,deleted,genericError}`, `cashCategories.actions.{confirmDelete,confirmYes,confirmCancel}`.
- **Da riusare**: `club.invalidEmail`, `club.error` (errore generico della barra), `treasury.saved` («Impostazioni salvate.», spostata in `SettingsPage.saved`), `scheduling.invalidRange`, `smtp.invalidHost`, `treasury.invalidAmount`/`requiredDate`, `ratings|medical.form.conflictError`, `cashCategories.form.conflictError`, `*.feedback.deleteInUseError`, `*.form.requiredField`, `*.mobile.close`.
- **Nuove**: `SettingsPage.save` («Salva»), `saved`, `saveBar.clean` («Nessuna modifica»), `saveBar.dirty` («Modifiche non salvate: {sections}», interpolato client-side → `t.raw` come `scheduling.hint`, `page.tsx:223-228`), nomi brevi delle sezioni per la barra (o riuso dei `title`), `errors.forbidden`, `errors.stale` (`NOT_FOUND`), `errors.systemCategory`, `errors.duplicateName` (doppione client), `rowState.{new,changed,removed}`, `actions.restore` («Ripristina»), `club.contactEmailHint`, `membership.{title,sub,fee,feeHint}`, `currency.{title,sub,minFlights,windowDays,flightsSuffix,daysSuffix,hint}`, `smtp.testEmailNeedsSave`.

---

## §4 — Piano di test

### 4.1 — Unit
§3.5. Prove nuove: forma e chiavi puntate (AC 1); chiavi scritte per blocco (AC 2); `tx` distinto e propagazione (AC 4); ordine e no-op delle liste (AC 5); diff/normalizzazione/validazione/mappatura client (AC 10, 11, 14, 17).

### 4.2 — e2e (solo via `scripts/e2e.sh`)
Mirati prima della consegna: `settings` (`--no-deps` in locale), `treasury-settings` e `mobile-settings` (`--no-deps`), `expiry-types`, `expiry-registration`, `pdf-exports`, `cash-register`, `membership-fee`, `mobile-ink-targets`, `api-v1`. Per una serie di run: build **una volta** (`env -u NODE_ENV npm run build && npm run start &`) e poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …` (CLAUDE.md). Prima di gates/build/e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` — mai una build sotto un arbitro vivo (HANDOFF, incidente AOG-1b).

### 4.3 — Discriminanza (obbligatoria, nel Dev Agent Record §D con sha256 prima/dopo)
1. **Atomicità**: sostituire temporaneamente la `prisma.$transaction(async (tx) => …)` di `saveSettings` con l'esecuzione degli stessi passi su `prisma` → l'e2e AC 3(a) diventa **rosso** (METAR e finestra salvate nonostante il 409); ripristino byte-identico.
2. **Diff**: far mandare al client l'intero snapshot normalizzato → l'asserzione «body = solo `expiryTypes`» di `expiry-types.spec.ts` e quella di AC 10 diventano rosse.
3. **Un solo Salva**: rimettere temporaneamente un «Salva» di card (es. `scheduling-settings-save`) → AC 8 rosso.
4. **Barra sopra la tab bar**: togliere il `bottom` mobile della barra → la sonda `COVERED` di AC 18 riporta `settings-save` coperto `by: 'tabbar'`.

### 4.4 — Gate
`npm run gates` (mai i quattro comandi separati) + grep di AC 21 + parità di AC 22 + e2e mirati.

---

## §5 — Trappole note

1. **Non replicare `club-card.tsx:73-89`** (A17): niente `Promise.all` di richieste, nemmeno «solo per la prova SMTP dopo il salvataggio». Una `PATCH`.
2. **Recuperare un P2002/P2003 dentro la transazione**: in Postgres la transazione è già abortita; il core deve **rilanciare** (mappato in `ConflictError` con `reason`), mai proseguire.
3. **Pagina «sporca» all'apertura**: baseline calcolata dai valori grezzi (`null`) mentre i campi mostrano i default (`07:00`, porta `587`, `STARTTLS`, `''` per la data di tesoreria) → Salva abilitato a pagina appena aperta e, peggio, il primo Salva qualsiasi scriverebbe i default di Pianificazione (oggi «never written implicitly», `scheduling-card.tsx:36`) attivando il vincolo `BOOKING_OUTSIDE_WINDOW`. Baseline e bozza passano entrambe da `toDraft` (AD-9).
4. **Diff falso sugli importi**: «60» e «60.00» sono lo stesso valore; confrontare i centesimi, non le stringhe.
5. **Chiavi globali scritte da un test nel progetto parallelo**: un test di `chromium` che salva dalla pagina deve mandare **solo** il suo blocco (D-3, AC 20); se un test nuovo deve scrivere chiavi globali, va in `settings.spec.ts` (catena), con ripristino in `afterAll`.
6. **Form annidati**: i pannelli di lista oggi sono `<form>` (`ratings-card.tsx:561`, `cash-categories-card.tsx:432`); dentro il form della pagina diventano gruppi (`role="group"`), e nessun bottone interno può restare `type="submit"` implicito (un `<button>` senza `type` dentro un form è un submit: «Chiudi», «Modifica», «Disattiva», «Elimina», «Aggiungi», «Invia email di prova» tutti `type="button"`).
7. **Invio nel form**: Invio in un campo invia il form (= Salva); con Salva disabilitato l'invio implicito non parte (regola HTML del bottone di default disabilitato). Verificarlo: nessun PATCH vuoto.
8. **`index` di `create` nei 409/422**: si riferisce all'array **inviato**, che contiene solo le voci nuove non rimosse; il client conserva la mappa `index → rowKey` della richiesta in volo, non la ricalcola dalla bozza (che può essere cambiata mentre la richiesta è in volo — o si blocca la modifica durante il salvataggio, scelta del dev annotata in §G).
9. **`getByLabel` substring**: «Nome aviosuperficie» / «Nome Ratings» / «Nome» della categoria; «Validità»; «Finestra (giorni)» vs. altre «Finestra» — sempre testid o `{ exact: true }` scopato alla sezione.
10. **Toast che si accumulano**: con il Salva unico c'è un toast per salvataggio; gli e2e che salvano due volte di seguito filtrano il toast per testo (`mobile-settings.spec.ts:540-542`).
11. **`router.refresh()` dopo il Salva** ri-renderizza la pagina server con lo snapshot nuovo: lo stato client **non** deve reinizializzarsi dalle props a metà (la bozza viene già riallineata dalla risposta); evitare `key` che cambino con lo snapshot.
12. **`kind` implicito**: `createExpiryTypeSchema` ha `kind` con default `RATING` (`expiry-types.ts:53`); nel composito `kind` è obbligatorio e ristretto a `RATING | MEDICAL`, così una visita creata dalla lista Visite mediche non diventa mai un rating per un campo dimenticato, e nessun client crea un secondo tipo MEMBERSHIP (che la 19.7 comunque rifiuta).

---

## §6 — Fuori scope DICHIARATO

- **Backend di currency, quota e visite mediche** (regola «una visita valida qualsiasi», calcolo della currency, quota in Scadenze): **19.7**. Qui solo la configurazione (UI + blocchi del composito).
- **Avvisi con deroga** che leggono currency/quota (19.9/19.10).
- `GET /api/v1/settings` (D-11); avviso «modifiche non salvate» e «Annulla modifiche» (D-6); RBAC per blocco (AD-2 passo 1); lock/ETag sulle impostazioni (AD-2).
- Rimozione delle route singole (D-8).
- Copy definitive e glossario (19.12): qui solo le chiavi nuove e quelle rese orfane.
- Il pre-check client «categoria con movimenti non eliminabile» (il dato `movementCount` c'è, ma la regola resta al server come oggi: 409 `IN_USE` al Salva).

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§2.3 «Salva unico», §4.0 R-19-i/j/k/m, §4.2 riga 19.8, §4.5, §4.6, §4.10 A17).
- PRD: FR-46 (currency), FR-48 (un solo Salva per form), FR-35 (tipi di scadenza) — `_bmad-output/planning-artifacts/epics.md:65`, `:920`.
- Precedenti: `12-11-*` (la pagina), `13-1-*` (due card su `ExpiryType.kind`), `15-8b-*` (faccia mobile, R-15.8b-d), `19-3-*`/`19-4-*` (Salva unico: D-3, D-5, D-6, D-8), `19-7-*` (contratti backend), `19-1-*` §7 (TD 19.1-a).
- `CLAUDE.md` (catena serializzata, e2e, gates, env eager); `docs/handoffs/HANDOFF.md` (ambiente, reset DB, arbitro).

---

## Tasks / Subtasks

- [x] **T0 — Riallineamento**: `git log --oneline -10` (19.1…19.7 committate); contratti della 19.7 verificati sul codice (tabella del banner) con ogni differenza in §A; `scripts/e2e.sh status`, `:3000` libero; rieseguire i censimenti di §3.1 e §3.4; conteggio chiavi i18n di partenza.
- [x] **T1 — Contratto** (AC 1, 6, 7): `updateSettingsSchema`, `settingsSnapshotSchema`, tipi; route `PATCH /api/v1/settings` con `fieldErrors` puntati; `GET`/`PUT /api/v1/settings/currency` (D-8); `registry.ts` + `registry.test.ts`.
- [x] **T2 — Core e service** (AC 2-6): core `tx` di AD-3 nei tre service (route singole invariate, `details.reason` additivo); `settings.service.ts` con `getSettingsSnapshot` e `saveSettings` nell'ordine di AD-2; `page.tsx` sullo snapshot.
- [x] **T3 — Unit** (AC 1-6, 10-11, 14, 17): §3.5; comando env eager.
- [x] **T4 — Modulo bozza** (AC 10, 11, 14, 17): `src/lib/settings-draft.ts` + test (AD-9).
- [x] **T5 — Pagina e sezioni scalari** (AC 8-13, 16-17): `settings-console.tsx`, sezioni controllate, Club unificata, Quota e Currency nuove, barra del Salva, email di prova (D-9).
- [x] **T6 — Liste in bozza** (AC 14-15, 18): `ratings-card.tsx` (Ratings + Visite mediche senza ambito), `cash-categories-card.tsx`, entrambe le facce; `mobile-settings.ts`.
- [x] **T7 — CSS e mobile** (AC 18): barra sopra la tab bar (misurata), stati di voce coi token esistenti, regole orfane rimosse.
- [x] **T8 — i18n** (AC 22): §3.6, parità misurata.
- [x] **T9 — e2e** (AC 3, 5, 8-11, 13-20): §3.4 (riscritture + test nuovi in `settings.spec.ts`).
- [x] **T10 — Discriminanza** (§4.3) con sha256.
- [x] **T11 — Verifica** (AC 21, 23, 24): grep a zero, OpenAPI servito, `npm run gates`, e2e mirati via `scripts/e2e.sh`, screenshot 1280/375; Dev Agent Record compilato (righe effettive, delta test, deviazioni).

---

## Dev Agent Record

### Agent Model Used

Opus 5.5 (`claude-opus-5-5`), unico dev subagent (`dev-19-8`), 2026-11-02. Skill: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max` (query «sticky save bar», «inline validation error focus», «submit button disabled state» → riepilogo errore nella barra + errore sul campo, stato disabilitato visibile, feedback di salvataggio).

### §A — Riallineamento sul HEAD (T0) e contratti della 19.7

- HEAD di partenza `a598b26` (19.1…19.7b committate, `git log --oneline -15`); `scripts/e2e.sh status` = ultimo arbitro 555 passed `E2E_EXIT=0`; `:3000` libero. DB `airmanager` NON toccato: tutte le prove su un gemello `airmanager_19_8` (createdb + migrate deploy + seed nel container, ricreato da zero prima della serie finale; eliminato a fine lavoro).
- **Contratti 19.7a verificati sul codice** (nessuna differenza di nome): `writeCurrencySettingsCore(tx, input)` e `setCurrencySettings` = `authorize` + `$transaction(core)` (`app-settings.service.ts:428-444`), `getCurrencySettings` senza gate, `currencySettingsSchema` in `schemas/settings.ts`, `CURRENCY_DEFAULTS` **e `CURRENCY_LIMITS`** in `src/lib/currency.ts` (D-g della 19.7a: il mirror li legge di lì); 409 `MEMBERSHIP_TYPE_LOCKED` e 422 `MEDICAL_TYPE_FIELDS` in `expiry-types.service.ts` (`assertNotMembership`/`assertMedicalFields`); `updateExpiryType` già in `$transaction` con `FOR UPDATE` (fix F3) — il core l'ha ereditato tale e quale; D-18 già fatto in `ratings-card.tsx` (form MEDICAL senza ambito/checkbox).
- **Scostamenti di riga rispetto a `a7e960e`** (stesso disegno): setter di `app-settings.service.ts` a `:92-102` (ICAO), `:116-126` (email), `:177-191` (scheduling), `:239-271` (SMTP), `:321-331` (METAR), `:367-377` (quota), `:447-457` (branding), `:537-559` (tesoreria); `expiry-types.service.ts:134-265`; `cash.service.ts:98-230` invariato; `page.tsx` `Promise.all` `:144-156` invariato; regole mobili `airops.css` dei «Salva» per card a `:3361-3362` (non `:3288-3290`), checkbox `:3410-3411`, `.catalog-sheet-step` `:3399-3400`.
- **Censimenti §3.1/§3.4 rieseguiti**: inventario identico (8 salvataggi + 3×3 scritture immediate + l'azione di prova; Club già a 3 PUT dopo la 19.1). Grep e2e: gli 8 spec attesi più due falsi positivi (`people-management.spec.ts:309` `medical-chip-*`, `person-save.spec.ts:252` `pilot-medical-editor`: altri testid, nessun flusso Impostazioni). `grep -rn 'data-testid\^=' e2e/` → nessun selettore su `settings`/`rating`/`medical`/`cash-category`/`club`.
- i18n di partenza: 1662 chiavi per locale, `SettingsPage` 208, parità 0/0.
- Unit di partenza: 1956 (gates sul HEAD).

### §B — Riepilogo per AC con le prove

| AC | Prova |
|---|---|
| 1 | e2e `settings.spec` «AC 1» (pilota e istruttore 403 `FORBIDDEN`, quota invariata; `{}` → `fieldErrors['']`; `smtp.host`, `scheduling.closeTime`, `club.contactEmail`, `cashCategories.create.1.name` puntati). Unit: `settings.service.test` «permission» (403 prima di QUALUNQUE metodo di `prisma`, `$transaction` mai chiamata), `issues-by-path.test` (blocco, array, radice), `schemas/settings.test` (11 casi sulla forma). |
| 2 | Unit `settings.service.test` «each scalar block» (9 casi + password cifrata): ogni blocco scrive esattamente le sue chiavi su `tx`, niente su `prisma`. |
| 3 | e2e `settings.spec` «AC 3 (a)» (409 `NAME_TAKEN`, `item {expiryTypes, create, 0}`, METAR e scheduling invariati) e «AC 3 (b)/(c)» (409 `IN_USE` `item {cashCategories, delete, 0, id}`, categoria nuova assente, quota invariata; update di un id inesistente 409 `NOT_FOUND`, METAR invariata). Discriminante §D.1. |
| 4 | Unit `settings.service.test` «one transaction»: `tx` distinto, zero scritture su `prisma` con tutti i blocchi e tutte le liste, lock di riga su `tx`; ordine delete → update → create per lista e scalari prima; errore dell'ultimo core propagato con `details.item`, nessuno snapshot letto. |
| 5 | e2e «AC 5» (un PATCH crea/rinomina/disattiva tipi e crea/rinomina+disattiva/elimina categorie; delete già eliminato e `isActive:false` su inattiva → 200; «elimina X e crea X» → 200 con id nuovo; «Ricariche» → 409 `SYSTEM_CATEGORY`; tipo con scadenza registrata → 409 `IN_USE` con item). `cash-register.spec` e i test API di `expiry-types.spec` **non modificati** e verdi. Unit «list semantics» (7 casi). |
| 6 | e2e «AC 6/17» (10 chiavi, `smtp` senza `pass`, `hasPassword: true`, nessuna quota nei tipi; la pagina mostra lo stesso `from`); unit «getSettingsSnapshot» (MEMBERSHIP esclusa, METAR = ICAO → `''`, snapshot letto DOPO il commit). |
| 7 | `registry.test` (path in elenco; request con i 10 blocchi; response `SettingsSnapshot`; 401/403/409/422; componenti `UpdateSettingsRequest`/`SettingsSnapshot` con i 10 blocchi; `settings/currency` GET 401 / PUT 401-403-422). |
| 8 | e2e «AC 8» (un solo `settings-save`, `type=submit`, nella barra, ultimo figlio del form; `getByRole('button', {name: 'Salva', exact})` = 1; 21 testid spariti a 0; un solo `button[type=submit]` nel form); a 375 la matrice di `mobile-settings` «AC 9». Discriminante §D.3. |
| 9 | e2e «AC 9»: le nove sezioni cambiate (nome, ICAO, email, METAR, quota, X/Y, finestra, mittente SMTP su Mailpit, tesoreria, rating nuovo, visita del test disattivata, categoria del test rinominata), zero scritture prima del click, **una** `PATCH /api/v1/settings` sola, body con i 10 blocchi, toast, barra di nuovo «Nessuna modifica», tutto presente dopo il reload. |
| 10 | e2e «AC 10» (disabilitato all'arrivo; «Quota associativa» nella barra; valore riportato a mano → disabilitato; Invio su pagina pulita → zero richieste; body = `['airfield','currency']`). Unit `settings-draft.test` (DB fresco → patch `null`; `60`/`60,00`; ICAO/email normalizzati; lista sola → `['expiryTypes']`). Discriminante §D.2. |
| 11 | e2e «AC 11 (a)» (422 su host, `aria-invalid`, messaggio, focus sull'host, bozza intatta, ICAO vecchio dopo reload), «AC 11 (b)» (nome preso via API dopo il caricamento → 409 su `rating-row-error` della riga nuova, focus lì, METAR invariata), «AC 11 (c)/12» (email e nome vuoto fermati dal client, zero richieste, messaggio un nodo). Unit `mapSaveError` (7 casi). |
| 12 | e2e «AC 11 (c)/12» (hint «Riceve l'email di prova SMTP.», placeholder METAR = ICAO della bozza, nome vuoto fermato); `club-membership-fee-input` a 0 (AC 8). TD 19.1-a chiuso: §G. |
| 13 | e2e «AC 13» (quota a 2 decimali e currency mostrate come salvate; X=0 e Y=3651 fermati con «Inserisci un numero intero da 1 a 99/3650.», zero richieste; salvataggio → body esatto `{membershipFee, currency}`, GET `membership-fee` = nuovo importo, cioè ciò che precompila l'azione Scadenze). `membership-fee.spec` invariato e verde (legge via API). |
| 14 | Desktop: `expiry-types.spec` (crea/modifica/disattiva/elimina in bozza, `data-state` new/changed/removed, «Ripristina», doppione fermato dal client a zero PATCH, «Elimina» su nuova la toglie), `settings.spec` «Categorie di cassa» (stesso ciclo + 409 «in uso» sulla riga). 375: `mobile-settings` «19.8 AC 14» tipo (crea dal pannello, modifica/disattiva dallo sheet, 409 mockato sulla card, elimina) e categorie (crea/rinomina/disattiva/elimina, sistema senza Elimina e nome in sola lettura). |
| 15 | `expiry-types.spec` test 2 (nessun `medical-scope-select`, nessuna checkbox, nessun «Tutti»/«Blocca prenotazioni» sulla riga, create = `{name, kind: 'MEDICAL', validityMonths}`, update = solo `name`; DB `ALL`/`true`), test 1 (nessuna colonna «Ambito» nella tabella visite); `mobile-settings` «AC 5» (sheet visita `['Validità', 'Stato']`, rating `['Ambito','Validità','Stato','Blocca prenotazioni e voli']`). Unit `mobile-settings.test` (ambito assente). |
| 16 | e2e «AC 16/17»: email di contatto modificata → bottone disabilitato con `smtp-test-email-hint`; Salva → abilitato; bozza in un'altra sezione non lo blocca; click → solo `POST …/test-email`, email su Mailpit al contatto salvato, bozza currency intatta. |
| 17 | e2e «AC 16/17» (password digitata nel body, assente dalla risposta, campo svuotato e placeholder «Password già configurata»; secondo salvataggio senza `pass`, `hasPassword` resta `true`) e «AC 6/17». |
| 18 | `mobile-settings` «AC 4 / 19.8 AC 18» (zero target < 44px a 320/375/390 anche coi tre pannelli aperti; Salva ≥ 44px e largo quanto il contenuto della barra; `headHeights` `toHaveLength(9)` ≤ pre-fix), «AC 10» (a 320/375/390: barra sopra la tab bar — `gap ≥ 0` e hit-test sul Salva — in cima e in fondo; `COVERED` senza `tabbar`/`savebar`/`other` in fondo; overflow 0), «AC 11» (iii con `settings-save` tra i bersagli ristretti, iv nuova: `bottom: 0` → la tab bar copre il Salva), «AC 5» (sheet senza `secondStep`, «Ripristina» ≥ 44px). Misura: tab bar 66,92px a 320/375/390 in IT e EN, gap 8,08px, Salva 44px. |
| 19 | `settings.spec` redirect pilota, `treasury-settings.spec` redirect, `mobile-settings` «AC 13» (pilota/allievo/istruttore a 375 e 1280): verdi. |
| 20 | Nessuno spec nuovo in catena; i test che scrivono AppSettings sono tutti in `settings.spec`. `expiry-types.spec` asserisce a ogni Salva `Object.keys(body) == ['expiryTypes']` (helper `saveOnlyExpiryTypes`), `expiry-registration.spec` idem, `pdf-exports.spec` asserisce il body `{airfield: {name}}`. |
| 21 | §E. |
| 22 | §E. |
| 23 | §I. |
| 24 | §H. |

### §C — Core estratti e route singole invariate

| Route singola | Prima | Dopo |
|---|---|---|
| `PUT settings/airfield`, `club`, `metar-station`, `membership-fee` | upsert su `prisma` | `authorize` + `write*Core(prisma, …)` (una chiave: non transazionale, come prima); stessi status/codici/body |
| `PUT settings/scheduling`, `smtp`, `treasury` | `$transaction([...])` a batch | `authorize` + `$transaction((tx) => write*Core(tx, …))`; stessi body (`smtp` risponde ancora `getSmtpSettings`) |
| `PUT settings/club` | due setter in `Promise.all` | **invariata** (TD 19.8-a) |
| `POST /expiry-types` | create su `prisma` | `authorize` + `createExpiryTypeCore(prisma)`; 409 con `details.reason: 'NAME_TAKEN'` (additivo) |
| `PATCH /expiry-types/{id}` | `$transaction` + `FOR UPDATE` | `authorize` + `$transaction(updateExpiryTypeCore)`; il catch P2002 è nel core (stesso 409 + `reason`) |
| `DELETE /expiry-types/{id}` | delete su `prisma`, 404/409 | `deleteExpiryTypeCore(prisma, id, { missingOk: false })`: stesso 404, 409 `reason: 'IN_USE'` |
| `POST/PATCH/DELETE /cash-categories…` | create/rename/delete su `prisma` | `createCashCategoryCore`, `updateCashCategoryCore(prisma, id, { name })` (qualunque `name` su una categoria di sistema = 409, come prima), `deleteCashCategoryCore(…, { missingOk: false })`; `reason` additivo (`NAME_TAKEN`/`SYSTEM_CATEGORY`/`IN_USE`) |
| `POST /cash-categories/{id}/{deactivate,reactivate}` | guardia atomica, 409 «already» | **non toccate** (il core dichiarativo è solo del composito) |

Unit esistenti rimasti verdi; i 5 di `app-settings.service.test` che asserivano la forma batch `$transaction([...])` riscritti sul callback (`runTransactionsOnPrisma`: le upsert del core si leggono su `upsertMock`), più due asserzioni `details.reason` in `cash`/`expiry-types.service.test`. e2e `cash-register.spec` e test API di `expiry-types.spec` invariati e verdi.

### §D — Discriminanza (§4.3), una build mutante unica

sha256 prima della mutazione (= dopo il ripristino, `diff` vuoto: `SHA_IDENTICAL`):
```
050ac68378aaf31729bfdd9737727541abfd9bf01370b5040170865715e4ab52  src/server/services/settings.service.ts
7df94d39eb46f16e9e00e4bfdf4c85a179e85396f0a41bb940c1567a3cad7972  src/lib/settings-draft.ts
0139095d4443a8ff59b76c119bfc63d4003dce5e4ac883a3a8a6448307a7a887  src/app/[locale]/dashboard/settings/scheduling-card.tsx
9b1e19f81a0fd15f07195cd5fdcef6e4734358e7e35b77c1a98d1374bf65b141  src/styles/airops.css
```
Quattro mutanti nella stessa build (`--retries=0`), ognuno rosso sul SUO test e per il SUO motivo:
1. **Atomicità** — `saveSettings` esegue gli stessi passi su `prisma` invece che in `$transaction` → `settings.spec` «AC 3 (a)» rosso all'asserzione `settings.spec.ts:235` (riga attuale) (`metar-station` cambiata nonostante il 409).
2. **Diff** — `buildSettingsPatch` manda ogni blocco scalare sempre → `expiry-types.spec` test 1 rosso a `expiry-types.spec.ts:40` (`Object.keys(body)` con 8 chiavi in più) e `settings.spec` «AC 10» rosso a `settings.spec.ts:476` (Salva abilitato all'arrivo).
3. **Un solo Salva** — un `scheduling-settings-save` rimesso nella card → «AC 8» rosso a `settings.spec.ts:388` (2 bottoni «Salva»).
4. **Barra sopra la tab bar** — tolto il `bottom` mobile → `mobile-settings` «AC 10» rosso a `mobile-settings.spec.ts:766` (`bar vs tab bar @320`: −54,92). La stessa prova vive anche nello spec come discriminante (iv), per iniezione di stile.
Le righe citate sono quelle attuali (la build mutante girava sulla versione dello spec di 4 righe più corta in testa, prima del letterale SMTP di §F). Nota di processo: in modalità serial un rosso salta il resto del gruppo, per cui AC 8 e AC 10 sono stati rieseguiti da soli sulla stessa build mutante.

### §E — Grep di AC 21 e parità i18n (verbatim)

```
--- grep 1 (fetch verso le route singole di scrittura)
src/app/[locale]/dashboard/settings/smtp-card.tsx:58:    const response = await fetch('/api/v1/settings/smtp/test-email', { method: 'POST' }).catch(() => null);
```
→ l'unico risultato è l'azione «Invia email di prova», che l'AC stesso esclude (la regex `settings/smtp` combacia con `settings/smtp/test-email`); l'altra fetch della pagina è la `PATCH /api/v1/settings` (`settings-console.tsx:196`).
```
--- grep 2 (testid ritirati) in src: 0 righe
--- grep 2 in e2e: solo le asserzioni di ASSENZA richieste dall'AC 8
e2e/settings.spec.ts:373-376 (RETIRED_TESTIDS, count 0 a 1280)
e2e/mobile-settings.spec.ts:716-719 (absentAtRest, count 0 a 375 e 1280)
e2e/expiry-types.spec.ts:149 (medical-scope-select toHaveCount(0), AC 15)
--- grep 3 (SettingsForm / settings-form.tsx): 0 righe
--- grep 4 (Promise.all nella cartella della pagina): 0 righe
```
(stesso trattamento della 19.6, AC 29: i residui sono le asserzioni di assenza; AC 8 e AC 21 non si possono soddisfare entrambi alla lettera altrimenti.)

i18n: `SettingsPage` **208 → 168** chiavi per locale, totale 1662 → 1622; parità `diff` vuoto (0/0); script di controllo: ognuna delle 168 chiavi è letta da `page.tsx` (letterale o template `${ns}`), nessuna chiave letta manca. Rimosse 73 (save/saved/error delle card, quota nella Club, `identityHeading`, `form.*` di submit/cancel/genericError/requiredField, `feedback.*` delle azioni immediate, `actions.confirm*`, ambito/blocca/yes/no delle visite, `treasury.invalidAmount` → `errors.invalidAmount`, `club.error` → `errors.generic`, `club.form.requiredField` → `errors.required`); aggiunte 33: `save`, `saved`, `saveBar.{clean,dirty,saving}`, `errors.{required,invalidAmount,integerRange,invalidValue,duplicateName,invalidItem,stale,systemCategory,checkFields,forbidden,generic}`, `rowState.{new,changed,removed}`, `actions.restore`, `club.contactEmailHint`, `membership.{title,sub,fee,feeHint}`, `currency.{title,sub,minFlights,windowDays,flightsSuffix,daysSuffix,hint}`, `smtp.testEmailNeedsSave`.

### §F — Delta test

- **Unit**: 1956 → **2038** (+82): `settings.service.test` 29 (nuovo), `settings-draft.test` 32 (nuovo), `issues-by-path.test` 4 (nuovo), `schemas/settings.test` +11, `registry.test` +2, `mobile-settings.test` +2, `cash.service.test` +1, `expiry-types.service.test` +1; 5 test di `app-settings.service.test` riscritti (forma callback). Verifica env eager: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 7 file toccati → 233 passed.
- **e2e**: `settings.spec` 7 → 16 (+9); `expiry-types` 6, `treasury-settings` 3, `mobile-settings` 12, `pdf-exports` 9, `expiry-registration` 2 invariati di numero (riscritti). `npx playwright test --list` → **564** test (era 555). **Delta arbitro atteso 555 → 564.**
- **Serie mirate** (gemello ricreato da zero, build pulita, `E2E_REUSE_SERVER=1`): progetto `chromium` — `expiry-types`, `pdf-exports`, `expiry-registration`, `cash-register`, `membership-fee`, `api-v1`, `mobile-ink-targets` → **56 passed**, exit 0; catena `--no-deps --workers=1` — `settings` + `treasury-settings` + `mobile-settings` → **31 passed**, exit 0, zero flaky. Serie precedenti sul gemello sporco: `settings` 15 + 1 flaky (login, classe nota: il retry passa; `LoginAttempt` solo righe `succeeded`), `treasury-settings` + `mobile-settings` 15 passed; `api-v1` 2 rossi **solo** sul gemello che aveva già girato la catena (le prenotazioni del 2099 superano i `maxAdvanceDays: 3650` della finestra permissiva ripristinata da `settings.spec`; nella suite vera `chromium` gira PRIMA della catena): verde dopo aver tolto le `sched.*` dal gemello, e verde nella serie finale.
- Dopo la serie finale una sola riga di spec è cambiata: `settings.spec` usa il letterale `'localhost'` per l'host SMTP invece di `process.env['SMTP_HOST']` (che `env.ci-sync.test` avrebbe voluto in `ci.yml`): stesso valore di `.env`/`.env.example`.

### §G — Deviazioni motivate

- **D-a (firme di AD-9)**: `buildSettingsPatch` restituisce `{ body, index }` (l'indice `index → rowKey` della richiesta, trappola 8) invece del solo body; `validateDraft(baseline, draft, patch)` riceve anche la baseline (serve per sapere quali righe sono nuove/modificate: le righe salvate e intatte non si validano).
- **D-b (validazione solo dei blocchi nel patch)**: il mirror controlla solo i blocchi che il Salva sta per mandare — su un'installazione nuova l'host SMTP vuoto non blocca un salvataggio dell'ICAO.
- **D-c (`closeTime ≤ openTime` fermato dal client)**: AD-9 lo mette nel mirror, quindi dal telefono è un errore client a zero richieste, non il «422 puntato» citato in §3.4 per `mobile-settings`; il 422 `scheduling.closeTime` resta provato via API (`settings.spec` AC 1). L'host SSRF resta l'unico 422 di campo provato dalla UI.
- **D-d (modifiche durante la richiesta)**: la bozza non si blocca durante il salvataggio; la risposta riallinea baseline e bozza allo snapshot (spec), quindi un carattere digitato nei ~100 ms del volo andrebbe perso. La mappa degli errori usa comunque l'indice della richiesta catturato al click.
- **D-e (azioni su voci nuove/eliminate)**: una voce nuova non ha «Disattiva» (il create non porta `isActive`); una voce «Da eliminare» mostra solo «Ripristina».
- **D-f (messaggio di riga sul telefono)**: l'errore sta subito SOTTO la card (fratello del `<button>`), non dentro: un `role="alert"` dentro il bottone della card ne sporcherebbe il ruolo, e la card resta un solo interattivo (asserito).
- **D-g (copy)**: etichetta «Finestra» (non «Finestra (giorni)») perché il suffisso dell'`InputGroup` dice già «giorni»; hint di METAR ed email come `hint` del `Field` (sotto il campo) invece del paragrafo sotto la griglia; messaggio nuovo `errors.checkFields` nella barra quando i campi evidenziati spiegano perché nulla è stato salvato (linea guida «errore sul campo + riepilogo»); nomi vuoti di una voce nuova mostrati come «—». Copy definitive: 19.12.
- **D-h (stato disabilitato)**: `.btn` non ha un aspetto `:disabled` (solo `[aria-disabled]`, 13.11): il Salva e «Invia email di prova» prendono la stessa opacità .4 con regole sulle classi della pagina (`.settings-save-bar > .btn:disabled`, `.settings-card > .card-head > .btn:disabled`), non globali (TD 19.8-b).
- **D-i (focus sull'errore)**: il primo errore visibile (campo `aria-invalid` o messaggio di riga) prende il focus da un effetto dopo il commit e viene centrato (`scrollIntoView({ block: 'center' })`): lo scroll minimo del browser lo lasciava sotto la top bar o sotto la barra del Salva (misurato prima della correzione).
- **D-j (pannelli dopo il Salva)**: le tre card di lista si rimontano a ogni Salva riuscito (`key` col contatore), che chiude pannelli e sheet; la console NON si rimonta (trappola 11).
- **D-k (OpenAPI)**: come ogni altro request/response registrato del repo, il path inlinea lo schema e i componenti `UpdateSettingsRequest`/`SettingsSnapshot` sono registrati a parte (il test lo asserisce così, non con un `$ref`).
- **TD 19.1-a chiuso** come falso positivo: `airfield.contactEmail` ha un consumer (`smtp-test-email.service.ts:23`, destinatario dell'email di prova); il campo resta, con l'hint che lo dice.
- **METAR negli e2e**: il layout della dashboard chiama `getMetar` a ogni pagina (TD 19.7b-e, senza timeout; misurato qui: LIRF 8,0 s, LIZZ 204 in 0,28 s). `settings.spec` salva solo una stazione FISSA (`LIZZ`) e in `afterAll` rimette METAR `''` e ICAO/email/nome/quota/currency ai valori letti in `beforeAll` (più finestra permissiva e tesoreria neutra), così la catena a valle non eredita stazioni.

### §7 — Debito tecnico nuovo

- **TD 19.8-a** — `PUT /api/v1/settings/club` (route singola, non toccata per chirurgia) scrive ancora ICAO ed email con due setter in `Promise.all`, non atomici fra loro (preesistente; il composito li scrive nella sua transazione). Bassa.
- **TD 19.8-b** — `.btn` non ha uno stile `:disabled` globale: ogni bottone disabilitato dell'app (fuori da questa pagina) appare identico a uno attivo. Bassa/media, da decidere a livello di design system.
- **TD 19.8-c** — transazione del composito con il timeout predefinito (5 s): un client API che mandasse liste ai massimi (50 + 200 + 200 voci per lista) su un DB remoto lento potrebbe superarlo (P2028). Nessun consumer oggi oltre la pagina. Bassa.

### §H — Verifica UI (screenshot)

Script `playwright-core` throwaway (scratchpad, Chromium 1228), build di produzione sul gemello: 1280 chiaro (pulita, pannello aperto, lista con new/changed/removed, errore di riga, errore di campo centrato), 1280 scuro (stessi stati), 375 chiaro (pulita con Salva disabilitato visibile, pannello aperto, sheet di una voce, lista sporca, errore di riga, errore host centrato con hint della prova e messaggio della barra, fondo pagina). Misure: overflow orizzontale 0 a 1280 e 375; barra 60,8px a 1280 (12px dal bordo), 92,1px a 375, 8,08px sopra la tab bar (66,92px) a 320/375/390 IT ed EN. Solo token e primitive AirOps esistenti (`--panel`, `--border`, `--radius-md`, `--shadow-md`, `--accent`, `--ink-*`, `Badge` info/warn/bad); stati di voce con gli stessi segni delle righe in bozza della 19.4.

### §I — Gate ed esiti verbatim

```
PASS  lint (60s)
PASS  typecheck (10s)
PASS  test (22s) — Tests  2038 passed (2038)
PASS  build (56s)
```
e2e finali (gemello fresco): `56 passed (2.3m) E2E_EXIT=0` (progetto `chromium`, 7 spec) e `31 passed (2.4m) E2E_EXIT=0` (catena `settings` + `treasury-settings` + `mobile-settings`, `--no-deps --workers=1`). L'arbitro full-suite su DB fresco resta alla sessione principale (atteso 564).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `a7e960e`).
- Implementazione completa dei 24 AC (commit `72ad09e`): endpoint composito atomico con core `tx`, snapshot unico, pagina a Salva unico su due facce, liste in bozza, i18n, e2e riscritti/ampliati; discriminanza dei quattro mutanti provata con sha256 identici al ripristino.
- Gemello `airmanager_19_8` eliminato a fine lavoro; `airmanager` e `airmanager_load` mai toccati.

### File List

- `src/app/api/v1/settings/route.ts` (nuovo)
- `src/app/api/v1/settings/currency/route.ts` (nuovo)
- `src/lib/api/issues-by-path.ts`, `src/lib/api/issues-by-path.test.ts` (nuovi)
- `src/lib/settings-draft.ts`, `src/lib/settings-draft.test.ts` (nuovi)
- `src/server/services/settings.service.ts`, `src/server/services/settings.service.test.ts` (nuovi)
- `src/app/[locale]/dashboard/settings/settings-console.tsx`, `membership-card.tsx`, `currency-card.tsx` (nuovi)
- `src/app/[locale]/dashboard/settings/settings-form.tsx` (eliminato, confluito nella sezione Club)
- `src/app/[locale]/dashboard/settings/page.tsx`, `club-card.tsx`, `scheduling-card.tsx`, `smtp-card.tsx`, `treasury-card.tsx`, `ratings-card.tsx`, `cash-categories-card.tsx`
- `src/server/services/app-settings.service.ts`, `app-settings.service.test.ts`, `expiry-types.service.ts`, `expiry-types.service.test.ts`, `cash.service.ts`, `cash.service.test.ts`
- `src/lib/schemas/settings.ts`, `settings.test.ts`, `registry.ts`, `registry.test.ts`
- `src/lib/mobile-settings.ts`, `mobile-settings.test.ts`
- `src/styles/airops.css`
- `messages/it.json`, `messages/en.json`
- `e2e/settings.spec.ts`, `e2e/expiry-types.spec.ts`, `e2e/treasury-settings.spec.ts`, `e2e/mobile-settings.spec.ts`, `e2e/pdf-exports.spec.ts`, `e2e/expiry-registration.spec.ts`
- `_bmad-output/implementation-artifacts/19-8-impostazioni-salva-unico.md` (questo record)

### Change Log

- 2026-11-02 — dev (Opus 5.5): implementazione `72ad09e` (feat) e Dev Agent Record; Status → review.
