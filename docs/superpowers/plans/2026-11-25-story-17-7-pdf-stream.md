# Story 17.7 PDF Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace react-pdf with pdfkit 0.20.2 while retaining the export contract, improving throughput, and explaining export caps in the three report screens.

**Architecture:** A synchronous pdfkit writer lays out measured rows and starts a new A4 page before a row can cross the footer. It yields between pages and buffers the document for the existing route response; the existing service controls ACL and caps. Server pages compare the total from the exact export filter with the shared cap and pass localized unavailable text to the existing ExportMenu.

**Tech Stack:** Next.js 16, TypeScript, pdfkit 0.20.2, Vitest, Playwright, PostgreSQL synthetic load database.

**Spec:** `_bmad-output/implementation-artifacts/17-7-export-pdf-stream.md`

## Global Constraints

- Preserve `PdfColumn`, `PdfTotal`, `PdfReportDocumentProps`, `renderReportPdf(): Promise<Buffer>` and existing services/ACL.
- Use pdfkit 0.20.2 and @types/pdfkit 0.17.7; remove @react-pdf; declare `serverExternalPackages`.
- Excel cap remains 10,000; choose the PDF cap from the widest 2,000-row benchmark, at most 10,000.
- Use only synthetic data, do not push, merge, deploy, weaken ACL, or contact real email services.
- Keep BMAD status pending independent review.

## Review Focus

- Long unbroken cell: wraps within its allotted width without colliding with the next cell.
- Tall row near a page boundary: moves intact to the next page.
- Empty report and totals near the bottom: keep the em dash and intact totals.
- Filters altered through the URL: unavailable message uses the same total/filter as the PDF route.
- A production bundle: resolves pdfkit and returns a real PDF, not just a passing unit mock.

---

### Task 1: Measure baseline and replace engine

**Files:** `scripts/perf/pdf-bench.ts`, `src/server/adapters/pdf/document.ts`, `src/server/adapters/pdf/document.test.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `ARCHITECTURE-SPINE.md`.

**Interfaces:** `renderReportPdf<T>(props: PdfReportDocumentProps<T>): Promise<Buffer>` remains the sole export adapter entry point.

- [ ] Generate five frozen synthetic report shapes and raster/text baseline, and run the old engine once at 2,000 rows.
- [ ] Add discriminating structure tests for page counts, footers, repeated headers, row boundaries, empty data, and long tokens; verify failures against isolated mutants.
- [ ] Install exact dependencies with npm 10 and implement measured pdfkit layout with per-page yield.
- [ ] Run adapter and unmodified service unit tests, and compare text/pages and raster output to baseline.
- [ ] Run `npm run gates` and record results.

### Task 2: Export caps and screen feedback

**Files:** `src/lib/export-caps.ts`, three report server pages and their consoles/tables, `messages/{it,en}.json`, affected tests.

**Interfaces:** Existing `ExportMenu` `pdfUnavailable`/`xlsUnavailable` props carry localized messages; no change to export routes.

- [ ] Set measured PDF cap and update any literal UI assumptions and fixtures.
- [ ] Add server-side cap comparison for logbook, bookings, and expiries using export-equivalent totals.
- [ ] Test below/above cap and filter parity without changing permissions.
- [ ] Run targeted browser tests at desktop/mobile widths.

### Task 3: Performance and integration evidence

**Files:** `scripts/perf/targets.json`, `scripts/perf/bench.mjs`, `scripts/perf/README.md`, story Dev Agent Record.

- [ ] Benchmark engine at 100/500/2,000/5,000/10,000 rows and endpoint five times after warm-up on synthetic load database.
- [ ] Run production build and full `scripts/e2e.sh` suite, including `pdf-exports.spec.ts`.
- [ ] Record raster comparisons, metrics, licenses, commands/exits, and all limits in the story; leave status pending independent review.
- [ ] Commit verified code and evidence locally without push.
