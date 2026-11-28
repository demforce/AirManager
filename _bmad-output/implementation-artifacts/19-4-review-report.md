# Review adversarial — Story 19.4 «Editor pilota e istruttore a Salva unico»

- **Reviewer**: Opus 5.5 (`claude-opus-5-5`), unico layer adversarial — 2026-11-02
- **Commit sotto review**: `e160065` (feat) + `7d2dd4b` (docs), baseline `bb92494`
- **Metodo**: `bmad-code-review` + `karpathy-guidelines`; arbitro e2e completo su DB fresco; sonde empiriche sull'app reale (build di produzione dell'arbitro, `npm run start`), DB ispezionato via `pg`; UI guidata con `playwright-core` (Chromium `chromium-1228`, `timezoneId: Europe/Rome`) — il Playwright MCP non era necessario.

## Verdetto

**SHIPPABLE DOPO IL FIX DI F1** (MEDIUM, fix piccolo e locale ai due editor). Il contratto server è solido: atomicità, ordine dei lock, esclusività, diff delle scadenze, parti istruttore, RBAC e idempotenza reggono tutte le prove costruite a mano e **0 errori 5xx / 0 deadlock** su 45+ iterazioni concorrenti per scenario. F2 e F3 sono LOW (F2 chiede una decisione di copy al PO/19.12).

