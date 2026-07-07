import { OpenAPIRegistry, OpenApiGeneratorV31, type ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { z } from './zod-with-openapi';
import {
  accountOverviewSchema,
  accountStatementResponseSchema,
  listAccountMovementsQuerySchema,
  negativeBalancesResponseSchema,
  recordAdjustmentSchema,
  recordTopUpSchema,
} from './accounts';
import {
  aircraftListItemSchema,
  aircraftListResponseSchema,
  aircraftRateItemSchema,
  aircraftRateListResponseSchema,
  createAircraftRateSchema,
  createAircraftSchema,
  createHourMeterAdjustmentSchema,
  hourMeterAdjustmentListResponseSchema,
  listAircraftQuerySchema,
  listHourMeterAdjustmentsQuerySchema,
  setOutOfServiceSchema,
  updateAircraftSchema,
} from './aircraft';
import { forgotPasswordSchema, setPasswordSchema } from './auth-tokens';
import {
  cashCategoryItemSchema,
  cashCategoryListResponseSchema,
  cashMovementItemSchema,
  cashMovementListResponseSchema,
  cashReportQuerySchema,
  cashReportResponseSchema,
  createCashCategorySchema,
  listCashCategoriesQuerySchema,
  listCashMovementsQuerySchema,
  recordCashMovementSchema,
  renameCashCategorySchema,
  reverseCashMovementSchema,
} from './cash';
import { errorEnvelopeSchema, okResponseSchema } from './common';
import {
  cancelFlightSchema,
  correctFlightSchema,
  flightListResponseSchema,
  listFlightsQuerySchema,
  registerFlightResponseSchema,
  registerFlightSchema,
} from './flights';
import { meResponseSchema } from './me';
import {
  createPackageTypeSchema,
  listPackageTypesQuerySchema,
  packageTypeItemSchema,
  packageTypeListResponseSchema,
  updatePackageTypeSchema,
} from './package-types';
import { hourPackageItemSchema, hourPackageListResponseSchema, sellPackageResponseSchema, sellPackageSchema } from './packages';
import {
  createInstructorRateSchema,
  createPersonSchema,
  instructorProfileRequestSchema,
  instructorProfileSchema,
  instructorRateItemSchema,
  instructorRateListResponseSchema,
  listPeopleQuerySchema,
  personDetailSchema,
  personListItemSchema,
  personListResponseSchema,
  pilotProfileRequestSchema,
  pilotProfileSchema,
  studentProfileRequestSchema,
  studentProfileSchema,
  updatePersonSchema,
} from './people';
import { createUserSchema, listUsersQuerySchema, updateUserSchema, userListItemSchema, userListResponseSchema } from './users';

/**
 * OpenAPI registry (story 1.5, AD-1/AD-8): the single place that turns the
 * Zod schemas already living in `src/lib/schemas/*` into a runtime-generated
 * OpenAPI document, served at `GET /api/v1/openapi.json`. Nothing here
 * changes request/response *validation* — that stays in the route handlers
 * (`src/lib/api/handler.ts`) via the very same schemas; this module only
 * describes them for the spec.
 *
 * IMPORTANT (review 1.5 F1): every schema registered as a *component* via
 * `registry.register(name, schema)` MUST be built from the extended `z`
 * exported by `zod-with-openapi.ts` — `register()` throws
 * "zodSchema.openapi is not a function" on a schema built from plain
 * `'zod'`. `extendZodWithOpenApi` patches `ZodType.prototype` at call time,
 * so it only affects schema instances created *afterwards*; the wrapper
 * module guarantees the extension runs before any schema construction.
 * Only inline schemas passed to `registerPath` (e.g. `idParams`, health)
 * tolerate plain `'zod'`. An ESLint `no-restricted-imports` rule on
 * `src/lib/schemas/**` enforces the wrapper import.
 */
export const registry = new OpenAPIRegistry();

/**
 * Auth.js v5 (AD-10) session cookie set at login. The future Flutter client
 * (FR-42) will present the same signed JWT as an `Authorization: Bearer`
 * header once mobile auth ships — deliberately out of scope for this story
 * (Dev Notes: "niente auth con bearer token mobile").
 */
const cookieAuth = registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'authjs.session-token',
  description:
    'Auth.js v5 session cookie. The mobile client will authenticate with the same underlying JWT via a bearer token once that ships (out of scope here).',
});

const security = [{ [cookieAuth.name]: [] }];

