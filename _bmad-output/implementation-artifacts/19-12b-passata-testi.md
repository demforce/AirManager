---
baseline_commit: dc69faf
---

# Story 19.12b: Passata completa dei testi italiani in contesto

Status: **ready-for-dev** — 2026-11-03. **Modello dev: Opus 5 xhigh (UI)**: la story rilegge l'app reale su tutte le superfici (desktop e mobile, quattro ruoli), cambia le copy, il cablaggio delle etichette di `ExportMenu` in cinque pagine, aggiunge le pagine d'errore localizzate e tocca una trentina di spec e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-12b-passata-testi`.

> **Origine**: seconda metà della story 19.12 «Revisione completa dell'italiano» (CR 2026-11-01 §4.2, punto PO 13), divisa dalla sessione principale il 2026-11-03. La prima metà, **19.12a** (`19-12a-glossario-parita-plurali.md`), consegna il glossario `docs/i18n/glossario-it.md`, il test di parità `src/i18n/messages.test.ts`, i plurali ICU e il catalogo senza chiavi morte. Questa story **applica** il glossario a tutto il resto.
>
> ⚠️ **Baseline e ordine**: ricognizione misurata su **`dc69faf`**. Il dev parte **dopo il commit di chiusura della 19.12a**, che a sua volta parte dopo la 19.11. Rispetto a qui sono quindi cambiati: le copy di 19.10 (eventuali fix di review) e 19.11 (estratto conto a periodo, `Export.pdfTooLarge`/`.xlsTooLarge`, una variante di `ExportMenu`); le chiavi di §3.2 della 19.12a (plurali, già con la copy finale: **non si ritoccano** salvo errori); le chiavi morte (rimosse: le righe «†» di §L possono non esistere più). I conteggi di §3 si rieseguono al T0.
>
> **T0, prima di scrivere una riga**: `git log --oneline -12`, `scripts/e2e.sh status`, `ss -ltnp | grep :3000` (memoria `parallel-sessions-collision-risk`); leggere `docs/i18n/glossario-it.md` e il Dev Agent Record della 19.12a; rieseguire §3.1 e §3.2 e correggere qui le righe slittate.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (e2e: name-match substring, testid `-mobile`/`mobile-` e divieto `^=`, suite solo via `scripts/e2e.sh`, unit ed env eager); `docs/i18n/glossario-it.md` (vincolante: §G e §0.3 della 19.12a ne sono la fonte); CR §4.10 **A20**; `_bmad-output/planning-artifacts/audit-2026-11-02/ui-ux.md` §4.5 (I18N-1…5) e la tabella mobile (M6, M11, M13a-c) — **sola lettura**. Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "ux writing microcopy"` per il tono).

### ✅ Domande PO — decise

**Q-19.12-a — Come si chiamano le due voci di menu che oggi hanno due nomi?**

| Voce | Oggi | A (raccomandata) | B |
|---|---|---|---|
| Flotta | menu e barra «Aeromobili», H1 «Velivoli», card «Flotta» (audit M13b) | «Flotta» ovunque | «Velivoli» ovunque |
| Conto personale | menu e H1 «Le mie transazioni», link della landing pilota «Il mio conto» | «Il mio conto»; «Estratto conto» resta il nome dell'elenco, degli export e del PDF | «Estratto conto» anche come voce di menu |

> **DECISIONE PO (2026-11-03): B (contro la raccomandazione)** — «**Velivoli**» ovunque per la sezione (menu, barra, H1; il singolo resta «velivolo»; via «Aeromobili»); «**Estratto conto**» anche come voce di menu e H1 del conto personale (via «Le mie transazioni» e «Il mio conto»). Inglese coerente: «Aircraft» (già così), «Account statement».
> Conseguenze in questa story: la card dentro la pagina Velivoli resta «Flotta» (nome comune, ammesso dal glossario come in «Flotta disponibile»); su «Estratto conto» la card sotto l'H1 non può ripetere lo stesso titolo (§5, AD-6).

**Q-19.12-b — «Currency»: quali parole per i suoi stati?** Opzioni: A «currency» femminile con gli stati di ogni scadenza; B tradurre il concetto; C «Non current» resta.

> **DECISIONE PO (2026-11-03): A** — «currency» femminile; stati «Valida / In scadenza / Scaduta»; «Non current» → «Currency scaduta»; «Currency 5gg» → «Currency · 5 gg».

**Q-19.12-c — Il ruolo `ADMIN` si legge «Admin» o «Amministratore»?** Oggi il badge dice «Admin», tutti i messaggi «amministratore».

> **DECISIONE PO (2026-11-03): A** — «Amministratore» ovunque.

**Q-19.12-d — Pagine di errore (404/500) in italiano?** Oggi non esiste `not-found.tsx` né `error.tsx` sotto `src/app`: un indirizzo inesistente (anche `/ppr`, Q-19.1-a) mostra la pagina di Next in inglese (audit I18N-5).

> **DECISIONE PO (2026-11-03): A** — in questa story, minimali: `not-found` localizzato + catch-all, `error`, stile AirOps (AD-4).

**Q-19.12-e — Descrizioni dei movimenti scritte dal server?** `Instructor payout 2026-10-01 – 2026-10-31` è in inglese nella UI italiana (`instructor-compensation.service.ts:501`); le altre sono italiane con data ISO (`flights.service.ts:863`, `:887`; `membership.service.ts:132`).

> **DECISIONE PO (2026-11-03): A** — solo la parola inglese: `Compenso istruttore {inizio} – {fine}` per i movimenti nuovi; formato delle date e struttura restano; la soluzione strutturata resta all'audit (AD-5).

---

## Story

As **chi usa AirManager in italiano** (amministratore, istruttore, pilota, allievo),

I want che ogni testo dell'app, delle email e dei file esportati usi **una sola parola per ogni concetto**, accordi genere e numero, non mescoli l'inglese e si legga bene nel punto in cui compare,

so that l'app sembri scritta da una persona sola (punto PO 13).

### Il perché

Il catalogo è cresciuto per sostituzioni puntuali: la R5 dell'epic 13 ha messo «Ratings» al posto di «Abilitazione» **lasciando articoli e genere** («Nuova Ratings», «Nessuna Ratings configurata»: `13-1-*.md:102`); le story AOG hanno introdotto «fermo» accanto a «fuori servizio»; la 19.6 ha trasformato l'annullamento del volo in eliminazione ma la tabella dice ancora «Annulla»; ogni pagina ha scelto la sua etichetta di export; la stessa pagina ha due nomi fra menu e H1.

