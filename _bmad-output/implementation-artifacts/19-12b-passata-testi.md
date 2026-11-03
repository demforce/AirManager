---
baseline_commit: dc69faf
---

# Story 19.12b: Passata completa dei testi italiani in contesto

Status: **review** — 2026-11-03 (dev `dev-19-12b`; prima ready-for-dev). **Modello dev: Opus 5 xhigh (UI)**: la story rilegge l'app reale su tutte le superfici (desktop e mobile, quattro ruoli), cambia le copy, il cablaggio delle etichette di `ExportMenu` in cinque pagine, aggiunge le pagine d'errore localizzate e tocca una trentina di spec e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-12b-passata-testi`.

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

- [x] T0 — riallineamento su HEAD (dopo 19.12a): `git log`, `scripts/e2e.sh status`, `:3000`; glossario e record della 19.12a letti; §3.1-§3.2 rieseguiti (AC tutti)
- [x] T1 — matrice di lettura (AD-1) su gemello: superfici, email, export; elenco delle modifiche nuove oltre §L (AC 2, 22)
- [x] T2 — §L e modifiche nuove: JSON it, en solo AD-2; decisioni PO (AC 1, 5-8, 11-17)
- [x] T3 — codice: export (AD-6), `keep`, `CFI`, card del conto personale, compenso (AD-5) (AC 9, 10, 18, 20)
- [x] T4 — pagine d'errore (AD-4) + e2e (AC 19)
- [x] T5 — guardia del glossario (AD-3) + mutante; conteggio §3.1 a zero (AC 3, 4)
- [x] T6 — e2e (incl. `'invitato'` → `'invito'`), unit, discriminanza, gate, arbitro (AC 21, 23, 24) — l'arbitro completo su DB fresco resta alla sessione principale e al reviewer; qui la suite intera su un gemello fresco, 552 + 54
- [ ] T7 — commit `feat(19.12b)` + Dev Agent Record; review; fix; `docs(19.12b)` con HANDOFF, sprint-status e la nota per la 18.5 (AC 25) — fatti `feat(19.12b)` e il Dev Agent Record; review, fix e chiusura alla sessione principale

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), dev subagent `dev-19-12b`, unico dev della story, 2026-11-03. Skill usate: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` e `ui-ux-pro-max`. La story cambia testi: delle due skill di design valgono l'auto-verifica della copy (una parola per concetto, l'informazione che conta in testa a una stringa che può essere tagliata), la regola «un bottone o un badge non si spezza e non si taglia» e il controllo a 1280 e 375 che i testi più lunghi non rompano il layout. Il ridisegno della riga di conferma segue l'idioma AirOps esistente (`.fld` a colonna, `.fld-label`, `.btn.primary`/`.btn`), senza stili nuovi.

### §A — Riallineamento sul HEAD (T0): righe slittate, copy di 19.10/19.11, lavoro della 19.12a