// Named component schemas — nicer `$ref`s in the generated document than
// inlining every shape at every path.
registry.register('Error', errorEnvelopeSchema);
registry.register('Ok', okResponseSchema);
registry.register('Me', meResponseSchema);
registry.register('Person', personListItemSchema);
registry.register('PersonList', personListResponseSchema);
registry.register('PersonDetail', personDetailSchema);
registry.register('CreatePersonRequest', createPersonSchema);
registry.register('UpdatePersonRequest', updatePersonSchema);
registry.register('PilotProfileRequest', pilotProfileRequestSchema);
registry.register('PilotProfile', pilotProfileSchema);
registry.register('StudentProfileRequest', studentProfileRequestSchema);
registry.register('StudentProfile', studentProfileSchema);
registry.register('InstructorProfileRequest', instructorProfileRequestSchema);
registry.register('InstructorProfile', instructorProfileSchema);
registry.register('InstructorRate', instructorRateItemSchema);
registry.register('InstructorRateList', instructorRateListResponseSchema);
registry.register('CreateInstructorRateRequest', createInstructorRateSchema);
registry.register('Aircraft', aircraftListItemSchema);
registry.register('AircraftList', aircraftListResponseSchema);
registry.register('CreateAircraftRequest', createAircraftSchema);
registry.register('UpdateAircraftRequest', updateAircraftSchema);
registry.register('SetOutOfServiceRequest', setOutOfServiceSchema);
registry.register('CreateHourMeterAdjustmentRequest', createHourMeterAdjustmentSchema);
registry.register('HourMeterAdjustmentList', hourMeterAdjustmentListResponseSchema);
registry.register('AircraftRate', aircraftRateItemSchema);
registry.register('AircraftRateList', aircraftRateListResponseSchema);
registry.register('CreateAircraftRateRequest', createAircraftRateSchema);
registry.register('AccountOverview', accountOverviewSchema);
registry.register('RecordTopUpRequest', recordTopUpSchema);
registry.register('AccountStatement', accountStatementResponseSchema);
registry.register('RecordAdjustmentRequest', recordAdjustmentSchema);
registry.register('NegativeBalancesList', negativeBalancesResponseSchema);
registry.register('CashCategory', cashCategoryItemSchema);
registry.register('CashCategoryList', cashCategoryListResponseSchema);
registry.register('CreateCashCategoryRequest', createCashCategorySchema);
registry.register('RenameCashCategoryRequest', renameCashCategorySchema);
registry.register('CashMovement', cashMovementItemSchema);
registry.register('CashMovementList', cashMovementListResponseSchema);
registry.register('RecordCashMovementRequest', recordCashMovementSchema);
registry.register('ReverseCashMovementRequest', reverseCashMovementSchema);
registry.register('CashReport', cashReportResponseSchema);
registry.register('PackageType', packageTypeItemSchema);
registry.register('PackageTypeList', packageTypeListResponseSchema);
registry.register('CreatePackageTypeRequest', createPackageTypeSchema);
registry.register('UpdatePackageTypeRequest', updatePackageTypeSchema);
registry.register('HourPackage', hourPackageItemSchema);
registry.register('HourPackageList', hourPackageListResponseSchema);
registry.register('SellPackageRequest', sellPackageSchema);
registry.register('SellPackageResponse', sellPackageResponseSchema);
registry.register('RegisterFlightRequest', registerFlightSchema);
registry.register('RegisterFlightResponse', registerFlightResponseSchema);
registry.register('FlightList', flightListResponseSchema);
registry.register('CancelFlightRequest', cancelFlightSchema);
registry.register('CorrectFlightRequest', correctFlightSchema);
registry.register('User', userListItemSchema);
registry.register('UserList', userListResponseSchema);
registry.register('CreateUserRequest', createUserSchema);
registry.register('UpdateUserRequest', updateUserSchema);
registry.register('SetPasswordRequest', setPasswordSchema);
registry.register('ForgotPasswordRequest', forgotPasswordSchema);

