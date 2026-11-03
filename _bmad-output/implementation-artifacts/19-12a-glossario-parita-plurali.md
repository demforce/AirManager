---
baseline_commit: dc69faf
---

# Story 19.12a: Glossario, test di parità, plurali ICU e chiavi morte

Status: **ready-for-dev** — 2026-11-03. **Modello dev: Opus 5 xhigh (UI)**: la story cambia componenti client (plurali calcolati nel browser via `useTranslations`), le `labels` di una decina di pagine e il testo di superfici desktop e mobile, oltre a scrivere test e documentazione. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-12a-glossario-parita-plurali`.

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
| Il client può formattare ICU | `NextIntlClientProvider` senza `messages` (`src/app/[locale]/layout.tsx:93`, next-intl 4.13.1 li eredita dal server); `requirements-warning.tsx:44` usa `useTranslations('Requirements')` con plurali | i numeri calcolati nel client usano `useTranslations` (D-13) |
| `t.raw` | **65** chiamate `.raw(` fuori dai test; ≈27 righe `.replace('{…}', …)`; `countText(one, many, count)` a mano in `fleet/aircraft-editor.tsx:830-832` (usato a `:882`, `:896`, `:921`, `:999`) | un messaggio ICU letto con `t.raw` stampa `{count, plural, …}` a schermo: guardia (AD-3) |
| Nessuna tipizzazione dei messaggi | nessun `AppConfig`/`Messages` per next-intl; `exports.service.ts:66` tipizza solo l'import | una chiave viva tolta per errore non rompe il typecheck → prova per chiave (AD-5) |
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
D-13. Dove il valore è già nel server (sottotitoli di pagina, `booking-labels.ts:40`) basta il JSON o il passaggio da `t.raw` a `t(key, values)`. Dove il numero nasce nel client (`fleet-card.tsx:123`, `scadenze-widget.tsx:127`, `mobile-alerts-card.tsx:88`, `bookings-table.tsx:626`, `schedule.tsx:391`, `:710`, `:843`, `scadenze-console.tsx:451`, `cash-categories-card.tsx:105`, `scheduling-card.tsx:94`, `aircraft-editor.tsx:882-1000`) il componente prende `useTranslations` per **quelle** chiavi e il tipo delle sue `labels` perde i campi relativi. Le chiavi che non accordano un numero (`{reason}`, `{date}`, `Filtri ({count})`, `+{count} · Vedi tutte` delle prenotazioni) **restano** con `t.raw`: modifiche chirurgiche.

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
| `BookingsPage.list.pendingSummary` | «{pending} in attesa · {total} totali» | «{pending} in attesa su {total}» (niente ICU) | `bookings-table.tsx:626` (resta `.replace`) |
| `BookingsPage.list.filteredSummary` | «{total} totali» | «{total, plural, one {# prenotazione} other {# prenotazioni}}» | `bookings-table.tsx:626` → `useTranslations` |
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

- [ ] T0 — riallineamento su HEAD (dopo la 19.11): `git log`, `scripts/e2e.sh status`, `:3000`; §3.1-§3.4 rieseguiti; righe slittate corrette (AC tutti)
- [ ] T1 — `docs/i18n/glossario-it.md` + riga in `CLAUDE.md` (AC 1)
- [ ] T2 — devDependency del parser con `npx -y npm@10` (AC 2); `src/i18n/messages.test.ts`: parità e guardia (AC 3, 4)
- [ ] T3 — plurali di §3.2: JSON it/en, consumatori, test di resa 0/1/2 (AC 5-7)
- [ ] T4 — chiavi morte: prova per chiave, rimozione, conteggi (AC 8)
- [ ] T5 — e2e toccati, serie mirata, verifica UI, discriminanza 4.3, gate, arbitro (AC 9-12)
- [ ] T6 — commit `feat(19.12a)` + Dev Agent Record; review; fix; `docs(19.12a)` con HANDOFF e sprint-status (AC 13)

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD (T0): righe slittate, chiavi della 19.11, censimenti rieseguiti

### §B — Riepilogo per AC con le prove

### §C — Plurali: chiavi convertite, consumatori cambiati, resa 0/1/2

### §D — Chiavi morte: prova per chiave, conteggi prima/dopo per namespace

### §E — Discriminanze §4.3 (a)-(e) con sha256

### §F — Diff di `package.json`/`package-lock.json` e di `en.json` (motivo riga per riga)

### §G — Delta test (unit ed e2e, prima/dopo; spec toccati e perché)

### §H — Deviazioni motivate

### §I — Verifica UI (screenshot)

### §J — Gate ed esiti verbatim

### Completion Notes List

### File List
