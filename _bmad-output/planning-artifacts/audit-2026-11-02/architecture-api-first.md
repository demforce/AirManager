ARCHITECTURE AUDIT: API-FIRST CLAIM AND UI DUPLICATION (read-only, judged at HEAD a598b26)

VERDICT: the claim is only half true. Reads skip the API: server-rendered pages call the services directly. Writes go through the API. 21 of the 46 service functions that pages read from have no API route, so a Flutter client can't reach that data.

NUMBERS
- Dashboard page.tsx files: 14. 13 import @/server/services/* directly (47 import lines). 0 fetch /api/v1 for data: all 17 /api/v1 refs are export download links.
- 'use client' files: 58. 26 of them call fetch, 62 call sites in total.
- Of those 62 calls: 13 GET (typeahead or lazy detail loads), 49 writes (POST 27, PATCH 9, PUT 8, DELETE 3, PUT/POST 2).
- Server actions: 1 (logout, layout.tsx:155).
- router.refresh() after writes: 54 calls in 19 files. Data is re-read through the server pages, not the API.
- Service functions read by pages with no route: 21 / 46.
- API responses checked against their schemas: 0 (handler.ts:494 returns the raw service result).
- Shared error parser parseApiError (src/lib/api-field-errors.ts:31): used in 10 of the 26 fetching files; 16 hand-roll it; 34 inline code === 'X' checks in 10 files.
- Fetch calls with no try/catch in the enclosing function: 49 / 62 (heuristic). Only 1 finally in all UI code.
- Fetch boilerplate repeated: 'Content-Type': 'application/json' x38, body: JSON.stringify x36, .json() casts x29.

GIANT COMPONENTS
(lines / useState / useEffect / useCallback / useRef / fetch / top-level components / main body. useMemo is 0 in all of them. All but page.tsx are client files.)
- billing-console        1598 / 28 / 2 / 1 / 8 / 3 / 1 / 1347
- pilot-editor           1386 / 26 / 4 / 0 / 6 / 6 / 10 / -
- flight-editor          1167 / 22 / 0 / 0 / 2 / 5 / 1 / 876
- dashboard/page (server) 1160 / - / - / - / - / 0 / 4 render functions / renderAdminOverview 508
- logbook-console        1102 / 11 / 2 / 1 / 3 / 1 / 1 / 887
- aircraft-editor        1093 / 19 / 2 / 0 / 1 / 6 / 5 / -
- scadenze-console       1010 / 14 / 1 / 1 / 1 / 3 / 3 / 594
- bookings-table          959 / 11 / 1 / 1 / 3 / 1 / 1 / 791
- schedule                898 /  4 / 0 / 1 / 4 / 0 / 1 / 638
- pilots-console          860 /  9 / 2 / 1 / 3 / 2 / 2 / 534
- instructors-console     755 / 13 / 2 / 1 / 1 / 3 / 5 / 201
16 client files are over 400 lines.

FINDINGS

H1 - Reads bypass the API (VERIFIED, High).
Pages read through services. The API is used only by client-side writes, typeahead searches and export links.
Fix: every page read gets a GET route on the same service, plus a test checking the two stay in sync.

H2 - Some roles can't get their data from the API (VERIFIED, High).
- A pilot has only self.read + bookings.manage.own (rbac.ts:107).
- GET /aircraft requires aircraft.manage (aircraft.service.ts:119). The list of bookable aircraft (bookings.service.ts:1484) and of active instructors (:1514) are self.read but have no route. A mobile pilot therefore can't fill in a new booking.
- An instructor's own pay (instructor-compensation.service.ts:325) has no route, and GET /instructor-compensation needs finance.manage (:213).
- Data that exists only in the web pages: the pilots-page data (listPilotsPageData - routes mention it only in comments, users/route.ts:10), logbook totals (getFlightTotals), expiry counters (getExpiryTierCounts), currency per person (listCurrencyByPerson), fleet hours (sumFlightMinutesByAircraft), billing summary (getBillingSummary).
- settings/treasury is PUT-only.
Fix: add GET routes for these, scoped to the caller's own data.

M1 - API responses are never checked against their schemas (VERIFIED, Medium-High).
apiRoute has no responseSchema option, and 0 tests parse a response with one. The OpenAPI response shapes are documentation only, so drift would break a Flutter client that was generated from them.
Fix: an optional responseSchema, parsed in dev and test.

M2 - Pages convert service data to wire shape by hand, duplicating what the API does (VERIFIED, Medium).
- page.tsx:380-395 and bookings/page.tsx:388-403 are byte-identical except for one variable name.
- bookings-table.tsx:35-55 re-declares BookingStatusDto/BookingRowDto, which already exist in schemas/bookings.ts:92-164.
- logbook/page.tsx:155-162 converts Date fields to strings by hand, which GET /flights does implicitly.
- Also: expiries/page.tsx:41 (toExpiryDto), pilots/page.tsx:77 (PilotRow at pilots-console.tsx:49 vs personListItemSchema, people.ts:92), fleet/page.tsx:100-118.
- {id, firstName, lastName} option lists are mapped 6 times across 5 pages.
Fix: one shared mapper per resource in src/lib, used by both the page and the route.

M3 - No shared client fetch helper (VERIFIED, Medium).
Nothing like src/lib/api-client* exists. Many handlers set a busy flag, await the fetch, then clear the flag. If the network fails, the flag stays set and the error is swallowed: billing-console.tsx:414, smtp-card.tsx:71, aircraft-editor.tsx:769, logbook-console.tsx:490, booking-transition.ts:103.
- Error readers are duplicated: errorCodeOf exists as identical copies in pilot-editor.tsx:128 and aircraft-editor.tsx:207, plus errorBodyOf (edit-booking-form.tsx:92) and readBookingApiError (booking-transition.ts:45).
- The booking error-code-to-message mapping exists 3 times (new-booking-form.tsx:365, edit-booking-form.tsx:190, booking-transition.ts:49). The last one lacks the "out of service until <date>" wording.
Fix: one apiFetch() that returns {ok, data, error: ParsedApiError}.

M4 - Billing adjustments sent without an Idempotency-Key (VERIFIED, Medium, money).
The same endpoint POST /people/{id}/account/adjustments is called with the key and a try from account-section.tsx:752, but without either from billing-console.tsx:416, on both the desktop and phone paths. A network retry could record an adjustment twice.
Fix: use useIdempotencyKey in billing-console.tsx too.

M5 - Filter, URL and pagination boilerplate copied (VERIFIED, Medium).
- useDebouncedCallback: 5 copies (3 byte-identical: billing:81, logbook:68, scadenze:60; variants in pilots-console:139, fleet-console:107).
- The buildFilterQuery / navigate / handleFilterChange / handleReset / open-dismiss-apply filter panel block: 3 copies (billing:326-690, logbook:281-471, scadenze:260-326).
- pageHref: 7 copies. The pager markup (registry-pagination): 6 copies.
- closeSheet: 13 copies.
Fix: a useUrlFilters hook and a <Pager> component.

M6 - Desktop/mobile duplication, 3 examples (VERIFIED, Medium).
- Billing: the network calls are shared (postAdjust/postReverse/postReclassify). Validation and state are not: 16 desktop-modal useState vs 8 sheet useState, and submitAdjust vs submitSheetAdjust (:426 vs :579) are near-identical.
- Bookings: postBookingTransition is shared, but the "deny with reason" flow exists 3 times and behaves differently. Desktop bookings-table.tsx:306 shows a generic error, the phone sheet :348 shows the server's message, and mobile-pending-bookings.tsx:141 shows both a toast and an inline error.
- Logbook and pilots: the desktop row builds the route inline as "A -> B" (logbook-console.tsx:667), while mobile uses flightRouteLabel -> "A->B" (mobile-logbook.ts:33); submitCancel/submitSheetCancel are twins. On Pilots, currencyBadgeOf (pilots-console.tsx:325) re-encodes the tier rule from pilotRowFlag (mobile-registries.ts:76).
- There are 10 "phone twin" handlers across 6 files.
- What is shared: 9 src/lib/mobile-*.ts modules (611 lines of pure formatters).

L1 - Default dates use UTC (VERIFIED, Low-Medium).
todayDateOnly exists 5 times as new Date().toISOString().slice(0,10) (pilots-console:758, account-section:161, flight-editor:244, instructors-console:443, transaction-editor:73). That is the UTC date, though instructors-console.tsx:442 documents it as browser-local. Between midnight and 02:00 Rome time, forms default to yesterday.
Fix: one shared local-date helper.

L2 - Smaller copies (VERIFIED, Low).
- Section component: 3 identical copies (pilot-editor:212, instructor-editor:107, aircraft-editor:346).
- ArchiveSection: 2 copies of 53 lines.
- Initials helper: 4 versions (layout.tsx:50 and billing-console.tsx:245 are identical).
- People-search fetchers against /api/v1/people: 5.
- Top-up form schema and submit: 2 copies (pilots-console.tsx:737, account-section.tsx:574).
- Cents to editable text: 7 sites with two decimal-separator conventions ("." vs ",").
- Ad-hoc Intl.DateTimeFormat: 9 uses in 4 files, beyond lib/time.

L3 - Client/server boundary (VERIFIED, Low).
- No client file imports server or Prisma code at runtime, and none pulls in exceljs or @react-pdf.
- 3 type-only imports cross the boundary: pilots-console.tsx:25 and pilot-editor.tsx:26 from @/generated/prisma/client; billing-panels-mobile.tsx:25 from a service.
- 5 client files import runtime values from schema modules that load zod-to-openapi. Its code is in a browser chunk: .next/static/chunks/1esf6e77qpwrs.js, 23 KB. That build is from today and includes the uncommitted settings work.
Fix: keep form schemas apart from the OpenAPI-registered modules.

Scratch files (a HEAD snapshot and measurement scripts) are in /tmp/claude-1000/-home-admin-AirManager/3d06ddd1-b828-45ca-bf7a-109f0d9fa254/scratchpad/audit/arch/. Nothing in the repo was modified.