const idParams = z.object({ id: z.string().meta({ description: 'User id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const personIdParams = z.object({ id: z.string().meta({ description: 'Person id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const aircraftIdParams = z.object({ id: z.string().meta({ description: 'Aircraft id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const flightIdParams = z.object({ id: z.string().meta({ description: 'Flight id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

const ERROR_DESCRIPTIONS: Record<number, string> = {
  401: 'Not authenticated (AD-8 `UNAUTHENTICATED`).',
  403: 'Forbidden — the actor lacks the required permission (AD-5).',
  404: 'The requested resource does not exist.',
  409: 'The request conflicts with the current state of the resource.',
  422: 'Validation failed (Zod schema or domain-level).',
};

/**
 * Standard AD-8 error responses reused across every documented path — every
 * endpoint can also fail unexpectedly, so 500 is always included (closes
 * story 1.3 review F2: even unmapped errors now have a documented,
 * leak-free envelope).
 */
function errorResponses(...statuses: Array<401 | 403 | 404 | 409 | 422>): Record<number, ResponseConfig> {
  const responses: Record<number, ResponseConfig> = {
    500: { description: 'Unexpected server error (AD-8 `INTERNAL_ERROR`).', content: jsonContent(errorEnvelopeSchema) },
  };
  for (const status of statuses) {
    responses[status] = { description: ERROR_DESCRIPTIONS[status], content: jsonContent(errorEnvelopeSchema) };
  }
  return responses;
}

function jsonContent(schema: z.ZodTypeAny) {
  return { 'application/json': { schema } };
}

// --- Paths ----------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  summary: 'Liveness check',
  tags: ['System'],
  responses: {
    200: { description: 'The service is up.', content: jsonContent(z.object({ status: z.literal('ok') })) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/me',
  summary: "Current user's own data",
  tags: ['Me'],
  security,
  responses: {
    200: { description: 'The caller.', content: jsonContent(meResponseSchema) },
    ...errorResponses(401, 404),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people',
  summary: 'List persons (paginated, searchable)',
  description: 'Search (`q`) matches first name, last name or email, case-insensitively. Archived persons are excluded unless `includeArchived=true` (AC 2).',
  tags: ['People'],
  security,
  request: { query: listPeopleQuerySchema },
  responses: {
    200: { description: 'A page of persons.', content: jsonContent(personListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people',
  summary: 'Create a person',
  tags: ['People'],
  security,
  request: { body: { content: jsonContent(createPersonSchema), required: true } },
  responses: {
    201: { description: 'The created person.', content: jsonContent(personListItemSchema) },
    ...errorResponses(401, 403, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}',
  summary: 'Get a single person (with full profile data)',
  description:
    'Includes the pilot/student/instructor profiles in full (story 2.2, AC 1) — `null` when a profile was never activated. Readable with `people.read` (any person) or "own" access: `self.read` plus a matching `personId` (story 2.3, AC 2).',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: 'The person, with its profiles.', content: jsonContent(personDetailSchema) },
    ...errorResponses(401, 403, 404),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/people/{id}',
  summary: 'Update a person (name, contact details, fiscal code)',
  tags: ['People'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(updatePersonSchema), required: true } },
  responses: {
    200: { description: 'The updated person.', content: jsonContent(personListItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/archive',
  summary: 'Archive a person',
  description: 'Soft-archive only (AC 2) — there is no physical delete endpoint for a Person.',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: 'The archived person.', content: jsonContent(personListItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/unarchive',
  summary: 'Restore a previously archived person',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: 'The restored person.', content: jsonContent(personListItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

/**
 * Profiles (story 2.2, AC 1/2, AD-11): implemented by a single dynamic
 * `[type]` route (`src/app/api/v1/people/[id]/profiles/[type]/route.ts`)
 * that validates `type` against `pilot`/`student`/`instructor` at runtime —
 * documented here as three literal paths, one per type, since each has a
 * distinct request/response body and that reads far better in the generated
 * spec than a single `oneOf`-discriminated path would.
 */
registry.registerPath({
  method: 'put',
  path: '/api/v1/people/{id}/profiles/pilot',
  summary: 'Activate or update the pilot profile',
  description: 'Creates the profile if absent; if present (active or deactivated), updates it and clears `deactivatedAt` (AC 2).',
  tags: ['People'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(pilotProfileRequestSchema), required: true } },
  responses: {
    200: { description: 'The activated/updated pilot profile.', content: jsonContent(pilotProfileSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/profiles/pilot/deactivate',
  summary: 'Deactivate the pilot profile',
  description: 'Soft-deactivation only — the row is never deleted (future epics reference it). Conflict if never activated or already deactivated.',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: 'The profile was deactivated.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/people/{id}/profiles/student',
  summary: 'Activate or update the student profile',
  description: 'Creates the profile if absent; if present (active or deactivated), updates it and clears `deactivatedAt` (AC 2).',
  tags: ['People'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(studentProfileRequestSchema), required: true } },
  responses: {
    200: { description: 'The activated/updated student profile.', content: jsonContent(studentProfileSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/profiles/student/deactivate',
  summary: 'Deactivate the student profile',
  description: 'Soft-deactivation only — the row is never deleted (future epics reference it). Conflict if never activated or already deactivated.',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: 'The profile was deactivated.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/people/{id}/profiles/instructor',
  summary: 'Activate or update the instructor profile',
  description: 'Creates the profile if absent; if present (active or deactivated), updates it and clears `deactivatedAt` (AC 2).',
  tags: ['People'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(instructorProfileRequestSchema), required: true } },
  responses: {
    200: { description: 'The activated/updated instructor profile.', content: jsonContent(instructorProfileSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/profiles/instructor/deactivate',
  summary: 'Deactivate the instructor profile',
  description: 'Soft-deactivation only — the row is never deleted (future epics reference it). Conflict if never activated or already deactivated.',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: 'The profile was deactivated.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/account',
  summary: "Get a person's prepaid account overview (balance + recent movements preview)",
  description:
    'Balance is always `SUM(AccountMovement.amountCents)` (AD-3) — there is no stored balance column. `account: null` means the person never activated a pilot/student profile (AC 1). `recentMovements` previews at most the 5 most recent entries — the full paginated statement is story 3.2. Readable with `people.read` (any person) or "own" access: `self.read` plus a matching `personId` (same rule as `GET /api/v1/people/{id}`, story 2.3).',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: "The person's account overview.", content: jsonContent(accountOverviewSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/account/top-ups',
  summary: 'Record a prepaid-account top-up',
  description:
    'Append-only (AD-3, story 3.1, AC 2/3) — in one transaction, upserts the `Account`, creates an immutable `AccountMovement` (TOP_UP) and its automatic `CashMovement` twin under the seeded "Ricariche" category. There is no update/delete endpoint for either ledger. Requires `finance.manage` (staff/admin) — never "own".',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(recordTopUpSchema), required: true } },
  responses: {
    200: { description: 'The account overview, refreshed after the top-up.', content: jsonContent(accountOverviewSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/account/movements',
  summary: "List a person's full account statement (paginated, most recent first)",
  description:
    'The full, paginated ledger (story 3.2) behind `GET /api/v1/people/{id}/account`\'s 5-entry preview. A person without an `Account` yet gets an empty page (`total: 0`), NOT a 404 — only an unknown person is. `actorEmail` (who registered the movement) is included ONLY when the caller has `people.read` (AC 2\'s operational detail for staff) — absent for a titolare reading their own statement. Readable with `people.read` (any person) or "own" access: `self.read` plus a matching `personId` (same rule as `GET /api/v1/people/{id}/account`).',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, query: listAccountMovementsQuerySchema },
  responses: {
    200: { description: "A page of the person's account statement.", content: jsonContent(accountStatementResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/account/adjustments',
  summary: 'Record a motivated adjustment (rettifica) on a person\'s account',
  description:
    'Append-only (AD-3, story 3.3, AC 1) — creates a NEW, independent `AccountMovement` (`ADJUSTMENT`); the original movement is never touched. `originalMovementId`, when given, links this adjustment to the movement it corrects and must belong to the same account (404 otherwise, never revealing another account\'s movement) and must not already have a linked adjustment (409). Triggers the negative-balance alert email (AC 2/3) when the balance band worsens. Requires `finance.manage` — never "own".',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(recordAdjustmentSchema), required: true } },
  responses: {
    200: { description: 'The account overview, refreshed after the adjustment.', content: jsonContent(accountOverviewSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/instructor-rates',
  summary: "List a person's historicized instructor-rate history (most recent validFrom first)",
  description:
    'Story 4.2, AC 1 — the twin of `GET /api/v1/aircraft/{id}/rates`, a plain array (no pagination, capped at 500). A person without an (active) instructor profile gets an empty array, NOT a 404 — only an unknown person is. Requires `people.read` (staff+admin — a wider read than the `settings.manage` write below, since instructor data lives under `people`).',
  tags: ['People'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: "The instructor's rate history.", content: jsonContent(instructorRateListResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/instructor-rates',
  summary: 'Record a new historicized instructor rate (AD-4)',
  description:
    'Story 4.2, AC 1/2 — the twin of `POST /api/v1/aircraft/{id}/rates`. Append-only (AD-3 spirit): there is no update/delete endpoint; a wrong price is corrected by a NEW rate with a later `validFrom`. Two rates sharing the same `(instructorProfileId, validFrom)` are a 409 (AC 2). A person with no active instructor profile (never activated, or deactivated) also answers 409. Requires `settings.manage` (admin-only pricing configuration, same as `POST /api/v1/aircraft/{id}/rates`).',
  tags: ['People'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(createInstructorRateSchema), required: true } },
  responses: {
    201: { description: 'The created rate.', content: jsonContent(instructorRateItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/packages',
  summary: "List a person's sold hour packages (residuals + expiry)",
  description:
    'Story 4.4, AC 2 — a plain array (no pagination, capped at 500), most recent sale first. An unknown person is a 404; a person with no packages yet gets an empty array. `remainingMinutes` is always computed (AD-3, epic 5 will extend it to subtract consumption); `isExpired` is true only when `expiresAt` is strictly before today. `actorEmail` is included ONLY when the caller has `people.read` (same conditional-field pattern as the account statement). Readable with `people.read` (any person) or "own" access: `self.read` plus a matching `personId` (same rule as `GET /api/v1/people/{id}/account`).',
  tags: ['Finance'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: "The person's sold packages.", content: jsonContent(hourPackageListResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/packages',
  summary: 'Sell an hour package to a person (FR-13)',
  description:
    'Story 4.4, AC 1 — in one transaction: upserts the `Account`, creates the `PACKAGE_PURCHASE` `AccountMovement` (always `amountCents: 0` — the payment is external to the account, see `HourPackage`\'s doc-comment), the `HourPackage` snapshot (`includedMinutes`/`pricePaidCents` copied from the type, `expiresAt` materialized from `validityMonths` when present) and the linked `CashMovement` under the seeded "Pacchetti" category (`amountCents: +priceCents`). `packageTypeId` must reference an ACTIVE type (409 otherwise); an archived person is also a 409. Requires `finance.manage` (staff/admin) — an operazione di sportello, never "own".',
  tags: ['Finance'],
  security,
  request: { params: personIdParams, body: { content: jsonContent(sellPackageSchema), required: true } },
  responses: {
    201: { description: 'The created package, plus the refreshed account overview.', content: jsonContent(sellPackageResponseSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/accounts/negative-balances',
  summary: 'List every account with a negative balance, most negative first',
  description:
    'The staff-facing "saldi negativi" list (story 3.3, AC 2) shown on the `/dashboard/finance` landing page. Balance is always `SUM(AccountMovement.amountCents)` (AD-3). Requires `finance.manage`.',
  tags: ['Accounts'],
  security,
  responses: {
    200: { description: 'Every account with a negative balance.', content: jsonContent(negativeBalancesResponseSchema) },
    ...errorResponses(401, 403),
  },
});

// --- Cash register (story 3.4) ---------------------------------------------

const cashCategoryIdParams = z.object({ id: z.string().meta({ description: 'Cash category id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const cashMovementIdParams = z.object({ id: z.string().meta({ description: 'Cash movement id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

registry.registerPath({
  method: 'get',
  path: '/api/v1/cash-categories',
  summary: 'List cash-register categories',
  description:
    'Active categories only by default — pass `includeInactive=true` (the admin management page does) to also get deactivated ones (story 3.4, AC 1). Requires `finance.manage` (the same list feeds the "new movement" category picker).',
  tags: ['Cash'],
  security,
  request: { query: listCashCategoriesQuerySchema },
  responses: {
    200: { description: 'Every cash category, with its movement count.', content: jsonContent(cashCategoryListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cash-categories',
  summary: 'Create a cash-register category',
  description: 'Name must be unique — conflict is a 409. Requires `settings.manage` (admin-only configuration, story 3.4, AC 1).',
  tags: ['Cash'],
  security,
  request: { body: { content: jsonContent(createCashCategorySchema), required: true } },
  responses: {
    201: { description: 'The created category.', content: jsonContent(cashCategoryItemSchema) },
    ...errorResponses(401, 403, 409, 422),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cash-categories/{id}',
  summary: 'Rename a cash-register category',
  description: 'Name must stay unique — conflict is a 409. Requires `settings.manage`.',
  tags: ['Cash'],
  security,
  request: { params: cashCategoryIdParams, body: { content: jsonContent(renameCashCategorySchema), required: true } },
  responses: {
    200: { description: 'The renamed category.', content: jsonContent(cashCategoryItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cash-categories/{id}/deactivate',
  summary: 'Deactivate a cash-register category',
  description:
    'Soft only (story 3.4, AC 1): the category disappears from new-movement pickers but historical movements stay intact. Conflict if already inactive. Requires `settings.manage`.',
  tags: ['Cash'],
  security,
  request: { params: cashCategoryIdParams },
  responses: {
    200: { description: 'The category was deactivated.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cash-categories/{id}/reactivate',
  summary: 'Reactivate a previously deactivated cash-register category',
  description: 'Conflict if already active. Requires `settings.manage`.',
  tags: ['Cash'],
  security,
  request: { params: cashCategoryIdParams },
  responses: {
    200: { description: 'The category was reactivated.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/cash-categories/{id}',
  summary: 'Delete a cash-register category (only if never used)',
  description:
    'A category with recorded movements cannot be deleted — 409 suggesting deactivation instead (story 3.4, AC 1; the `CashMovement.categoryId` FK RESTRICT backstops the race). Requires `settings.manage`.',
  tags: ['Cash'],
  security,
  request: { params: cashCategoryIdParams },
  responses: {
    200: { description: 'The category was deleted.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cash-movements',
  summary: 'List the cash register (paginated, filterable by period/category/sign)',
  description:
    'Ordered by `effectiveDate` (data valuta) descending — deliberately different from the account statement (story 3.2, ordered by registration time): the cash register is consulted per accounting period. `from`/`to` filter inclusively on `effectiveDate`; `sign` is `in` (`amountCents > 0`) or `out` (`< 0`). Requires `finance.manage` (story 3.4, AC 2).',
  tags: ['Cash'],
  security,
  request: { query: listCashMovementsQuerySchema },
  responses: {
    200: { description: 'A page of cash movements.', content: jsonContent(cashMovementListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cash-movements',
  summary: 'Record a manual cash movement (entrata or uscita)',
  description:
    'Append-only (AD-3, story 3.4, AC 2): there is no update/delete endpoint — corrections go through `POST /api/v1/cash-movements/{id}/reverse`. The category must exist and be active (409 if deactivated). `amountCents` is SIGNED: positive = entrata, negative = uscita. Requires `finance.manage`.',
  tags: ['Cash'],
  security,
  request: { body: { content: jsonContent(recordCashMovementSchema), required: true } },
  responses: {
    201: { description: 'The recorded movement.', content: jsonContent(cashMovementItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cash-report',
  summary: 'Period financial report over the cash ledger (totals by category, in/out/net)',
  description:
    'A read-only aggregation over the cash register (story 3.5, AC 1/2) — NO new model or write path. `from`/`to` are both mandatory (`YYYY-MM-DD`), inclusive on `effectiveDate`, and rejected with a 422 if inverted. `netCents = totalInCents + totalOutCents` (`outCents` is already negative, AD-2). Categories with no movements in the period are excluded; the remaining ones are ordered by name. Requires `finance.manage`.',
  tags: ['Cash'],
  security,
  request: { query: cashReportQuerySchema },
  responses: {
    200: { description: 'The financial report for the requested period.', content: jsonContent(cashReportResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cash-movements/{id}/reverse',
  summary: 'Reverse (storna) a manual cash movement',
  description:
    'AD-3 storno (story 3.4, AC 2): creates a NEW movement with the OPPOSITE amount, the SAME category (even if meanwhile deactivated), linked via `reversalOfId` (unique — at most one storno per movement, 409 on a second attempt). A storno itself and the automatic top-up twins (story 3.1) cannot be reversed — 409 (the latter are corrected via the account rettifica, story 3.3). Requires `finance.manage`.',
  tags: ['Cash'],
  security,
  request: { params: cashMovementIdParams, body: { content: jsonContent(reverseCashMovementSchema), required: true } },
  responses: {
    200: { description: 'The reversal movement.', content: jsonContent(cashMovementItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- Package types (story 4.3, FR-12) ---------------------------------------

const packageTypeIdParams = z.object({ id: z.string().meta({ description: 'Package type id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

registry.registerPath({
  method: 'get',
  path: '/api/v1/package-types',
  summary: 'List the package-type listino (discounted hour bundles, FR-12)',
  description:
    'Active types only by default — pass `includeInactive=true` (the admin management page does) to also get deactivated ones (story 4.3, AC 1). Requires `finance.manage` (the same list feeds the sale picker, story 4.4).',
  tags: ['Finance'],
  security,
  request: { query: listPackageTypesQuerySchema },
  responses: {
    200: { description: 'Every package type, with its eligible-aircraft set.', content: jsonContent(packageTypeListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/package-types',
  summary: 'Create a package type',
  description:
    'Name must be unique — conflict is a 409. Every `aircraftId` in `aircraftIds` must exist (404) and must not be archived (409). Requires `settings.manage` (admin-only configuration, story 4.3, AC 1).',
  tags: ['Finance'],
  security,
  request: { body: { content: jsonContent(createPackageTypeSchema), required: true } },
  responses: {
    201: { description: 'The created package type.', content: jsonContent(packageTypeItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/package-types/{id}',
  summary: 'Update a package type (partial patch)',
  description:
    'Every field optional; `validityMonths: null` clears the validity. `aircraftIds`, when present, fully replaces the eligible-aircraft set. Editing a type with sold packages is legal (the sale snapshots price/minutes, story 4.4). Requires `settings.manage`.',
  tags: ['Finance'],
  security,
  request: { params: packageTypeIdParams, body: { content: jsonContent(updatePackageTypeSchema), required: true } },
  responses: {
    200: { description: 'The updated package type.', content: jsonContent(packageTypeItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/package-types/{id}',
  summary: 'Delete a package type (only if never sold)',
  description:
    'A package type with sold packages cannot be deleted — 409 suggesting deactivation instead (story 4.3, AC 2; story 4.4 adds the `HourPackage.packageTypeId` FK RESTRICT this backstops). Requires `settings.manage`.',
  tags: ['Finance'],
  security,
  request: { params: packageTypeIdParams },
  responses: {
    204: { description: 'The package type was deleted.' },
    ...errorResponses(401, 403, 404, 409),
  },
});

// --- Flights (epic 5, story 5.1, FR-9/FR-14/FR-15) --------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/flights',
  summary: 'List registered flights (paginated, most recent first)',
  description:
    'Story 5.1, AC 1/2 — staff-only for now (no own-access/filters yet, story 5.4). `breakdown.totalAmountCents` is always computed (aircraft + optional instructor cost), never a persisted column. Requires `flights.manage`.',
  tags: ['Flights'],
  security,
  request: { query: listFlightsQuerySchema },
  responses: {
    200: { description: 'A page of registered flights.', content: jsonContent(flightListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/flights',
  summary: 'Register a flight and its automatic charge (FR-9/FR-14/FR-15)',
  description:
    'Story 5.1, AC 1/2/3 — in one transaction: creates the `Flight` (AD-4 rate snapshot at `flightDate`), the `FLIGHT_CHARGE` `AccountMovement` (amount NEGATIVE — aircraft cost + optional instructor cost, no insufficient-balance block), and advances `Aircraft.hourMeterMinutes` by the flight\'s minutes. Exactly one of `minutes` or the `hourMeterStart`/`hourMeterEnd` pair must be given. Domain-state failures (archived aircraft/person, missing pilot/student profile, future date, invalid hour-meter pair, a SCHOOL flight without an instructor, an instructor without an active profile, no rate in effect) all answer 422 with a SPECIFIC stable code (AC 3) rather than the generic `VALIDATION_ERROR`. Requires `flights.manage` (FR-14: only staff/admin register a flight).',
  tags: ['Flights'],
  security,
  request: { body: { content: jsonContent(registerFlightSchema), required: true } },
  responses: {
    201: { description: 'The registered flight, plus the refreshed account overview.', content: jsonContent(registerFlightResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/flights/{id}/cancel',
  summary: 'Cancel (storno) a registered flight (FR-16)',
  description:
    'Story 5.3, AC 1/3/4 — in one transaction: the flight becomes CANCELLED (cancelledAt/cancelReason set), an opposite-signed FLIGHT_CHARGE_REVERSAL movement is created (linked via reversalOfId to the original FLIGHT_CHARGE), package minutes become available again (via a status-filtered SUM, no PackageConsumption row is touched), and the aircraft hour meter is reduced by the flight\'s minutes (clamped at 0). Always allowed, even if the person/aircraft is now archived. Already-cancelled -> 409. Requires `flights.manage`.',
  tags: ['Flights'],
  security,
  request: { params: flightIdParams, body: { content: jsonContent(cancelFlightSchema), required: true } },
  responses: {
    200: { description: 'The cancelled flight, plus the refreshed account overview.', content: jsonContent(registerFlightResponseSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/flights/{id}/correct',
  summary: 'Correct a registered flight: storno + new registration (FR-16)',
  description:
    'Story 5.3, AC 2/3/4 — in one transaction: storno of the original flight (identical to /cancel) followed immediately by a brand-new registration with the given data, re-validated from scratch (the same 404/422 guards as POST /flights apply to the NEW data) — linked via Flight.correctionOfId. If the new registration fails, the whole transaction (storno included) rolls back. Already-cancelled -> 409. Requires `flights.manage`.',
  tags: ['Flights'],
  security,
  request: { params: flightIdParams, body: { content: jsonContent(correctFlightSchema), required: true } },
  responses: {
    201: { description: 'The new flight, plus the refreshed account overview (of the corrected data\'s person).', content: jsonContent(registerFlightResponseSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/aircraft',
  summary: 'List aircraft (paginated, searchable)',
  description:
    'Search (`q`) matches registration or model, case-insensitively. Archived aircraft are excluded unless `includeArchived=true` (AC 2). Requires `aircraft.manage` — there is no `aircraft.read` permission (Dev Notes: pilots see the fleet via the future bookings epic).',
  tags: ['Aircraft'],
  security,
  request: { query: listAircraftQuerySchema },
  responses: {
    200: { description: 'A page of aircraft.', content: jsonContent(aircraftListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft',
  summary: 'Create an aircraft',
  description: 'Registration (marche) must be unique — conflict is a 409.',
  tags: ['Aircraft'],
  security,
  request: { body: { content: jsonContent(createAircraftSchema), required: true } },
  responses: {
    201: { description: 'The created aircraft.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/aircraft/{id}',
  summary: 'Get a single aircraft',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams },
  responses: {
    200: { description: 'The aircraft.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/aircraft/{id}',
  summary: 'Update an aircraft (registration, type, model, hour meter, notes)',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams, body: { content: jsonContent(updateAircraftSchema), required: true } },
  responses: {
    200: { description: 'The updated aircraft.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft/{id}/archive',
  summary: 'Archive an aircraft',
  description: 'Soft-archive only (AC 2) — there is no physical delete endpoint for an Aircraft.',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams },
  responses: {
    200: { description: 'The archived aircraft.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft/{id}/unarchive',
  summary: 'Restore a previously archived aircraft',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams },
  responses: {
    200: { description: 'The restored aircraft.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft/{id}/out-of-service',
  summary: 'Mark an aircraft out of service, with a mandatory reason',
  description: 'Not archiving (story 2.5, AC 1) — the aircraft stays in the default fleet list, just flagged as ungrounded/not currently airworthy. Conflict if already out of service.',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams, body: { content: jsonContent(setOutOfServiceSchema), required: true } },
  responses: {
    200: { description: 'The aircraft, now out of service.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft/{id}/return-to-service',
  summary: 'Return an out-of-service aircraft to service',
  description: 'Clears the status reason. Conflict if already operational.',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams },
  responses: {
    200: { description: 'The aircraft, now operational.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/aircraft/{id}/hour-meter-adjustments',
  summary: "List an aircraft's hour-meter adjustment history (paginated, most recent first)",
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams, query: listHourMeterAdjustmentsQuerySchema },
  responses: {
    200: { description: 'A page of hour-meter adjustments.', content: jsonContent(hourMeterAdjustmentListResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft/{id}/hour-meter-adjustments',
  summary: 'Record a tracked hour-meter (contaore) rectification',
  description: 'Append-only (AD-3 spirit, story 2.5, AC 2) — creates the adjustment and updates Aircraft.hourMeterMinutes in one transaction. A negative delta is allowed.',
  tags: ['Aircraft'],
  security,
  request: {
    params: aircraftIdParams,
    body: { content: jsonContent(createHourMeterAdjustmentSchema), required: true },
  },
  responses: {
    200: { description: 'The aircraft, with the updated hour meter.', content: jsonContent(aircraftListItemSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/aircraft/{id}/rates',
  summary: "List an aircraft's historicized rate history (most recent validFrom first)",
  description:
    'Story 4.1, AC 1 — a plain array (no pagination, small admin-managed list, capped at 500). Requires `aircraft.manage` (staff+admin see fleet pricing, a wider read than the `settings.manage` write below).',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams },
  responses: {
    200: { description: "The aircraft's rate history.", content: jsonContent(aircraftRateListResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft/{id}/rates',
  summary: 'Record a new historicized rate (AD-4)',
  description:
    'Append-only (AD-3 spirit, story 4.1, AC 1/2) — there is no update/delete endpoint; a wrong price is corrected by a NEW rate with a later `validFrom`. Two rates sharing the same `(aircraftId, validFrom)` are a 409 (AC 2). An archived aircraft also answers 409. Requires `settings.manage` (admin-only pricing configuration, story 3.4\'s cash-category pattern).',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams, body: { content: jsonContent(createAircraftRateSchema), required: true } },
  responses: {
    201: { description: 'The created rate.', content: jsonContent(aircraftRateItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users',
  summary: 'List users (paginated)',
  tags: ['Users'],
  security,
  request: { query: listUsersQuerySchema },
  responses: {
    200: { description: 'A page of users.', content: jsonContent(userListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users',
  summary: 'Create (invite) a user',
  tags: ['Users'],
  security,
  request: { body: { content: jsonContent(createUserSchema), required: true } },
  responses: {
    201: { description: 'The created user.', content: jsonContent(userListItemSchema) },
    ...errorResponses(401, 403, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/{id}',
  summary: 'Get a single user',
  tags: ['Users'],
  security,
  request: { params: idParams },
  responses: {
    200: { description: 'The user.', content: jsonContent(userListItemSchema) },
    ...errorResponses(401, 403, 404),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/users/{id}',
  summary: 'Update a user (roles, locale, linked person, active status)',
  tags: ['Users'],
  security,
  request: { params: idParams, body: { content: jsonContent(updateUserSchema), required: true } },
  responses: {
    200: { description: 'The updated user.', content: jsonContent(userListItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/{id}/resend-invite',
  summary: 'Re-send the invite email for a user who has not yet set a password',
  tags: ['Users'],
  security,
  request: { params: idParams },
  responses: {
    200: { description: 'The invite email was (re-)queued.', content: jsonContent(okResponseSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/set-password',
  summary: 'Consume a single-use invite/reset token and set a password',
  tags: ['Auth'],
  request: { body: { content: jsonContent(setPasswordSchema), required: true } },
  responses: {
    200: { description: 'The password was set.', content: jsonContent(okResponseSchema) },
    ...errorResponses(404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/forgot-password',
  summary: 'Request a password-reset email',
  description:
    'Always answers 200, whether or not the email matches an active account — the response must not reveal account existence (AC 3).',
  tags: ['Auth'],
  request: { body: { content: jsonContent(forgotPasswordSchema), required: true } },
  responses: {
    200: { description: 'Always returned, regardless of whether the account exists.', content: jsonContent(okResponseSchema) },
    ...errorResponses(422),
  },
});

/** Generates the OpenAPI 3.1 document from everything registered above. */
export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: 'AirManager API',
      description: 'AirManager REST API (AD-1/AD-8) — the same contract the future Flutter client (FR-42) consumes.',
    },
    servers: [{ url: '/' }],
  });
}