| # | Severità | Titolo |
|---|---|---|
| F1 | MEDIUM | Un campo anagrafica opzionale vuoto, toccato e poi svuotato, blocca l'INTERO Salva (il diff tratta `''` come `null`, il resolver no) — bozza persa o valore fittizio obbligato |
| F2 | LOW | Errori deterministici (`PERSON_ARCHIVED`, `EXPIRY_TYPE_*`, `SCOPE_MISMATCH`, `EXPIRY_CONFLICT`, `INSTRUCTOR_PROFILE_INACTIVE`) mostrati come «Si è verificato un errore. Riprova.» a livello di sezione — decisione PO |
| F3 | LOW | Un GET delle tariffe istruttore fallito si legge come «Nessuna tariffa in vigore» (`fetchInstructorRates` ingoia l'errore) |

---

## Arbitro e2e (priorità zero)

Lanciato per primo, su DB fresco (resettato dalla sessione principale), `:3000` vuoto e nessun run in corso:
`export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` → `STARTED (pid 426829)`. Esito letto SOLO con `scripts/e2e.sh status`:

```
  519 passed (13.4m)
E2E_EXIT=0
```

- **Delta dichiarato 504 → 519: confermato** (+15: `person-save` 11, `person-profiles` +2, `instructor-rates` +2).
- **0 failed, 0 flaky**: nessuna classe nota da diagnosticare (login 5 s, pagina 1, cap 100, METAR, TD-6, TD 16.2-g, TD 19.4-a non si sono manifestate).

---

## Finding

### F1 — MEDIUM — Un campo opzionale vuoto toccato e svuotato blocca l'intero Salva

**Dove**
- `src/lib/person-save.ts:20-28` — `savedFormOf` normalizza `null` ≡ `''` (trappola 13 della story): un campo vuoto sul server, digitato e poi svuotato, **non** è nel diff → non viene mandato.
- `src/lib/schemas/people.ts:29-35` — `updatePersonSchema`: `phone`/`address` sono `z.string().trim().min(1).nullish()`, `email` è `.pipe(z.email()).nullish()` → `''` è **invalido**.
- `src/app/[locale]/dashboard/pilots/pilot-editor.tsx:378` e `src/app/[locale]/dashboard/instructors/instructor-editor.tsx:331-334` — quello schema è il `zodResolver` dell'INTERO form: `handleSubmit` valida tutti i campi d'anagrafica, anche quelli che il diff considera invariati.

**Effetto**: il Salva si abilita (il diff ha altre parti), il click viene fermato da RHF con «Campo obbligatorio.» su un campo che l'utente considera vuoto/invariato, **nessuna richiesta parte**. Nell'input non c'è modo di tornare a `null` (anche uno spazio viene trimmato a `''`): l'utente deve inventare un valore o chiudere il pannello — e senza conferma di chiusura (D-6) perde tutta la bozza (profili, scadenze, compenso, tariffa). È il TD 19.4-d preesistente («un campo opzionale svuotato non si può salvare»), ma **questa story ne allarga il raggio**: prima bloccava solo il form anagrafica, ora blocca ogni sezione — ed è raggiungibile anche senza voler cancellare nulla (basta digitare in un campo vuoto e cancellare).

**Riproduzione** (`probe-ui2.mjs`, editor pilota a 1280): persona senza telefono → Modifica → Telefono: `fill('+39 1')`, poi `fill('')` → Salva disabilitato (corretto: diff vuoto) → chip di un rating ALL + data `2099-01-01` → Salva abilitato → click.

**Evidenza**
```
T1 disabledAfterClear=true enabledWithRating=true writes=0 expiryRows=0 alerts="Campo obbligatorio." focused="TelefonoCampo obbligatorio."
FAIL T1 [expected to FAIL if trap present] the rating saves after touching+clearing the empty phone — writes=0 rows=0
```
Stessa radice osservata nell'editor istruttore (prima esecuzione di U4): dopo un 409 email, svuotare l'email dava `alerts: Campo obbligatorio. | Esiste già una persona con questa email.` — il form restava bloccato (e l'errore di sezione del tentativo precedente restava visibile, v. nota sotto).

**Fix suggerito** (risolve anche il TD 19.4-d, il server accetta già `null` su questi tre campi): nei due editor registrare `email`/`phone`/`address` con `setValueAs: (v) => (typeof v === 'string' && v.trim() === '' ? null : v)` (oppure un resolver client che preprocessa `'' → null` sugli opzionali). Con `null` nel valore di RHF: campo vuoto mai toccato → invariato e valido; valore salvato cancellato → nel diff come `null` → il server lo azzera. e2e da aggiungere a `person-save.spec.ts`: «fill + clear del telefono vuoto, rating nuovo, Salva → 1 PATCH senza `phone`» (rosso oggi, verde dopo) e, se si chiude il TD 19.4-d, «telefono salvato cancellato → `phone: null`». Nota minore nello stesso punto: `onInvalid` non azzera `saveError`, quindi l'errore di sezione del tentativo precedente resta accanto ai nuovi errori di campo (`pilot-editor.tsx:441-443`, `instructor-editor.tsx:399-401`): azzerarlo lì.

### F2 — LOW — Errori deterministici mostrati come «Riprova», senza dire cosa né quale riga

**Dove**: `pilot-editor.tsx:481-493` (sezione `expiries` → sempre `labels.ratings.genericError`), `instructor-editor.tsx:444-453` (`payoutRate`/`instructorRate` → `labels.errors.generic`/`studentRate.genericError`).

Requisito della review soddisfatto: **nessun 409 viene mostrato come «email già usata»** (verificato su ogni codice, v. sotto). Ma per `PERSON_ARCHIVED`, `EXPIRY_TYPE_INACTIVE`/`_NOT_FOUND`, `SCOPE_MISMATCH`, `EXPIRY_CONFLICT`, `INSTRUCTOR_PROFILE_INACTIVE` il testo è «Si è verificato un errore. Riprova.»: ritentare fallirà sempre, e con più righe nuove nella stessa sezione l'utente non sa quale togliere. Prima della 19.4 l'errore compariva sulla riga che si stava aggiungendo (attribuzione per riga) e non bloccava le altre sezioni; ora blocca tutto il Salva (P7, corretto) senza dire perché. AD-5 consentiva il messaggio generico, quindi non è una violazione di contratto.

**Evidenza** (`probe-ui.mjs` U2, `probe-ui2.mjs` U4b): persona archiviata dall'editor stesso + rating nuovo → `pilot-ratings-error` = «Si è verificato un errore. Riprova.» (focus corretto sull'errore, telefono non salvato); istruttore disattivato alle spalle dell'editor → `instructor-payout-rate-error` e `instructor-rates-error` = «Si è verificato un errore. Riprova.». Screenshot: `shots/u2-archived-error.png`, `shots/u4b-instructor-inactive.png` (scratchpad).

**Decisione PO** (o rinvio a 19.12, revisione copy): copy per codice — es. «La persona è archiviata: ripristinala per aggiungere scadenze.», «Il tipo "{nome}" è stato disattivato: togli la riga.», «Il profilo istruttore non è più attivo.» — con il nome del tipo quando l'errore riguarda una riga (il server potrebbe passare `expiryTypeId` nei `details`).

### F3 — LOW — Tariffe istruttore: un caricamento fallito si legge «Nessuna tariffa in vigore»

**Dove**: `instructor-editor.tsx:219-223` (`fetchInstructorRates` → `[]` se `!response.ok`), resa `:561-571`.

Con un GET fallito l'hint dice «Nessuna tariffa in vigore» e il placeholder sparisce: l'admin può credere che non ci sia tariffa e impostarne una «da oggi», sostituendo quella vera. La chiave `studentRate.loadError` («Impossibile caricare lo storico tariffe.») è stata rimossa. È lo stesso ragionamento che il dev applica in §G-12 a `fetchPersonExpiries` («una lista vuota per errore offrirebbe… meglio fallire»). Evidenza: lettura del codice (non ho forzato un 500 sul GET). **Fix**: far fallire il fetch e, in errore, mostrare un messaggio di caricamento al posto dell'hint (niente placeholder, niente «Nessuna tariffa»).

### Note INFO (nessuna azione richiesta in questa story)

- **I1** `expiry-editor.tsx:36-39` — `precompileExpiresAt` usa `todayDateOnlyUtc()` (data UTC nel client): preesistente dalla 13.8, non è una data «nuova» ai sensi di A16, ma il grep di AC 26 passa solo perché `todayDateOnly\b` non intercetta `todayDateOnlyUtc`. Candidato TD (fra le 00:00 e l'01:00/02:00 di Roma precompila un giorno indietro).
- **I2** `people.service.ts` (§G-6) — il ricontrollo «tipo attivo» dentro la transazione usa la mappa letta prima (nessuna rilettura): stessa finestra check-then-write di `registerExpiry`, innocuo.
- **I3** Persone «legacy» con Allievo + Pilota entrambi attivi (pre-19.3): qualunque blocco profili nel composito (anche solo togliere Istruttore) dà 422 finché lo stato non viene sanato nello stesso Salva. Coerente con «stato finale», il messaggio di sezione lo spiega. Nessuna azione.

---

## Verificato corretto (con prove)

**Contratto API** (`probe-api.mjs`, 52 controlli, 0 fallimenti reali — i 2 «FAIL» stampati sono artefatti della sonda, chiariti sotto):
- **Atomicità sul DB reale** — (a) `{phone, profiles.pilot:false, expiries.set:[ALL esistente → nuova data, PILOTS nuovo]}` → 422 `SCOPE_MISMATCH`; telefono invariato, Pilota attivo, **data della riga ALL già spostata nella stessa transazione tornata a `2098-01-01`** (`"expiresAt"::text`), il suo `SentAlert` ancora presente, nessuna riga PILOTS. (b) solo-istruttore senza `Account` + attivazione Allievo + scadenza → 422 `STUDENT_PROFILE_EXCLUSIVE`: `Account` 0→0, nessun `StudentProfile`, nessuna scadenza, nome invariato. (c) tariffa di ieri → 422 `RATE_VALID_FROM_IN_PAST`, compenso non scritto. (d) licenza aggiornata + scadenza + compenso senza istruttore → 409 `INSTRUCTOR_PROFILE_INACTIVE`, licenza e scadenza annullate. Artefatto: il primo controllo di (a) leggeva `Date` col fuso del processo (`2097-12-31T23:00Z` = `2098-01-01` a Roma); riletto come testo = `2098-01-01`.
- **Esclusività sullo stato finale**: allievo + istruttore → 422; «Allievo off + Pilota on + Istruttore on» → 200 `PersonDetail`; «Allievo on + Pilota off» con Istruttore ancora attivo → 422; Pilota e Allievo entrambi `true` → 422 `STUDENT_PROFILE_EXCLUSIVE`; disattivare un profilo inattivo → 200 no-op.
- **Diff scadenze**: stessa data → 200, `updatedAt` invariato, `SentAlert` intatto; data nuova → `SentAlert` cancellati; riga esistente su tipo disattivato → 200; riga nuova su tipo disattivato → 422 `EXPIRY_TYPE_INACTIVE`; tipo inesistente → 422 `EXPIRY_TYPE_NOT_FOUND`; tipo in `set` e `remove` → 422 `VALIDATION_ERROR`; remove di un tipo assente → 200; persona archiviata: riga nuova → 409 `PERSON_ARCHIVED` (telefono non salvato), spostamento/rimozione di riga esistente → 200.
- **Parti istruttore**: attivazione + compenso + tariffa nello stesso body → 200; stessa `validFrom` → riscrittura (1 riga, 4500); `payoutRateCents: null` azzera; `-1`, `2^31`, `1.5`, `"100"` → 422; tariffa su non-istruttore → 409 `INSTRUCTOR_PROFILE_INACTIVE`.
- **RBAC**: pilota, istruttore e allievo → 403 `FORBIDDEN` su body con sola anagrafica, con `expiries` e con `payoutRateCents` (prima di qualunque query: «lacks people.manage»); anonimo → 401; persona vittima intatta. Il gating per parte (`expiries.manage`/`payouts.manage`/`settings.manage`) è provabile solo a unit (ADMIN li ha tutti): unit presenti e verdi.
- **Retro-compatibilità**: body di sola anagrafica → 200 con i tre profili; id ignoto → 404; body invalido → 422 prima del lookup.
- **OpenAPI servito**: `PATCH /api/v1/people/{id}` con `profiles`/`expiries`/`payoutRateCents`/`instructorRate` nella request, 200 = forma `PersonDetail` (inline: **tutte** le 75 response 200 del documento sono inline, convenzione del progetto — il secondo «FAIL» della sonda cercava un `$ref`), errori 401/403/404/409/422/500.

**Concorrenza** (`probe-conc.mjs`, eseguito con N=15 e poi N=30 → 45 iterazioni per scenario; `probe-book.mjs` 12+1):
```
C2a composite(pilota: email nuova per ultima, licenza → upsert Account, scadenza) ‖ registerFlight dello stesso pilota: 200 ×45 / 201 ×45
C2b composite(istruttore: email, compenso, tariffa, scadenza) ‖ volo SCUOLA con lui istruttore:      200 ×45 / 201 ×45
C1  Salva ‖ Salva stessa persona: nessun 5xx (409 = INSTRUCTOR_PROFILE_INACTIVE quando l'altro lo disattiva)
C5  composite con scadenza nuova ‖ archivia: coerente (200 ⇒ riga+telefono, 409 PERSON_ARCHIVED ⇒ niente)
C6  composite Pilota ‖ PUT …/profiles/student: sempre un 200 e un 422, un solo profilo di volo attivo
C7  composite ‖ POST /expiries stesso tipo: 409 EXPIRY_CONFLICT (mai CONFLICT), il perdente non salva il telefono
C8  stessa email nuova su due persone (P2002 all'ULTIMO passo): sempre 200+409 CONFLICT, il perdente non conserva telefono/istruttore/scadenza
B   composite (istruttore o allievo della prenotazione) ‖ creazione prenotazione: 200 ×12 / 201 ×12
OK   no 5xx anywhere
```
Log del server: `grep -ciE "deadlock|40P01|P2028|P2034"` → **0**. L'ordine `Person (NO KEY UPDATE) → profili/Account → Expiry → InstructorProfile → InstructorRate → Person (UPDATE)` non chiude cicli con voli e prenotazioni, come dichiarato nel §C.

**UI** (`probe-ui.mjs`, `probe-ui2.mjs`, `probe-ui3.mjs`):
- Editor pilota a 1280: `.so-foot` = «Annulla | Salva modifiche[disabled]» a form pulito, nessun overflow; l'unico altro submit del pannello è «Crea e invia invito» (azione).
- Focus: errore server → sull'errore di sezione (`pilot-ratings-error`, `pilot-profiles-error`, `instructor-payout-rate-error`, `instructor-rates-error`); validazione client (Pilota senza licenza) → sul campo licenza, **0 richieste**.
- `STUDENT_PROFILE_EXCLUSIVE` da editor stantio (istruttore attivato via API a pannello aperto, poi spunta Allievo) → `pilot-profiles-error` col testo della regola, telefono non salvato.
- **Nessun 409 mostrato come «email già usata»**: `PERSON_ARCHIVED`, `INSTRUCTOR_PROFILE_INACTIVE` (compenso e tariffa) → messaggi generici nella sezione giusta; il 409 email → «Esiste già una persona con questa email.» nell'anagrafica (pilota e istruttore).
- Azioni separate: Invio nell'email dell'invito → **solo** `POST /users`, telefono in bozza conservato, Salva ancora abilitato, DB invariato; Archivia (U2) idem.
- Bozza scadenze: «Rimuovi» → `data-state="removed"`, data e calendario disabilitati, un PATCH `{expiries:{remove:[…]}}`, riga sparita; riattivare Pilota ripropone la licenza conservata.
- Mobile 375: Salva nello `.so-foot` alto 44px, colpibile col corpo in cima e in fondo, in entrambi gli editor; nell'editor istruttore 1 solo submit; popover data delle righe RATING e MEDICAL dentro il viewport (`left 8, right 288, top 18, bottom 402.9`); overflow 0.

**Codice / gate**:
- Env eager: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` di people/expiries/instructor-rates/rates/person-save/registry → `Test Files 6 passed, Tests 267 passed`.
- i18n: parità it/en vuota, 1672 = 1672.
- Residui (AC 26): restano solo le asserzioni d'ASSENZA negli e2e e i `todayDateOnly` UTC delle console fuori perimetro (TD 19.4-b, `pilots-console.tsx:712` preesistente).
- Diff e ordine del service conformi ad AD-2/AD-3 (lock primo statement, disattivazioni → attivazioni → una sola esclusività → scadenze → istruttore → anagrafica per ultima; 409 con codici propri; nessuna scrittura fuori da `tx`); `instructor-compensation.service` non importato (niente catena env).

## Decisioni PO necessarie

1. **F2** — copy specifica per i codici deterministici (o rinvio esplicito alla 19.12).
2. Facoltativa, legata a F1: se il fix proposto (valore `null` per i campi opzionali svuotati) chiude anche il **TD 19.4-d** (si potrà cancellare un telefono/indirizzo/email salvato), confermare che è il comportamento voluto.

## Stato della macchina a fine review

- `npm run start` avviato da me (PID npm **441854**, `next-server` **441873**) e **fermato per PID**; `:3000` e `:3001` liberi; nessun processo `next`; nessun run e2e attivo (arbitro DONE, `E2E_EXIT=0`).
- Repo **invariato** (`git status` identico all'inizio: solo i file untracked dell'utente e la cancellazione preesistente di `.claude/skills/design-taste-frontend/SKILL.md`); nessuno stash, nessun `git add`, nessuna build rifatta; `airmanager_load` e i container non toccati.
- DB `airmanager`: contiene le fixture run-unique delle sonde (persone `Rbac/Atom*/Excl/Diff/Istr/Retro/Conc*/U*-/T1-/P375-/Bk*`, tipi `Rev194 …`, velivoli `I-RV*`/`I-BK*`, voli 2025-02/2025-03, 13 prenotazioni future sul velivolo `I-BK…`, righe con id `rev194_` in `SentAlert`/`AircraftRate`/`InstructorRate`). **Consigliato il reset del DB prima del prossimo arbitro.**
- Script e screenshot delle sonde: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/` (`probe-api.mjs`, `probe-conc.mjs`, `probe-book.mjs`, `probe-ui*.mjs`, `shots/`, `server.log`).
