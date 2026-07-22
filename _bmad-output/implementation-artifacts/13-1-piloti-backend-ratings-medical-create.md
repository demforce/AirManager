---
baseline_commit: eab82c8
---

# Story 13.1: Piloti backend — separazione ratings/visite mediche + creazione persona one-step

Status: ready-for-dev

## Story

As a admin/staff dell'aviosuperficie,
I want che le abilitazioni (ratings) e le visite mediche siano due categorie distinte del catalogo scadenze, e che una persona possa essere creata in UN SOLO passaggio (anagrafica + profili + accesso/ruoli + ratings e visita medica con relative scadenze),
so that il flusso "Aggiungi pilota" non richieda più il doppio step creazione→modifica e i ratings non siano mai testo libero.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 1). Story SOLO backend + card Impostazioni: il form unico UI arriva con la 13.2 — l'editor pilota esistente e le e2e correnti devono restare verdi.

**Ratifiche PO (AskUserQuestion 2026-07-22)**:
- **R-13.1-a**: visite mediche = card SEPARATA in Impostazioni ("Visite mediche", stesso CRUD della card Abilitazioni), voci esistenti e scadenze già registrate MIGRATE automaticamente, nessuna perdita dati.
- **R-13.1-b**: le abilitazioni d'insegnamento dell'istruttore usano lo STESSO catalogo (ambito ISTRUTTORI) CON scadenze come i piloti; il campo free-text `InstructorProfile.ratings` sparisce.
- **R-13.1-c**: nel form/API di creazione one-step, la data di scadenza è OBBLIGATORIA per ogni rating/visita medica selezionati.

## Acceptance Criteria

1. **(Modello kind)** `ExpiryType` guadagna `kind ExpiryTypeKind @default(RATING)` con `enum ExpiryTypeKind { RATING MEDICAL }`. Migrazione hand-written (pattern TD-2, doc-comment in testa al SQL): ADD enum + colonna con default, poi `UPDATE` data-migration che marca `kind='MEDICAL'` le voci mediche esistenti (match sui nomi del seed "Visita medica…" — verificare i nomi ESATTI in `prisma/seed.ts` e usare un match robusto documentato nel SQL). Le righe `Expiry` collegate NON si toccano (referenziano gli stessi type id — R-13.1-a). `prisma/seed.ts` aggiornato: le voci mediche nascono `kind: 'MEDICAL'` sui DB freschi.
2. **(Catalogo filtrabile)** `expiry-types.service.ts` e `GET /api/v1/expiry-types` accettano un filtro `kind` opzionale; default = TUTTI (nessuna rottura dei consumer esistenti — inventariarli: pagina scadenze, editor, seed/fixtures e2e). Zod + registrazione OpenAPI aggiornate in `src/lib/schemas/` + `registry.ts`.
3. **(Card Impostazioni)** La card "Abilitazioni" (`settings/ratings-card.tsx`) mostra e crea SOLO `kind=RATING`; nuova card "Visite mediche" (stesso pattern UI, stesso servizio con `kind=MEDICAL`) accanto ad essa in `/dashboard/settings`. i18n IT/EN speculari nello stesso commit.
4. **(Instructor ratings dal catalogo)** `InstructorProfile.ratings` (free-text) viene RIMOSSO: migrazione drop-column (il testo libero esistente NON è migrato automaticamente — decisione R-13.1-b: il parsing dei nomi sarebbe inaffidabile; le abilitazioni si riassegnano dai chip. Dichiararlo nel doc-comment della migrazione). Le abilitazioni istruttore vivono come righe `Expiry` su tipi con ambito ISTRUTTORI (già supportato da `ExpiryScope`). Sweep dei consumer del campo free-text (editor/pagina istruttori, schemi, OpenAPI, seed, test) — inventario PRIMA della rimozione (lezione 12.12/12.13).
5. **(API creazione one-step)** `POST /api/v1/people` esteso con blocchi opzionali:
   - `profiles`: attivazione pilot/student/instructor coi campi già previsti dalle route `profiles/*` esistenti;
   - `expiries`: array `{ expiryTypeId, expiresAt }` con `expiresAt` OBBLIGATORIA per ogni voce (R-13.1-c), tipi validati (esistenti, attivi, ambito coerente coi profili attivati);
   - `access`: `{ email, roles }` — crea l'utente e invia l'invito (riuso del flusso `POST /api/v1/users`); richiede `users.manage`: attore senza permesso che passa `access` → 403 (il blocco NON è ignorato silenziosamente).
   Tutto in UNA transazione atomica (fallimento di qualunque blocco → nessuna persona creata); l'email di invito parte SOLO post-commit (pattern fire-and-forget esistente). Il comportamento del create SENZA blocchi nuovi resta identico a oggi (retro-compatibilità: l'editor esistente continua a funzionare). OpenAPI aggiornata.