### Fatti misurati che vincolano il design (su `dc69faf`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Varianti vietate nel catalogo IT | «aeromobile» **22** chiavi, «Ratings» 17 (12 nel testo + 5 valori esatti «Ratings», ammessi da R5), «fermo» 13, «finestra» 8, «AOG» 7, «impatt-» 7, «payout» 4, «(EUR» 4, «...» 4, «Aereo» 2 (tabella in §3.1; parte la risolve già la 19.12a) | perimetro misurabile; guardia come test (AD-3) |
| Nomi di sezione doppi | menu/barra «Aeromobili» vs H1 «Velivoli»; menu/H1 «Le mie transazioni» vs link «Il mio conto» (audit M13b, M6) | decisione PO Q-19.12-a |
| Card del conto personale | `my-account/page.tsx:87-91` usa `AccountStatementPage.kicker` («Estratto conto») come titolo della card proprio per **non** ripetere l'H1; `headingRepeatsPageHead={true}` (`:145`, `account-section.tsx:301`) | con H1 «Estratto conto» la card ripeterebbe l'H1: chiave nuova per il titolo della card (§L) |
| Pattern di export | 8 siti `<ExportMenu>`; fleet/pilots/instructors/scheda persona/conto personale passano `Export.button` («Esporta Excel») sia al **bottone** sia alla voce (`fleet/page.tsx:148-149`, `pilots/page.tsx:120-121`, `instructors-console.tsx:131`, `people/[id]/page.tsx:400`, `my-account/page.tsx:143`); Registro voli e Contabilità «‹Contenuto› (Excel)»; Scadenze «Excel (.xlsx)»/«PDF»; Prenotazioni «Esporta XLS»/«Esporta PDF»; il menu antepone un badge «XLS»/«PDF» (`export-menu.tsx`) | un solo pattern (D-2 del glossario); sulla scheda persona e sul conto personale oggi un bottone «Esporta Excel» apre anche il PDF |
| Testo cablato fuori catalogo | `CFI ⟨nome⟩` in `logbook-console.tsx:338`, `:624`; `Instructor payout …` in `instructor-compensation.service.ts:501` | AC 18, AC 24 |
| Conferma di annullamento della prenotazione | `list.actions.dismiss` («Annulla») sta accanto a «Sì, annulla» (`bookings-table.tsx:706`, `:1052`) **e** fa da «Annulla» dei form (`booking-labels.ts:146`) | chiave nuova invece di cambiare `dismiss` |
| Email e Mailpit | **19** occorrenze di `'invitato'` in **17** spec cercano l'email d'invito per oggetto (`waitForMailpitMessage(email, 'invitato')`, una copia dell'helper per spec, più `booking-requirements.spec.ts:186`) | cambiare «Sei stato invitato» rompe il setup di 17 spec se non si cambia il frammento |
| Pagine d'errore | nessun `not-found.tsx`/`error.tsx` sotto `src/app` | AD-4 |
| Sovrapposizione con la 18.5 | la 18.5 «Righe, tab e lessico» (`docs/superpowers/plans/2026-09-10-epics-16-18-audit.md:333`) cita M6, M11, M13 | qui si cambiano **le parole**; layout e comportamento restano alla 18.5 (nota finale) |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR §4.2 riga 19.12, parte assegnata a questa story)

| # | Requisito |
|---|---|
| **P2** | Passata **completa** di tutte le chiavi IT **in contesto** (UI reale, non solo il JSON), incluse email, messaggi d'errore, PDF ed Excel. |
| **P5** | e2e allineati ai testi. |
| **P6** | Comprende le copy nuove di 19.10 e 19.11. |
| **P1** (applicazione) | Il glossario ratificato è applicato ovunque. |