- HEAD di partenza **`6525be2`** (19.12a chiusa). Frontmatter `baseline_commit: dc69faf` lasciato (valore della ricognizione, la skill lo preserva). `scripts/e2e.sh status`: DONE, 604 passed, `E2E_EXIT=0` (arbitro finale 19.12a, 17:51). `:3000` e `:3100` liberi. Glossario, §G/§0.3 e Dev/Review Record della 19.12a letti; review report 19.12a F2 letto per le misure della riga di conferma.
- **§3.1 su `6525be2`** (1 430 chiavi): aeromobile **21**, aereo 2, payout 4, AOG **4**, fermo **5**, Ratings nel testo **11**, impatt **0**, finestra 8, (EUR **3**, ... **3**, CFI 1, dashboard **1**, sidebar 1, card 1, reset 1, alert 2, slot 2 (una è il nome dell'argomento `{slot, plural}` di `SettingsPage.scheduling.hint`), turnaround **1**, timeline 1, top N 1, Successivo 3, Diario 1, Le mie transazioni 3, Il mio conto 1, Admin 2, Esporta XLS/Excel **2**, login 2, Sei stato 2, Non current 1, gg/g 7, aeroporto 1, certificat 2. In grassetto i conteggi diversi da `dc69faf`: sono le chiavi che la 19.12a ha riscritto (i plurali di §3.2 di quella story: `SettingsPage.scheduling.hint`, le chiavi dell'editor fuori servizio, `AircraftPage.sub`, `DashboardPage.fleetCard.summary`, `DashboardPage.overview.aogCount`) o rimosso come morte (§D di quella story: `AircraftPage.exportXls`, `PeoplePage`/`FlightsPage.backToDashboard`, `FinancePage.cashRegister.form.amount`, …).
- **§3.2 rieseguito** con uno script (scratchpad `b/census.py`, poi una seconda passata sui valori esatti tra apici) che cerca ogni valore vecchio delle chiavi cambiate in `e2e/` e in `src/**/*.test.ts`, righe non di commento. Le righe slittate rispetto alla tabella: `bookings.spec.ts` `:1769`→`:1781` (Approvato), `:1797`→`:1809`, `:1831`→`:1843`, `:1836`→`:1848`, `:1848`→`:1860`, `:1853`→`:1865`; `booking-requirements.spec.ts:699`→`:708`; `flight-delete-update.spec.ts:287`→`:288`; `exports.service.test.ts:928`→`:982`; `aog-impact-email.spec.ts` il test MAJOR-2 è a `:391` (il `test(`), il letterale a `:429`. Spec **non** elencati da §3.2 e trovati dal censimento: `membership-fee.spec.ts` e `mobile-membership-fee.spec.ts` (combobox `'Pilota'` della quota), `mobile-billing.spec.ts:348` (chiavi dello sheet), `expiry-registration.spec.ts:149` («In regola» della scheda persona), `expiry-types.spec.ts` e `settings.spec.ts` (stati delle visite), `mobile-logbook.spec.ts:428`/`:432`/`:437` (chiavi dello sheet), `expiries-registry.spec.ts:198`/`:425` (sotto-riga mobile «0 g»), unit `exports.service.test.ts:395`/`:526`/`:533`/`:658-659`/`:674`/`:753`/`:923`/`:978-982`/`:1015`.
- **`'invitato'`**: **20** occorrenze in **18** spec, non 19 in 17 (la 19.11 ha aggiunto `account-statement-period.spec.ts:70`).
- **Export**: `grep "^export async function" exports.service.ts` = **14** export, non 15 (9 Excel, 5 PDF).
- **Copy di 19.10/19.11** rilette (AC 15): `Requirements.*` (avviso unico) e `BookingsPage.requirements.*` invariate salvo `expiryExpired` (AC 14); `AccountStatementPage.period.*` con F6 di review 19.11 (sotto); `Export.pdfTooLarge`/`xlsTooLarge` invariate (lette nel PDF/Excel oltre il tetto di `account-statement-period.spec.ts`).
- **Lavoro della 19.12a**: le chiavi di §3.2 di quella story non sono ritoccate, salvo la domanda di conferma (decisione PO su F2, aggiunta in coda). U+00A0 in `AircraftPage.sub`/`DashboardPage.fleetCard.summary` lasciato.

### §B — Tabella delle modifiche (chiave → prima → dopo → superficie letta), incluse quelle oltre §L

Catalogo IT: **221** valori cambiati, **14** chiavi nuove, **1** rimossa (1 430 → 1 443 chiavi per file). B.1 ha 202 righe (191 chiavi di §L, 3 corpi di email cambiati per sottostringa, 8 chiavi nuove), B.2 ne ha 34 (27 valori cambiati, 6 chiavi `ErrorPages` nuove, 1 chiave rimossa). Le superfici sono quelle della matrice di §D, lette sulla build di produzione del gemello `airmanager_1912b` (seed + `seed:demo`) o, per le email, in Mailpit. Le chiavi che i dati demo non mostrano sono lette dal codice o provocate (indicato in §D).

**B.1 — Righe di §L** (tutte applicate; dove la copy differisce dalla proposta, il motivo è in §H):

| Chiave | Prima | Dopo | Superficie letta |
|---|---|---|---|
| `shell.nav.fleet` | Aeromobili | Velivoli | barra laterale, barra mobile, titolo della barra (tutti i ruoli, 1280/375) |
| `shell.pageTitle.fleet` | Aeromobili | Velivoli | barra laterale, barra mobile, titolo della barra (tutti i ruoli, 1280/375) |
| `DashboardPage.overview.mobile.shortcuts.fleet` | Aeromobili | Velivoli | Panoramica admin (1280/375) |
| `DashboardPage.fleetCard.cardTitle` | Aeromobili | Velivoli | Panoramica admin, card Velivoli (1280) |
| `shell.nav.myAccount` | Le mie transazioni | Estratto conto | barra laterale, barra mobile, titolo della barra (tutti i ruoli, 1280/375) |
| `shell.pageTitle.myAccount` | Le mie transazioni | Estratto conto | barra laterale, barra mobile, titolo della barra (tutti i ruoli, 1280/375) |
| `MyAccountPage.title` | Le mie transazioni | Estratto conto | Estratto conto del pilota (1280/375) |
| `DashboardPage.pilotLanding.accountLink` | Il mio conto | Estratto conto | Panoramica pilota e allievo (1280/375) |
| `shell.roles.ADMIN` | Admin | Amministratore | barra laterale, barra mobile, titolo della barra (tutti i ruoli, 1280/375) |
| `UsersPage.roles.ADMIN` | Admin | Amministratore | Piloti, editor sezione Accesso (ruoli) |
| `auth.forgotPassword.submit` | Invia link di reset | Invia link di reimpostazione | accesso / password dimenticata / imposta password (anonimo, 1280/375) |
| `auth.setPassword.goToLogin` | Vai al login | Vai all'accesso | accesso / password dimenticata / imposta password (anonimo, 1280/375) |
| `auth.forgotPassword.backToLogin` | Torna al login | Torna all'accesso | accesso / password dimenticata / imposta password (anonimo, 1280/375) |
| `auth.setPassword.missingToken` | Link non valido: token mancante. | Link non valido o incompleto: richiedine uno nuovo. | accesso / password dimenticata / imposta password (anonimo, 1280/375) |
| `Emails.invite.subject` | Sei stato invitato ad AirManager | Hai ricevuto un invito ad AirManager | Mailpit (template reale) |
| `Emails.expiryDigest.subject` | Riepilogo alert scadenze | Riepilogo avvisi di scadenza | Mailpit (template reale) |
| `Emails.expiryDigest.intro` | Sono stati inviati i seguenti alert di scadenza: | Sono stati inviati i seguenti avvisi di scadenza: | Mailpit (template reale) |
| `DashboardPage.overview.dispatchButton` | Pianifica volo | Registra volo | Panoramica admin (1280/375) |
| `DashboardPage.scadenzeWidget.countInWindow` | {count} entro {window}g | {count} entro {window} gg | Panoramica admin, card Scadenze (1280) |
| `DashboardPage.scadenzeWidget.window7` | 7g | 7 gg | Panoramica admin, card Scadenze (1280) |
| `DashboardPage.scadenzeWidget.window30` | 30g | 30 gg | Panoramica admin, card Scadenze (1280) |
| `DashboardPage.scadenzeWidget.window60` | 60g | 60 gg | Panoramica admin, card Scadenze (1280) |
| `DashboardPage.scadenzeWidget.ago` | {n}g fa | {n} gg fa | Panoramica admin, card Scadenze (1280) |
| `DashboardPage.scadenzeWidget.inDays` | tra {n}g | tra {n} gg | Panoramica admin, card Scadenze (1280) |
| `DashboardPage.fleetCard.addAircraft` | Aggiungi aeromobile | Aggiungi velivolo | Panoramica admin, card Velivoli (1280) |
| `DashboardPage.fleetCard.empty` | Nessun aeromobile registrato. | Nessun velivolo registrato. | Panoramica admin, card Velivoli (1280) |
| `DashboardPage.fleetCard.badge.aog` | AOG | Fuori servizio | Panoramica admin, card Velivoli (1280) |
| `DashboardPage.mobile.detail.aircraft` | Aeromobile | Velivolo | Panoramica admin 375, sheet di dettaglio |
| `DashboardPage.pilotLanding.kpis.medical` | Scadenza medico | Visita medica | Panoramica pilota e allievo (1280/375) |
| `DashboardPage.instructorLanding.kpis.payoutRate` | Tariffa payout | Compenso orario | Panoramica istruttore (1280/375) |
| `DashboardPage.instructorLanding.kpis.hoursMonth` | Ore mese | Ore nel mese | Panoramica istruttore (1280/375) |
| `DashboardPage.instructorLanding.kpis.owedMonth` | Dovuto mese | Dovuto nel mese | Panoramica istruttore (1280/375) |
| `DashboardPage.instructorLanding.status.completed` | completato | conclusa | Panoramica istruttore (1280/375) |
| `BookingsPage.schedule.mobile.phase.completed` | completato | conclusa | Pianificazione 375, agenda |
| `PilotsPage.actions.topUp` | Registra | Ricarica | Piloti (1280/375) |
| `PilotsPage.mobile.flagExpired` | {doc} scaduto | Scadenza superata · {doc} | Piloti 375, riga e sheet |
| `PilotsPage.mobile.flagExpiring` | {doc} {days}gg | {days} gg · {doc} | Piloti 375, riga e sheet |
| `PilotsPage.currency.notCurrent` | Non current | Currency scaduta | Piloti 1280 (badge sotto «Ultimo volo») e 375 |
| `PilotsPage.currency.expiring` | Currency {days}gg | Currency · {days} gg | Piloti 1280 (badge sotto «Ultimo volo») e 375 |
| `PilotsPage.pagination.next` | Successivo | Successiva | Piloti (1280/375) |
| `AircraftPage.pagination.next` | Successivo | Successiva | Velivoli (1280/375) |
| `PilotsPage.editor.ratings.empty` | Nessuna scadenza registrata. | Nessun rating registrato. | Piloti, editor (1280/375) |
| `InstructorsPage.editor.ratings.empty` | Nessuna scadenza registrata. | Nessun rating registrato. | Istruttori, editor |
| `PilotsPage.toast.suspended` | Utente sospeso. | Accesso sospeso. | Piloti, editor sezione Accesso (toast) |
| `PilotsPage.toast.reactivated` | Utente riattivato. | Accesso riattivato. | Piloti, editor sezione Accesso (toast) |
| `PilotsPage.toast.userCreated` | Utente creato: email di invito inviata. | Accesso creato: invito inviato per email. | Piloti, editor sezione Accesso (toast) |
| `PilotsPage.editor.access.noUser` | Nessun utente collegato a questa persona. | Nessun accesso per questa persona. | Piloti, editor (1280/375) |
| `PilotsPage.editor.saveErrors.instructorProfileInactive` | Il profilo istruttore non è più attivo: compenso e tariffa allievo non si possono salvare. | Il profilo istruttore non è più attivo: compenso e tariffa istruttore non si possono salvare. | Piloti, editor (1280/375) |
| `PeoplePage.profilesPanel.errors.exclusive` | Allievo non può essere attivo insieme a Pilota o Istruttore: disattiva prima l'altro profilo. | Il profilo allievo non può essere attivo insieme a pilota o istruttore: disattiva prima l'altro profilo. | Piloti, editor sezione Profili |
| `InstructorsPage.kpi.avgRate` | Tariffa media payout | Compenso orario medio | Istruttori (1280/375) |
| `InstructorsPage.table.rate` | Tariffa payout | Compenso orario | Istruttori (1280/375) |
| `InstructorsPage.paymentCycleButton` | Ciclo pagamenti | Compensi da liquidare | Istruttori, slide-over «Compensi da liquidare» |
| `InstructorsPage.paymentCycle.title` | Ciclo pagamenti | Compensi da liquidare | Istruttori, slide-over «Compensi da liquidare» |
| `InstructorsPage.paymentCycle.subtitle` | Istruttori con un dovuto da liquidare | Istruttori con compensi da liquidare | Istruttori, slide-over «Compensi da liquidare» |
| `InstructorsPage.paymentCycle.empty` | Nessun istruttore con un dovuto da liquidare. | Nessun istruttore con compensi da liquidare. | Istruttori, slide-over «Compensi da liquidare» |
| `InstructorsPage.editor.payoutRate.sectionTitle` | Tariffa payout (pagata all'istruttore) | Compenso istruttore | Istruttori, editor |
| `InstructorsPage.editor.payoutRate.label` | Tariffa oraria | Compenso orario (€/h) | Istruttori, editor |
| `InstructorsPage.studentRate.heading` | Tariffa allievo (addebitata al pilota/allievo) | Tariffa istruttore (addebitata a chi vola) | Istruttori, editor sezione tariffa |
| `InstructorsPage.studentRate.price` | Prezzo (€/h) | Tariffa (€/h) | Istruttori, editor sezione tariffa |
| `InstructorsPage.profile.kpi.rate` | Tariffa oraria | Compenso orario | Istruttori, profilo (slide-over e sheet 375) |
| `MyCompensationPage.kpi.rate` | Tariffa oraria | Compenso orario | I miei compensi (istruttore, 1280/375) |
| `InstructorsPage.profile.recentFlights.sectionTitle` | Voli recenti come CFI | Voli recenti come istruttore | Istruttori, profilo (slide-over e sheet 375) |
| `InstructorsPage.pay.periodStart` | Periodo da | Dal | Istruttori, modale «Registra pagamento» |
| `InstructorsPage.pay.periodEnd` | Periodo a | Al | Istruttori, modale «Registra pagamento» |
| `PersonDetailPage.backToDashboard` | Torna alla dashboard | Torna alla Panoramica | Scheda persona (admin, 1280/375) |
| `PersonDetailPage.accountPanel.topUp.amount` | Importo (EUR) | Importo (€) | Scheda persona (admin, 1280/375) |
| `AccountStatementPage.adjustments.amount` | Importo (EUR, con segno) | Importo (€, con segno) | Scheda persona ed Estratto conto (1280/375), PDF/Excel |
| `BillingPage.adjustModal.amount` | Importo (EUR, con segno) | Importo (€, con segno) | Contabilità (1280/375), Excel «Transazioni» |
| `PersonDetailPage.accountPanel.topUp.description` | Note | Descrizione | Scheda persona (admin, 1280/375) |
| `AircraftPage.newAircraft` | Aggiungi aeromobile | Aggiungi velivolo | Velivoli (1280/375) |
| `AircraftPage.editor.submitCreate` | Aggiungi aeromobile | Aggiungi velivolo | Velivoli, editor (1280/375) |
| `AircraftPage.editor.newTitle` | Nuovo aeromobile | Nuovo velivolo | Velivoli, editor (1280/375) |
| `AircraftPage.editor.newSubtitle` | Registra un aeromobile sul campo | Aggiungi un velivolo alla flotta | Velivoli, editor (1280/375) |
| `AircraftPage.empty` | Nessun aeromobile trovato. | Nessun velivolo trovato. | Velivoli (1280/375) |
| `AircraftPage.badge.aog` | AOG | Fuori servizio | Velivoli (1280/375) |
| `BookingsPage.schedule.aog` | AOG | Fuori servizio | Pianificazione, calendario |
| `AircraftPage.mobile.sheet.aogReason` | Motivo AOG | Motivo | Velivoli 375, card e sheet |
| `AircraftPage.mobile.monthHours` | Ore mese | Ore nel mese | Velivoli 375, card e sheet |
| `AircraftPage.mobile.sheet.monthHours` | Ore mese | Ore nel mese | Velivoli 375, card e sheet |
| `AircraftPage.editor.availability.until` | Fermo fino al (compreso) | Fuori servizio fino al (compreso) | Velivoli, editor (1280/375) |
| `AircraftPage.editor.availability.untilHint` | Facoltativo: l'ultimo giorno di fermo. Vuoto = rientro da definire. | Facoltativo: l'ultimo giorno fuori servizio. Se vuoto, il rientro è da definire. | Velivoli, editor (1280/375) |
| `AircraftPage.editor.availability.untilValue` | fermo fino al {date} compreso | fuori servizio fino al {date} compreso | Velivoli, editor (1280/375) |
| `AircraftPage.toast.setOutOfService` | Velivolo segnato fuori servizio. | Velivolo messo fuori servizio. | Velivoli (1280/375) |
| `BookingsPage.form.errors.AIRCRAFT_OUT_OF_SERVICE_UNTIL` | Il velivolo è fuori servizio: {reason}. Fermo fino al {date} compreso. | Il velivolo è fuori servizio fino al {date} compreso: {reason}. | Pianificazione, form «Nuova prenotazione» |
| `AircraftPage.editor.availability.confirmQuestion` | Mettere fuori servizio? {count, plural, =0 {Nessuna prenotazione coinvolta} one {# prenotazione coinvolta} other {# prenotazioni coinvolte}} | Mettere fuori servizio il velivolo? {count, plural, =0 {Nessuna prenotazione coinvolta} one {# prenotazione coinvolta} other {# prenotazioni coinvolte}} | Velivoli, editor (1280/375) |
| `AircraftPage.editor.availability.confirmQuestionUnknown` | Mettere fuori servizio? Conteggio non disponibile | Mettere fuori servizio il velivolo? Conteggio delle prenotazioni non disponibile | Velivoli, editor (1280/375) |
| `BookingsPage.sub` | Timeline aeromobili e prenotazioni in attesa di approvazione. | Calendario dei velivoli e prenotazioni da approvare. | Pianificazione (1280/375) |
| `BookingsPage.schedule.filtersAircraft` | Aeromobile | Velivolo | Pianificazione, calendario |
| `BookingsPage.list.table.aircraft` | Aereo | Velivolo | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `LogbookPage.table.aircraft` | Aereo | Velivolo | Registro voli (1280/375) |
| `BookingsPage.list.status.APPROVED` | Approvato | Approvata | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.status.DENIED` | Rifiutato | Rifiutata | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.status.FLOWN` | Effettuato | Effettuata | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.status.CANCELLED` | Annullato | Annullata | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.actions.markFlown` | Effettuato | Segna come effettuata | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.actions.markNoShow` | Assente | Segna come assente | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.actions.errors.BOOKING_ALREADY_STARTED` | La prenotazione è già iniziata: non può più essere modificata o cancellata. | La prenotazione è già iniziata: non può più essere modificata o annullata. | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.actions.errors.BOOKING_TRANSITION_INVALID` | Questa prenotazione è già stata aggiornata da un altro operatore. Ricarica la pagina e riprova. | Questa prenotazione è già stata aggiornata da un altro utente. Ricarica la pagina e riprova. | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.denyModal.subtitle` | La motivazione sarà inviata al pilota. | Il motivo sarà inviato a chi ha prenotato. | Pianificazione, modale di rifiuto |
| `BookingsPage.list.denyModal.reasonPlaceholder` | Aeromobile non disponibile, conflitto istruttore, minime meteo… | Velivolo non disponibile, conflitto istruttore, minime meteo… | Pianificazione, modale di rifiuto |
| `BookingsPage.list.exportXls` | Esporta XLS | Prenotazioni (Excel) | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.list.exportPdf` | Esporta PDF | Prenotazioni (PDF) | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `BookingsPage.form.picker.placeholder` | Cerca... | Cerca… | Pianificazione, form «Nuova prenotazione» |
| `LogbookPage.picker.placeholder` | Cerca... | Cerca… | Registro voli (1280/375) |
| `BillingPage.newTransactionForm.picker.placeholder` | Cerca... | Cerca… | Contabilità (1280/375), Excel «Transazioni» |
| `BookingsPage.form.errors.BOOKING_OUTSIDE_WINDOW` | Orario fuori dalla finestra di prenotazione ({window}). | Orario non prenotabile ({window}). | Pianificazione, form «Nuova prenotazione» |
| `BookingsPage.calendar.clampedStartHint` | Inizia prima di questa finestra oraria | Inizia prima dell'orario mostrato | Pianificazione, calendario giorno/settimana |
| `BookingsPage.calendar.clampedEndHint` | Continua oltre questa finestra oraria | Continua dopo l'orario mostrato | Pianificazione, calendario giorno/settimana |
| `LogbookPage.cardTitle` | Diario di volo | Elenco voli | Registro voli (1280/375) |
| `LogbookPage.newEntry` | Nuova voce | Registra volo | Registro voli (1280/375) |
| `LogbookPage.editor.newTitle` | Nuova voce | Registra volo | Registro voli, editor «Registra volo» |
| `LogbookPage.kpi.entries` | Voci | Voli | Registro voli (1280/375) |
| `LogbookPage.table.cancelAction` | Annulla | Elimina | Registro voli (1280/375) |
| `LogbookPage.cancelModal.title` | Annulla volo | Elimina volo | Registro voli, modale di eliminazione |
| `LogbookPage.editor.errors.FLIGHT_OVERLAP` | Questo velivolo ha già un volo registrato il {date} dalle {from} alle {to}. Annulla o correggi quel volo, oppure cambia gli orari. | Questo velivolo ha già un volo registrato il {date} dalle {from} alle {to}. Elimina o modifica quel volo, oppure cambia gli orari. | Registro voli, editor «Registra volo» |
| `LogbookPage.editor.fields.noChargeModes.noCharge` | Non addebitato | Senza addebito | Registro voli, editor «Registra volo» |
| `LogbookPage.editor.fields.studentOnlyHint` | Allievo senza brevetto: il tipo volo è sempre Scuola. | Allievo senza brevetto: il tipo di volo è sempre Scuola. | Registro voli, editor «Registra volo» |
| `LogbookPage.editor.errors.SOLO_REQUIRES_SCHOOL` | Doppio comando/solista è valido solo per i voli scuola. | La scelta doppio comando o solista vale solo per i voli Scuola. | Registro voli, editor «Registra volo» |
| `LogbookPage.editor.result.balanceAlert` | Attenzione: il saldo del pilota risulta negativo (o è peggiorato oltre la soglia configurata). Il volo è comunque stato registrato. | Attenzione: il saldo del conto risulta negativo (o è peggiorato oltre la soglia configurata). Il volo è comunque stato registrato. | Registro voli, editor «Registra volo» |
| `LogbookPage.table.route` | Part → Arr | Tratta | Registro voli (1280/375) |
| `ExpiriesPage.sub` | Scadenze certificati e Ratings · {count} da gestire | Visite mediche, rating, quota e currency · {count} da gestire | Scadenze (1280/375) |
| `ExpiriesPage.registry.segmented.expired` | Scaduti | Scadute | Scadenze (1280/375) |
| `ExpiriesPage.registry.statCards.expired` | Scaduti | Scadute | Scadenze (1280/375) |
| `ExpiriesPage.registry.segmented.win60` | ≤60g | ≤ 60 gg | Scadenze (1280/375) |
| `ExpiriesPage.registry.segmented.win30` | ≤30g | ≤ 30 gg | Scadenze (1280/375) |
| `ExpiriesPage.registry.segmented.win7` | ≤7g | ≤ 7 gg | Scadenze (1280/375) |
| `ExpiriesPage.registry.status.expired` | Scaduto | Scaduta | Scadenze (1280/375) |
| `ExpiriesPage.registry.status.ok` | Valido | Valida | Scadenze (1280/375) |
| `ExpiriesPage.own.table.status.ok` | In regola | Valida | Le mie scadenze (pilota) |
| `ExpiriesPage.registry.daysAgoSuffix` | g fa |  gg fa | Scadenze (1280/375) |
| `ExpiriesPage.registry.daysSuffix` |  g |  gg | Scadenze (1280/375) |
| `ExpiriesPage.registry.table.empty` | Nulla in questa finestra. | Nessuna scadenza in questo intervallo. | Scadenze (1280/375) |
| `ExpiriesPage.registry.mobile.empty` | Nessuna scadenza in questa finestra. | Nessuna scadenza da mostrare. | Scadenze (1280/375) |
| `ExpiriesPage.registry.table.certificate` | Certificato | Dettaglio | Scadenze (1280/375) |
| `ExpiriesPage.registry.table.pilot` | Pilota | Persona | Scadenze (1280/375) |
| `ExpiriesPage.registry.filters.pilot` | Pilota | Persona | Scadenze (1280/375) |
| `ExpiriesPage.registry.filters.allPilots` | Tutti i piloti | Tutte le persone | Scadenze (1280/375) |
| `ExpiriesPage.registry.filters.personSearchPlaceholder` | Cerca pilota… | Cerca persona… | Scadenze (1280/375) |
| `ExpiriesPage.registry.membershipFee.pilot` | Pilota | Persona | Scadenze, modale «Quota associativa» |
| `ExpiriesPage.registry.membershipFee.requiredPilot` | Seleziona un pilota. | Seleziona una persona. | Scadenze, modale «Quota associativa» |
| `ExpiriesPage.registry.membershipFee.success` | Addebitato. Nuovo saldo: {balance} · scadenza rinnovata al {expires}. | Quota addebitata. Nuovo saldo: {balance} · valida fino al {expires}. | Scadenze, modale «Quota associativa» |
| `ExpiriesPage.registry.exportMenu.xlsLabel` | Excel (.xlsx) | Scadenze (Excel) | Scadenze (1280/375) |
| `ExpiriesPage.registry.exportMenu.pdfLabel` | PDF | Scadenze (PDF) | Scadenze (1280/375) |
| `Requirements.failure.expiryExpired` | {typeName}: scaduto il {date} | {typeName}: scadenza del {date} superata | avviso unico dei requisiti (registro voli / prenotazioni) |
| `BillingPage.table.statusOptions.registered` | Registrato | Registrata | Contabilità (1280/375), Excel «Transazioni» |
| `BillingPage.table.statusOptions.reversed` | Stornato | Stornata | Contabilità (1280/375), Excel «Transazioni» |
| `BillingPage.panels.deposits.inRed` | Conti in rosso | Conti in negativo | Contabilità (1280/375), Excel «Transazioni» |
| `BillingPage.table.pilot` | Pilota | Persona | Contabilità (1280/375), Excel «Transazioni» |
| `BillingPage.filters.pilot` | Pilota | Persona | Contabilità (1280/375), Excel «Transazioni» |
| `BillingPage.newTransactionForm.fields.pilot` | Pilota | Persona | Contabilità (1280/375), Excel «Transazioni» |
| `BillingPage.mobile.sourceAccount` | Conto pilota | Conto prepagato | Contabilità 375 |
| `BillingPage.exportMenu.pdfLabel` | Report cassa (PDF) | Report di cassa (PDF) | Contabilità (1280/375), Excel «Transazioni» |
| `CashReportPage.title` | Report finanziario | Report di cassa | PDF «Report di cassa» |
| `ReportsPage.sub` | Analisi dell'aeroporto · {period} | Analisi dell'aviosuperficie · {period} | Statistiche (1280/375) |
| `ReportsPage.charts.fleet.empty` | Nessun aeromobile operativo. | Nessun velivolo operativo. | Statistiche (1280/375) |
| `ReportsPage.rankAircraft.title` | Per aeromobile | Per velivolo | Statistiche (1280/375) |
| `ReportsPage.rankAircraft.empty` | Nessun aeromobile con voli nel periodo. | Nessun velivolo con voli nel periodo. | Statistiche (1280/375) |
| `ReportsPage.movementMix.keys.TOURISM` | Turismo/Privato | Turismo | Statistiche (1280/375) |
| `ReportsPage.rankPilots.sub` | top 10 · {period} | primi 10 · {period} | Statistiche (1280/375) |
| `ReportsPage.mobile.capNote` | Prime {shown} di {total} | Primi {shown} di {total} | Statistiche 375 |
| `ReportsPage.mobile.showAll` | Mostra tutte ({count}) | Mostra tutti ({count}) | Statistiche 375 |
| `SettingsPage.club.sub` | Identità usata nella console e nei PDF esportati | Dati del club usati nell'app e nei PDF esportati | Impostazioni (1280/375) |
| `SettingsPage.club.metarStationHint` | Stazione per il meteo in sidebar. Vuota = usa l'ICAO del campo. | Stazione per il meteo nella barra laterale. Se vuota, si usa l'ICAO del campo. | Impostazioni (1280/375) |
| `SettingsPage.smtp.testEmailNoContact` | Imposta prima un'email di contatto nella card Club. | Imposta prima un'email di contatto nella sezione Club. | Impostazioni (1280/375) |
| `SettingsPage.membership.sub` | Importo della quota annuale | Importo della quota (vale 12 mesi dal pagamento) | Impostazioni (1280/375) |
| `SettingsPage.membership.fee` | Importo annuale | Importo | Impostazioni (1280/375) |
| `SettingsPage.membership.feeHint` | Vale 12 mesi dal pagamento. Precompila l'azione «Quota associativa» in Scadenze. | Precompila l'azione «Quota associativa» in Scadenze. | Impostazioni (1280/375) |
| `SettingsPage.currency.windowDays` | Finestra | Periodo | Impostazioni (1280/375) |
| `SettingsPage.currency.hint` | Chi non ha almeno questo numero di voli nella finestra può volare solo con un istruttore. | Chi non ha almeno questo numero di voli nel periodo può volare solo con un istruttore. | Impostazioni (1280/375) |
| `SettingsPage.scheduling.sub` | Finestra di disponibilità degli aeromobili per le prenotazioni | Orari e limiti delle prenotazioni dei velivoli | Impostazioni (1280/375) |
| `SettingsPage.scheduling.openTime` | Aeromobili disponibili dalle | Velivoli prenotabili dalle | Impostazioni (1280/375) |
| `SettingsPage.scheduling.closeTime` | Aeromobili disponibili fino alle | Velivoli prenotabili fino alle | Impostazioni (1280/375) |
| `SettingsPage.scheduling.minSlotMinutes` | Durata minima slot | Durata minima prenotazione | Impostazioni (1280/375) |
| `SettingsPage.scheduling.turnaroundMinutes` | Margine di turnaround | Tempo minimo tra prenotazioni | Impostazioni (1280/375) |
| `SettingsPage.ratings.sub` | Tipi di Ratings e durata di validità | Tipi di rating e durata di validità | Impostazioni (1280/375) |
| `SettingsPage.ratings.addAction` | Aggiungi Ratings | Aggiungi rating | Impostazioni (1280/375) |
| `SettingsPage.ratings.table.name` | Nome Ratings | Nome del rating | Impostazioni (1280/375) |
| `SettingsPage.ratings.form.name` | Nome Ratings | Nome del rating | Impostazioni (1280/375) |
| `SettingsPage.ratings.table.empty` | Nessuna Ratings configurata. | Nessun rating configurato. | Impostazioni (1280/375) |
| `SettingsPage.ratings.form.createTitle` | Nuova Ratings | Nuovo rating | Impostazioni (1280/375) |
| `SettingsPage.ratings.form.editTitle` | Modifica Ratings | Modifica rating | Impostazioni (1280/375) |
| `SettingsPage.ratings.form.validityHint` | Precompila la scadenza alla registrazione (oggi + mesi). Imposta 0 per le Ratings che non scadono mai. | Precompila la scadenza alla registrazione (oggi + mesi). Imposta 0 per i rating che non scadono mai. | Impostazioni (1280/375) |
| `SettingsPage.ratings.hint` | Imposta la validità a 0 per le Ratings che non scadono mai (es. Ratings notturna). Le scadenze compaiono nella pagina Scadenze. | Imposta la validità a 0 per i rating che non scadono mai (es. il volo notturno). Le scadenze compaiono nella pagina Scadenze. | Impostazioni (1280/375) |
| `SettingsPage.ratings.blocksBooking.yes` | Blocca prenotazioni | Blocca prenotazioni e voli | Impostazioni (1280/375) |
| `SettingsPage.ratings.form.blocksBookingHint` | Una scadenza di questo tipo, se scaduta o assente, impedisce nuove prenotazioni e la registrazione/correzione di voli. | Una scadenza di questo tipo, se scaduta o assente, impedisce nuove prenotazioni e la registrazione o la modifica dei voli. | Impostazioni (1280/375) |
| `SettingsPage.medical.status.active` | Attivo | Attiva | Impostazioni (1280/375) |
| `SettingsPage.medical.status.inactive` | Disattivato | Disattivata | Impostazioni (1280/375) |
| `SettingsPage.medical.hint` | Le visite mediche sono separate dai Ratings: hanno una propria scadenza e non sono mai testo libero. Le scadenze compaiono nella pagina Scadenze. | Le visite mediche sono separate dai rating e hanno una propria scadenza. Le scadenze compaiono nella pagina Scadenze. | Impostazioni (1280/375) |
| `Export.button` | Esporta Excel | Esporta | menu Esporta delle 8 superfici |
| `AccountStatementPage.period.openingAt` | Saldo iniziale al {date} | Saldo all'inizio del {date} | Scheda persona ed Estratto conto (1280/375), PDF/Excel |
| `AccountStatementPage.period.closingAt` | Saldo finale al {date} | Saldo alla fine del {date} | Scheda persona ed Estratto conto (1280/375), PDF/Excel |
| `Emails.invite.body` | …Sei stato invitato ad accedere ad AirManager.… | …Hai ricevuto un invito per accedere ad AirManager.… | Mailpit (template reale) |
| `Emails.expiryAlert.body` | …La tua scadenza "{typeName}"… | …La tua scadenza «{typeName}»… | Mailpit (template reale) |
| `Emails.aircraftGrounded.body` | …Fermo: {window}… | …Fuori servizio: {window}… | Mailpit (template reale) |
| `MyAccountPage.cardHeading` (nuova) | — | Movimenti | Estratto conto del pilota (1280/375) |
| `BookingsPage.list.actions.keep` (nuova) | — | No, mantienila | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `LogbookPage.mobile.instructorLine` (nuova) | — | Istruttore: {name} | Registro voli (1280/375) |
| `AircraftPage.exportMenu.xlsLabel` (nuova) | — | Velivoli (Excel) | Velivoli (1280/375) |
| `PilotsPage.exportMenu.xlsLabel` (nuova) | — | Persone (Excel) | Piloti (1280/375) |
| `InstructorsPage.exportMenu.xlsLabel` (nuova) | — | Istruttori (Excel) | Istruttori (1280/375) |
| `AccountStatementPage.exportMenu.xlsLabel` (nuova) | — | Estratto conto (Excel) | Scheda persona ed Estratto conto (1280/375), PDF/Excel |
| `AccountStatementPage.exportMenu.pdfLabel` (nuova) | — | Estratto conto (PDF) | Scheda persona ed Estratto conto (1280/375), PDF/Excel |

`AircraftPage.title` / `.cardTitle` (Velivoli / Flotta) restano, come da §L. `LogbookPage.table.takeoffs` / `.landings` restano «Dec» / «Att» con il nome completo per le tecnologie assistive (§C, §H D-a).

**B.2 — Modifiche nuove trovate dalla passata** (oltre §L), con lo stesso formato:

| Chiave | Prima | Dopo | Superficie letta |
|---|---|---|---|
| `ExpiriesPanel.table.status.ok` | In regola | Valida | Scheda persona, card Scadenze |
| `PilotsPage.empty` | Nessun pilota trovato. | Nessuna persona trovata. | Piloti (1280/375) |
| `PilotsPage.editor.access.emailConflict` | Esiste già un utente con questa email. | Esiste già un accesso con questa email. | Piloti, editor (1280/375) |
| `PilotsPage.topUp.genericError` | Si è verificato un errore. Riprova. | Impossibile registrare la ricarica. Riprova. | Piloti (1280/375) |
| `InstructorsPage.pay.invalidPeriod` | La data di inizio periodo deve precedere o coincidere con la data di fine periodo. | La data iniziale non può essere successiva a quella finale. | Istruttori, modale «Registra pagamento» |
| `InstructorsPage.profile.kpi.owedTotal` | Dovuto totale | Totale dovuto | Istruttori, profilo (slide-over e sheet 375) |
| `InstructorsPage.studentRate.invalidPrice` | Il prezzo deve essere un importo positivo (es. 45,00). | La tariffa deve essere un importo positivo (es. 45,00). | Istruttori, editor sezione tariffa |
| `ExpiriesPage.registry.membershipFee.genericError` | Operazione non riuscita. Riprova. | Impossibile addebitare la quota. Riprova. | Scadenze, modale «Quota associativa» |
| `ExpiriesPage.registry.reminders.error` | Invio non riuscito. Riprova. | Impossibile inviare i promemoria. Riprova. | Scadenze (1280/375) |
| `BookingsPage.list.actions.errors.generic` | Operazione non riuscita. Riprova. | Si è verificato un errore. Riprova. | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `SettingsPage.errors.generic` | Non è stato possibile salvare. Riprova. | Impossibile salvare le impostazioni. Riprova. | Impostazioni (1280/375) |
| `SettingsPage.smtp.testEmailFailed` | Invio non riuscito. Controlla la configurazione SMTP. | Impossibile inviare l'email di prova. Controlla la configurazione SMTP. | Impostazioni (1280/375) |
| `SettingsPage.club.icao` | Aeroporto base (ICAO) | ICAO del campo | Impostazioni (1280/375) |
| `BillingPage.mobile.empty` | Nessun movimento con questi filtri. | Nessuna transazione con questi filtri. | Contabilità 375 |
| `BillingPage.mobile.filtersTitle` | Filtri del registro | Filtri delle transazioni | Contabilità 375 |
| `LogbookPage.kpi.revenue` | Ricavo | Addebiti | Registro voli (1280/375) |
| `LogbookPage.table.amount` | Costo | Addebito | Registro voli (1280/375) |
| `BookingsPage.calendar.toolbar.prev` | Precedente | Periodo precedente | Pianificazione, calendario giorno/settimana |
| `BookingsPage.calendar.toolbar.next` | Successivo | Periodo successivo | Pianificazione, calendario giorno/settimana |
| `ExpiriesPage.dashboard.heading` | Tutte le scadenze | Scadenze | Excel/PDF «Scadenze» |
| `AircraftPage.editor.availability.setOutOfService` | Fuori servizio | Metti fuori servizio | Velivoli, editor (1280/375) |
| `AircraftPage.editor.availability.returnToService` | Rientro in servizio | Rimetti in servizio | Velivoli, editor (1280/375) |
| `BookingsPage.list.table.pilot` | Pilota | Persona | Pianificazione, tabella prenotazioni e sheet (1280/375), PDF/Excel |
| `LogbookPage.table.pilot` | Pilota | Persona | Registro voli (1280/375) |
| `ExpiriesPage.registry.status.within7` | ≤ 7 giorni | ≤ 7 gg | Scadenze (1280/375) |
| `ExpiriesPage.registry.status.within30` | ≤ 30 giorni | ≤ 30 gg | Scadenze (1280/375) |
| `ExpiriesPage.registry.status.within60` | ≤ 60 giorni | ≤ 60 gg | Scadenze (1280/375) |
| `ErrorPages.notFound.title` (nuova) | — | Pagina non trovata | pagine 404 ed errore (1280/375, chiaro/scuro) |
| `ErrorPages.notFound.text` (nuova) | — | L'indirizzo che hai aperto non esiste o non è più disponibile. | pagine 404 ed errore (1280/375, chiaro/scuro) |
| `ErrorPages.error.title` (nuova) | — | Si è verificato un errore | pagine 404 ed errore (1280/375, chiaro/scuro) |
| `ErrorPages.error.text` (nuova) | — | La pagina non si è caricata. Riprova; se il problema continua, torna alla Panoramica. | pagine 404 ed errore (1280/375, chiaro/scuro) |
| `ErrorPages.retry` (nuova) | — | Riprova | pagine 404 ed errore (1280/375, chiaro/scuro) |
| `ErrorPages.home` (nuova) | — | Vai alla Panoramica | pagine 404 ed errore (1280/375, chiaro/scuro) |
| `Export.buttonPdf` (rimossa) | Esporta PDF | — | chiave morta dopo AD-6 |

Perché, in breve: `ExpiriesPanel.table.status.ok` e `ExpiriesPage.registry.status.within*` (D-4, D-3); `PilotsPage.empty`, `BookingsPage.list.table.pilot`, `LogbookPage.table.pilot` (D-5: la lista e le colonne mescolano piloti e allievi; l'export dei voli diceva già «Persona»); `PilotsPage.editor.access.emailConflict` (D-15); i sei messaggi d'errore (AC 13: una formula per caso); `InstructorsPage.pay.invalidPeriod` (le etichette sono ora «Dal»/«Al»: stessa frase di `AccountStatementPage.period.invalidRange`); `InstructorsPage.profile.kpi.owedTotal` (le altre tre etichette dello stesso dato dicono «Totale dovuto»); `InstructorsPage.studentRate.invalidPrice` (il campo è ora «Tariffa (€/h)»; «prezzo» è del velivolo); `SettingsPage.club.icao` (glossario: «aeroporto» solo per partenza/arrivo; l'hint accanto dice già «l'ICAO del campo»); `BillingPage.mobile.*` (in Contabilità la riga è una transazione); `LogbookPage.kpi.revenue` / `.table.amount` (lo stesso numero si chiamava «Ricavo» nel KPI, «Costo» in tabella e «Addebito» nell'export; «Ricavo» a un pilota che guarda i suoi voli è falso); `BookingsPage.calendar.toolbar.prev/next` (nome accessibile delle frecce, che spostano di un giorno o di una settimana; «Successivo» era l'ultima riga di §3.1); `ExpiriesPage.dashboard.heading` (AD-6: il titolo del PDF/Excel coincide col contenuto della voce); `AircraftPage.editor.availability.setOutOfService` / `.returnToService` (il glossario dà i verbi «mettere fuori servizio» / «rimettere in servizio», e la domanda che il bottone apre è «Mettere fuori servizio il velivolo?»); `ErrorPages.*` (AD-4); `Export.buttonPdf` rimossa perché, dopo AD-6, nessuno la legge (D-1 della 19.12a).

### §C — Codice: export, `keep`, `CFI`, card del conto personale, pagine d'errore, compenso

- **Export (AD-6, AC 10)**: `Export.button` = «Esporta» per tutti i bottoni; le voci prendono chiavi nel namespace della pagina: `AircraftPage.exportMenu.xlsLabel` «Velivoli (Excel)» (`fleet/page.tsx`), `PilotsPage.exportMenu.xlsLabel` «Persone (Excel)» (`pilots/page.tsx`: l'export è `/api/v1/people`, foglio «Persone»), `InstructorsPage.exportMenu.xlsLabel` «Istruttori (Excel)» (`instructors/page.tsx`, campo `exportXls` nuovo nelle label di `instructors-console.tsx`, che passava `exportLabel` anche come voce), `AccountStatementPage.exportMenu.{xls,pdf}Label` «Estratto conto (Excel/PDF)» (`people/[id]/page.tsx` e `my-account/page.tsx`, via `exportLabels` di `account-section.tsx`, invariato), `BookingsPage.list.exportXls/Pdf` «Prenotazioni (Excel/PDF)», `ExpiriesPage.registry.exportMenu.*` «Scadenze (Excel/PDF)»; Registro voli e Contabilità avevano già il pattern. Titoli: foglio istruttori da `InstructorsPage.cardTitle` («Elenco istruttori») a `.title` («Istruttori», `exports.service.ts:501`); `ExpiriesPage.dashboard.heading` «Scadenze»; `CashReportPage.title` «Report di cassa». Le 14 intestazioni lette in §D. `.export-menu-panel .pop-row > .btn{ white-space: nowrap }` (`airops.css`): con le voci nuove «Estratto conto (Excel)», «Prenotazioni (PDF)» e «Scadenze (Excel)» andavano a capo nel popover di 180px (misurato: 54px contro 35px di una riga), e la Contabilità ci andava già; ora il popover cresce fino alla voce più lunga, 180px resta il minimo.
- **`keep` (AC 9)**: `BookingsPage.list.actions.keep` «No, mantienila» / «No, keep it»; in `booking-labels.ts` il campo `actions.dismiss` diventa `actions.keep`, letto da `bookings-table.tsx` nei due punti della conferma (desktop e sheet). `list.actions.dismiss` resta il «Annulla» dei form (`booking-labels.ts:144`).
- **`CFI` (AC 18)**: `LogbookPage.mobile.instructorLine` «Istruttore: {name}» / «Instructor: {name}», letta con `t.raw` (argomento riempito nel client, come `filtersCount`) in `logbook/page.tsx`; `logbook-console.tsx#instructorLabel` la usa per la sotto-riga della card e per la seconda riga del desktop, che ora chiama la stessa funzione. `grep -rn "CFI" src --include=*.tsx` fuori dai commenti = 0. La colonna della persona del Registro voli parte da 200px (era 150px): con «Istruttore: Bianchi Luca» (166px) la riga andava in ellissi a 1280 su 4 voli demo su 4; 200px lasciano al nome i 17 caratteri che lasciava prima.
- **Intestazioni compatte del Registro voli**: «Dec»/«Att» restano (colonne da 55px, «ATTERRAGGI» ne misura 71) con `title` e uno `sr-only` col nome completo, riusando `LogbookPage.mobile.takeoffs/landings`; «Part → Arr» diventa «Tratta», la parola di sheet ed export (§H D-a).
- **Card del conto personale (AC 5)**: `MyAccountPage.cardHeading` «Movimenti» / «Movements» (`my-account/page.tsx`, commento riallineato); l'H1 è «Estratto conto», la card della scheda persona resta «Estratto conto».
- **Pagine d'errore (AD-4, AC 19)**: `src/app/[locale]/not-found.tsx` (server, `getTranslations('ErrorPages')`), `src/app/[locale]/[...rest]/page.tsx` (catch-all, `setRequestLocale` + `notFound()`), `src/app/[locale]/error.tsx` (client, `useTranslations`, `reset`), e un `error-card.tsx` condiviso: la cornice della pagina di accesso (`--bg`, brand, `.card`, `.page-title-block`, `.btn`), link alla Panoramica via `Link` di `@/i18n/navigation`. Schema next-intl letto prima (WebFetch di `amannn/next-intl` `docs/.../environments/error-files.mdx`): il `NextIntlClientProvider` del layout passa già i messaggi al client (next-intl 4), quindi nessuna modifica al layout. Il catch-all è la route meno specifica: `/it/dashboard/fleet` ed `/en/dashboard/logbook` 200, `/api/v1/health` 200 (provato nell'e2e); `/api/v1/qualcosa` resta 401 senza sessione (il proxy risponde prima).
- **Compenso (AD-5, AC 20)**: `instructor-compensation.service.ts:501` `Compenso istruttore {inizio} – {fine}`; unit `instructor-compensation.service.test.ts` asserisce la descrizione (rossa sul codice vecchio, verde dopo). Seed: `seed-demo.ts` passa da `recordPayout` (già nuovo), `seed-load.ts` diceva già «Compenso istruttore». Movimento letto nell'Excel «Registro cassa» e «Transazioni» e nella Contabilità 375 del gemello.
- **Riga di conferma del fuori servizio (decisione PO su review 19.12a F2)**: `confirmQuestion` = «Mettere fuori servizio il velivolo? {count, plural, =0 {Nessuna prenotazione coinvolta} one {# prenotazione coinvolta} other {# prenotazioni coinvolte}}», `confirmQuestionUnknown` = «Mettere fuori servizio il velivolo? Conteggio delle prenotazioni non disponibile» (inglese invariato, AD-2). In `aircraft-editor.tsx` lo stato armato non gira più la `.fld` in riga: la colonna impila la domanda (`data-testid="out-of-service-question"`, nuovo) sopra una riga `display:flex; gap:8` con Conferma e Annulla. Misure (scratchpad `b/confirm-geom.cjs`, editor reale, testo della domanda sostituito nel DOM con ogni forma):

  | Larghezza | Domanda | Righe della domanda | Conferma / Annulla | Sulla stessa riga | Conferma copre il trigger |
  |---|---|---|---|---|---|
  | 1280 | `=0` 66 car., `one` 60, `other` 61-62 | 1 (15px) | x 781 / x 870, y 611 | sì, ogni conteggio | striscia di 13,6px in basso a sinistra |
  | 1280 | «… non disponibile» 80 car. | 2 (30px) | x 781 / x 870, y 626 | sì | no (−1,6px) |
  | 375 | tutte le forme | 2 (30px) | x 20 / x 109, y 621 | sì | striscia di 7,56px |

  Prima, con la domanda corta della 19.12a, Annulla andava a capo da solo; con la frase intera andava a capo la coppia (review F2). La guardia `event.detail > 1` resta com'era.

### §D — Matrice di lettura (AD-1): superfici, email, export

- **Ambiente**: build di produzione dei gates, `:3100` sul gemello `airmanager_1912b` (migrate + `db seed` + `seed:demo`: 4 velivoli, 14 persone, 24 voli, prenotazioni in ogni stato, compenso, quota, scadenze in ogni fascia); `AUTH_URL`/`APP_URL` del gemello su `:3100`. Script `playwright-core` nello scratchpad (`b/matrix.cjs`, `b/panels.cjs`, `b/logbook-panels.cjs`, `b/confirm-geom.cjs`, `b/badge-width.cjs`, `b/btnw.cjs`, `b/export-wrap.cjs`, `b/error-pages.cjs`, `b/exports.cjs`). Per ogni pagina: screenshot a pagina intera, testo del `body` cercato per sintassi ICU (`{…}`) e per le varianti vietate, elementi col testo tagliato (`overflow: hidden` con `scrollWidth > clientWidth`).
- **Superfici**: le voci del `route-registry` per ogni ruolo che le vede (admin 10, istruttore 5, pilota 5, allievo 5) a 1280 e 375 = **50 pagine**; pannelli: editor Velivoli con la riga di conferma a 1280/375, tabella prenotazioni con la conferma di annullamento e il menu Esporta, sheet prenotazione 375, Registro voli con la modale di eliminazione, l'editor «Registra volo» e lo sheet 375, Scadenze con i filtri 375 e il menu Esporta, Piloti con il menu Esporta, scheda persona col menu Esporta, menu profilo 375, Estratto conto del pilota col menu Esporta a 1280/375, I miei compensi a 1280/375. Pagine d'errore: 404 anonimo it/en, 404 autenticato, errore di render it/en, a 1280 e 375, chiaro e scuro (24 screenshot).
- **Esiti**: 0 sintassi ICU a schermo in 50 pagine; varianti vietate a schermo solo nei **dati** demo («velivolo fermo tutto il giorno» è il motivo di un fuori servizio del seed, «Admin AirManager» è il nome dell'utente). Testi tagliati introdotti dalla story e corretti: la riga «Istruttore: …» del Registro voli (colonna a 200px, §C), il badge currency dei Piloti (colonna a 128px, sotto), le azioni delle prenotazioni (colonna a 200px, sotto), le voci del menu Esporta (nowrap, §C), il chip dei Piloti 375 (stato in testa, §H D-c). Testi tagliati **preesistenti**, non toccati: email nella colonna da 160px dei Piloti, sotto-righe mobile con tratte e descrizioni lunghe (dati), il prompt «Confermi l'annullamento di …» nella colonna azioni (già in ellissi a 180px), «Tecnam P92 Echo Super» nella card Velivoli 375.
  - Badge currency: «Currency scaduta» e «Currency · 12 gg» misurano 126,38px (`.badge` 10,5px mono) contro la colonna «Ultimo volo» da 110px, che li tagliava (`expiry-rules-currency.spec.ts:439` rosso nella prima serie): colonna a 128px (`pilots-console.tsx`).
  - Azioni delle prenotazioni: «Segna come effettuata» 132,5px e «Segna come assente» 122,8px come `.btn.mini` portavano le quattro azioni di una riga approvata da 2 a 4 righe (riga da 135,7px) nella colonna da 180px; a 200px tornano su 2 righe, coi 20px presi dal minimo della colonna persona (160 → 140px), quindi il minimo della riga non cambia (`bookings-table.tsx`).
- **Email (AC 11)**, lette in Mailpit dalle serie e2e: invito «Hai ricevuto un invito ad AirManager» / «Hai ricevuto un invito per accedere ad AirManager…», rifiuto prenotazione, fuori servizio («Fuori servizio: oltre il 02/11/2026 previsto, rientro da definire»), saldo negativo, reimpostazione password, promemoria scadenza («La tua scadenza «…» scade …»), riepilogo «Riepilogo avvisi di scadenza», email di prova SMTP (già bilingue, invariata). `templates.test.ts` asserisce oggetto dell'invito, oggetto del riepilogo, le virgolette «» del promemoria e «Fuori servizio: rientro da definire».
- **Export (AC 12)**, i 14 export di `exports.service.ts` scaricati in italiano dal gemello e aperti (`b/exports.cjs`; Excel letti con exceljs, PDF letti come documento): fogli «Persone», «Velivoli», «Voli», «Prenotazioni», «Estratto conto», «Registro cassa», «Transazioni», «Scadenze», «Istruttori»; PDF «Estratto conto» (totali «Saldo all'inizio del 01/01/2000» / «Saldo alla fine del 31/12/2099»), «Report di cassa», «Voli», «Scadenze», «Prenotazioni». Intestazioni coerenti col glossario («Velivolo», «Persona», stati al femminile, «Compenso orario», «Totale dovuto», «Registrata»). Separatori data-ora «04/11/2026, 09:00» e descrizioni con data ISO («Volo I-B412 2026-10-29 — 0:45») restano: fuori scope (I18N-4, I18N-1).

### §E — Discriminanze con sha256

Tutte su una **copia isolata** (`scratchpad/b/mut`: `rsync` di repo senza `node_modules`/`.next`/`.git`, `node_modules` in symlink, `.env` della copia puntato al gemello e a `:3200`, `playwright.config.ts` della copia su `PORT = 3200`, `turbopack.root: '/'` nel `next.config.ts` della copia perché Turbopack rifiuta un `node_modules` in symlink fuori dalla radice), mai in place. Log separato con `TMPDIR` della copia.

- **(a) guardia AD-3**: `AircraftPage.newAircraft` = «Aggiungi aeromobile» nella copia → `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts` rosso: `× no Italian value uses a forbidden variant` con `+ "AircraftPage.newAircraft: \"Aggiungi aeromobile\" matches /[Aa]eromobil/ — use velivolo (row Aircraft)"` (1 failed, 32 passed). Ripristino: `messages/it.json: OK` (`f5c4f5e7c36fc7d48d901a073666228c9d4addf54872bd0d0e7a519002f08f0d`, uguale al repo), 33 passed.
- **(b) catch-all rimosso** e **(c) guardia `event.detail` rimossa**, in un'unica build mutante della copia (i due mutanti toccano percorsi indipendenti: nessuno dei due test passa dal codice dell'altro). Prima: `[...rest]/page.tsx` `7de4aefcff792a0f17713ac5ff5bdb7826c6cac0a4d10cbdbe818d1a9cc13d97`, `aircraft-editor.tsx` `75529001d058e430408ca3daebbb8702bdfd61fcc9d8381350943b0b86972b28`. `curl /it/ppr` sulla mutante: 404 con «This page could not be found» (6 occorrenze), 0 «Pagina non trovata». `scripts/e2e.sh start --project=chromium e2e/error-pages.spec.ts e2e/aog-impact-email.spec.ts -g "Localized 404|double click|double TAP"` della copia: **4 failed** (`E2E_EXIT=1`), ogni tentativo col suo messaggio:
  - `error-pages.spec.ts:40` e `:48`: `Expected: "Pagina non trovata"` / `Received: "404"` (la pagina di Next);
  - `aog-impact-email.spec.ts:397` (MAJOR-2 desktop): `Error: a double click at 821.7265625,784.09375 must not reach the grounding endpoint` (il punto della striscia sotto la domanda);
  - `aog-impact-email.spec.ts:475` (doppio tocco 375): `Error: a double tap must not reach the grounding endpoint`.
  - La metà del test che non dipende dalla geometria (un click con `detail: 2` su Conferma) provata da sola sulle due build (`b/detail2.cjs`): build vera `:3100` → **0 POST**, stato `OPERATIONAL`; build mutante `:3200` → **1 POST**, stato `OUT_OF_SERVICE`.
  - Ripristino della copia: `sha256sum -c` → `[...rest]/page.tsx: OK`, `aircraft-editor.tsx: OK`; gli stessi due hash verificati anche sul repo (OK). Server `:3200` fermato.

### §F — Conteggio delle varianti prima/dopo e diff di `en.json` riga per riga (AD-2)

**§3.1** (`6525be2` → dopo): aeromobile 21 → 0; aereo 2 → 0; payout 4 → 0; AOG 4 → 0; fermo 5 → 0; Ratings nel testo 11 → 0 (restano i valori esatti «Ratings», R5); impatt 0 → 0; finestra 8 → 0; (EUR 3 → 0; ... 3 → 0; CFI 1 → 0; dashboard 1 → 0; sidebar 1 → 0; card 1 → 0; reset 1 → 0; alert 2 → 0; slot 2 → **1**; turnaround 1 → 0; timeline 1 → 0; top N 1 → 0; Successivo 3 → 0; Diario 1 → 0; Le mie transazioni 3 → 0; Il mio conto 1 → 0; Admin 2 → 0; Esporta XLS/Excel 2 → 0; login 2 → 0; Sei stato 2 → 0; Non current 1 → 0; gg/g 7 → 0; aeroporto 1 → 0; certificat 2 → 0. L'unico 1 è il **nome** dell'argomento `{slot, plural, …}` in `SettingsPage.scheduling.hint` (la regex di §3.1 legge il valore grezzo): a schermo non c'è, e la guardia di AD-3, che legge il testo dell'albero ICU, non lo vede. Nessuna eccezione in `BANNED_EXCEPTIONS`.

**Guardia AD-3** (`src/i18n/messages.test.ts`, describe «the Italian catalogue follows the glossary (story 19.12b, AD-3)»): tabella `BANNED` con le 23 regex di AD-3, ognuna col termine da usare e la riga del glossario; `/Ratings/` ammessa solo sul valore esatto «Ratings». Si applica al **testo** di ogni valore italiano (`textOf`: le parti letterali dell'albero ICU, rami plural/select compresi, ogni argomento letto come `1`), così un nome di argomento non è testo e «top {n}» si legge «top 1». Fallisce con chiave, valore, regex e termine.

**`messages/en.json`**: 15 valori cambiati, 14 chiavi nuove (parità), 1 rimossa (parità):
- `shell.nav.myAccount`, `shell.pageTitle.myAccount`, `MyAccountPage.title` «My transactions» → «Account statement»; `DashboardPage.pilotLanding.accountLink` «My account» → «Account statement» (AD-2, PO Q-19.12-a).
- `DashboardPage.overview.dispatchButton` «Dispatch flight» → «Log flight» (AD-2, M13a).
- `DashboardPage.overview.title` «Operational overview» → «Operations overview», il testo di `shell.pageTitle.overview` (AD-2, M13b).
- `Export.button` «Export Excel» → «Export»; `BookingsPage.list.exportXls`/`Pdf` «Export XLS/PDF» → «Bookings (Excel/PDF)»; `ExpiriesPage.registry.exportMenu.xlsLabel`/`pdfLabel` «Excel (.xlsx)»/«PDF» → «Expiries (Excel/PDF)» (AD-2, etichette di export del pattern D-2).
- `ExpiriesPage.dashboard.heading` «All expiries» → «Expiries» e `CashReportPage.title` «Financial report» → «Cash report»: titoli del PDF/Excel che AD-6 fa coincidere con la voce del menu («Expiries (PDF)», «Cash report (PDF)», già così) — parte del pattern D-2, §H D-g.
- `AccountStatementPage.period.openingAt`/`closingAt` «Opening/Closing balance on {date}» → «Balance at the start/end of {date}»: richiesta esplicita della review 19.11 F6 («IT ed EN»), fuori dall'elenco chiuso di AD-2, §H D-g.
- Chiavi nuove: `MyAccountPage.cardHeading`, `BookingsPage.list.actions.keep`, `LogbookPage.mobile.instructorLine`, `AircraftPage`/`PilotsPage`/`InstructorsPage.exportMenu.xlsLabel`, `AccountStatementPage.exportMenu.xlsLabel`/`pdfLabel`, `ErrorPages.*` (6). Rimossa: `Export.buttonPdf`.
- Non cambiano in inglese (AD-2): il ruolo «Admin», la domanda di conferma («Confirm the grounding? …»), tutte le altre copy italiane cambiate.

### §G — Delta test (unit ed e2e, prima/dopo; spec toccati e perché)

- **Unit**: 2 210 → **2 211** (+1: la guardia AD-3 in `messages.test.ts`). Asserzioni nuove dentro test esistenti: descrizione del compenso (`instructor-compensation.service.test.ts`, AC 20, rossa sul codice vecchio prima del cambio), resa di `expiryExpired` (`requirement-failures.test.ts`, AC 14), virgolette «» e «Fuori servizio: rientro da definire» (`templates.test.ts`). Allineati: `templates.test.ts` (oggetti di invito e riepilogo), `exports.service.test.ts` (stati al femminile, «Velivolo»/«Persona», titoli «Report di cassa»/«Scadenze», totali dell'estratto conto it/en), `messages.test.ts` (resa della domanda di conferma). `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` → 84 file, 2 211 passed (nessun import di service nuovo).
- **e2e**: atteso **604 → 606** (+2, `e2e/error-pages.spec.ts`: 404 anonimo it/en con link all'accesso; 404 autenticato su un indirizzo inesistente, anche sotto `/dashboard`, su `/it/ppr` e in inglese, link alla Panoramica, route vere e `/api/v1/health` ancora 200). Spec toccati (41):
  - `'invitato'` → `'invito'` (AC 21, 20 occorrenze): `account-statement-period`, `api-v1`, `booking-requirements`, `bookings` (3), `expiry-rules-currency`, `flight-delete-update`, `flight-log`, `flights`, `home-dashboard`, `mobile-logbook`, `mobile-planning`, `mobile-self-public`, `my-account`, `my-compensation`, `people-management`, `typeahead-pickers`, `user-management`, `aog-impact-email`. `grep -rn "'invitato'" e2e` = 0.
  - Testo sotto test aggiornato (AD-7): stati delle prenotazioni (`bookings`, `booking-requirements`), stati e giorni delle scadenze (`expiries-registry`, `expiry-dashboard`, `expiry-registration`, `expiry-rules-currency`, `mobile-expiries-movements`), currency (`expiries-registry`, `expiry-rules-currency`, `mobile-registries`), fuori servizio (`aircraft-out-of-service-until`, `aircraft-status-hours`, `mobile-registries`), requisiti (`flights`, `flight-requirements`), `CFI` (`flights`, `mobile-logbook`), errori di profilo e compenso (`person-save`, `person-profiles`), statistiche mobili (`mobile-reports`), saldi del periodo (`account-statement-period`), stati delle visite (`settings`, `expiry-types`), Registro voli (`flight-delete-update` «Elimina», `flight-no-charge` KPI «Addebiti», chiavi dello sheet in `mobile-logbook`), chiavi dello sheet di Contabilità (`mobile-billing`), toast e bottone dell'accesso (`user-management`), conferma della messa fuori servizio (`aog-impact-email`).
  - Testo usato solo come locatore → testid o ruolo scoped: `account-statement.spec.ts:104` → `kpi-balance`; `pdf-exports.spec.ts` e `mobile-planning.spec.ts` → `export-menu-pdf`/`-xls`; **28** `page.getByRole('button', { name: 'Registra volo' })` → `getByTestId('flight-form-submit')` (testid nuovo sul submit di `flight-editor.tsx`) in `flights` (15), `flight-requirements` (5), `mobile-logbook` (4), `aircraft-out-of-service-until` (2), `flight-no-charge`, `typeahead-pickers`: con «Registra volo» anche sul bottone della pagina e sulla Panoramica, il nome page-level trovava due bottoni (§H D-e). Etichette cambiate dei campi: `instructor-compensation` («Compenso orario (€/h)»), `accounts-topups` e `account-adjustments` («Importo (€…)»), `membership-fee` e `mobile-membership-fee` (combobox «Persona»), `my-account` (link scoped alla navigazione e H1 «Estratto conto»), `cash-report` («Report di cassa (PDF)»).
  - `aog-impact-email.spec.ts:391` riscritto (decisione PO su F2, vincolo MAJOR-2): misura domanda, Conferma, Annulla e asserisce la disposizione (coppia sotto la domanda, sulla stessa riga, Annulla dopo Conferma); doppio clic nativo sul bordo sinistro e al centro del trigger e, se Conferma copre una striscia del trigger, al centro di quella striscia; poi un click con `detail: 2` su Conferma, che vale in qualunque disposizione; controllo negativo da tastiera. Commento del test touch riallineato alla misura nuova (7,56px). Rosso sul mutante senza la guardia (§E).
  - `mobile-billing.spec.ts` AC 8: il popover desktop non misura più **esattamente** 180px; ora asserisce `w ≥ 180`, posizione, z-index, padding e una riga per voce (§H D-f).
  - Asserzioni `not.toContainText` rilette (AD-7): `person-detail.spec.ts:187` (`not 'Registrato'` sulla riga dei movimenti: resta vera e significativa, il movimento non porta stato); `mobile-logbook.spec.ts:389` (`'Annullato'`: nessuno stato di volo, resta vera); `mobile-logbook.spec.ts:488` riscritta su `'Istruttore:'` perché `'CFI'` sarebbe stata vera per costruzione; `flight-delete-update.spec.ts:288` (`'Annullato'`, resta vera).
- **Serie e2e** (build di produzione, `CI=1 E2E_REUSE_SERVER=1 scripts/e2e.sh`, `JOBS_SECRET` non segnaposto, log in `scratchpad/b/e2e-*.log`):
  1. `--project=chromium` sul DB `airmanager` (reset delle 17:53): **539 passed, 1 flaky, 5 failed**. I 5 erano miei e sono stati corretti: due letterali «0 g»/«80 g» rimasti in `expiries-registry` (sotto-riga mobile), il badge currency tagliato (`expiry-rules-currency.spec.ts:439`, colonna a 128px), `membership-fee` (file modificato mentre la serie girava: il worker aveva caricato la copia vecchia col nome `'Pilota'`), `mobile-billing:348` (chiave «Pilota» dello sheet). Flaky `mobile-planning.spec.ts:325`: `ECONNRESET` su `POST /api/v1/aircraft`, la classe nota (keepAlive, TD della 19.10), verde al retry.
  2. Stesso DB, build con le correzioni: **546 passed, 4 failed**: `bookings.spec.ts:526`, `datetime-picker.spec.ts:129`, `home-dashboard.spec.ts:229`, `pdf-exports.spec.ts:326`, tutti per **volume del DB** dopo due suite intere sullo stesso database: il picker della persona carica le prime 100 persone per cognome (`OPTIONS_PAGE_SIZE`) e la persona nuova («Pilota-… Prenota») non c'era più («Nessun risultato.» nello snapshot), la prima pagina delle prenotazioni non conteneva più la prenotazione nuova. Nessuno legge una copy della story.
  3. Gemello fresco `airmanager_1912b_e2e`, 10 spec: i quattro del punto 2 (`bookings`, `datetime-picker`, `home-dashboard`, `pdf-exports`), i quattro rossi del punto 1 (`expiries-registry`, `expiry-rules-currency`, `membership-fee`, `mobile-billing`), `error-pages` e `aog-impact-email`: **115 passed, `E2E_EXIT=0`**.
  4. Catena serializzata sullo stesso gemello, `--no-deps --workers=1` (`settings`, `booking-window`, `reports`, `treasury-settings`, `billing-global`, `mobile-metar`, `mobile-overview-overflow`, `mobile-membership-fee`, `mobile-settings`, `booking-requirements-catalogue`, `aog-overview-count`): **54 passed, `E2E_EXIT=0`**.
  5. **Serie finale**, build dei gates finali (comprende la correzione del menu Esporta), gemello fresco `airmanager_1912b_e2e3` (migrate + seed): `--project=chromium` **552 passed, 0 failed, 0 flaky, `E2E_EXIT=0`** in 20,5 min; poi la catena serializzata `--no-deps --workers=1` sullo stesso gemello: **54 passed, `E2E_EXIT=0`**. Insieme coprono i 606 test attesi (552 + 54). Log del server di produzione: 0 `MISSING_MESSAGE`/`IntlError`/`FORMATTING_ERROR`/`INVALID_KEY`. Una serie intermedia sul gemello `airmanager_1912b_e2e2` è stata fermata a 117 passed, 0 failed per ricostruire dopo la correzione del menu Esporta (log `e2e-series5-stopped.log`).
- **DB gemelli creati** (tutti miei, nessuno resettato da me fra quelli altrui): `airmanager_1912b` (seed + demo, lettura UI), `airmanager_1912b_e2e`, `airmanager_1912b_e2e2` (serie fermata a 117/552 per ricostruire dopo la correzione del menu Esporta), `airmanager_1912b_e2e3` (serie finale). `airmanager`, `airmanager_audit`, `airmanager_load` mai resettati né migrati.

### §H — Deviazioni motivate

- **D-a — `LogbookPage.table.route` «Tratta»** invece di «Partenza → Arrivo», e «Dec»/«Att» compatti con nome completo. La condizione di §L è falsa (intestazioni senza nome accessibile), ma la proposta non entra: «ATTERRAGGI» misura 71px in una colonna da 55px e andrebbe in ellissi. «Tratta» è la parola dello sheet e dell'export ed entra nei 150px; per «Dec»/«Att» quattro righe di codice in `logbook-console.tsx` danno `title` e uno `sr-only` col nome completo (riusano `LogbookPage.mobile.takeoffs/landings`). Oltre §3.3 («solo JSON»), è il modo minimo per rendere vera la condizione di §L.
- **D-b — `ExpiriesPage.registry.mobile.empty` «Nessuna scadenza da mostrare.»** invece della stessa frase del desktop: `mobile-expiries-movements.spec.ts` (AC 1/7/12 della 15.x) vuole che lo stato vuoto mobile **non** ripeta la stringa desktop, perché le due facce stanno nello stesso DOM e un `getByText` page-level della stringa desktop deve trovare un solo nodo (`expiry-dashboard.spec.ts:135` lo usa in strict mode). Il desktop dice «Nessuna scadenza in questo intervallo.» come da §L.
- **D-c — Chip delle scadenze nella riga mobile dei Piloti con lo stato in testa**: «Scadenza superata · {doc}» e «{days} gg · {doc}» invece di «{doc} · scadenza superata» / «{doc} · {days} gg». A 375 il chip è largo 180px e il nome del tipo lo riempie: misurato «Visita medica classe 2 · …», cioè lo stato tagliato via proprio dove serve. Stato in testa, nome dopo: l'ellissi taglia il nome, che la riga ripete nello sheet. Stesse parole del glossario («scadenza superata», D-9; «N gg», D-3, come la cella «Giorni rimasti»).
- **D-d — `AircraftPage.editor.availability.untilHint`** «… Se vuoto, il rientro è da definire.» invece di «Vuoto = …»: stessa forma che §L dà a `metarStationHint` («Se vuota, si usa …»). **`SettingsPage.membership.feeHint`** perde «Vale 12 mesi dal pagamento.» perché §L lo porta nel sottotitolo della sezione: detto due volte a 3 righe di distanza.
- **D-e — testid `flight-form-submit`** e 28 locatori: §L dà «Registra volo» al bottone della pagina (`newEntry`) e alla Panoramica (`dispatchButton`, AD-2/M13a), che è anche il testo del submit dell'editor. Con l'editor aperto i bottoni con quel nome sono due e il locatore page-level va in strict mode. Testid sul submit (non esisteva, AD-7), nessun `^=` su `flight-form` in `e2e/`.
- **D-f — layout toccato per non tagliare o mandare a capo i testi nuovi (AC 22)**, ognuno misurato prima e dopo (§D): colonna «Ultimo volo» dei Piloti 110 → 128px; colonna persona del Registro voli min 150 → 200px; colonne della tabella prenotazioni persona 160 → 140px e azioni 180 → 200px (minimo della riga invariato); voci del menu Esporta su una riga (`white-space: nowrap`, il popover cresce oltre i 180px) con l'asserzione di `mobile-billing.spec.ts` AC 8 riscritta da «w = 180» a «w ≥ 180 e una riga per voce». La 18.5 resta padrona di layout e comportamento: questi sono gli aggiustamenti minimi perché le parole nuove non rompano le righe che c'erano.
- **D-g — Inglese oltre l'elenco chiuso di AD-2**: `AccountStatementPage.period.openingAt`/`closingAt` (richiesta esplicita della review 19.11 F6, «IT ed EN»); `ExpiriesPage.dashboard.heading` e `CashReportPage.title` (titoli che AD-6 fa coincidere con la voce del menu, già «Expiries (PDF)»/«Cash report (PDF)»).
- **D-h — modifiche nuove oltre §L** (B.2), ognuna col suo perché; più `BookingsPage.calendar.toolbar.prev/next` («Periodo precedente/successivo», nome accessibile delle frecce del calendario) e `ExpiriesPage.registry.status.within*` («≤ 7 gg», D-3: il badge è un contesto compatto come il controllo segmentato sopra, che dice già «≤ 7 gg»).
- **D-i — conteggi della story**: 14 export, non 15; `'invitato'` 20 occorrenze in 18 spec, non 19 in 17 (§A).
- **D-j — commenti e titoli dei test**: i titoli dei test che citano la copy vecchia («Il mio conto», «Effettuato/Assente/Annulla», «Esporta PDF/XLS») non sono rinominati, per non cambiare l'identità dei test nei report; i commenti di codice toccati da un cambio (`my-account/page.tsx`, `logbook-console.tsx`, `aircraft-editor.tsx`, `expiries-registry.spec.ts` intestazione della fixture) sono riallineati, gli altri no.
- **D-k — `CLAUDE.md`**: la riga «Copy italiana» dice ora che `messages.test.ts` vieta anche le varianti del glossario (fatto cambiato da questa story).
- Nessuna assunzione di dominio nuova implementata: le copy dal significato da decidere sono domande in fondo (Completion Notes).

### §I — Verifica UI (screenshot)

Screenshot in `/tmp/claude-1000/-home-admin-AirManager/af449493-cc12-476a-90ac-651351693579/scratchpad/b/ui/` (non committati), build di produzione dei gates, gemello con i dati demo:
- **Matrice** (`m-<ruolo>-<pagina>-<1280|375>.png`, 50 pagine a pagina intera): admin (Panoramica, Pianificazione, Piloti, Istruttori, Velivoli, Scadenze, Registro voli, Contabilità, Statistiche, Impostazioni), istruttore (Panoramica, Pianificazione, Scadenze, Registro voli, I miei compensi), pilota e allievo (Panoramica, Pianificazione, Scadenze, Registro voli, Estratto conto). Report `ui/matrix-all-light.json`.
- **Pannelli** (`p-*.png`): tabella prenotazioni con le azioni su due righe e la conferma «Sì, annulla / No, mantienila» (`p-bookings-cancel-confirm-1280`), menu Esporta di prenotazioni, scadenze, piloti, scheda persona, estratto conto del pilota a 1280 e 375, sheet prenotazione 375, Registro voli con la modale «Elimina volo» e l'editor «Registra volo», sheet volo 375, filtri delle scadenze 375, Piloti col badge «Currency scaduta» / «Currency · 26 gg» sotto la data, menu profilo 375, barra in alto 1280.
- **Riga di conferma** (`confirm-real-1280`, `confirm-real-375`): domanda intera su una riga a 1280 e su due a 375, Conferma e Annulla sotto, a sinistra.
- **Pagine d'errore** (`err-404-it-anon-*`, `err-404-en-anon-*`, `err-404-it-auth-*`, `err-500-it-*`, `err-500-en-*`, a 1280 e 375, chiaro e `-dark`): 404 dalla catch-all e dal `notFound()`; l'errore di render provocato su un secondo server della stessa build (`:3300`) con `DATABASE_URL` verso un database inesistente e il cookie di sessione di `:3100` (stesso `AUTH_SECRET`): `/it/dashboard` risponde 500 con «Si è verificato un errore», `/en/dashboard` con «Something went wrong», e «Riprova»/«Vai alla Panoramica». A 375 il nome «AirManager» accanto al marchio è nascosto dalla regola mobile di `.brand-name`, come nella pagina di accesso.
- Tab bar del pilota a 375 con «Estratto conto» (`m-pilot-dashboard-375`): cinque voci su una riga, nessun taglio (M6).
- Menu Esporta dopo la correzione (`f-export-billing-1280`, `f-export-bookings-1280`, `f-export-expiries-1280`, `f-export-my-account-375`, misure di `b/export-wrap.cjs`): ogni voce su una riga (35px), popover da 180px su Velivoli, Piloti, Istruttori e Registro voli, 185-206px sugli altri. `f-person-not-found-1280`: il `notFound()` della scheda persona con un id inesistente mostra la stessa pagina 404 italiana. Con sessione, `GET /api/v1/does-not-exist` e `/api/v2/x` rispondono 404 (HTML), `/it/dashboard/people/does-not-exist` 404.

### §J — Gate ed esiti verbatim

Baseline su `6525be2`: 2 210 unit (2 211 meno l'unico test nuovo; coincide col Review Record della 19.12a, F4: 2 209 → 2 210). Gate finale, sui file del commit `feat` `66fd139` (stesso codice delle serie finali di §G):
```
PASS  lint (38s)
PASS  typecheck (5s)
PASS  test (20s) — Tests  2211 passed (2211)
PASS  build (57s)
```

### Completion Notes List

- §L applicato per intero (202 righe, con le varianti motivate in §H D-a…D-d), 34 modifiche nuove dalla passata (B.2), guardia AD-3 con mutante rosso, §3.1 a zero (l'unico 1 è un nome di argomento), pagine d'errore localizzate con e2e e mutante rosso, riga di conferma ridisegnata con la guardia MAJOR-2 provata rossa sul mutante in entrambe le metà del test.
- Quattro aggiustamenti di layout, minimi e misurati, perché le parole nuove non taglino o non mandino a capo righe che prima stavano su una riga (§H D-f). Il resto del layout resta alla 18.5.
- Per il reviewer, i punti più fragili: (1) il test MAJOR-2 (`aog-impact-email.spec.ts:397`) dipende da una striscia di 13,6px solo per la sua metà geometrica, la metà con `detail: 2` vale in ogni disposizione; il test touch a 375 conta su una sovrapposizione di 7,56px; (2) il popover del menu Esporta non è più largo esattamente 180px (asserzione di `mobile-billing` AC 8 riscritta); (3) i chip mobili dei Piloti con lo stato in testa (D-c) sono una scelta oltre §L; (4) le colonne ritoccate di Piloti, Registro voli e Prenotazioni; (5) il catch-all `[...rest]` cattura anche `/api/...` autenticato con un `[locale]` falso: risponde 404 dalla `notFound()` del layout, come prima rispondeva il 404 di Next.
- Non fatto qui (sessione principale, istruzione del team lead): arbitro completo su DB fresco (AC 24), `HANDOFF.md`, `sprint-status.yaml` e la nota per la 18.5 (AC 25).
- **Domande aperte per il PO** (non implementate):
  1. **Sezione Piloti**: la lista contiene tutte le persone (il sottotitolo dice già «N persone», D-5), ma la card dice «Anagrafica piloti», il bottone «Aggiungi pilota», l'editor «Nuovo pilota» e il toast «Pilota creato.». A) resta così: «Piloti» è il nome della sezione; B) solo la card diventa «Anagrafica» e il resto resta; C) la sezione diventa «Persone». Raccomandazione: **A**, ed eventualmente B nella 18.5.
  2. **Saluto della Panoramica**: istruttore «Buongiorno, {name}» a ogni ora, pilota e allievo «Ciao, {name}». A) «Ciao, {name}» per tutti; B) saluto secondo l'ora; C) resta. Raccomandazione: **A** (una riga di JSON, it ed en).
  3. **Riepilogo avvisi di scadenza**: la riga «{tipo}: è scaduta da N giorni» accorda con «scadenza» sottintesa; con «Rating SEP» si legge «Rating SEP: è scaduta». A) resta; B) una chiave a parte per il riepilogo, «scadenza superata da N giorni». Raccomandazione: **B**, in una story piccola (due chiavi, un template).
  4. **`Export.pdfTooLarge`**: «… o usa l'export Excel» usa «export» come nome. A) resta; B) «… o scarica l'Excel». Raccomandazione: B, bassa priorità.

### File List

- `messages/it.json`, `messages/en.json`
- `src/i18n/messages.test.ts`
- `src/app/[locale]/not-found.tsx` (nuovo), `src/app/[locale]/error.tsx` (nuovo), `src/app/[locale]/error-card.tsx` (nuovo), `src/app/[locale]/[...rest]/page.tsx` (nuovo)
- `src/app/[locale]/dashboard/bookings/booking-labels.ts`, `bookings-table.tsx`
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx`, `fleet/page.tsx`
- `src/app/[locale]/dashboard/instructors/instructors-console.tsx`, `instructors/page.tsx`
- `src/app/[locale]/dashboard/logbook/flight-editor.tsx`, `logbook-console.tsx`, `logbook/page.tsx`
- `src/app/[locale]/dashboard/my-account/page.tsx`
- `src/app/[locale]/dashboard/people/[id]/page.tsx`
- `src/app/[locale]/dashboard/pilots/page.tsx`, `pilots-console.tsx`
- `src/styles/airops.css`
- `src/server/services/exports.service.ts`, `exports.service.test.ts`
- `src/server/services/instructor-compensation.service.ts`, `instructor-compensation.service.test.ts`
- `src/server/adapters/mail/templates.test.ts`
- `src/lib/requirement-failures.test.ts`
- `e2e/error-pages.spec.ts` (nuovo) e i 41 spec di §G
- `CLAUDE.md`
- `_bmad-output/implementation-artifacts/19-12b-passata-testi.md` (questo record, Status, Tasks)

### Change Log

- 2026-11-03 — `feat(19.12b)` `66fd139`: passata dei testi (§L e 34 modifiche nuove), guardia del glossario, export a pattern unico, «No, mantienila», «Istruttore: …», card «Movimenti», compenso istruttore, pagine d'errore localizzate, riga di conferma del fuori servizio ridisegnata, quattro aggiustamenti di layout misurati, e2e e unit allineati. `docs(19.12b)`: questo Dev Agent Record, Status review.

---

## Nota per la sessione principale — riperimetrare la 18.5

La 18.5 «Righe, tab e lessico» (`docs/superpowers/plans/2026-09-10-epics-16-18-audit.md:333-336`, `sprint-status.yaml` `18-5-righe-tab-lessico`) cita le voci dell'audit mobile M4, M6, M11 e M13. **Il lessico di M6, M11 e M13a-c passa alla 19.12b**: l'etichetta della quinta tab («Estratto conto» al posto di «Le mie transazioni»), il sottotitolo di Pianificazione, «Pianifica volo» → «Registra volo», il nome unico «Velivoli» fra menu e H1, «Ricarica» al posto di «Registra». Alla 18.5 restano layout e comportamento: righe che mostrano il dato che distingue (M4), la tab bar che sta su una riga a prescindere dall'etichetta (M6, dimensione del font: audit MOB-2), la seconda tab del pilota che non sia la console admin (M11), l'azione primaria nello sheet prenotazione (M13d). Aggiornare la descrizione della 18.5 in `sprint-status.yaml` e nel piano quando la 19.12b si chiude.

---

> **Aggiunta della sessione principale (2026-11-03, review 19.11 F6)**: includere nella passata l'etichetta dell'estratto conto «Saldo iniziale al {from}» (esclude i movimenti di quel giorno) vs «Saldo finale al {to}» (li include): renderle non ambigue (es. «Saldo all'inizio del {from}» / «Saldo a fine {to}»), IT ed EN.


> **Aggiunta della sessione principale (2026-11-03, review 19.12a F2, DECISIONE PO)**: la domanda di conferma della messa fuori servizio (`AircraftPage.editor.availability.confirmQuestion` e `confirmQuestionUnknown`) torna alla **frase intera** prevista in §3.2 della 19.12a. Le due forme sono «Mettere fuori servizio il velivolo? {count, plural, =0 {Nessuna prenotazione coinvolta} one {# prenotazione coinvolta} other {# prenotazioni coinvolte}}» e «Mettere fuori servizio il velivolo? Conteggio delle prenotazioni non disponibile». Questa decisione annulla la forma corta «Mettere fuori servizio? …» introdotta dalla 19.12a (D-a), che resta solo fino a qui. L'inglese segue AD-2 di questa story.
> **La riga di conferma va ridisegnata** (`aircraft-editor.tsx` ~:981, riga flex con `flexWrap: 'wrap'`). Oggi, con 49-54 caratteri, Annulla va a capo da solo; con 66 caratteri va a capo la coppia Conferma/Annulla, e il centro di Conferma esce dal trigger. Le misure sono nel report `19-12a-review-report.md` F2. Dopo il ridisegno domanda, Conferma e Annulla devono avere una disposizione stabile, a 1280 e a 375, per ogni conteggio e anche nel caso «non disponibile».
> **Vincolo da non perdere**: decisione PO 6 / review MAJOR-2, cioè un doppio clic sul trigger arma il secondo passo e non conferma mai (guardia `event.detail` nell'editor). `aog-impact-email.spec.ts:392` oggi la prova con una precondizione geometrica: il centro di Conferma sta dentro il trigger. Se il ridisegno separa Conferma dal trigger, il test va riscritto in modo che resti discriminante, per esempio con un doppio clic nel punto dove nasce Conferma in qualunque layout, oppure con un click sintetico con `detail: 2` su Conferma. Il test va mostrato rosso su un mutante senza la guardia. La tecnica la scelgono writer e dev. Va aggiornato anche il letterale `:429`.
