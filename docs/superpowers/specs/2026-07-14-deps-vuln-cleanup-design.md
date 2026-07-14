# Dependency vulnerability cleanup — design

**Date:** 2026-07-14
**Status:** approved (user, 2026-07-14)
**Scope decision:** fix real vulnerabilities; accept exceljs install-time deprecation warnings and the next/postcss moderate finding.

## Problem

`npm install` reports 6 deprecation warnings and `npm audit` reports 10 vulnerabilities (9 moderate, 1 high).

Root-cause analysis:

| Finding | Root cause | Fixable? |
|---|---|---|
| **nodemailer <=9.0.0 (high, 6 CVEs incl. SMTP command injection)** | direct dep `nodemailer@7.0.13`; also flagged via `@auth/core`/`next-auth` chain | Yes — bump to 9.0.3 |
| uuid <11.1.1 (moderate) | `exceljs@4.4.0` (latest) pins `uuid@8` | Yes — scoped override |
| @hono/node-server <1.19.13 (moderate) | `prisma@7.8.0` (latest) → `@prisma/dev` (dev-only CLI tooling) | Yes — override |
| postcss <8.5.10 (moderate) | pinned inside `next@16.2.10` (latest stable); fix exists only in 16.3 canaries | **No** — accepted |
| Deprecation warnings: rimraf@2, glob@7, inflight, fstream, lodash.isequal | all transitive under `exceljs@4.4.0`, which is the newest release | **No** — accepted (upstream) |

`npm audit fix --force` is explicitly rejected: it would downgrade prisma to 6.x and next to 9.x.

## Change

**`package.json` only** (plus `package-lock.json`). No source changes expected.

1. `nodemailer`: `7.0.13` → **`9.0.3`** (dependencies). `@types/nodemailer` stays at `8.0.1` (latest published; our adapter uses only the stable `createTransport`/`sendMail` surface).
2. New `overrides` block:

```json
"overrides": {
  "nodemailer": "$nodemailer",
  "exceljs": { "uuid": "^11.1.1" },
  "@hono/node-server": ">=1.19.13"
}
```

Rationale per override:

- `"nodemailer": "$nodemailer"` — `next-auth@5.0.0-beta.31` (latest beta) and `@auth/core@0.41.2` declare an *optional* peer `nodemailer: ^7.0.7`; without the override, installing 9.0.3 trips ERESOLVE. Our auth flow never uses @auth/core's nodemailer integration (email goes through our own `src/server/adapters/mail/smtp-mail-sender.ts`), so aligning the peer edge is safe.
- `"exceljs": { "uuid": "^11.1.1" }` — scoped to exceljs; fixes the uuid CVE and removes the uuid deprecation warning. uuid 11 keeps CommonJS named exports, so exceljs's `require('uuid')` continues to work.
- `"@hono/node-server": ">=1.19.13"` — semver-compatible patch bump; only consumer is `@prisma/dev` (dev-only).

## Expected outcome

- `npm audit`: 10 → **2** findings (the accepted next→postcss chain; self-clears when Next 16.3 stable lands — re-check at the next routine Next upgrade).
- Install deprecation warnings: 6 → **5** (uuid gone; the remaining 5 are exceljs-upstream, accepted).

## Verification

1. `npm install` completes with no ERESOLVE errors.
2. `npm audit` shows exactly the 2 accepted postcss/next findings.
3. `npm run gates` passes (lint + typecheck + vitest + build).
4. `npm run test:e2e` passes — email/login is a core flow touched by the nodemailer major bump; Excel export tests cover the uuid override.

## Error handling / rollback

- If nodemailer 9 breaks typecheck against the v8 types: fix locally at the adapter boundary (`smtp-mail-sender.ts`, one file).
- Anything else: revert is a single-commit `package.json` + lockfile revert.

## Explicitly out of scope

- Replacing exceljs (would be a mini-epic; only benefit is silencing install-time warnings).
- Overriding Next's pinned postcss (Next pins it deliberately; risk to CSS build output outweighs a non-exploitable-here XSS finding).
- `npm audit fix --force`.
