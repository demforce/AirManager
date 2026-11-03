# Glossario dell'italiano di AirManager

Ogni copy nuova in `messages/it.json` segue questo glossario; `src/i18n/messages.test.ts` controlla la parità dei due cataloghi (chiavi, argomenti, forme ICU) e, dalla story 19.12b, le varianti vietate.

Fonti: glossario A20 della CR `sprint-change-proposal-2026-11-01.md` §4.10, ratifica R5 dell'epic 13 («Ratings» come nome di sezione), decisioni PO del 2026-11-03 (Q-19.12-a…e), scelte D-1…D-17 della story 19.12a.

## Termini

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

## Regole

- **Giorni** (D-3): nei contesti compatti (badge, celle, sottotitoli) «7 gg», «12 gg fa», «tra 5 gg», con lo spazio fra numero e «gg»; nella prosa la parola piena col plurale ICU (`{days, plural, one {# giorno} other {# giorni}}`).
- **Stati di una scadenza** (D-4): al femminile, «Valida · In scadenza · Scaduta» (la scadenza, la currency, la visita); i contatori dicono «Scadute».
- **Tipografia** (D-8): i puntini sono il carattere «…», mai tre punti; virgolette basse «»; gli importi con «€», mai «EUR»; la pagina dopo è «Successiva»; gli intervalli di date «Dal» / «Al».
- **Nomi interpolati di genere ignoto** (D-9): una frase che contiene `{doc}`, `{typeName}` o simili non accorda con quel nome; si scrive al neutro («Visita medica: scadenza superata il …», non «scaduto il …»).
- **Plurali** (D-13, D-14): ogni numero che accorda un nome passa da ICU (`{count, plural, =0 {…} one {# …} other {# …}}`), mai da coppie di chiavi `…One`/`…Many` né da un `count === 1 ? … : …` nel codice. Se il valore è noto al server, `t(key, values)` nel server e stringa pronta al client; se il numero nasce nel client, `useTranslations(ns)` nel componente. **Mai** `t.raw` + `.replace` su un messaggio con `plural`/`select`: `t.raw` restituisce la sintassi ICU grezza e la mostra a schermo (lo vieta la guardia di `messages.test.ts`). `t.raw` resta ammesso per i template senza numero da accordare (`{date}`, `{reason}`).
- **Rating** (D-16): invariabile al plurale, maschile («i rating», «un rating scaduto»); «Ratings» con la maiuscola solo come nome della sezione o della categoria (R5).
- **Apostrofo e graffe in ICU**: in un messaggio ICU l'apostrofo seguito da `{` apre una citazione, quindi `dell'{name}` stampa `{name}` alla lettera e l'argomento sparisce senza errori di parse. «nell'ultimo giorno» va bene (l'apostrofo non precede una graffa); davanti a un argomento si riformula («del velivolo {name}») o si raddoppia l'apostrofo (`dell''{name}`). Il test di parità lo vede: l'argomento manca in italiano e c'è in inglese.
- **Inglese** (D-10): `messages/en.json` cambia solo per parità di chiavi e argomenti, per i plurali dove l'inglese inflette e per i refusi evidenti; ogni altra modifica è una scelta da motivare.