### §0.2 Ratifiche vincolanti
- **A20**, **R5**, **R-19-c**, **R-19-k**, 19.3, 19.5: come nel glossario.
- **Decisioni PO del 2026-11-03** (sopra).
- **Q-19.7-b/c ribaltate**: niente righe «Mancante» nel registro Scadenze; i check di 19.9/19.10 dicono ancora «mancante» (corretto).
- **Glossario** `docs/i18n/glossario-it.md` e le sue «Regole» (D-1…D-17 della 19.12a): vincolanti. Una riga del glossario che in contesto suona male si **segnala** (deviazione motivata nel record), non si aggira in silenzio.

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Lettura in contesto
- **Ambiente**: build di produzione su un **DB gemello** e una porta libera se `:3000` è occupata (precedente 19.10 §C, `airmanager_d1910`); Playwright MCP o script throwaway `playwright-core` (i subagent non hanno l'MCP). Locale `it`; tema chiaro, più lo scuro dove il colore cambia la leggibilità.
- **Matrice minima** (§3.4): ogni voce del `route-registry` per ogni ruolo che la vede, a 1280 e 375; ogni pannello/sheet/modale aperto almeno una volta; stati vuoti ed errori provocati dove si possono provocare (422 dei check, 409 di concorrenza, campi obbligatori); i 7 template email letti in Mailpit; i **15 export** (`grep -n "^export async function" src/server/services/exports.service.ts`) scaricati e aperti; le pagine d'errore di AD-4.
- **Evidenza**: screenshot in scratchpad elencati nel record §I; per ogni chiave cambiata, la superficie in cui è stata letta (o «non raggiungibile coi dati demo, letta dal codice: `file:riga`»).

### AD-2 — Inglese: elenco chiuso
`messages/en.json` cambia solo per: (i) parità di chiavi e argomenti; (ii) refusi evidenti; (iii) questo elenco chiuso di incoerenze che l'inglese condivide con l'italiano: `shell.nav.myAccount`, `shell.pageTitle.myAccount`, `MyAccountPage.title`, `DashboardPage.pilotLanding.accountLink` → «Account statement» (PO Q-19.12-a); `DashboardPage.overview.dispatchButton` («Dispatch flight» apre «Log flight»: audit M13a); `shell.pageTitle.overview` vs `DashboardPage.overview.title` («Operations»/«Operational overview»: M13b → un solo testo); le etichette di export del pattern D-2; le chiavi nuove di questa story. Ogni altra modifica inglese è una deviazione da motivare.

### AD-3 — Guardia del glossario (in `src/i18n/messages.test.ts`, creato dalla 19.12a)
Una tabella `BANNED` (regex → motivo, con rinvio alla riga del glossario) sui valori **italiani**: `/[Aa]eromobil/`, `/\b[Aa]ere[oi]\b/`, `/payout/`, `/\bAOG\b/`, `/\b[Ff]ermo\b/`, `/impatt/`, `/\bCFI\b/`, `/\.\.\./`, `/\(EUR/`, `/\bsidebar\b/`, `/\bdashboard\b/`, `/\breset\b/`, `/\balert\b/`, `/\bslot\b/`, `/turnaround/`, `/[Tt]imeline/`, `/top \d/`, `/Sei stato/`, `/Non current/`, `/Le mie transazioni/`, `/Il mio conto/`, `/^Admin$/`, `/Ratings/` **salvo** il valore esatto «Ratings». Fallisce con chiave e valore. Le eccezioni (se servono) sono un elenco esplicito di chiavi, motivato nel file.

### AD-4 — Pagine d'errore (PO Q-19.12-d)
`src/app/[locale]/not-found.tsx`, il catch-all `src/app/[locale]/[...rest]/page.tsx` che chiama `notFound()`, `src/app/[locale]/error.tsx` (client component, con `reset`); chiavi `ErrorPages.*` in it/en (4-6 per lingua: titolo, testo, link). Lo schema di next-intl va letto **prima** (CLAUDE.md: WebFetch su `raw.githubusercontent.com` del repo `amannn/next-intl`, docs «Error files»). Stile AirOps (`airops.css`, nessun Tailwind), un link alla Panoramica (che rimanda all'accesso se non autenticati). `/ppr` resta un 404 (Q-19.1-a): cambia solo la lingua della pagina. Verificare che il catch-all non intercetti route esistenti né `api/` (è sotto `[locale]`).

### AD-5 — Descrizione del compenso (PO Q-19.12-e)
`instructor-compensation.service.ts:501`: `Instructor payout …` → `Compenso istruttore …`; resto della riga invariato; seed e unit che la leggono allineati. Nessuna migrazione, nessuna riga esistente toccata.

### AD-6 — Export a pattern unico (D-2)
`Export.button` diventa «Esporta» (bottone) e **non** si usa più come voce; ogni pagina passa le sue voci «‹Contenuto› (Excel)»/«‹Contenuto› (PDF)» (chiavi nel namespace della pagina, it ed en). Siti: `fleet/page.tsx:148-149`, `pilots/page.tsx:120-121`, `instructors/page.tsx:106` + `instructors-console.tsx:131`, `people/[id]/page.tsx:400`, `my-account/page.tsx:143` (+ `account-section.tsx:131`, `:315`), `booking-labels.ts:179-180`, `expiries/page.tsx:224`. I titoli di foglio e PDF coincidono col ‹Contenuto› (es. «Report di cassa»). Leggere prima la variante di `ExportMenu` della 19.11.

### AD-7 — e2e: regole
- Il testo **sotto test** (badge, toast, errore, oggetto email, intestazione di un export) si aggiorna: l'e2e continua a provare l'italiano.
- Il testo usato solo come **locatore** passa a un testid esistente (`export-menu-trigger`/`-xls`/`-pdf`, `kpi-balance`, `booking-flown-action`, …) o a un ruolo con `exact: true`; testid nuovi solo se mancano, con le regole di `CLAUDE.md` (`grep -rn 'data-testid\^=' e2e/` prima).
- `getByRole(…, { name })` è case-insensitive e substring: «Annulla» trova «Sì, annulla»; «Estratto conto» trova sia la voce di menu sia il link della landing; «Scaduta» trova «Currency scaduta».
- Asserzioni `not.toContainText` sulla copy vecchia (`person-detail.spec.ts:187`, `mobile-logbook.spec.ts:389`) restano vere da sole: rileggerle, non contarle come allineate.

---

## §2 — Acceptance Criteria

1. **Elenco §L**: ogni riga è applicata o rifiutata con motivo (tabella nel record §B: chiave → prima → dopo → superficie letta).
2. **Passata completa**: ogni namespace del catalogo (dopo 19.11 e 19.12a) letto in contesto secondo AD-1; il record elenca le **modifiche nuove** trovate oltre §L, con lo stesso formato.
3. **Guardia del glossario**: AD-3 implementata e verde; un mutante («aeromobile» reinserito in un valore) la rende rossa (sha256 prima/dopo il ripristino).
4. **Conteggio delle varianti**: il comando di §3.1 rieseguito dà 0 per ogni riga, salvo le eccezioni motivate di AD-3.
5. **Nomi di sezione** (PO Q-19.12-a): menu, barra e H1 dicono «Velivoli» per la flotta ed «Estratto conto» per il conto personale; il link della landing pilota dice «Estratto conto»; sulla pagina del conto personale nessun titolo ripete l'H1 (chiave nuova per la card, §L); in inglese «Aircraft» e «Account statement».
6. **Ruolo** (Q-19.12-c): «Amministratore» in badge, menu profilo e ovunque compaia il ruolo.
7. **Currency** (Q-19.12-b): «Currency scaduta», «Currency · N gg», stati della riga currency come ogni scadenza; nessun «current».
8. **Stati**: prenotazioni (tabella, sheet, chip di filtro desktop e mobile, export Excel/PDF) al femminile; azioni «Segna come effettuata»/«Segna come assente»; scadenze «Valida/In scadenza/Scaduta» in registro, «Le mie scadenze», editor pilota/istruttore, contatori «Scadute».
9. **Conferma di annullamento della prenotazione**: il bottone che la chiude dice «No, mantienila» (chiave nuova `BookingsPage.list.actions.keep`, usata a `bookings-table.tsx:706`, `:1052` via `booking-labels.ts:209`); il «Annulla» dei form (`booking-labels.ts:146`) resta.
10. **Export** (AD-6): gli 8 siti `<ExportMenu>` hanno bottone «Esporta» e voci «‹Contenuto› (Excel)»/«‹Contenuto› (PDF)» in it ed en; nessuna pagina passa `Export.button` come voce; titoli di foglio e PDF coerenti.
11. **Email**: i 7 template di `mail/templates.ts` letti in Mailpit; invito al genere neutro, riepilogo «avvisi di scadenza», email del fuori servizio senza «Fermo», virgolette «»; `templates.test.ts:19`, `:173` allineati.
12. **PDF ed Excel**: i 15 export aperti in italiano; intestazioni, titoli, totali e piè di pagina coerenti col glossario; `exports.service.test.ts:928` («Approvato» → «Approvata») e gli altri unit allineati.
13. **Messaggi d'errore e vuoti**: ogni `errors.*`, `*Error`, `empty`, `noResults` letto; una formula per caso («Si è verificato un errore. Riprova.» generico; «Impossibile ‹fare X›. Riprova.» quando l'azione è nota).
14. **Requisiti (19.9/19.10)**: `Requirements.failure.expiryExpired` al neutro («{typeName}: scadenza del {date} superata»); `requirement-failures.test.ts` ed e2e dei check allineati.
15. **Copy di 19.10 e 19.11** rilette in contesto (avviso unico sulle prenotazioni, estratto conto a periodo, export oltre il tetto).
16. **Inglese**: solo l'elenco AD-2 (diff di `en.json` spiegato riga per riga nel record §F).
17. **Genere**: `grep -nE "[Ss]ei (stat|sicur|pront)[oa]" messages/it.json` = 0.
18. **`CFI` cablato**: `logbook-console.tsx:338`, `:624` leggono la chiave nuova `LogbookPage.mobile.instructorLine` («Istruttore: {name}» / «Instructor: {name}»); `grep -rn "CFI" src --include=*.tsx` fuori dai commenti = 0.
19. **Pagine d'errore** (AD-4): `/it/una-pagina-che-non-esiste` e `/it/ppr` rispondono **404** con la pagina italiana, `/en/…` con quella inglese; un errore di render mostra `error.tsx` localizzato; e2e che lo prova (status 404, testo, link) e screenshot a 1280/375 chiaro e scuro.
20. **Descrizione del compenso** (AD-5): un compenso registrato dopo la story ha `Compenso istruttore …` (unit del service + una riga di Contabilità nell'e2e che già legge i compensi: `billing.spec.ts` o `instructor-compensation.spec.ts`).
21. **e2e allineati** (AD-7), incluso il frammento d'oggetto dell'invito: `grep -rn "'invitato'" e2e` = 0 e le 19 occorrenze passate al frammento nuovo (§5).
22. **Verifica UI**: screenshot della matrice di AD-1 (almeno Panoramica admin/istruttore/pilota, Velivoli con editor fuori servizio, Pianificazione con sheet prenotazione, Registro voli con modale di eliminazione, Scadenze con filtri, Contabilità, Statistiche, Impostazioni, Estratto conto del pilota, I miei compensi) a 1280 e 375, chiaro; nessun testo tagliato o a capo che prima stava su una riga (la tab bar mobile del pilota con «Estratto conto» in particolare: M6).
23. `npm run gates` verde; unit prima/dopo nel record.
24. Arbitro e2e completo via `scripts/e2e.sh` su **DB fresco** verde, conteggio prima/dopo.
25. `docs/handoffs/HANDOFF.md` e `sprint-status.yaml` aggiornati nel `docs(19.12b)` di chiusura, con la nota per la 18.5 (in fondo a questo file).

---

## §3 — Dev Notes (misurato su `dc69faf`; rieseguire al T0)

### 3.1 — Conteggio delle varianti

```bash
python3 - <<'EOF'
import json,re
def flat(d,p=''):
    o={}
    for k,v in d.items():
        kk=f'{p}.{k}' if p else k
        o.update(flat(v,kk)) if isinstance(v,dict) else o.__setitem__(kk,v)
    return o
it=flat(json.load(open('messages/it.json')))
for name,p in {'aeromobile':r'[Aa]eromobil','aereo':r'\b[Aa]ere[oi]\b','payout':r'payout','AOG':r'\bAOG\b','fermo':r'\b[Ff]ermo\b','Ratings':r'Ratings','impatt':r'impatt','finestra':r'[Ff]inestra','(EUR':r'\(EUR','...':r'\.\.\.','CFI':r'\bCFI\b','dashboard':r'dashboard','sidebar':r'sidebar','card':r'\bcard\b','reset':r'\breset\b','alert':r'\balert\b','slot':r'\bslot\b','turnaround':r'turnaround','timeline':r'[Tt]imeline','top N':r'top \d','Successivo':r'Successivo','Diario':r'Diario di volo','Le mie transazioni':r'Le mie transazioni','Il mio conto':r'Il mio conto','Admin':r'^Admin$','Esporta XLS/Excel':r'Esporta (XLS|Excel)','login':r'\blogin\b','Sei stato':r'Sei stato','Non current':r'Non current','gg/g':r'\}gg\b|\}g\b|^\s?g( fa)?$','aeroporto':r'aeroporto','certificat':r'[Cc]ertificat'}.items():
    ks=[k for k,v in it.items() if re.search(p,v) and not (name=='Ratings' and v=='Ratings')]
    print(f'{name:20}{len(ks):4}  {", ".join(ks)}')
EOF
```

Su `dc69faf`: aeromobile 22, aereo 2, payout 4, AOG 7, fermo 13, Ratings nel testo 12, impatt 7, finestra 8, (EUR 4, ... 4, CFI 1, dashboard 3, sidebar 1, card 1, reset 1, alert 2, slot 2, turnaround 2, timeline 1, top N 1, Successivo 3, Diario 1, Le mie transazioni 3, Il mio conto 1, Admin 2, Esporta XLS/Excel 3, login 2, Sei stato 2, Non current 1, gg/g 7, aeroporto 1 (`ReportsPage.sub`; «Aeroporto di partenza/arrivo» non contengono la parola minuscola), certificat 2. «finestra» non è vietata in sé: va eliminata dove indica un periodo o un orario (§L), ammessa altrove se ce n'è.

### 3.2 — Censimento e2e e unit (letterali italiani; rieseguire)

| Copy | Spec (righe) |
|---|---|
| «Approvato/Rifiutato/Effettuato/Annullato/Assente» | `bookings.spec.ts:1220`, `:1769`, `:1797`, `:1831`, `:1836`, `:1848`, `:1853`; `booking-requirements.spec.ts:699`; `flight-delete-update.spec.ts:287`; `mobile-logbook.spec.ts:389` (`not`); unit `exports.service.test.ts:928` |
| «Scaduto/Valido», giorni «0 g», «1g fa» | `expiries-registry.spec.ts:174-177`, `:210`, `:328`, `:351-352`; `expiry-dashboard.spec.ts:108`, `:112` |
| «Non current» | `expiries-registry.spec.ts:221-224`; `expiry-rules-currency.spec.ts:421-443`; `mobile-registries.spec.ts:400`, `:485` |
| «Nulla in questa finestra.» | `expiry-dashboard.spec.ts:135`; `mobile-expiries-movements.spec.ts:267` |
| fuori servizio / AOG (oltre le chiavi della 19.12a) | `aircraft-out-of-service-until.spec.ts:205-216`, `:319`, `:340`; `aircraft-status-hours.spec.ts:74` (badge «AOG»); `mobile-registries.spec.ts:327-328` («Motivo AOG») |
| «Tariffa payout», «Voli recenti come CFI», «Ore mese», «Tariffa oraria» | `mobile-registries.spec.ts:290`, `:327`, `:560`; `instructor-compensation.spec.ts:141` |
| `CFI ⟨nome⟩` | `flights.spec.ts:318`; `mobile-logbook.spec.ts:488`, `:1253`, `:1296` |
| export | «Esporta XLS» `mobile-planning.spec.ts:666`, `pdf-exports.spec.ts:349`; «Esporta PDF» `pdf-exports.spec.ts:342`; «Voli (Excel)» `exports.spec.ts:281` (resta) |
| «Le mie transazioni» | `my-account.spec.ts:144` (helper `myAccountNavLink`, già scoped alla navigazione), `:179` (H1) |
| «Il mio conto» | `account-statement.spec.ts:102` (`getByRole('link')` page-level: con «Estratto conto» troverebbe anche la voce di menu → `getByTestId('kpi-balance')`, `dashboard/page.tsx:1080`) |
| «Invia link di reset», «Utente creato» | `user-management.spec.ts:121`, `:196`, `:202` |
| «Importo (EUR…)» (`getByLabel`) | `accounts-topups.spec.ts:74`; `account-adjustments.spec.ts:81` |
| «Aereo» (riga dello sheet) | `mobile-logbook.spec.ts:432` |
| «completato» (fase) | `mobile-planning.spec.ts:308` |
| «Mostra tutte (…)» | `mobile-reports.spec.ts:419` |
| requisiti «scaduto il» | `flights.spec.ts:744`, `:827`; `flight-requirements.spec.ts:428`; unit `requirement-failures.test.ts` |
| «Admin» | `rbac.spec.ts:31`; `mobile-self-public.spec.ts:426` |
| oggetto «Sei stato invitato» | 19 occorrenze di `'invitato'` in 17 spec (§5) |
| «Nuova voce» | 2 letterali |

Unit che asseriscono copy: `mail/templates.test.ts:19`, `:173`; `exports.service.test.ts:928`; `requirement-failures.test.ts`; rileggere `mobile-agenda.test.ts`, `mobile-self.test.ts`, `instructor-compensation.service.test.ts` (AD-5). Falsi positivi noti: nomi di fixture (`createPerson(page, 'student', 'Scaduto')`, `flight-requirements.spec.ts:168`), titoli di test.

### 3.3 — Codice da toccare
- Export (AD-6), conferma prenotazione (AC 9), `CFI` (AC 18), titolo della card del conto personale (`my-account/page.tsx:87-91`: chiave nuova, commento riallineato), pagine d'errore (AD-4), descrizione del compenso (AD-5).
- Nient'altro: le altre righe di §L sono solo JSON.

### 3.4 — Superfici da leggere (AD-1)

| Superficie | Ruoli | Facce | Da provocare |
|---|---|---|---|
| Accesso, password dimenticata, imposta password | anonimo | 1280, 375 | errori di campo, link scaduto |
| Pagine d'errore | anonimo, autenticato | 1280, 375 | 404, errore di render |
| Panoramica | admin, istruttore, pilota, allievo | 1280, 375 | nessun avviso / molti avvisi |
| Pianificazione | tutti | giorno/settimana, agenda mobile, sheet | nuova, modifica, approva/rifiuta, 422 dei check, fuori servizio |
| Piloti, Istruttori, Velivoli | admin | tabella/card, editor, sheet | ricarica, pagamento, fuori servizio, archivia |
| Scheda persona | admin, accesso proprio | 1280, 375 | rettifica, export |
| Scadenze | tutti | registro, filtri, sheet, «Le mie scadenze» | promemoria, quota con saldo insufficiente |
| Registro voli | tutti | tabella, card, sheet, editor, eliminazione | 422 dei check, 409, senza addebito |
| Estratto conto, I miei compensi | pilota/allievo, istruttore | 1280, 375 | periodo vuoto, export oltre il tetto (19.11) |
| Contabilità, Statistiche | admin | 1280, 375 | nuova transazione, storno, rettifica, assegna metodo |
| Impostazioni | admin | 1280, 375 | errori per sezione, email di prova |
| Email (Mailpit) | — | 7 template | invito, reimpostazione, saldo negativo, avviso e riepilogo, rifiuto, fuori servizio |
| Export | admin, pilota | 15 file | — |

---

## §L — Elenco iniziale concreto (chiave → attuale → proposta)

«†» = chiave che la 19.12a può aver rimosso come morta. Le chiavi di plurale della 19.12a (§3.2 di quella story) non sono ripetute.

### Shell, accesso, email

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `shell.nav.fleet`, `shell.pageTitle.fleet`, `DashboardPage.overview.mobile.shortcuts.fleet`, `DashboardPage.fleetCard.cardTitle` | Aeromobili | Velivoli (PO) | — |
| `AircraftPage.title` / `.cardTitle` | Velivoli / Flotta | restano | — |
| `shell.nav.myAccount`, `shell.pageTitle.myAccount`, `MyAccountPage.title`, `DashboardPage.pilotLanding.accountLink` | Le mie transazioni / Il mio conto | Estratto conto (PO); EN «Account statement» | `my-account.spec.ts:144`, `:179`; `account-statement.spec.ts:102` → testid |
| `MyAccountPage.cardHeading` (nuova) | la card riusa `AccountStatementPage.kicker` («Estratto conto») | Movimenti / Movements (la card non ripete l'H1) | — |
| `shell.roles.ADMIN`, `UsersPage.roles.ADMIN` | Admin | Amministratore (PO) | `rbac.spec.ts:31`, `mobile-self-public.spec.ts:426` |
| `auth.forgotPassword.submit` | Invia link di reset | Invia link di reimpostazione | `user-management.spec.ts:196`, `:202` |
| `auth.setPassword.goToLogin` / `auth.forgotPassword.backToLogin` | Vai al login / Torna al login | Vai all'accesso / Torna all'accesso | — |
| `auth.setPassword.missingToken` | Link non valido: token mancante. | Link non valido o incompleto: richiedine uno nuovo. | — |
| `Emails.invite.subject` | Sei stato invitato ad AirManager | Hai ricevuto un invito ad AirManager | 17 spec (§5); `templates.test.ts:19` |
| `Emails.invite.body` | …Sei stato invitato ad accedere ad AirManager… | …Hai ricevuto un invito per accedere ad AirManager… | — |
| `Emails.expiryDigest.subject` / `.intro` | Riepilogo alert scadenze / …i seguenti alert di scadenza: | Riepilogo avvisi di scadenza / …i seguenti avvisi di scadenza: | `templates.test.ts:173` |
| `Emails.expiryAlert.body` | La tua scadenza "{typeName}" … | La tua scadenza «{typeName}» … | rileggere `templates.test.ts` |
| `Emails.aircraftGrounded.body` | …Fermo: {window}… | …Fuori servizio: {window}… | `aog-impact-email.spec.ts` (corpo) |

### Panoramica

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `DashboardPage.overview.dispatchButton` | Pianifica volo | Registra volo (EN «Log flight», AD-2; audit M13a) | — |
| `DashboardPage.scadenzeWidget.countInWindow` / `.window7/30/60` / `.ago` / `.inDays` | {count} entro {window}g / 7g / {n}g fa / tra {n}g | {count} entro {window} gg / 7 gg / {n} gg fa / tra {n} gg | — |
| `DashboardPage.fleetCard.addAircraft` / `.empty` / `.badge.aog` | Aggiungi aeromobile / Nessun aeromobile registrato. / AOG | Aggiungi velivolo / Nessun velivolo registrato. / Fuori servizio | — |
| `DashboardPage.mobile.detail.aircraft` | Aeromobile | Velivolo | — |
| `DashboardPage.pilotLanding.kpis.medical` | Scadenza medico | Visita medica | — |
| `DashboardPage.instructorLanding.kpis.payoutRate` / `.hoursMonth` / `.owedMonth` | Tariffa payout / Ore mese / Dovuto mese | Compenso orario / Ore nel mese / Dovuto nel mese | — |
| `DashboardPage.instructorLanding.status.completed`, `BookingsPage.schedule.mobile.phase.completed` | completato | conclusa (è una prenotazione) | `mobile-planning.spec.ts:308` |

### Piloti, Istruttori, Persona

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `PilotsPage.actions.topUp` | Registra | Ricarica (audit M13c) | — |
| `PilotsPage.mobile.flagExpired` / `.flagExpiring` | {doc} scaduto / {doc} {days}gg | {doc} · scadenza superata / {doc} · {days} gg | — |
| `PilotsPage.currency.notCurrent` / `.expiring` | Non current / Currency {days}gg | Currency scaduta / Currency · {days} gg (PO) | §3.2 «Non current» |
| `PilotsPage.pagination.next`, `AircraftPage.pagination.next` | Successivo | Successiva | — |
| `PilotsPage.editor.ratings.empty`, `InstructorsPage.editor.ratings.empty` | Nessuna scadenza registrata. | Nessun rating registrato. | — |
| `PilotsPage.toast.suspended` / `.reactivated` / `.userCreated` | Utente sospeso. / Utente riattivato. / Utente creato: email di invito inviata. | Accesso sospeso. / Accesso riattivato. / Accesso creato: invito inviato per email. | `user-management.spec.ts:121` |
| `PilotsPage.editor.access.noUser` | Nessun utente collegato a questa persona. | Nessun accesso per questa persona. | — |
| `PilotsPage.editor.saveErrors.instructorProfileInactive` | …compenso e tariffa allievo non si possono salvare. | …compenso e tariffa istruttore non si possono salvare. | — |
| `PeoplePage.profilesPanel.errors.exclusive` | Allievo non può essere attivo insieme a Pilota o Istruttore: … | Il profilo allievo non può essere attivo insieme a pilota o istruttore: disattiva prima l'altro profilo. | — |
| `InstructorsPage.kpi.avgRate` / `.table.rate` | Tariffa media payout / Tariffa payout | Compenso orario medio / Compenso orario | `mobile-registries.spec.ts:560` |
| `InstructorsPage.paymentCycleButton`, `.paymentCycle.title` / `.subtitle` / `.empty` | Ciclo pagamenti / Istruttori con un dovuto da liquidare / Nessun istruttore con un dovuto da liquidare. | Compensi da liquidare / Istruttori con compensi da liquidare / Nessun istruttore con compensi da liquidare. | — |
| `InstructorsPage.editor.payoutRate.sectionTitle` / `.label` | Tariffa payout (pagata all'istruttore) / Tariffa oraria | Compenso istruttore / Compenso orario (€/h) | `instructor-compensation.spec.ts:141` |
| `InstructorsPage.studentRate.heading` / `.price` | Tariffa allievo (addebitata al pilota/allievo) / Prezzo (€/h) | Tariffa istruttore (addebitata a chi vola) / Tariffa (€/h) | — |
| `InstructorsPage.profile.kpi.rate`, `MyCompensationPage.kpi.rate` | Tariffa oraria | Compenso orario (mostrano `payoutRateCents`) | — |
| `InstructorsPage.profile.recentFlights.sectionTitle` | Voli recenti come CFI | Voli recenti come istruttore | `mobile-registries.spec.ts:560` |
| `InstructorsPage.pay.periodStart` / `.periodEnd` | Periodo da / Periodo a | Dal / Al | — |
| `PersonDetailPage.backToDashboard` | Torna alla dashboard | Torna alla Panoramica | — |
| `PersonDetailPage.accountPanel.topUp.amount`, `AccountStatementPage.adjustments.amount`, `BillingPage.adjustModal.amount` | Importo (EUR) / Importo (EUR, con segno) | Importo (€) / Importo (€, con segno) | `accounts-topups.spec.ts:74`, `account-adjustments.spec.ts:81` (`getByLabel`) |
| `PersonDetailPage.accountPanel.topUp.description` vs `PilotsPage.topUp.description` | Note / Descrizione | una sola parola per lo stesso campo (leggere quale salva) | — |

### Velivoli e fuori servizio

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `AircraftPage.newAircraft`, `.editor.submitCreate` / `.editor.newTitle` / `.editor.newSubtitle` / `.empty` | Aggiungi aeromobile / Nuovo aeromobile / Registra un aeromobile sul campo / Nessun aeromobile trovato. | Aggiungi velivolo / Nuovo velivolo / Aggiungi un velivolo alla flotta / Nessun velivolo trovato. | — |
| `AircraftPage.badge.aog`, `BookingsPage.schedule.aog` | AOG | Fuori servizio | `aircraft-status-hours.spec.ts:74` |
| `AircraftPage.mobile.sheet.aogReason` / `.mobile.monthHours`, `.mobile.sheet.monthHours` | Motivo AOG / Ore mese | Motivo / Ore nel mese | `mobile-registries.spec.ts:290`, `:327-328` |
| `AircraftPage.editor.availability.until` / `.untilHint` / `.untilValue` | Fermo fino al (compreso) / …l'ultimo giorno di fermo… / fermo fino al {date} compreso | Fuori servizio fino al (compreso) / …l'ultimo giorno fuori servizio… / fuori servizio fino al {date} compreso | `aircraft-out-of-service-until.spec.ts:205-216` |
| `AircraftPage.toast.setOutOfService` | Velivolo segnato fuori servizio. | Velivolo messo fuori servizio. | `aircraft-status-hours.spec.ts:70` (substring: resta vero) |
| `BookingsPage.form.errors.AIRCRAFT_OUT_OF_SERVICE_UNTIL` | Il velivolo è fuori servizio: {reason}. Fermo fino al {date} compreso. | Il velivolo è fuori servizio fino al {date} compreso: {reason}. (come `Requirements.failure.outOfServiceUntil`) | `aircraft-out-of-service-until.spec.ts:319`, `:340` |

### Pianificazione e prenotazioni

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `BookingsPage.sub` | Timeline aeromobili e prenotazioni in attesa di approvazione. | Calendario dei velivoli e prenotazioni da approvare. (audit M11, solo parole) | — |
| `BookingsPage.schedule.filtersAircraft` | Aeromobile | Velivolo | — |
| `BookingsPage.list.table.aircraft`, `LogbookPage.table.aircraft` | Aereo | Velivolo | `mobile-logbook.spec.ts:432` |
| `BookingsPage.list.status.APPROVED/DENIED/FLOWN/CANCELLED` | Approvato / Rifiutato / Effettuato / Annullato | Approvata / Rifiutata / Effettuata / Annullata | §3.2 |
| `BookingsPage.list.actions.markFlown` / `.markNoShow` | Effettuato / Assente | Segna come effettuata / Segna come assente | `bookings.spec.ts` (testid `booking-flown-action`/`booking-noshow-action` esistono) |
| `BookingsPage.list.actions.keep` (nuova) | — (oggi `dismiss` «Annulla» accanto a «Sì, annulla») | No, mantienila | — |
| `BookingsPage.list.actions.errors.BOOKING_ALREADY_STARTED` / `.BOOKING_TRANSITION_INVALID` | …modificata o cancellata. / …da un altro operatore… | …modificata o annullata. / …da un altro utente… | — |
| `BookingsPage.list.denyModal.subtitle` / `.reasonPlaceholder` | La motivazione sarà inviata al pilota. / Aeromobile non disponibile, … | Il motivo sarà inviato a chi ha prenotato. / Velivolo non disponibile, … | — |
| `BookingsPage.list.exportXls` / `.exportPdf` | Esporta XLS / Esporta PDF | Prenotazioni (Excel) / Prenotazioni (PDF) | `mobile-planning.spec.ts:666`, `pdf-exports.spec.ts:342`, `:349` → testid |
| `BookingsPage.form.picker.placeholder`, `LogbookPage.picker.placeholder`, `BillingPage.newTransactionForm.picker.placeholder` | Cerca... | Cerca… | — |
| `BookingsPage.form.errors.BOOKING_OUTSIDE_WINDOW` | Orario fuori dalla finestra di prenotazione ({window}). | Orario non prenotabile ({window}). | — |
| `BookingsPage.calendar.clampedStartHint` / `.clampedEndHint` | Inizia prima di questa finestra oraria / Continua oltre questa finestra oraria | Inizia prima dell'orario mostrato / Continua dopo l'orario mostrato | — |

### Registro voli

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `LogbookPage.cardTitle` | Diario di volo | Elenco voli | — |
| `LogbookPage.newEntry`, `.editor.newTitle` / `.kpi.entries` | Nuova voce / Voci | Registra volo / Voli | 2 letterali «Nuova voce» |
| `LogbookPage.table.cancelAction` / `.cancelModal.title` | Annulla / Annulla volo | Elimina / Elimina volo | — |
| `LogbookPage.editor.errors.FLIGHT_OVERLAP` | …Annulla o correggi quel volo, oppure cambia gli orari. | …Elimina o modifica quel volo, oppure cambia gli orari. | rileggere `flights.spec.ts:1178` |
| `LogbookPage.editor.fields.noChargeModes.noCharge` | Non addebitato | Senza addebito | — |
| `LogbookPage.editor.fields.studentOnlyHint` | …il tipo volo è sempre Scuola. | …il tipo di volo è sempre Scuola. | — |
| `LogbookPage.editor.errors.SOLO_REQUIRES_SCHOOL` | Doppio comando/solista è valido solo per i voli scuola. | La scelta doppio comando o solista vale solo per i voli Scuola. | — |
| `LogbookPage.editor.result.balanceAlert` | Attenzione: il saldo del pilota risulta negativo… | Attenzione: il saldo del conto risulta negativo… | — |
| `LogbookPage.mobile.instructorLine` (nuova) | `CFI ⟨nome⟩` cablato | Istruttore: {name} | §3.2 `CFI` |
| `LogbookPage.table.route` / `.takeoffs` / `.landings` | Part → Arr / Dec / Att | restano compatti **se** l'intestazione ha un nome accessibile completo; altrimenti Partenza → Arrivo / Decolli / Atterraggi | — |

### Scadenze e requisiti

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `ExpiriesPage.sub` | Scadenze certificati e Ratings · {count} da gestire | Visite mediche, rating, quota e currency · {count} da gestire | — |
| `ExpiriesPage.registry.segmented.expired`, `.statCards.expired` / `.segmented.win60/30/7` | Scaduti / ≤60g | Scadute / ≤ 60 gg | — |
| `ExpiriesPage.registry.status.expired` / `.ok`, `ExpiriesPage.own.table.status.ok` / `.expired` | Scaduto / Valido / In regola / Scaduta | Scaduta / Valida / Valida / Scaduta | §3.2 |
| `ExpiriesPage.registry.daysAgoSuffix` / `.daysSuffix` | «g fa» / « g» | « gg fa» / « gg» (`mobile-expiries.ts:28` concatena: niente codice) | `expiries-registry.spec.ts:174-177`, `:210`, `:351-352` |
| `ExpiriesPage.registry.table.empty` / `.mobile.empty` | Nulla in questa finestra. / Nessuna scadenza in questa finestra. | Nessuna scadenza in questo intervallo. (entrambe) | `expiry-dashboard.spec.ts:135`, `mobile-expiries-movements.spec.ts:267` |
| `ExpiriesPage.registry.table.certificate` | Certificato | Dettaglio (mostra anche la riga currency: `scadenze-console.tsx:399`) | — |
| `ExpiriesPage.registry.table.pilot`, `.filters.pilot` / `.allPilots` / `.personSearchPlaceholder` | Pilota / Tutti i piloti / Cerca pilota… | Persona / Tutte le persone / Cerca persona… | — |
| `ExpiriesPage.registry.membershipFee.pilot` / `.requiredPilot` / `.success` | Pilota / Seleziona un pilota. / Addebitato. Nuovo saldo: … · scadenza rinnovata al {expires}. | Persona / Seleziona una persona. / Quota addebitata. Nuovo saldo: {balance} · valida fino al {expires}. | — |
| `ExpiriesPage.registry.exportMenu.xlsLabel` / `.pdfLabel` | Excel (.xlsx) / PDF | Scadenze (Excel) / Scadenze (PDF) | — |
| `Requirements.failure.expiryExpired` | {typeName}: scaduto il {date} | {typeName}: scadenza del {date} superata | `flights.spec.ts:744`, `:827`; `flight-requirements.spec.ts:428`; `requirement-failures.test.ts` |

### Contabilità, Statistiche, Impostazioni, comuni

| Chiave | Attuale | Proposta | e2e/unit |
|---|---|---|---|
| `BillingPage.table.statusOptions.registered` / `.reversed` | Registrato / Stornato | Registrata / Stornata (righe = transazioni) | — |
| `BillingPage.panels.deposits.inRed` | Conti in rosso | Conti in negativo (= `negativeBalances`) | — |
| `BillingPage.table.pilot`, `.filters.pilot`, `.newTransactionForm.fields.pilot` / `.mobile.sourceAccount` | Pilota / Conto pilota | Persona / Conto prepagato | — |
| `BillingPage.exportMenu.pdfLabel`, `CashReportPage.title` | Report cassa (PDF) / Report finanziario | Report di cassa (PDF) / Report di cassa | — |
| `ReportsPage.sub` | Analisi dell'aeroporto · {period} | Analisi dell'aviosuperficie · {period} | — |
| `ReportsPage.charts.fleet.empty`, `.rankAircraft.title` / `.empty` | Nessun aeromobile operativo. / Per aeromobile / Nessun aeromobile con voli nel periodo. | Nessun velivolo operativo. / Per velivolo / Nessun velivolo con voli nel periodo. | — |
| `ReportsPage.movementMix.keys.TOURISM` | Turismo/Privato | Turismo | — |
| `ReportsPage.rankPilots.sub` | top 10 · {period} | primi 10 · {period} | — |
| `ReportsPage.mobile.capNote` / `.showAll` | Prime {shown} di {total} / Mostra tutte ({count}) | Primi {shown} di {total} / Mostra tutti ({count}) (velivoli, istruttori, piloti: maschili) | `mobile-reports.spec.ts:419` |
| `SettingsPage.club.sub` / `.metarStationHint` | Identità usata nella console e nei PDF esportati / …meteo in sidebar. Vuota = usa l'ICAO del campo. | Dati del club usati nell'app e nei PDF esportati / Stazione per il meteo nella barra laterale. Se vuota, si usa l'ICAO del campo. | — |
| `SettingsPage.smtp.testEmailNoContact` | …nella card Club. | …nella sezione Club. | — |
| `SettingsPage.membership.sub` / `.fee` | Importo della quota annuale / Importo annuale | Importo della quota (vale 12 mesi dal pagamento) / Importo | — |
| `SettingsPage.currency.windowDays` / `.hint` | Finestra / …nella finestra… | Periodo / …nel periodo… | — |
| `SettingsPage.scheduling.sub` / `.openTime` / `.closeTime` / `.minSlotMinutes` / `.turnaroundMinutes` | Finestra di disponibilità degli aeromobili… / Aeromobili disponibili dalle / …fino alle / Durata minima slot / Margine di turnaround | Orari e limiti delle prenotazioni dei velivoli / Velivoli prenotabili dalle / Velivoli prenotabili fino alle / Durata minima prenotazione / Tempo minimo tra prenotazioni | — (`mobile-settings.spec.ts:706` usa un testid) |
| `SettingsPage.ratings.sub` / `.addAction` / `.table.name`, `.form.name` / `.table.empty` / `.form.createTitle` / `.form.editTitle` | Tipi di Ratings… / Aggiungi Ratings / Nome Ratings / Nessuna Ratings configurata. / Nuova Ratings / Modifica Ratings | Tipi di rating… / Aggiungi rating / Nome del rating / Nessun rating configurato. / Nuovo rating / Modifica rating | — |
| `SettingsPage.ratings.form.validityHint` / `.hint` | …per le Ratings che non scadono mai. / …(es. Ratings notturna)… | …per i rating che non scadono mai. / …(es. il volo notturno)… | — |
| `SettingsPage.ratings.blocksBooking.yes` / `.form.blocksBookingHint` | Blocca prenotazioni / …la registrazione/correzione di voli. | Blocca prenotazioni e voli / …la registrazione o la modifica dei voli. | `getByLabel('Blocca prenotazioni')` resta vero (substring) |
| `SettingsPage.medical.status.active` / `.inactive` | Attivo / Disattivato | Attiva / Disattivata (accordo con «visita») | rileggere `mobile-settings.spec.ts` |
| `SettingsPage.medical.hint` | Le visite mediche sono separate dai Ratings: hanno una propria scadenza e non sono mai testo libero.… | Le visite mediche sono separate dai rating e hanno una propria scadenza.… | — |
| `Export.button` | Esporta Excel | Esporta (le voci prendono chiavi per pagina, AD-6) | — |

---

## §4 — Piano di test

- **Unit**: guardia AD-3 in `src/i18n/messages.test.ts`; allineare `templates.test.ts`, `exports.service.test.ts`, `requirement-failures.test.ts`, `instructor-compensation.service.test.ts` e quelli che `grep -rlE "<copy vecchia>" src --include=*.test.ts` trova. Verifica env: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts`.
- **e2e**: solo via `scripts/e2e.sh`; serie mirate con una build sola e `E2E_REUSE_SERVER=1`; e2e nuovo per le pagine d'errore (AC 19); arbitro completo su DB fresco. Lock anti-brute-force dopo ~10 login sullo stesso DB.
- **Discriminanza** (record §E, sha256 prima/dopo il ripristino): (a) «aeromobile» reinserito in un valore → guardia rossa; (b) `[...rest]/page.tsx` rimosso → l'e2e delle pagine d'errore rosso (la pagina torna inglese).
- **Gate**: `npm run gates` prima di ogni commit; arbitro prima della chiusura.

---

## §5 — Trappole note

- **Oggetto dell'invito**: 17 spec cercano l'email con `'invitato'` (una copia di `waitForMailpitMessage` per spec, più `booking-requirements.spec.ts:186`). Con «Hai ricevuto un invito» il frammento diventa `'invito'` in **tutte** le 19 occorrenze, altrimenti il setup di quegli spec scade a 15 s. A fine story `grep -rn "'invitato'" e2e` = 0.
- **`list.actions.dismiss` fa due mestieri**: è il «Annulla» della conferma di annullamento **e** dei form di prenotazione (`booking-labels.ts:146`; `booking-requirements.spec.ts:643` e `typeahead-pickers.spec.ts:475` cliccano «Annulla» nei form). Per questo la chiave nuova `keep` invece di cambiare `dismiss`.
- **`Export.button` è bottone e voce insieme** su 5 pagine: cambiarlo in «Esporta» senza dare alle voci la loro chiave produce un menu con due voci «Esporta».
- **«Estratto conto» compare due volte**: come voce di menu e come link della landing (`kpi-balance`); un `getByRole('link', { name: 'Estratto conto' })` page-level trova entrambi (strict mode). E sulla pagina del conto personale la card riusa `AccountStatementPage.kicker` proprio per non ripetere l'H1 (`my-account/page.tsx:87-91`): con l'H1 nuovo servirebbe la ripetizione, quindi chiave nuova.
- **Regex sulla copy** (`aog-overview-count.spec.ts`): già riscritte dalla 19.12a; non ritoccare quelle chiavi senza rileggerle.
- **Apostrofo italiano in ICU**: `nell'{x}` stampa `{x}` letterale; il test di parità della 19.12a lo vede.
- **19.11 tocca l'estratto conto e `ExportMenu`**: leggerne il codice prima di AD-6.
- **Sessioni parallele e `:3000`**: verificare prima del primo reset DB (memoria `parallel-sessions-collision-risk`); verifica UI su un gemello se `:3000` è occupata.

---

## §6 — Fuori scope DICHIARATO

- **Descrizioni strutturate dei movimenti** (audit I18N-1, oltre AD-5): campi strutturati e formattazione a video per lingua → story a sé con migrazione.
- **Ordine nome/cognome** (audit I18N-2): regola di presentazione, resta all'audit.
- **Nomi di dati nel DB** (categorie di cassa di sistema, tipi di scadenza del seed): dati, non copy.
- **Layout e comportamento della 18.5** (M4, dimensione della tab bar di M6, console admin per pilota/allievo di M11, azione primaria di M13d): qui cambiano solo le parole.
- **Separatori data-ora** (audit I18N-4): vengono da `src/lib/time.ts`; se la passata trova una superficie che li mescola, la segnala come TD.
- **Email di prova SMTP** (`smtp-test-email.service.ts:35-36`): già bilingue; si legge, non si cambia salvo refusi.
- Inglese oltre AD-2.

---

## §7 — Riferimenti

- Story sorella: `19-12a-glossario-parita-plurali.md` (glossario §G, regole D-1…D-17, plurali §3.2, chiavi morte).
- CR `sprint-change-proposal-2026-11-01.md` §1, §2.1, §4.2, §4.10 (A20); R5 `13-1-*.md:102-110`.
- Audit (sola lettura): `_bmad-output/planning-artifacts/audit-2026-11-02/ui-ux.md` §4.5, tabella mobile (M6, M11, M13a-c), §7.
- 18.5: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md:333-336`.
- Precedenti: `export-menu.tsx`, `mail/templates.ts`, `exports.service.ts`; `19-10-*.md` §C (DB gemello, script UI); `19-11-*.md` §3.6.

---

## Tasks / Subtasks

- [ ] T0 — riallineamento su HEAD (dopo 19.12a): `git log`, `scripts/e2e.sh status`, `:3000`; glossario e record della 19.12a letti; §3.1-§3.2 rieseguiti (AC tutti)
- [ ] T1 — matrice di lettura (AD-1) su gemello: superfici, email, export; elenco delle modifiche nuove oltre §L (AC 2, 22)
- [ ] T2 — §L e modifiche nuove: JSON it, en solo AD-2; decisioni PO (AC 1, 5-8, 11-17)
- [ ] T3 — codice: export (AD-6), `keep`, `CFI`, card del conto personale, compenso (AD-5) (AC 9, 10, 18, 20)
- [ ] T4 — pagine d'errore (AD-4) + e2e (AC 19)
- [ ] T5 — guardia del glossario (AD-3) + mutante; conteggio §3.1 a zero (AC 3, 4)
- [ ] T6 — e2e (incl. `'invitato'` → `'invito'`), unit, discriminanza, gate, arbitro (AC 21, 23, 24)
- [ ] T7 — commit `feat(19.12b)` + Dev Agent Record; review; fix; `docs(19.12b)` con HANDOFF, sprint-status e la nota per la 18.5 (AC 25)

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD (T0): righe slittate, copy di 19.10/19.11, lavoro della 19.12a

### §B — Tabella delle modifiche (chiave → prima → dopo → superficie letta), incluse quelle oltre §L

### §C — Codice: export, `keep`, `CFI`, card del conto personale, pagine d'errore, compenso

### §D — Matrice di lettura (AD-1): superfici, email, export

### §E — Discriminanze con sha256

### §F — Conteggio delle varianti prima/dopo e diff di `en.json` riga per riga (AD-2)

### §G — Delta test (unit ed e2e, prima/dopo; spec toccati e perché)

### §H — Deviazioni motivate

### §I — Verifica UI (screenshot)

### §J — Gate ed esiti verbatim

### Completion Notes List

### File List

---

## Nota per la sessione principale — riperimetrare la 18.5

La 18.5 «Righe, tab e lessico» (`docs/superpowers/plans/2026-09-10-epics-16-18-audit.md:333-336`, `sprint-status.yaml` `18-5-righe-tab-lessico`) cita le voci dell'audit mobile M4, M6, M11 e M13. **Il lessico di M6, M11 e M13a-c passa alla 19.12b**: l'etichetta della quinta tab («Estratto conto» al posto di «Le mie transazioni»), il sottotitolo di Pianificazione, «Pianifica volo» → «Registra volo», il nome unico «Velivoli» fra menu e H1, «Ricarica» al posto di «Registra». Alla 18.5 restano layout e comportamento: righe che mostrano il dato che distingue (M4), la tab bar che sta su una riga a prescindere dall'etichetta (M6, dimensione del font: audit MOB-2), la seconda tab del pilota che non sia la console admin (M11), l'azione primaria nello sheet prenotazione (M13d). Aggiornare la descrizione della 18.5 in `sprint-status.yaml` e nel piano quando la 19.12b si chiude.

---

> **Aggiunta della sessione principale (2026-11-03, review 19.11 F6)**: includere nella passata l'etichetta dell'estratto conto «Saldo iniziale al {from}» (esclude i movimenti di quel giorno) vs «Saldo finale al {to}» (li include): renderle non ambigue (es. «Saldo all'inizio del {from}» / «Saldo a fine {to}»), IT ed EN.