6. **(Rename Certifications→Ratings)** Stringhe utente: EN "Certifications"→"Ratings", IT resta "Abilitazioni" dove già corretto; rename cheap degli identificatori direttamente toccati (es. `CertificationsSection`). NESSUN redesign dell'editor (13.2).
7. **(Test)** Unit: composite create (atomicità: fallimento user-create → rollback persona; expiresAt mancante → 422; tipo inesistente/inattivo → 422; access senza `users.manage` → 403; create semplice invariato), filtro `kind`, marcatura seed. e2e API-level in `e2e/api-v1.spec.ts`: one-step create completo (persona+profilo+expiry+utente, invito visibile in Mailpit); suite esistente resta verde.
8. **(Gates)** `npm run gates` verde; migrazioni applicate su DB fresco senza errori; e2e locali toccate verdi.

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-22)

- **Modelli**: `ExpiryType` `prisma/schema.prisma:1250-1278` (name/scope/isActive/blocksBooking/validityMonths), `Expiry` `:1314-1346` (`@@unique(personId, expiryTypeId)`, stato derivato via `computeExpiryStatus` — NON persistito), `InstructorProfile.ratings` `:125` (string free-text). Le visite mediche del seed sono ExpiryType normali (commento `schema.prisma:1238-1239`).
- **Catalogo**: card `src/app/[locale]/dashboard/settings/ratings-card.tsx` (pattern da replicare per la card medical), service `expiry-types.service.ts`, route `/api/v1/expiry-types`.
- **Creazione oggi**: `POST /api/v1/people` = solo anagrafica (`pilot-editor.tsx:202-313` mode `new`); profili via `PUT/POST /api/v1/people/{id}/profiles/{tipo}`; accesso via `POST /api/v1/users` `{email, roles, personId}` (`pilot-editor.tsx:897-901`), ADMIN-only (`canManageUsers`). Il composite deve DELEGARE alla logica esistente (estrazione di helper condivisi se le service function aprono transazioni proprie — pattern `getFlightTotals` 12.8: helper condivisi, mai duplicazione).
- **Migrazioni**: pattern hand-written con doc-comment; l'`UPDATE` data-migration nello stesso file della colonna è sicuro (nessun valore enum appena aggiunto viene usato in default — la trappola PG16 della 12.2 non si applica qui, ma VERIFICARE su DB fresco, non assumerlo).
- **RBAC INVARIATO**: nessun permesso nuovo; il composite riusa `people.manage`-equivalente esistente (verificare il permesso esatto sulla route people) + `users.manage` per il blocco access.
- **Ambiente locale**: macchina Fedora dell'utente — Postgres+Mailpit via `docker compose` del repo (Mailpit API `http://localhost:8025/api/v1/messages`); lockfile SOLO via `npx -y npm@10` (questa story non tocca dipendenze); MAI `playwright install`; porta 3000 libera prima delle e2e (`fuser -k 3000/tcp`); e2e SOLO in foreground; commit APPENA i gates passano (lezione runway 12.3/12.5). Utenti seed admin@/staff@/… (password in `SEED_ADMIN_PASSWORD` di `.env`).
- **Skill obbligatorie**: leggere e seguire `.claude/skills/karpathy-guidelines/SKILL.md` (assunzioni esplicite, semplicità, modifiche chirurgiche, criteri verificabili).
- **Commit**: `feat(13.1): ratings/medical split + one-step person create API`. Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>. Niente push.

## Fuori scope dichiarato

- Form unico UI e chips (13.2); editor scadenze inline (13.2); pagine people/{id} (13.3).
- Qualunque cambiamento alla logica `blocksBooking`/stati derivati delle scadenze (funziona identica per entrambi i kind).
- Migrazione automatica del testo libero instructor ratings (R-13.1-b: riassegnazione manuale).

## Dev Agent Record

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
