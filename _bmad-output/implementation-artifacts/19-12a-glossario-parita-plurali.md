---
baseline_commit: dc69faf
---

# Story 19.12a: Glossario, test di parità, plurali ICU e chiavi morte

Status: **review** — 2026-11-03 (dev `dev-19-12a`, Dev Agent Record in fondo; arbitro AC 12 e chiusura AC 13 alla sessione principale). **Modello dev: Opus 5 xhigh (UI)**: la story cambia componenti client (plurali calcolati nel browser via `useTranslations`), le `labels` di una decina di pagine e il testo di superfici desktop e mobile, oltre a scrivere test e documentazione. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-12a-glossario-parita-plurali`.

> **Origine**: la story 19.12 «Revisione completa dell'italiano» (CR 2026-11-01 §4.2, punto PO 13) è stata **divisa dalla sessione principale** il 2026-11-03 in **19.12a** (questa: meccanismi verificabili da test) e **19.12b** (`19-12b-passata-testi.md`: passata di contenuto in contesto). Questa story scrive il glossario che la 19.12b applica.
>
> ⚠️ **Baseline e ordine**: ricognizione misurata su **`dc69faf`** (19.1-19.10 committate, la 19.10 in review; la 19.11 è solo story file). Il dev parte **dopo il commit di chiusura della 19.11**: la 19.11 aggiunge 15 chiavi per file e ne toglie 2 (`19-11-*.md` §3.6), e il test di parità e la rimozione delle chiavi morte vanno fatti sul catalogo finale dell'epic. Gli eventuali fix di review della 19.10 possono aver toccato `BookingsPage.requirements.*` e `Requirements.*`. I conteggi di §3 **sono comandi, non elenchi da prendere per buoni**.
>
> **T0, prima di scrivere una riga**: `git log --oneline -12`, `scripts/e2e.sh status`, `ss -ltnp | grep :3000` (sessioni parallele: memoria `parallel-sessions-collision-risk`), poi rieseguire §3.1, §3.2 (righe dei consumatori), §3.3 e §3.4 e correggere qui le righe slittate.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (e2e: name-match substring, testid `-mobile`/`mobile-` e divieto `^=`, suite solo via `scripts/e2e.sh`, unit ed env eager, manutenzione del file); CR `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §4.2 riga 19.12 e §4.10 **A20**; `13-1-piloti-backend-ratings-medical-create.md:102` (**R5**); `src/components/dashboard/requirements-warning.tsx` (ICU nel client, 19.9). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max`.

### ✅ Decisioni PO (2026-11-03) che il glossario registra

Le domande complete, con le opzioni, sono in `19-12b-passata-testi.md` (lì si applicano). Qui servono per scrivere `docs/i18n/glossario-it.md` e la copy delle chiavi che questa story tocca.

| Domanda | > **DECISIONE PO (2026-11-03)** |
|---|---|
| Q-19.12-a — nomi di menu | **B (contro la raccomandazione)**: «**Velivoli**» ovunque per la sezione flotta (menu, barra, H1; il singolo resta «velivolo»; via «Aeromobili»); «**Estratto conto**» anche come voce di menu e H1 del conto personale (via «Le mie transazioni» e «Il mio conto»). Inglese coerente («Aircraft», «Account statement»). |
| Q-19.12-b — currency | **A**: «currency» femminile; stati «Valida / In scadenza / Scaduta»; «Non current» → «Currency scaduta»; «Currency 5gg» → «Currency · 5 gg». |
| Q-19.12-c — ruolo ADMIN | **A**: «Amministratore» ovunque. |
| Q-19.12-d — pagine d'errore | **A**: in 19.12b, minimali. |
| Q-19.12-e — descrizioni del server | **A**: in 19.12b, solo «Instructor payout» → «Compenso istruttore». |

---

## Story

As **chi scrive o rivede le copy di AirManager** (dev, reviewer, la futura 18.5),

I want un glossario scritto, un test che confronta i due cataloghi chiave per chiave e argomento per argomento, plurali veri al posto di quelli fatti a mano e un catalogo senza chiavi morte,

so that la passata di contenuto della 19.12b lavori su un catalogo pulito, e una copy nuova sbagliata (una chiave mancante in inglese, un plurale letto con `t.raw`, un placeholder perso) diventi un test rosso invece di un difetto in produzione.

### Il perché

I plurali sono quasi tutti scritti a mano (`{count} prenotazioni`, «1 totali», `countText(one, many)`), e una parte vive in `t.raw` + `.replace` nei componenti client, dove ICU non arriva. Nessun test confronta `it.json` ed `en.json`; nessun tipo di next-intl protegge le chiavi, quindi una chiave tolta per errore rompe solo a runtime. Il catalogo contiene un centinaio e mezzo di chiavi che nessuna pagina legge più (pagine ritirate nelle epic 12-13), con dentro le varianti che il glossario vieta.

### Fatti misurati che vincolano il design (su `dc69faf`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Cataloghi | `messages/it.json`, `messages/en.json`: **1 616 chiavi** per file, 29 namespace di primo livello, parità di chiavi 0/0 (1 629 dopo la 19.11) | il test di parità parte verde su HEAD: va provato con mutanti (§4.3) |
| ICU già in uso | **10** chiavi con `plural` (`LogbookPage.sub`, `Emails.*`, `Requirements.failure.currency`, `BillingPage.sub`, …) | formato supportato in server e client |
| Un confronto dei placeholder a regex **sbaglia** | `/\{(\w+)/` su `ExpiriesPage.registry.currency.detail` estrae `negli`, `nell` dai rami del plurale | il test deve **parsare** ICU (AD-2) |
| Il client può formattare ICU | `NextIntlClientProvider` senza `messages` (`src/app/[locale]/layout.tsx:93`, next-intl 4.13.1 li eredita dal server); `requirements-warning.tsx:46` usa `useTranslations('Requirements')` con plurali | i numeri calcolati nel client usano `useTranslations` (D-13) |
| `t.raw` | **65** chiamate `.raw(` fuori dai test; ≈27 righe `.replace('{…}', …)`; `countText(one, many, count)` a mano in `fleet/aircraft-editor.tsx:830-832` (usato a `:882`, `:896`, `:921`, `:999`) | un messaggio ICU letto con `t.raw` stampa `{count, plural, …}` a schermo: guardia (AD-3) |
| Nessuna tipizzazione dei messaggi | nessun `AppConfig`/`Messages` per next-intl; `exports.service.ts:65` tipizza solo l'import | una chiave viva tolta per errore non rompe il typecheck → prova per chiave (AD-5) |
| Chiavi probabilmente morte | **176** candidati (§3.3): `FinancePage.cashRegister` 39, `FlightsPage.*` 55, `PeoplePage.*` 32, `ExpiriesPanel.*` 19, `CashReportPage.*` 14, `PersonDetailPage` 10, altri 7 | rimozione con prova (D-1) |
| Parser ICU disponibile | `@formatjs/icu-messageformat-parser` **3.5.12**, transitivo via `intl-messageformat` 11.2.9 (next-intl) | devDependency alla stessa versione (D-12) |
| Apostrofo italiano | `grep "'{" messages/it.json` = 0 oggi; in ICU `'` seguito da `{` apre una citazione | con i plurali nuovi la trappola diventa possibile: il test la vede (§4.3 d) |
| e2e che **parsano** la copy | `aog-overview-count.spec.ts:49-58`: `/(\d+)\s+AOG/`, `/(\d+)\s+disponibili/` | si riscrivono con le chiavi che leggono (§3.2) |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR §4.2 riga 19.12, parte assegnata a questa story)

| # | Requisito |
|---|---|
| **P1** | Glossario (§4.10 **A20**) ratificato, scritto in `docs/i18n/glossario-it.md`. |
| **P3** | Plurali ICU dove servono, eliminando i `t.raw` + `.replace` relativi. |
| **P4** | Test di parità it/en: chiavi e placeholder, incluse le forme ICU. |
| **P6** | Sul catalogo finale dell'epic (dopo la 19.11). |

### §0.2 Ratifiche vincolanti

- **A20**: «velivolo», mai «aeromobile»/«aereo»; «rating» singolare maschile, etichetta «Ratings» invariata (R5) ma grammatica corretta; «compenso istruttore», mai «payout»; «fuori servizio», mai «fermo»/«AOG»; stati prenotazione al femminile; plurali ICU; terminologia unica per «Estratto conto».
- **R5** (epic 13): «Ratings» è il nome della **sezione/categoria**; non si torna ad «Abilitazioni» (l'audit I18N-3 lo propone: la ratifica vince).
- **R-19-c** (19.6) volo **eliminato** e **modificato**; **R-19-k** (19.7a) quota per 12 mesi dal pagamento; **19.3** prezzo allievo/pilota, tariffa istruttore addebitata, compenso pagato; **19.5** tipi «Turismo»/«Scuola».
- **Decisioni PO del 2026-11-03** (tabella in testa).
- Inglese: cambia solo per parità, plurali e refusi evidenti (D-10).

### §0.3 Scelte prese su delega (diventano le «Regole» del glossario)

| ID | Scelta | Perché |
|---|---|---|
| **D-1** | Le chiavi **provate** morte (AD-5) si **rimuovono** da entrambi i file. | Senza contesto non si rivedono; lasciate, tengono in vita «Esporta XLS» e «Torna alla dashboard» e la guardia del glossario della 19.12b avrebbe bisogno di eccezioni. |
| **D-2** | Export: bottone «**Esporta**»; voci «‹Contenuto› (Excel)» / «‹Contenuto› (PDF)». | Pattern già usato da Registro voli e Contabilità (applicato dalla 19.12b). |
| **D-3** | Giorni nei contesti compatti: «7 gg», «12 gg fa», «tra 5 gg» con lo spazio; nella prosa la parola piena col plurale. | Unifica «63g fa»/«12 g»/«{days}gg» (audit I18N-4). |
| **D-4** | Stati di una scadenza al femminile: «Valida · In scadenza · Scaduta»; contatori «Scadute». | Tre vocabolari per lo stesso concetto oggi. |
| **D-5** | Elenchi e filtri che mescolano piloti, allievi e istruttori: «Persona». | «Pilota» li esclude a parole. |
| **D-6** | Nel Registro voli la riga è un **volo** (via «voce»). | Il pannello che si apre si chiama già «Registra volo». |
| **D-7** | «PIC» resta; «CFI» → «istruttore». | «CFI» è un titolo FAA; «PIC» è nel libretto EASA. |
| **D-8** | «…», virgolette «», «€» (mai «EUR»), «Successiva» (pagina), «Dal»/«Al». | Audit I18N-4. |
| **D-9** | Frasi con un nome interpolato di genere ignoto (`{doc}`, `{typeName}`) al neutro («scadenza superata»). | «Visita medica: scaduto il …» è sgrammaticato. |
| **D-10** | Inglese: solo parità di chiavi/argomenti, plurali dove l'inglese inflette, refusi, e l'elenco chiuso della 19.12b (AD-2 di quella story). | Lead e CR. |
| **D-11** | Glossario in `docs/i18n/glossario-it.md`; una riga in `CLAUDE.md` §Convenzioni. | Conoscenza di progetto in `docs/`; la 18.5 e ogni copy futura lo devono trovare. |
| **D-12** | `@formatjs/icu-messageformat-parser` in `devDependencies` alla **versione già nel lockfile** (3.5.12); lockfile **solo** via `npx -y npm@10` (memoria `local-machine-environment-drift`). | Parser vero, nessun codice nuovo scaricato, `npm ci` della CI invariato. |
| **D-13** | Valore noto al server → `t(key, values)` nel server e stringa pronta al client; valore calcolato nel client → `useTranslations(ns)` nel componente. **Mai** `t.raw` + `.replace` su un messaggio con `plural`/`select`. | Due strade già presenti nel repo. |
| **D-14** | Coppie `…One`/`…Many`/`…None` → **una** chiave ICU (`=0`/`one`/`other`); `countText` sparisce. | Il plurale fatto a mano è ciò che ICU fa. |
| **D-15** | «accesso» = credenziali di una persona; «utente» solo per «un altro utente». | La sezione dell'editor si chiama già «Accesso». |
| **D-16** | «rating» invariabile al plurale («i rating»). | Grammatica dei prestiti; A20. |
| **D-17** | Prenotazione **annullata**, volo **eliminato**, volo **modificato**. | R-19-c. |

---

## §G — Glossario (contenuto di `docs/i18n/glossario-it.md`)

| Concetto | Termine | Varianti vietate in UI | Fonte |
|---|---|---|---|
| Aircraft | **velivolo**, velivoli | aeromobile, aereo, aerei | A20 |
| Sezione flotta (menu, barra, H1) | **Velivoli** («flotta» resta come nome comune: «Flotta disponibile», «Utilizzo flotta») | Aeromobili | PO Q-19.12-a |
| Conto personale (menu, H1, link) | **Estratto conto**; la riga è un **movimento** | Le mie transazioni, Il mio conto, transazione (fuori da Contabilità) | A20, PO Q-19.12-a |
| Rating | **rating**, m., invariabile; «**Ratings**» solo come nome di sezione/categoria | «la Ratings», «Nuova Ratings», «dai Ratings», «i ratings», abilitazione, certificazione | A20, R5, D-16 |
| Visita medica | **visita medica** | medico (sost.), certificato medico | — |
| Quota associativa | **quota associativa**, vale 12 mesi dal pagamento | quota annuale, importo annuale | R-19-k |
| Currency | **currency**, f.; stati come ogni scadenza; «Currency scaduta» | current, non current | PO Q-19.12-b |
| Stati di una scadenza | **Valida · In scadenza · Scaduta**; contatori «Scadute» | Valido, Scaduto, In regola, Scaduti | D-4 |
| Compenso pagato all'istruttore | **compenso istruttore**, **compenso orario** (€/h), **compensi da liquidare**, «dovuto» | payout, tariffa payout, ciclo pagamenti | A20 |
| Tariffa addebitata per l'istruttore | **tariffa istruttore** (€/h, addebitata a chi vola) | tariffa allievo | 19.3 |
| Prezzi del velivolo | **prezzo allievo**, **prezzo pilota** (€/h) | wet, dry, noleggio | 19.3 |
| Indisponibilità del velivolo | **fuori servizio**; «mettere fuori servizio», «rimettere in servizio» | fermo, AOG, a terra, grounding | A20 |
| Effetto sulle prenotazioni | **interessa N prenotazioni**, «prenotazioni coinvolte» | impattare, impattate | — |
| Stati prenotazione | **In attesa · Approvata · Rifiutata · Effettuata · Assente · Annullata**; «Segna come effettuata», «Segna come assente» | Approvato, Rifiutato, Effettuato, Annullato | A20 |
| Volo e prenotazione | prenotazione **annullata**; volo **eliminato**, **modificato** | volo annullato, correggi il volo, prenotazione cancellata | D-17 |
| Registro voli | **Registro voli**; la riga è un **volo** | Diario di volo, voce | D-6 |
| Contabilità | **Contabilità**; la riga della lista unificata è una **transazione** (f.) | Finanze, Report finanziario | — |
| Ricarica | **ricarica**, «Registra ricarica», bottone «Ricarica» | «Registra» senza oggetto | audit M13c |
| Elenco misto | **Persona** | Pilota (per un elenco che include allievi e istruttori) | D-5 |
| Credenziali | **accesso** | utente (per le credenziali) | D-15 |
| Ruolo ADMIN | **Amministratore** | Admin | PO Q-19.12-c |
| Home | **Panoramica** | dashboard | — |
| Login | **accesso**, «Accedi» | login | — |
| Password | **reimposta**, reimpostazione | reset | — |
| Avvisi email | **avviso di scadenza**, promemoria | alert | — |
| Parti dell'interfaccia | **barra laterale**, **sezione** | sidebar, card, console | — |
| Impostazioni di pianificazione | **durata minima prenotazione**, **tempo minimo tra prenotazioni**, «velivoli prenotabili dalle… alle…» | slot, turnaround, finestra (di disponibilità) | — |
| Pianificazione | **Pianificazione**, «calendario dei velivoli» | timeline | audit M11 |
| Istruttore a bordo | **istruttore** | CFI | D-7 |
| Pilot in command | **PIC** | — | D-7 |
| Campo | **aviosuperficie** nel testo; «campo» nelle etichette brevi; **aeroporto** solo per partenza/arrivo | aeroporto (per il club) | — |
| Classifiche | **primi N** | top N | — |
| Tipi di volo | **Turismo**, **Scuola** | Turismo/Privato | 19.5 |
| Giorni | «7 gg», «12 gg fa», «tra 5 gg»; prosa col plurale | 7g, 63g fa, {days}gg | D-3 |
| Importi | **€** | EUR | D-8 |
| Invito | «**Hai ricevuto un invito**» | Sei stato invitato | genere neutro |
| Export | «**Esporta**»; «‹Contenuto› (Excel)», «‹Contenuto› (PDF)» | Esporta XLS, Esporta Excel, Excel (.xlsx) | D-2 |
| Tipografia | «…», «», «Successiva», «Dal»/«Al» | ..., "", Successivo (pagina), Periodo da/a | D-8 |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Il glossario come documento
`docs/i18n/glossario-it.md`: la tabella di §G, una riga d'intestazione («ogni copy nuova in `messages/it.json` lo segue; `src/i18n/messages.test.ts` ne controlla la parità e, dalla 19.12b, le varianti vietate») e una sezione «Regole» con D-3, D-4, D-8, D-9, D-13, D-16 e la trappola dell'apostrofo (§5). In `CLAUDE.md` §Convenzioni **una** riga che lo indica e nomina il test; nessuna copia del contenuto.

### AD-2 — Test di parità: `src/i18n/messages.test.ts` (nuovo; il glob vitest lo prende da sé)
Importa i due JSON (precedente `src/lib/requirement-failures.test.ts:3-4`) e `parse` da `@formatjs/icu-messageformat-parser`. Nessun import di service (niente env eager). Asserzioni:
1. stesso insieme di chiavi appiattite (errore: le chiavi mancanti da ciascuna parte);
2. ogni valore è una stringa non vuota che **parsa** in entrambe le lingue;
3. per ogni chiave, **lo stesso insieme di nomi di argomento** in it ed en, contando quelli annidati nei rami di `plural`/`select`;
4. ogni `plural`/`select` ha `other`; ogni `plural` italiano ha `one` o `=1`;
5. un argomento `plural` in una lingua non è un `select` nell'altra (semplice ↔ `plural` ammesso: l'italiano accorda dove l'inglese no, «{count} mostrate» / «{count} shown»).

### AD-3 — Guardia `t.raw` × ICU (stesso file)
Scansione di `src/**/*.{ts,tsx}` (esclusi i test) per `\.raw\(\s*['"]([\w.]+)['"]`; ogni chiave del catalogo che **termina** con `.<percorso>` non deve contenere `plural`/`select`. È euristica (non risolve il namespace): un falso positivo si stringe col namespace dichiarato nel file, non si disattiva.

### AD-4 — Plurali: tecnica (elenco in §3.2)
D-13. Dove il valore è già nel server (sottotitoli di pagina, `booking-labels.ts:40`) basta il JSON o il passaggio da `t.raw` a `t(key, values)`. Dove il numero nasce nel client (`fleet-card.tsx:123`, `scadenze-widget.tsx:127`, `mobile-alerts-card.tsx:88`, `bookings-table.tsx:637`, `schedule.tsx:391`, `:710`, `:843`, `scadenze-console.tsx:451`, `cash-categories-card.tsx:105`, `scheduling-card.tsx:94`, `aircraft-editor.tsx:882-1000`) il componente prende `useTranslations` per **quelle** chiavi e il tipo delle sue `labels` perde i campi relativi. Le chiavi che non accordano un numero (`{reason}`, `{date}`, `Filtri ({count})`, `+{count} · Vedi tutte` delle prenotazioni) **restano** con `t.raw`: modifiche chirurgiche.

### AD-5 — Chiavi morte: metodo e prova
1. Rieseguire la scansione di §3.3 al T0.
2. Per **ogni** candidato: `grep -rn "<percorso relativo>" src --include=*.ts --include=*.tsx` (fuori dai JSON) = 0 **e** nessun prefisso dinamico che lo copra (`` t(`status.${…}`) ``). Le chiavi lette da `exports.service.ts` e `mail/templates.ts` (`FlightsPage.*`, `FinancePage.cashRegister.*`, `CashReportPage.*`, `PeoplePage.*`, `ExpiryTypesPage.*`, `Emails.*`) sono **vive** anche se nessuna pagina le usa.
3. Rimozione da it **ed** en nello stesso commit; Dev Agent Record con conteggio prima/dopo per namespace.
4. Rete: e2e completo verde e log di `next build` senza `MISSING_MESSAGE`.

### AD-6 — e2e: regole
- Il testo **sotto test** (badge, toast, banner, oggetto email) si aggiorna alla copy nuova; il testo usato solo come **locatore** passa a un testid esistente o a un ruolo con `exact: true` (testid nuovi solo se mancano, con le regole di `CLAUDE.md`; `grep -rn 'data-testid\^=' e2e/` prima).
- `getByRole(…, { name })` è case-insensitive e substring: ogni asserzione toccata si rilegge con questo in mente (lezioni 103-F1, 11.2, 12.11 F2).
- Gli spec che **parsano** numeri dalla copy cambiano regex insieme al testo; nei messaggi che uno spec parsa, ogni ramo del plurale tiene la cifra (`#`), niente `=0 {Nessuno}` lì.

---

## §2 — Acceptance Criteria

1. **Glossario**: `docs/i18n/glossario-it.md` contiene ogni riga di §G con le decisioni PO applicate e la sezione «Regole» (AD-1); `CLAUDE.md` §Convenzioni ha una riga che lo indica.
2. **Dipendenza**: `@formatjs/icu-messageformat-parser` è in `devDependencies` alla versione 3.5.12; il lockfile è stato rigenerato con `npx -y npm@10` e `git diff package-lock.json` non sposta altre versioni (incollato nel Dev Agent Record).
3. **Parità**: `src/i18n/messages.test.ts` implementa i 5 controlli di AD-2 ed è verde; i mutanti §4.3 (a)-(d) lo rendono rosso, ciascuno col suo messaggio.
4. **Guardia `t.raw`**: verde; il mutante §4.3 (e) la rende rossa.
5. **Plurali**: ogni riga di §3.2 è convertita (it, ed en dove l'inglese inflette) o rifiutata con motivo; un test table-driven nello stesso file rende **ogni** chiave convertita in italiano con 0, 1 e 2 (e il ramo `=0` se c'è) via `createTranslator` e confronta con l'atteso scritto a mano.
6. **Niente plurali a mano**: `grep -rn "countText" src` = 0; le chiavi `AircraftPage.editor.availability.*One`/`*Many`/`*None` non esistono più in nessuno dei due file (D-14); nessuna chiave di §3.2 è letta con `t.raw` (lo prova AC 4).
7. **Copy finale sulle chiavi toccate**: le chiavi di §3.2 hanno già la copy del glossario (nessun «fermo», «AOG», «impattate», «aeromobile» in quelle chiavi).
8. **Chiavi morte**: ogni chiave rimossa ha la prova di AD-5; Dev Agent Record con l'elenco per namespace e il conteggio prima/dopo; `next build` senza `MISSING_MESSAGE`; nessuna chiave viva rimossa (e2e completo verde).
9. **e2e allineati** (AD-6): almeno `aog-impact-email.spec.ts`, `aog-overview-count.spec.ts`, `mobile-settings.spec.ts` (contatore movimenti) e quelli che il censimento §3.4 trova sulle chiavi toccate.
10. **Verifica UI** delle superfici toccate (Panoramica admin e istruttore, Velivoli con editor fuori servizio e prenotazioni coinvolte 0/1/2, Pianificazione settimana e agenda mobile, Prenotazioni filtrate, Scadenze con conteggio mostrate, Impostazioni Pianificazione e Categorie di cassa) a 1280 e 375, con screenshot elencati nel record; nessun `{count, plural` visibile a schermo.
11. `npm run gates` verde; unit prima/dopo nel record.
12. Arbitro e2e completo via `scripts/e2e.sh` su **DB fresco** verde, con il conteggio prima/dopo.
13. `docs/handoffs/HANDOFF.md` e `sprint-status.yaml` aggiornati nel `docs(19.12a)` di chiusura.

---

## §3 — Dev Notes (misurato su `dc69faf`; rieseguire al T0)

### 3.1 — Inventario

```bash
python3 - <<'EOF'
import json
def flat(d,p=''):
    o={}
    for k,v in d.items():
        kk=f'{p}.{k}' if p else k
        o.update(flat(v,kk)) if isinstance(v,dict) else o.__setitem__(kk,v)
    return o
it=flat(json.load(open('messages/it.json'))); en=flat(json.load(open('messages/en.json')))
print(len(it),len(en),sorted(set(it)^set(en)))
print('ICU', sum(1 for v in it.values() if ', plural' in v or ', select' in v))
EOF
grep -rn "\.raw(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
```

### 3.2 — Plurali: elenco iniziale

| Chiave | Oggi | Proposta IT | Consumatore da cambiare |
|---|---|---|---|
| `PilotsPage.sub` | «{total} in archivio · {suspended} sospesi» | «{total, plural, one {# pilota} other {# piloti}} · {suspended, plural, one {# sospeso} other {# sospesi}}» («in archivio» si confonde con «Solo archiviati») | nessuno (`pilots/page.tsx:96`) |
| `InstructorsPage.sub` | «{active} attivi · {owed} da liquidare» | «{active, plural, one {# attivo} other {# attivi}} · {owed} da liquidare» | nessuno (`instructors/page.tsx:83`) |
| `AircraftPage.sub`, `DashboardPage.fleetCard.summary` | «{total} totali · {available} disponibili · {aog} AOG» | «{total, plural, one {# velivolo} other {# velivoli}} · {available, plural, one {# disponibile} other {# disponibili}} · {aog} fuori servizio» | `fleet-card.tsx:123` → `useTranslations`; `aog-overview-count.spec.ts:57` (`disponibil[ei]`) |
| `DashboardPage.overview.aogCount` | «{count} AOG» | «{count} fuori servizio» (invariabile, niente ICU) | regex di `aog-overview-count.spec.ts:50` |
| `DashboardPage.instructorLanding.sub` | «{flightsToday} voli oggi · …» | «{flightsToday, plural, one {# volo} other {# voli}} oggi · {owed} dovuti nel mese» | nessuno |
| `DashboardPage.overview.mobile.alerts.seeAll` | «+{count} altri · Vedi tutte» | «+{count, plural, one {# altro avviso} other {# altri avvisi}} · Vedi tutti» (accordare l'ultima parola con la destinazione di `alerts.moreHref`) | `mobile-alerts-card.tsx:88` |
| `DashboardPage.overview.mobile.alerts.seeAllAtLeast` | «+{count} e oltre · Vedi tutte» | «+{count} e oltre · Vedi tutti» (stessa regola; niente ICU) | idem |
| `DashboardPage.scadenzeWidget.seeAll` | «+{count} altre · Vedi tutte» | «+{count, plural, one {# altra} other {# altre}} · Vedi tutte» | `scadenze-widget.tsx:127` |
| `ExpiriesPage.registry.shown` | «{count} mostrati» | «{count, plural, one {# mostrata} other {# mostrate}}» | `scadenze-console.tsx:451` |
| `BookingsPage.schedule.weekBookingsCount` | «{count} prenotazioni» | «{count, plural, one {# prenotazione} other {# prenotazioni}}» | `schedule.tsx:710`, `:843` |
| `BookingsPage.schedule.mobile.agendaCount` | «{count} movimenti» | come sopra (conta prenotazioni: `schedule.tsx:313`) | `schedule.tsx:391` |
| `BookingsPage.list.pendingSummary` | «{pending} in attesa · {total} totali» | «{pending} in attesa su {total}» (niente ICU) | `bookings-table.tsx:637` (resta `.replace`) |
| `BookingsPage.list.filteredSummary` | «{total} totali» | «{total, plural, one {# prenotazione} other {# prenotazioni}}» | `bookings-table.tsx:637` → `useTranslations` |
| `BookingsPage.form.schedulingWindow.advance` | «prenotabile fino a {days} giorni in anticipo» | «prenotabile fino a {days, plural, one {# giorno} other {# giorni}} prima» | `booking-labels.ts:40` → `t(…, { days })` |
| `SettingsPage.cashCategories.mobile.movementsCount` | «{count} movimenti» | «{count, plural, one {# movimento} other {# movimenti}}» | `cash-categories-card.tsx:105`; `mobile-settings.spec.ts:655` («0 movimenti» resta) |
| `SettingsPage.scheduling.hint` | «Gli aeromobili possono essere prenotati … in incrementi di {slot} minuti, fino a {days} giorni in anticipo. Durata minima slot e margine di turnaround sono indicativi …» | «I velivoli si possono prenotare tra le {open} e le {close} (ora locale), a passi di {slot, plural, one {# minuto} other {# minuti}}, fino a {days, plural, one {# giorno} other {# giorni}} prima. Durata minima e tempo tra prenotazioni sono indicativi: non impediscono di salvare una prenotazione.» | `scheduling-card.tsx:94` |
| `AircraftPage.editor.availability.confirmQuestion{One,Many}` + `…Unknown` | «Confermi il fermo? 1 prenotazione impattata» / «… {count} prenotazioni impattate» / «Confermi il fermo? Conteggio non disponibile» | `confirmQuestion`: «Mettere fuori servizio il velivolo? {count, plural, =0 {Nessuna prenotazione coinvolta} one {# prenotazione coinvolta} other {# prenotazioni coinvolte}}»; `confirmQuestionUnknown`: «Mettere fuori servizio il velivolo? Conteggio delle prenotazioni non disponibile» | `aircraft-editor.tsx:999-1000`; `aog-impact-email.spec.ts:429` |
| `…impactPreview{None,One,Many}` | «Nessuna prenotazione impattata» / «Stai per impattare 1 prenotazione.» / «… {count} prenotazioni.» | `impactPreview`: «{count, plural, =0 {Nessuna prenotazione coinvolta} one {Interessa # prenotazione.} other {Interessa # prenotazioni.}}» | `aircraft-editor.tsx:921`, `:970`; `aog-impact-email.spec.ts:221`, `:306`, `:312`, `:315`, `:368` |
| `…impactBanner{One,Many}` | «Fermo registrato: {count} prenotazioni impattate.» | `impactBanner`: «Fuori servizio registrato: {count, plural, one {# prenotazione coinvolta} other {# prenotazioni coinvolte}}.» | `aircraft-editor.tsx:882`; `aog-impact-email.spec.ts:241`, `:252`, `:322` |
| `…impactRow{One,Many}` | «{count} prenotazioni nel fermo» | `impactRow`: «{count, plural, one {# prenotazione nel periodo} other {# prenotazioni nel periodo}}» | `aircraft-editor.tsx:896`; `aog-impact-email.spec.ts:259`, `:327`, `:527` |
| `…impactWindowOverdue` (stesso blocco) | «fermo oltre il {date} previsto: conteggio non delimitato» | «fuori servizio oltre il {date} previsto: conteggio non delimitato» (niente ICU; si cambia qui perché lo spec la legge insieme a `impactRow`) | `aog-impact-email.spec.ts:528` |
| `Requirements.failure.currency`, `.currencyNever` | «… negli ultimi {windowDays} giorni …» | `{windowDays, plural, one {nell'ultimo giorno} other {negli ultimi # giorni}}` (forma di `ExpiriesPage.registry.currency.detail`; l'apostrofo non precede una graffa) | nessuno (già `useTranslations`); `flight-requirements.spec.ts:431` |
| `ReportsPage.charts.revenue.sub`, `.hours.sub` | «ultimi {count} mesi · €» | «{count, plural, one {ultimo mese} other {ultimi # mesi}} · €» | nessuno |
| `LogbookPage.sub`, `.subOwn` (D-6) | «# voce registrata / # voci registrate» | «{count, plural, one {# volo registrato} other {# voli registrati}}» / «… · solo i tuoi voli» | nessuno |
| `ExpiriesPage.registry.reminders.sent` | «Promemoria inviati: {holders} ai titolari, {digests} agli amministratori.» | «Promemoria ai titolari: {holders} · riepiloghi agli amministratori: {digests}.» (niente ICU: «promemoria» è invariabile) | `scadenze-console.tsx:371` (resta `.replace`) |

Non servono plurali (AD-4): `Filtri ({count})`, `+{count} · Vedi tutte` delle prenotazioni, `{count} in corso`, `{count} da approvare`, `Pag. {page} di {total}`, i giorni compatti di D-3 (19.12b).

### 3.3 — Chiavi morte: candidati

Scansione euristica (namespace per variabile `t…` **in ordine di dichiarazione** nello stesso file; `${…}` come prefisso; `createTranslator({ namespace })` compresi): **176** candidati su `dc69faf`. `FinancePage.cashRegister.*` 39 (vivi solo `heading` e `table.{date,category,description,amount,recordedBy}` per `exportCashMovementsXlsx`); `FlightsPage.form.*` 24, `.filters.*` 12, `.result.*` 9, altri `FlightsPage` 10 (vive il resto per `exportFlightsXlsx`/`exportFlightsPdf`); `PeoplePage.*` 32 (vive quello che leggono `exportPeopleXlsx` — `title`, `table.{name,email,phone,status,profiles}`, `status.*`, `profilesPanel.badges.*` — e l'editor, `profilesPanel.{pilot,student,instructor}.*`); `ExpiriesPanel.*` 19; `CashReportPage.*` 14 (vivi `title`, `summary.{totalIn,totalOut,net}`, `categories.{name,in,out,net}` per il PDF di cassa); `PersonDetailPage.accountPanel.*` 9 + `kicker`; `AccountStatementPage.{backToPerson,noAccount}`; `AircraftPage.{exportLabel,exportXls,editor.delete}`; `InstructorsPage.searchPlaceholder`; `BillingPage.mobile.unattributedChip`. **Sono candidati**: decide la prova di AD-5.

### 3.4 — Censimento e2e e unit delle chiavi toccate

`aog-impact-email.spec.ts` (11 letterali: `:221`, `:241`, `:252`, `:259`, `:306`, `:312`, `:315`, `:322`, `:327`, `:368`, `:429`, `:527-528`); `aog-overview-count.spec.ts:49-58`; `mobile-settings.spec.ts:655`; `flight-requirements.spec.ts:431`. Unit: `requirement-failures.test.ts` (Requirements). Rieseguire con una scansione dei letterali di `e2e/**/*.ts` (righe non di commento) contro i valori vecchi delle chiavi di §3.2.

---

## §4 — Piano di test

### 4.1 — Unit
`src/i18n/messages.test.ts`: parità (AD-2), guardia `t.raw` (AD-3), resa dei plurali (AC 5). Verifica env: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts`.

### 4.2 — e2e
Solo via `scripts/e2e.sh`; per una serie mirata una build sola e `E2E_REUSE_SERVER=1` (`CLAUDE.md`); poi l'arbitro completo su DB fresco. Lock anti-brute-force dopo ~10 login sullo stesso DB (`CLAUDE.md`).

### 4.3 — Discriminanza (obbligatoria nel record, con sha256 di `messages/*.json` e dei file toccati prima e dopo il ripristino)
(a) una chiave aggiunta solo a `it.json` → rosso; (b) `{count}` rinominato `{n}` in una chiave `en` → rosso; (c) un `plural` senza `other` → rosso; (d) `dell'{name}` in un valore `it` → rosso (l'argomento sparisce: trappola ICU dell'italiano); (e) una chiave di §3.2 riletta con `t.raw` in un componente → rosso (guardia AD-3). Ripristino, `sha256sum -c` → OK.

### 4.4 — Gate
`npm run gates` prima di ogni commit; arbitro e2e completo su DB fresco prima della chiusura.

---

## §5 — Trappole note

- **Apostrofo italiano in ICU**: `'` seguito da `{` apre una citazione, quindi `nell'{x}` stampa `{x}` letterale e l'argomento sparisce senza errori di parse. «nell'ultimo giorno» va bene, «dell'{name}» no. Il test di parità lo vede (4.3 d); va scritto anche nelle «Regole» del glossario.
- **`t.raw` su un messaggio ICU** stampa la sintassi grezza; nessun typecheck lo vede (AD-3).
- **Regex sulla copy**: `aog-overview-count.spec.ts:50` e `:57` parsano «N AOG» e «N disponibili»; col plurale «1 disponibile» la seconda fallisce solo quando il conteggio è 1 (sembra una flake). Riscriverle sul testo nuovo.
- **Chiavi lette solo dagli export** (`exports.service.ts`) o dalle email (`mail/templates.ts`): sembrano morte guardando le pagine, non lo sono (AD-5).
- **Stessa variabile `t` per namespace diversi**: `exports.service.ts` ha 18 `createTranslator`; una scansione che tiene un solo `t` per file sbaglia (la prima versione di §3.3 dava 310 candidati).
- **Plurale nel client senza provider**: `useTranslations` funziona nei client component perché `layout.tsx:93` monta `NextIntlClientProvider`; un componente renderizzato fuori da quel layout (nessuno oggi) non lo avrebbe.
- **Lockfile**: solo `npx -y npm@10` (il npm di sistema riscrive il lockfile in un formato diverso: memoria `local-machine-environment-drift`).
- **Sessioni parallele e `:3000`**: verificare prima del primo reset DB; la verifica UI va su un DB gemello e una porta libera se `:3000` è occupata (precedente 19.10 §C).

---

## §6 — Fuori scope DICHIARATO

- Tutta la passata di contenuto in contesto (§L della 19.12b): nomi di menu, stati, export, email, PDF, errori, `CFI`, guardia del glossario, pagine d'errore, descrizione del compenso → **19.12b**.
- Le chiavi senza numero da accordare restano su `t.raw` (AD-4).
- Tipizzazione dei messaggi di next-intl (`AppConfig`): utile, ma cambia il tipo di ogni `t` del repo; fuori dal perimetro.

---

## §7 — Riferimenti

- CR `sprint-change-proposal-2026-11-01.md` §4.2, §4.10 (A20); R5 `13-1-*.md:102-110`; audit (sola lettura) `_bmad-output/planning-artifacts/audit-2026-11-02/ui-ux.md` §4.5.
- Precedenti: `requirements-warning.tsx` (ICU nel client), `requirement-failures.test.ts` (JSON + `createTranslator` nei test), `mail/templates.ts` (`createTranslator` nel server), `layout.tsx:93`.
- Story sorella: `19-12b-passata-testi.md`.

---

## Tasks / Subtasks

- [x] T0 — riallineamento su HEAD (dopo la 19.11): `git log`, `scripts/e2e.sh status`, `:3000`; §3.1-§3.4 rieseguiti; righe slittate corrette (AC tutti)
- [x] T1 — `docs/i18n/glossario-it.md` + riga in `CLAUDE.md` (AC 1)
- [x] T2 — devDependency del parser con `npx -y npm@10` (AC 2); `src/i18n/messages.test.ts`: parità e guardia (AC 3, 4)
- [x] T3 — plurali di §3.2: JSON it/en, consumatori, test di resa 0/1/2 (AC 5-7)
- [x] T4 — chiavi morte: prova per chiave, rimozione, conteggi (AC 8)
- [ ] T5 — e2e toccati, serie mirata, verifica UI, discriminanza 4.3, gate, arbitro (AC 9-12) — fatto tutto tranne l'**arbitro su DB fresco** (AC 12), che per istruzione del team lead lanciano reviewer e sessione principale (§G)
- [ ] T6 — commit `feat(19.12a)` + Dev Agent Record fatti; review, fix e `docs(19.12a)` di chiusura con HANDOFF e sprint-status (AC 13) alla sessione principale

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), dev subagent `dev-19-12a`, unico dev della story, 2026-11-03. Skill usate: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` e `ui-ux-pro-max`. La story cambia solo testi, quindi delle due skill di design valgono solo l'auto-verifica della copy, la regola «un bottone non va a capo» e il controllo che i testi più lunghi non rompano il layout a 1280 e 375 (§I). Query `search.py "text truncation wrap long labels responsive" --domain ux` (gestire i contenuti lunghi senza rompere il layout) e `"confirmation destructive action double click"` (conferma prima di un'azione irreversibile: è la guardia MAJOR-2 che ha deciso D-a).

### §A — Riallineamento sul HEAD (T0): righe slittate, chiavi della 19.11, censimenti rieseguiti

- HEAD di partenza **`a785e08`** (19.1-19.11 chiuse). Il frontmatter dice ancora `baseline_commit: dc69faf`, il valore della ricognizione: lasciato, la skill lo preserva. `scripts/e2e.sh status`: DONE, 604 passed, `E2E_EXIT=0` (arbitro 19.11). `:3000` e `:3100` liberi.
- **§3.1 su `a785e08`**: 1 629 chiavi per file, 29 namespace, differenza di chiavi 0/0, 10 chiavi ICU (le stesse in it ed en: `LogbookPage.sub`, `.subOwn`, `ExpiriesPage.registry.currency.detail`, `Requirements.failure.currency`, `.currencyNever`, `Emails.invite.body`, `Emails.passwordReset.body`, `Emails.expiryDays.*` ×2, `BillingPage.sub`). Nessun valore vuoto, nessun tag, nessun `'{`. Chiamate `.raw(` fuori dai test: **69** (la story ne contava 65: la 19.11 ha aggiunto `account-section`).
- **Righe slittate**, corrette nel corpo del file su istruzione del team lead: `bookings-table.tsx:626` → **`:637`** (tre occorrenze), `requirements-warning.tsx:44` → **`:46`** (la riga di `useTranslations('Requirements')`), `exports.service.ts:66` → **`:65`**. Tutte le altre righe di §3.2, AD-4, §3.4 e §5 sono ancora esatte su `a785e08` (verificate una a una: `fleet-card.tsx:123`, `scadenze-widget.tsx:127`, `mobile-alerts-card.tsx:88`, `schedule.tsx:313`/`:391`/`:710`/`:843`, `scadenze-console.tsx:371`/`:451`, `cash-categories-card.tsx:105`, `scheduling-card.tsx:94`, `aircraft-editor.tsx:830-832`/`:882`/`:896`/`:921`/`:970`/`:999-1000`, `booking-labels.ts:40`, `layout.tsx:93`, `aog-overview-count.spec.ts:50`/`:57`, `mobile-settings.spec.ts:655`, `flight-requirements.spec.ts:431`, le 12 righe di `aog-impact-email.spec.ts`).
- **Un fatto della tabella in testa va precisato**: «una chiave viva tolta per errore non rompe il typecheck» vale per le pagine, non per i due lettori server. `exports.service.ts:65` e `mail/templates.ts:14` tipizzano `createTranslator` con `typeof import('messages/it.json')`, quindi togliere una chiave che un export o un'email legge **rompe** `tsc`. È una rete in più per AD-5: dopo la rimozione il typecheck è verde, quindi nessuna chiave letta da export o email è sparita.
- **§3.3 rieseguita**: scanner Python in scratchpad (`dead_keys.py`) che risolve il namespace per variabile, nell'ordine di dichiarazione nel file, e per i translator passati come **parametro** usa una tabella letta dai chiamanti (`booking-labels.ts` = `BookingsPage`; `pilot-editor-labels.ts` = `PilotsPage`/`PeoplePage`/`UsersPage`; `buildFlightEditorLabels` = `LogbookPage`/`BookingsPage`; `buildMobileDetailLabels` = `DashboardPage`; `expiryTypeCardLabels` = `SettingsPage`; `methodLabel` = `InstructorsPage`; `buildStatementExportRows` = `AccountStatementPage`; `registryExportCells` = `ExpiriesPage`/`ExpiryTypesPage`). I template `` `a.${x}` `` diventano prefissi, `t.raw('sottoalbero')` tiene vivo il sottoalbero, ogni stringa puntata fuori da una chiamata `t(…)` tiene viva ogni chiave che termina così. Risultato: **194 candidati** (§D), contro i 176 stimati su `dc69faf`.
- **§3.4 rieseguita** (letterali di `e2e/**/*.ts`, righe non di commento, contro i valori vecchi): oltre alle righe del file, due spec che la story non elencava. `mobile-overview.spec.ts:268` (`/^\d+ AOG$/` sul sottotitolo della Panoramica) e `flight-log.spec.ts:255`, `:392`, `:419` («1 voce · solo i tuoi voli», «21 voci registrate»). `expiries-registry.spec.ts:174-177`, `:204` leggono `ExpiriesPage.registry.currency.detail`, che non cambia; `aircraft-out-of-service-until.spec.ts:206`, `:216` leggono `untilHint`/`untilValue` («fermo»), che restano alla 19.12b. Unit: `requirement-failures.test.ts` usa `windowDays: 90`, quindi le sue stringhe non cambiano col plurale nuovo.

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 Glossario | ✅ | `docs/i18n/glossario-it.md`: le 38 righe di §G con le decisioni PO (tabella identica riga per riga, `diff` vuoto), l'intestazione di AD-1 e la sezione «Regole» (D-3, D-4, D-8, D-9, D-13/D-14, D-16, apostrofo, D-10). `CLAUDE.md` §Convenzioni: una riga «Copy italiana» che rimanda al glossario e al test. |
| 2 Dipendenza | ✅ | `@formatjs/icu-messageformat-parser` **3.5.12** in `devDependencies` (pin esatto), lockfile rigenerato con `npx -y npm@10` (10.9.9); `git diff package-lock.json` = 1 riga (§F). |
| 3 Parità | ✅ | `src/i18n/messages.test.ts`, 5 test per i 5 controlli di AD-2, verdi; mutanti (a)-(d) rossi, ognuno col suo messaggio (§E). |
| 4 Guardia `t.raw` | ✅ | Test AD-3 verde; mutante (e) rosso con file, riga e chiave (§E). |
| 5 Plurali | ✅ | Le 30 chiavi di §3.2 convertite o motivate (§C); 24 casi table-driven (0, 1, 2 e `=0`) via `createTranslator('it')` contro l'atteso scritto a mano. |
| 6 Niente plurali a mano | ✅ | `grep -rn countText src` = 0; nessuna `AircraftPage.editor.availability.*One|*Many|*None` in nessuno dei due file (anche come test); nessuna chiave di §3.2 letta con `t.raw` (AC 4). |
| 7 Copy finale | ✅ | Sulle 30 chiavi di §3.2: 0 occorrenze di «fermo», «AOG», «impatt-», «aeromobil-», «voce/voci» (unico match di `\bslot\b` è il **nome** dell'argomento `{slot, plural, …}`, non testo a schermo). |
| 8 Chiavi morte | ✅ | 194 chiavi rimosse da it ed en con la prova di AD-5 (§D); 1 629 → 1 435 → **1 430** chiavi per file (−5 per la fusione delle coppie One/Many/None); `next build` 0 `MISSING_MESSAGE`; log del server di produzione 0 `MISSING_MESSAGE` su tutte le serie (§G). |
| 9 e2e allineati | ✅ | `aog-impact-email`, `aog-overview-count`, `mobile-overview`, `flight-log`, `flight-requirements` aggiornati; `mobile-settings.spec.ts:655` («0 movimenti») resta valido. Serie mirate verdi (§G). |
| 10 Verifica UI | ✅ | 38 screenshot a 1280 e 375 (§I); nessun `{count, plural` né `{…}` a schermo (15 pagine controllate col testo del `body`). |
| 11 Gate | ✅ | `npm run gates` verde; unit **2 178 → 2 209** (§J). |
| 12 Arbitro su DB fresco | ⏳ | Alla sessione principale e al reviewer (istruzione del team lead). Atteso **604** test, nessuno aggiunto o tolto. |
| 13 HANDOFF/sprint-status | ⏳ | Alla sessione principale nel `docs(19.12a)` di chiusura. |

### §C — Plurali: chiavi convertite, consumatori cambiati, resa 0/1/2

Ogni riga di §3.2 è convertita come proposto, salvo le due della domanda di conferma (D-a). Tecnica (D-13):

- **Solo JSON** (il server chiama già `t(key, values)`): `PilotsPage.sub`, `InstructorsPage.sub`, `AircraftPage.sub`, `DashboardPage.overview.aogCount`, `DashboardPage.instructorLanding.sub`, `ReportsPage.charts.{revenue,hours}.sub`, `LogbookPage.sub`/`.subOwn`, `Requirements.failure.currency`/`.currencyNever` (già in `useTranslations('Requirements')`).
- **Da `t.raw` + `.replace` a `t(key, values)` nel server**: `BookingsPage.form.schedulingWindow.advance` (`booking-labels.ts:40`).
- **`useTranslations` nel componente**, campo tolto dalle `labels` e dal builder del server: `DashboardPage.fleetCard.summary` (`fleet-card.tsx`), `DashboardPage.overview.mobile.alerts.seeAll`/`.seeAllAtLeast` (`mobile-alerts-card.tsx`, D-b), `DashboardPage.scadenzeWidget.seeAll` (`scadenze-widget.tsx`), `ExpiriesPage.registry.shown` (`scadenze-console.tsx`), `BookingsPage.schedule.weekBookingsCount` (`schedule.tsx`, due punti) e `.mobile.agendaCount`, `BookingsPage.list.filteredSummary` (`bookings-table.tsx`), `SettingsPage.cashCategories.mobile.movementsCount` (`cash-categories-card.tsx`), `SettingsPage.scheduling.hint` (`scheduling-card.tsx`), le quattro chiavi ICU nuove dell'editor (`aircraft-editor.tsx#AvailabilitySection`).
- **Restano `t.raw` + `.replace`** (nessun numero da accordare, AD-4): `BookingsPage.list.pendingSummary` («{pending} in attesa su {total}»), `ExpiriesPage.registry.reminders.sent`, `AircraftPage.editor.availability.{impactSplit,impactWindowUntil,impactWindowOverdue,untilValue}`.
- **D-14**: `confirmQuestionOne/Many` → `confirmQuestion`; `impactPreviewNone/One/Many` → `impactPreview` (col ramo `=0`, usato anche dalla riga compatta del conteggio zero, `aircraft-editor.tsx:957`); `impactBannerOne/Many` → `impactBanner`; `impactRowOne/Many` → `impactRow`. `countText` rimosso.
- **Resa 0/1/2**, dal test (`messages.test.ts`, describe «the plurals converted by story 19.12a render in Italian»), qualche esempio verbatim: «0 piloti · 0 sospesi / 1 pilota · 1 sospeso / 2 piloti · 2 sospesi»; «Mettere fuori servizio? Nessuna prenotazione coinvolta / … 1 prenotazione coinvolta / … 2 prenotazioni coinvolte»; «Nessuna prenotazione coinvolta / Interessa 1 prenotazione. / Interessa 2 prenotazioni.»; «+0 altri avvisi · Vedi tutti / +1 altro avviso · Vedi tutti / +2 altri avvisi · Vedi tutti»; «Currency scaduta: 1 volo negli ultimi 0 giorni … / … nell'ultimo giorno … / … negli ultimi 2 giorni …»; «ultimi 0 mesi · € / ultimo mese · € / ultimi 2 mesi · €». I 24 casi sono nel file.
- La resa **nel browser** è in §I (preview 0/1/2, domanda 0/1/2, banner, riga alla riapertura, contatori di Pianificazione, Prenotazioni filtrate, Scadenze, Impostazioni).

### §D — Chiavi morte: prova per chiave, conteggi prima/dopo per namespace

**Prova** (AD-5), per ognuna delle 194 chiavi:
1. lo scanner di §A non la trova letta da nessun translator del suo namespace, né coperta da un template o da un sottoalbero letto con `t.raw`;
2. `grep -rnE "['\"\`]<percorso relativo>['\"\`]" src --include=*.ts --include=*.tsx` per ogni percorso relativo di almeno due segmenti: **0 risultati per 144 chiavi**; per le altre **50** ogni risultato è stato letto ed è in un **altro** namespace o in un **commento**. Esempi: `FlightsPage.form.title`, `.form.aircraft`, `.list.empty`, `PeoplePage.form.cancel`, `ExpiriesPanel.form.notes`, `FinancePage.cashRegister.form.success` trovano `t('form.title')`, … in `booking-labels.ts`, dove `t` è `BookingsPage`; `FlightsPage.filters.*` trovano `t('filters.…')` in `logbook/page.tsx` (`LogbookPage`) e `billing/page.tsx` (`BillingPage`); `*.table.actions`/`*.table.noValue`/`*.table.empty` trovano le chiavi di `AccountStatementPage`, `BillingPage`, `InstructorsPage`, `LogbookPage`, `PilotsPage`, `MyCompensationPage`; `PersonDetailPage.accountPanel.movementType.*` trova `tAccount('movementType.…')` (`AccountStatementPage`); `table.noValue` e `table.empty` sono anche citate nei commenti di `mobile-self.ts:21`, `account-section.tsx:101-102`, `ratings-card.tsx:380`; `FlightsPage.form.errors.FLIGHT_TIMES_INVALID` è citata nel commento di `flight-editor.tsx:73`. L'elenco completo delle 50 righe col loro file è nello scratchpad (`proof.txt`).
3. un secondo controllo indipendente (file che nominano il namespace e chiamano il percorso relativo) ha dato 21 righe, tutte già spiegate: `PeoplePage.kicker` contro `tAccount('kicker')`, `PeoplePage.searchPlaceholder`/`.includeArchivedLabel` contro `t('…')` di `PilotsPage`, `AccountStatementPage.noAccount` contro `t('noAccount')` di `MyAccountPage` (`my-account/page.tsx:100`), `CashReportPage.kicker`/`FlightsPage.kicker` contro `t('kicker')` di `AccountStatementPage` in `exports.service.ts:366`/`:576`.
4. reti: `tsc` verde (export ed email tipizzati, §A), `next build` 0 `MISSING_MESSAGE`, log del server di produzione 0 `MISSING_MESSAGE`/`IntlError` durante le serie e2e e la verifica UI (`onError` di next-intl scrive `console.error` anche in produzione), serie e2e mirate verdi (§G).

**Perché 194 e non 176**: la stima su `dc69faf` teneva per vive le chiavi il cui percorso relativo compare in un **altro** namespace (18 in più: 11 `FlightsPage`, 5 `ExpiriesPanel`, 2 `PeoplePage`). Esempio: `FlightsPage.form.title` contro `t('form.title')` di `BookingsPage`. I conteggi della story su `FinancePage.cashRegister` (39), `CashReportPage` (14), `PersonDetailPage` (10), `AircraftPage` (3), `AccountStatementPage` (2), `InstructorsPage` (1) e `BillingPage` (1) coincidono.

**Conteggi per namespace (uguali in it ed en)**:

| Namespace | Prima | Dopo | Rimosse |
|---|---|---|---|
| `FlightsPage` | 89 | 23 | 66 |
| `FinancePage` (solo `cashRegister`) | 45 | 6 | 39 |
| `PeoplePage` | 59 | 25 | 34 |
| `ExpiriesPanel` | 34 | 10 | 24 |
| `CashReportPage` | 22 | 8 | 14 |
| `PersonDetailPage` | 41 | 31 | 10 |
| `AircraftPage` | 103 | 95 | 3 morte + 5 per la fusione D-14 (9 tolte, 4 nuove) |
| `AccountStatementPage` | 48 | 46 | 2 |
| `InstructorsPage` | 103 | 102 | 1 |
| `BillingPage` | 154 | 153 | 1 |
| **Totale per file** | **1 629** | **1 430** | **194** morte + 5 fusione |

**Elenco** (percorsi relativi al namespace):
- `PeoplePage` (34): `kicker`, `backToDashboard`, `newPerson`, `searchPlaceholder`, `includeArchivedLabel`, `table.actions`, `table.noValue`, `table.empty`, `actions.{archive,unarchive,confirmArchive,confirmUnarchive,confirmYes,confirmCancel,profiles}`, `form.{createTitle,editTitle,firstName,lastName,email,phone,address,submitCreate,submitEdit,cancel,requiredField,genericError,conflictError}`, `feedback.{created,updated,archived,unarchived}`, `profilesPanel.{close,loadError}`.
- `InstructorsPage` (1): `searchPlaceholder`.
- `PersonDetailPage` (10): `kicker`, `accountPanel.{heading,loadError,recentTitle,recentEmpty,viewStatement}`, `accountPanel.movementType.{topUp,adjustment,packagePurchase,flightCharge}`.
- `ExpiriesPanel` (24): `loadError`, `addAction`, `feedback.{registered,updated,deleted}`, `table.{pendingBadge,actions}`, `form.{title,type,noCompatibleTypes,expiresAt,notes,submit,cancel,save,edit,requiredField,scopeMismatchError,conflictError,genericError}`, `actions.{delete,confirmDelete,confirmYes,confirmCancel}`.
- `AccountStatementPage` (2): `backToPerson`, `noAccount`.
- `FinancePage.cashRegister` (39): `newMovement`, `automaticBadge`, `filters.{from,to,category,sign,allCategories,allSigns,signIn,signOut}`, `table.{actions,noValue,empty}`, `reversalBadge.{ofDate,linked}`, `form.{title,direction,directionIn,directionOut,category,amount,amountHint,effectiveDate,description,submit,cancel,invalidAmount,requiredField,conflictError,genericError,success}`, `reverse.{action,reason,confirm,cancel,requiredReason,conflictError,genericError,success}`.
- `CashReportPage` (14): `kicker`, `description`, `backToFinance`, `openInRegister`, `filters.{heading,month,quarter,year,custom,from,to}`, `summary.movementCount`, `categories.{heading,empty}`.
- `AircraftPage` (3): `exportLabel`, `exportXls`, `editor.delete`.
- `FlightsPage` (66): `kicker`, `description`, `titleOwn`, `descriptionOwn`, `backToDashboard`, `searchPlaceholder`, `noResults`, `form.{title,aircraft,noAircraftAvailable,person,noPersonAvailable,instructor,noInstructor,flightDate,flightType,soloMode,departure,arrival,takeoffTime,landingTime,computedDuration,takeoffs,landings,submit,requiredField}`, `form.soloModes.{dual,solo}`, `form.errors.{NO_AIRCRAFT_RATE,NO_INSTRUCTOR_RATE,SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR,SOLO_REQUIRES_SCHOOL,AIRCRAFT_ARCHIVED,PERSON_ARCHIVED,PERSON_NOT_PILOT_OR_STUDENT,INSTRUCTOR_NOT_FOUND,INSTRUCTOR_SAME_AS_PILOT,FLIGHT_DATE_IN_FUTURE,FLIGHT_TIMES_INVALID,generic}`, `result.{title,minutes,aircraftRate,aircraftAmount,instructorRate,instructorAmount,chargedMinutes,total,newBalance}`, `list.{heading,empty}`, `list.table.{noInstructor,actions,noValue}`, `filters.{dateFrom,dateTo,aircraft,allAircraft,person,allPeople,flightType,allTypes,archivedSuffix,reset,instructorActive,instructorClear}`.
- `BillingPage` (1): `mobile.unattributedChip`.

Restano vive, per gli export e il PDF, `FlightsPage.{title, form.flightTypes.*, list.table.* (17), pdf.*}`, `FinancePage.cashRegister.{heading, table.{date,category,description,amount,recordedBy}}`, `CashReportPage.{title, summary.{totalIn,totalOut,net}, categories.{name,in,out,net}}`, `PeoplePage.{title, table.{name,email,phone,status,profiles}, status.*, actions.edit, profilesPanel.*}`, `ExpiriesPanel.{heading, empty, table.*}` della scheda persona: le stesse che §3.3 prevedeva.

Varianti vietate dalla 19.12b sparite insieme alle chiavi morte: «Esporta XLS» (`AircraftPage.exportXls`), «Torna alla dashboard» (`PeoplePage`/`FlightsPage.backToDashboard`), «(EUR)» (`FinancePage.cashRegister.form.amount`).

### §E — Discriminanze §4.3 (a)-(e) con sha256

Snapshot prima dei mutanti (14:05, su `messages/*` e sul file del mutante (e)):
```
d2e50dc23c1cfa0373c43c8d888f0ab80ed3436abe33eec082d3eec32528f737  messages/it.json
b47610f208d617f22d7883b46a0d6e2f24b2318b9b246f55fd62c853ce30b99d  messages/en.json
01b357d01020be7b1cd7fe8c4be8ae4c5de545e51658dfa15cb091e15ede59b4  src/components/dashboard/fleet-card.tsx
```
Ogni mutante è applicato da solo, eseguito con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts`, poi i tre file sono ripristinati dalla copia. Esiti verbatim:
- **(a)** chiave solo in it (`DashboardPage.overview.mutantOnlyIt`) → rosso `have the same keys`: `+ "missingInEn": [ + "DashboardPage.overview.mutantOnlyIt",`.
- **(b)** `{count}` → `{n}` in en (`DashboardPage.overview.aogCount` = «{n} AOG») → rosso `every key has the same argument names…`: `+ "DashboardPage.overview.aogCount: it {count} / en {n}",`.
- **(c)** plurale senza `other` (`ExpiriesPage.registry.shown` = `{count, plural, one {# mostrata}}`) → rosso `every value … parses as ICU`: `+ "it ExpiriesPage.registry.shown: MISSING_OTHER_CLAUSE",`. Lo rifiuta già il parser, quindi è il controllo 2 a vederlo; il controllo 4 lo vede quando il ramo mancante non è `other`: **(c')** `{count, plural, other {# mostrate}}` → rosso `every plural/select has an other branch, and every Italian plural a one or =1 one`: `+ "it ExpiriesPage.registry.shown: {count, plural} has neither \`one\` nor \`=1\`",`.
- **(d)** `dell'{name}` in un valore it (`Requirements.who` = «dell'{name} ({role})») → rosso `every key has the same argument names…`: `+ "Requirements.who: it {} / en {name, role}",`. L'apostrofo ha inghiottito **entrambi** gli argomenti, senza errori di parse.
- **(e)** `fleet-card.tsx:126` riletto come `{(t.raw('summary') as string)}` → rosso `no source file reads an ICU plural or select with t.raw`: `+ "src/components/dashboard/fleet-card.tsx:126 t.raw('summary') -> DashboardPage.fleetCard.summary",`.
- **(f)**, in più: `{count, select, other {# shown}}` in en contro il plurale it → rosso `an argument is never a plural in one language and a select in the other`: `+ "ExpiriesPage.registry.shown: {count} is plural in it, select in en",`.

Ripristino: `sha256sum -c` → `messages/it.json: OK`, `messages/en.json: OK`, `src/components/dashboard/fleet-card.tsx: OK`. I mutanti girano sul catalogo **prima** di D-a (14:17): D-a cambia solo il testo atteso di un caso di AC 5, non la logica dei controlli.

⚠️ **Incidente alle 14:25:05** (segnalato al team lead): un processo che non era mio ha riscritto `messages/en.json`, `src/components/dashboard/fleet-card.tsx` e `messages/it.json`. I primi due sono tornati identici byte per byte; `it.json` aveva il mio contenuto **più il mutante (d)** in `Requirements.who`, come uno script di discriminanza fermato prima del ripristino. Il confronto chiave per chiave con la mia copia ha dato quell'unica differenza; l'ho riportata a «{name} ({role})» (valore di HEAD) prima di ogni gate e di ogni commit. Hash finali, controllati prima e dopo l'ultimo `npm run gates`:
```
b0f9b548f4b23510addfe49a3e4fcde421d5d699b3b8869add0e36749519fa5b  messages/it.json
b47610f208d617f22d7883b46a0d6e2f24b2318b9b246f55fd62c853ce30b99d  messages/en.json
01b357d01020be7b1cd7fe8c4be8ae4c5de545e51658dfa15cb091e15ede59b4  src/components/dashboard/fleet-card.tsx
```
La build servita alle serie e2e (BUILD_ID delle 14:24:44) è anteriore all'incidente: il suo chunk `messages_it_json` contiene `{name} ({role})`.

### §F — Diff di `package.json`/`package-lock.json` e di `en.json` (motivo riga per riga)

`npx -y npm@10 install -D --save-exact @formatjs/icu-messageformat-parser@3.5.12` (npm 10.9.9). Il pacchetto era già nel lockfile come dipendenza di `intl-messageformat`, quindi nessun pacchetto nuovo e nessuna versione spostata:
```diff
--- a/package.json
+++ b/package.json
@@ -39,6 +39,7 @@
   "devDependencies": {
+    "@formatjs/icu-messageformat-parser": "3.5.12",
     "@playwright/test": "1.61.1",
--- a/package-lock.json
+++ b/package-lock.json
@@ -30,6 +30,7 @@
       "devDependencies": {
+        "@formatjs/icu-messageformat-parser": "3.5.12",
         "@playwright/test": "1.61.1",
```

`messages/en.json`, oltre alle 194 chiavi morte rimosse come in it (§D):
- `DashboardPage.instructorLanding.sub`: «{flightsToday} flights today» → `{flightsToday, plural, one {# flight} other {# flights}} today` (D-10, l'inglese inflette).
- `BookingsPage.schedule.weekBookingsCount`: «{count} bookings» → plurale `# booking`/`# bookings` (D-10).
- `BookingsPage.schedule.mobile.agendaCount`: «{count} movements» → plurale `# booking`/`# bookings`. Oltre al plurale cambia il nome: conta prenotazioni (`schedule.tsx:313`), come l'italiano corretto; refuso di significato (D-10), D-g.
- `BookingsPage.form.schedulingWindow.advance`: «up to {days} days ahead» → `{days, plural, one {# day} other {# days}}` (D-10).
- `Requirements.failure.currency`, `.currencyNever`: «in the last {windowDays} days» → `{windowDays, plural, one {in the last day} other {in the last # days}}`, la forma di `ExpiriesPage.registry.currency.detail` (D-10).
- `SettingsPage.scheduling.hint`: solo `{days}` diventa plurale (`# day`/`# days`); `{slot}-minute` è aggettivale e resta semplice (D-10).
- `SettingsPage.cashCategories.mobile.movementsCount`: plurale `# movement`/`# movements` (D-10).
- `ReportsPage.charts.{revenue,hours}.sub`: «last {count} months» → `{count, plural, one {last month} other {last # months}}` (D-10).
- `AircraftPage.editor.availability.confirmQuestion`/`impactPreview`/`impactBanner`/`impactRow`: parità con la fusione D-14. Il testo è quello delle chiavi fuse, invariato; `=0` («No bookings impacted», il testo di `impactPreviewNone`) in `confirmQuestion` e `impactPreview` come in it.
- Non cambiano in en (D-10: nessuna inflessione, nessun refuso): `PilotsPage.sub`, `InstructorsPage.sub`, `AircraftPage.sub`, `DashboardPage.fleetCard.summary` e `.overview.aogCount` («AOG» inglese resta: A20 è sull'italiano; la 19.12b non lo mette nel suo elenco chiuso), `.overview.mobile.alerts.seeAll*`, `.scadenzeWidget.seeAll`, `ExpiriesPage.registry.shown`/`.reminders.sent`, `BookingsPage.list.pendingSummary`/`.filteredSummary`, `confirmQuestionUnknown`, `impactWindowOverdue`, `LogbookPage.sub*`. La parità accetta semplice ↔ plurale (AD-2 punto 5).

### §G — Delta test (unit ed e2e, prima/dopo; spec toccati e perché)

- **Unit**: 2 178 → **2 209** (+31, tutti in `src/i18n/messages.test.ts`: 5 di parità, 1 guardia `t.raw`, 24 casi di resa, 1 su D-14). `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts` → 31 passed (nessun import di service).
- **e2e**: nessun test aggiunto o tolto, atteso **604 → 604**. Spec toccati:
  - `aog-impact-email.spec.ts`: le 12 asserzioni sulla copy dell'editor («Interessa N prenotazioni.», «Fuori servizio registrato: N prenotazioni coinvolte.», «N prenotazioni nel periodo», «Nessuna prenotazione coinvolta · …», «Mettere fuori servizio? Nessuna prenotazione coinvolta», «fuori servizio oltre il … previsto»). Ogni ramo parsato tiene la cifra (`#`) tranne `=0`, che nessuno spec parsa.
  - `aog-overview-count.spec.ts`: regex `/(\d+)\s+fuori servizio/` e `/(\d+)\s+disponibil[ei]\b/` (la seconda prima falliva solo con 1 disponibile).
  - `mobile-overview.spec.ts:268`: `/^\d+ fuori servizio$/`.
  - `flight-log.spec.ts:255`, `:392`, `:419`: «1 volo · solo i tuoi voli», «21 voli registrati».
  - `flight-requirements.spec.ts:431`: il ramo `nell'ultimo giorno` quando `windowDays === 1`.
- **Serie mirate** (build di produzione su `:3000`, `E2E_REUSE_SERVER=1`, DB `airmanager` del reset delle 13:45, `JOBS_SECRET` non segnaposto):
  1. `--project=chromium` sui 25 spec dei consumatori e del censimento (`aog-impact-email`, `mobile-overview`, `flight-log`, `flight-requirements`, `bookings`, `mobile-planning`, `home-dashboard`, `expiries-registry`, `expiry-dashboard`, `person-detail`, `exports`, `pdf-exports`, `cash-register`, `cash-report`, `people-management`, `person-profiles`, `aircraft-out-of-service-until`, `aircraft-management`, `aircraft-status-hours`, `booking-requirements`, `mobile-registries`, `instructor-compensation`, `mobile-expiries-movements`, `mobile-logbook`, `mobile-reports`): **270 passed, 1 failed** (`aog-impact-email.spec.ts:392`, la guardia di geometria di review MAJOR-2, tre tentativi su tre). Causa e correzione in D-a; dopo la nuova build `aog-impact-email.spec.ts` da solo: **7 passed**, `E2E_EXIT=0`.
  2. Catena serializzata `--no-deps --workers=1`: `settings`, `booking-window`, `reports`, `mobile-overview-overflow`, `mobile-settings`, `aog-overview-count`: **42 passed**, `E2E_EXIT=0`.
  3. `--project=chromium` sui 33 spec restanti (`account-*`, `accounts-topups`, `aircraft-rates`, `api-v1`, `billing`, `datetime-picker`, `expiry-*`, `flight-delete-update`, `flight-no-charge`, `flights`, `idempotency`, `instructor-rates`, `login`, `membership-fee`, `mobile-a11y-sweep`, `mobile-billing`, `mobile-ink-targets`, `mobile-primitives`, `mobile-self-public`, `mobile-shell`, `my-account`, `my-compensation`, `person-save`, `rbac`, `shell-misc`, `typeahead-pickers`, `user-management`, `welcome`): **277 passed, 2 failed**: `api-v1.spec.ts:149` e `:209`, rossi anche da soli (6 passed, 2 failed). **Non dipendono dalla story**: prenotano il pilota del seed nel 2099 (`futureInterval()`, `api-v1.spec.ts:126-130`) e il DB aveva `sched.maxAdvanceDays = 3650`, lasciato dalla catena serializzata che ho lanciato **prima** del resto della suite (il suo `PERMISSIVE_SCHEDULING`; nell'ordine di Playwright la catena gira **dopo** il progetto principale, per questo su DB fresco l'arbitro è verde). Prova: `POST /api/v1/bookings` del pilota del seed il 2099-05-05 → `422 {"error":{"code":"BOOKING_OUTSIDE_WINDOW","message":"Booking cannot be made more than 3650 day(s) in advance."}}`, mentre lo stesso POST a +20 giorni → 201. Né il codice né un testo di questa story entrano in quel percorso.
  - Copertura: 58 spec del progetto principale (tutti) + 6 dei 10 della catena; non eseguiti `treasury-settings`, `billing-global`, `mobile-metar`, `mobile-membership-fee` e i due test `@global-catalogue`: li copre l'arbitro.
  - Log del server di produzione durante le serie 1-3, l'aog di nuovo e la verifica UI: **0** `MISSING_MESSAGE`/`IntlError`/`FORMATTING_ERROR` (il log del primo server, quello della serie 1, è stato sovrascritto al riavvio; le serie 2 e 3 e la verifica UI coprono tutte le pagine toccate).
  - Lock anti-brute-force: `LoginAttempt` conta solo i fallimenti e un login riuscito li azzera (`login-throttle.ts:133`); nessun rosso al login.
- **DB gemelli**: nessuno creato.

### §H — Deviazioni motivate

- **D-a — domanda di conferma accorciata**: `confirmQuestion` = «Mettere fuori servizio? {count, plural, =0 {Nessuna prenotazione coinvolta} one {# prenotazione coinvolta} other {# prenotazioni coinvolte}}» e `confirmQuestionUnknown` = «Mettere fuori servizio? Conteggio non disponibile», invece di «Mettere fuori servizio **il velivolo**? …» e «… Conteggio **delle prenotazioni** non disponibile» di §3.2. Motivo: la guardia di review MAJOR-2 (decisione PO 6, `aog-impact-email.spec.ts:392`) vuole il bottone Conferma **sulla riga del trigger**, sovrapposto al trigger a destra della domanda, perché il doppio clic sia un test che discrimina. Misurato a 1280 con lo stesso pannello: con 66 caratteri la coppia Conferma/Annulla va a capo (Conferma a x 781, y 779, sotto il trigger, centro fuori dal trigger) e la precondizione della guardia fallisce; con «Mettere fuori servizio? …» (49-54 caratteri) resta sulla riga (Conferma a x 1124-1158, y 756, centro dentro il trigger), come la copia vecchia «Confermi il fermo? …» (43). «il velivolo» si capisce già dal pannello, che porta le marche nel titolo. Lessico del glossario rispettato. La copy è una proposta della story, non una ratifica PO: la segnalo come punto per il reviewer.
- **D-b — `mobile-alerts-card.tsx`**: è un componente **server** (nessun `'use client'`), non client come lo classifica AD-4; `useTranslations` funziona nei componenti server non async. Ho spostato su `t` anche `seeAllAtLeast`, che non ha plurale (AD-4 lo lascerebbe a `t.raw`), perché è l'altro ramo della **stessa** espressione: tenerlo nelle `labels` avrebbe diviso un ternario su due meccanismi. «Vedi tutti» accorda con «avvisi» in entrambe le chiavi.
- **D-c — `fleet-card.tsx`**: i conteggi arrivano come prop dal server, quindi anche D-13 «valore noto al server» sarebbe stato legittimo. Ho seguito AD-4 (`useTranslations` nel componente): una riga, nessuna prop orfana.
- **D-d — 194 chiavi morte invece di 176**: §D.
- **D-e — `--save-exact`** nel comando npm@10: senza, npm scrive `^3.5.12`; il pin esatto tiene la devDependency allineata a quella di `intl-messageformat`, che chiede `3.5.12` esatto. Nessun'altra riga del lockfile cambia.
- **D-f — `LogbookPage.subOwn`**: «…» di §3.2 letto come la stessa sostituzione voce → volo della chiave sorella, senza «registrati»: «{count, plural, one {# volo} other {# voli}} · solo i tuoi voli».
- **D-g — `BookingsPage.schedule.mobile.agendaCount` in inglese**: «movements» → «bookings», non solo il plurale (§F).
- **D-h — `SettingsPage.scheduling.hint` con un campo vuoto**: i valori della bozza sono stringhe; passo `Number(…)`, quindi un campo vuoto si legge «a passi di 0 minuti» mentre si digita (prima: «in incrementi di  minuti»). Un input `type="number"` non dà altre stringhe non numeriche.
- **D-i — corpo della story**: corrette tre righe slittate (§A) su istruzione del team lead, oltre alle sezioni che la skill permette (Status, Tasks, Dev Agent Record).
- **D-j — Glossario**: le «Regole» includono anche D-14 (insieme a D-13), D-10 e la forma `''` per l'apostrofo davanti a un argomento, oltre all'elenco di AD-1.
- Nessuna assunzione di dominio nuova.

### §I — Verifica UI (screenshot)

Script `playwright-core` nello scratchpad (`ui-check.cjs`, `ui-elems.cjs`, `ui-editor-375.cjs`, `ui-fleethead.cjs`, `probe-geom2.cjs`) contro la build di produzione su `:3000`, admin e istruttore del seed. Screenshot in `/tmp/claude-1000/-home-admin-AirManager/af449493-cc12-476a-90ac-651351693579/scratchpad/ui/` (non committati):
- 1280: `01-overview-admin-1280` («26 fuori servizio»), `02-overview-admin-fleet-scadenze-1280`, `03-fleet-1280` («200 velivoli · 174 disponibili · 26 fuori servizio»), `04-editor-preview-{0,1,2}-1280` («Nessuna prenotazione coinvolta · conteggio fino al … compreso» / «Interessa 1 prenotazione.» / «Interessa 2 prenotazioni.»), `05-editor-confirm-2-1280`, `06-editor-confirm-0-1280` («Mettere fuori servizio? Nessuna prenotazione coinvolta» con Conferma sulla riga), `07-editor-banner-1-1280` («Fuori servizio registrato: 1 prenotazione coinvolta.»), `08-editor-row-1-1280` («1 prenotazione nel periodo · …»), `09-planning-week-1280` («0 prenotazioni | 13 prenotazioni | …»; non filtrata «31 in attesa su 158»), `10-bookings-filtered-1280` («109 prenotazioni»), `11-expiries-1280` («73 mostrate»), `12-settings-scheduling-1280` (il suggerimento nuovo), `22-overview-instructor-1280` («0 voli oggi · — dovuti nel mese»), `24-fleet-card-head-1280`, `25-scadenze-widget-1280` («+54 altre · Vedi tutte»), `26-overview-head-1280`, `31/32-fleet-card-head-{new,old}-{1280,1440}`.
- 375: `13-overview-admin-375`, `14-overview-alerts-375`, `27-mobile-alerts-card-375` («+114 e oltre · Vedi tutti»), `15-planning-agenda-375` («3 prenotazioni»), `16-planning-week-375`, `17-bookings-filtered-375`, `18-expiries-375`, `19-fleet-375`, `28-fleet-head-375`, `20-settings-cash-categories-375` («2 movimenti», «1 movimento», «0 movimenti»), `21-settings-scheduling-375`, `23-overview-instructor-375`, `29-editor-preview-{0,1,2}-375`, `30-editor-confirm-2-375` («Mettere fuori servizio? 2 prenotazioni coinvolte», coppia Conferma/Annulla sotto la domanda).
- Testo del `body` in 15 controlli a 1280/375 (Panoramica admin a 1280 e 375, Panoramica istruttore a 1280 e 375, Velivoli, editor col banner, Pianificazione settimana a 1280 con la tabella prenotazioni, agenda del giorno a 375, Scadenze, Impostazioni a 1280 e 375, Piloti, Istruttori, Registro voli, Statistiche), più l'editor a 375: nessun `{… , plural`, nessun `{count}`/`{total}`/`{days}`/`{slot}`.
- Osservazione, senza intervento (nessun restyling): nella card Velivoli della Panoramica, colonna stretta, il sottotitolo nuovo (50 caratteri contro 37) va su due righe a 1280 e a 1440, spezzando «fuori / servizio»; la testata cresce di 16 px a 1280 (132 contro 116) e di 40 px a 1440 (132 contro 92), dove prima il bottone stava sulla stessa riga. Niente si sovrappone e niente esce dalla card (`31-fleet-card-head-new-1440` contro `32-…-old-1440`). Il testo è quello ratificato (A20); la 19.12b accorcia «Aggiungi aeromobile» in «Aggiungi velivolo». La segnalo per la review.

### §J — Gate ed esiti verbatim

Baseline su `a785e08` prima di ogni modifica:
```
PASS  lint (50s)
PASS  typecheck (6s)
PASS  test (22s) — Tests  2178 passed (2178)
PASS  build (55s)
```
Finale, sui file del commit `feat` (sha256 controllati prima e dopo):
```
PASS  lint (25s)
PASS  typecheck (3s)
PASS  test (11s) — Tests  2209 passed (2209)
PASS  build (36s)
```
`grep -c MISSING_MESSAGE` sul log della build: 0.

### Completion Notes List

- Glossario, test di parità con parser ICU vero, guardia `t.raw`, 30 chiavi di §3.2 convertite con 24 casi di resa, `countText` sparito, 194 chiavi morte rimosse con prova, e2e allineati.
- D-a (domanda di conferma più corta per la guardia MAJOR-2) e l'osservazione sulla card Velivoli della Panoramica (§I) sono i due punti per il reviewer.
- I due rossi di `api-v1` nella serie 3 sono un effetto dell'ordine in cui ho lanciato le serie (`maxAdvanceDays = 3650` lasciato dalla catena), provato con una richiesta: non li tocca la story; l'arbitro su DB fresco li ricopre.
- Nessun server lasciato acceso, nessun DB gemello creato.

### File List

- `docs/i18n/glossario-it.md` (nuovo)
- `src/i18n/messages.test.ts` (nuovo)
- `CLAUDE.md`
- `package.json`, `package-lock.json`
- `messages/it.json`, `messages/en.json`
- `src/app/[locale]/dashboard/page.tsx`
- `src/app/[locale]/dashboard/bookings/booking-labels.ts`, `bookings-table.tsx`, `schedule.tsx`
- `src/app/[locale]/dashboard/expiries/page.tsx`, `scadenze-console.tsx`
- `src/app/[locale]/dashboard/fleet/page.tsx`, `aircraft-editor.tsx`
- `src/app/[locale]/dashboard/reports/page.tsx` (solo un commento che citava `scheduling.hint` raw)
- `src/app/[locale]/dashboard/settings/page.tsx`, `cash-categories-card.tsx`, `scheduling-card.tsx`
- `src/components/dashboard/fleet-card.tsx`, `mobile-alerts-card.tsx`, `scadenze-widget.tsx`
- `e2e/aog-impact-email.spec.ts`, `e2e/aog-overview-count.spec.ts`, `e2e/flight-log.spec.ts`, `e2e/flight-requirements.spec.ts`, `e2e/mobile-overview.spec.ts`
- `_bmad-output/implementation-artifacts/19-12a-glossario-parita-plurali.md` (questo record, Status, Tasks, tre righe slittate)

### Change Log

- 2026-11-03 — `feat(19.12a)` `abb0dd3`: glossario, test di parità e guardia `t.raw`, plurali ICU di §3.2, 194 chiavi morte rimosse, e2e allineati. `docs(19.12a)`: questo Dev Agent Record, Status review.
