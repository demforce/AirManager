---
baseline_commit: d45d308
---

# Story 16.10: Riprovare i moduli con importi senza ripetere l’operazione

Status: **in-review** — 2026-11-25. Contratto: sprint-status, decisione PO sulla review 16.6b F1.

## Criteri di accettazione

1. I sette moduli con `Idempotency-Key` usano lo stesso ciclo: due ricariche (Scheda e Piloti), rettifica, Nuova transazione, compenso istruttore, registrazione volo e quota.
2. Una caduta di rete, una risposta incompleta o un 409 `IDEMPOTENCY_IN_PROGRESS` non azzerano la chiave. Il messaggio italiano e inglese distingue il salvataggio in corso dall’incertezza dell’esito. Non si avviano ritentativi automatici.
3. Reinserendo gli stessi campi nella stessa scheda, anche dopo chiusura/riapertura del pannello o ricarica della pagina, il ritentativo ripete la medesima richiesta con la medesima chiave. Un rifiuto conclusivo e un successo chiudono l’intento. Un invio successivo, anche identico ma intenzionale, può quindi essere un’operazione nuova.
4. Deroghe di quota e volo: un consenso esplicito può seguire il 422 conclusivo; se la deroga è già stata inviata e il suo esito è incerto, il ritentativo con i medesimi dati conserva la deroga già autorizzata. Non trasforma una richiesta ordinaria in attesa in una nuova deroga. Il PUT di modifica del volo resta fuori perimetro.
5. Il browser conserva solo digest, chiave opaca e stato della deroga, non i dati del form. L’invio è circoscritto all’utente, al percorso e ai campi. Se lo storage è indisponibile, resta la tutela nel documento corrente, non dopo averlo ricaricato. La chiusura della scheda o un’altra scheda/browser non sono un ripristino garantito.

## Record di sviluppo

- Il submitter comune conserva il tentativo anche in caso di 5xx, corpo JSON incompleto e perdita della sessione. La risposta viene letta prima di scartare la chiave. Un mismatch esplicito invita a verificare il registro, senza avviare un altro addebito.
- Nessuna migrazione, nessun cambiamento all’API. Client e server mantengono i rispettivi confini. `@noble/hashes` era già nella lockfile (1.8.0); dichiarato direttamente per calcolare il digest anche sugli ambienti LAN in HTTP privi di Web Crypto SubtleCrypto.
- **7 unit aggiunti** su trasferimento del tentativo, risposte conclusive e incerte, deroga, isolamento e fallback; **2289 unit** e gate (lint, tipi e build) verdi. **69 browser mirati** passati, inclusi i quattro tentativi con una sola chiave, ricarica della pagina, replay, un solo addebito e un solo rinnovo nel DB sintetico. L’arbitro completo è ancora in corso.
