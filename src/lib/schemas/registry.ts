import { OpenAPIRegistry, OpenApiGeneratorV31, type ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { z } from './zod-with-openapi';
import {
  accountOverviewSchema,
  accountOverviewWithAlertSchema,
  accountStatementPdfQuerySchema,
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
  aogBookingImpactSchema,
  createAircraftRateSchema,
  createAircraftSchema,
  createHourMeterAdjustmentSchema,
  hourMeterAdjustmentListResponseSchema,
  listAircraftQuerySchema,
  listHourMeterAdjustmentsQuerySchema,
  outOfServiceImpactQuerySchema,
  setOutOfServiceResponseSchema,
  setOutOfServiceSchema,
  updateAircraftSchema,
} from './aircraft';
import { forgotPasswordSchema, setPasswordSchema } from './auth-tokens';
import {
  bookingItemSchema,
  bookingListResponseSchema,
  calendarBookingsQuerySchema,
  calendarBookingsResponseSchema,
  createBookingResponseSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  transitionBookingSchema,
  updateBookingSchema,
} from './bookings';
import {
  cashCategoryItemSchema,
  cashCategoryListResponseSchema,
  cashMovementItemSchema,
  cashMovementListResponseSchema,
  cashReportPdfQuerySchema,
  cashReportQuerySchema,
  cashReportResponseSchema,
  createCashCategorySchema,
  listCashCategoriesQuerySchema,
  listCashMovementsQuerySchema,
  reclassifyCashMovementSchema,
  recordCashMovementSchema,
  renameCashCategorySchema,
  reverseCashMovementSchema,
} from './cash';
import { errorEnvelopeSchema, okResponseSchema } from './common';
import { expiryAlertsJobResultSchema } from './expiry-alerts';
import {
  expiryDashboardItemSchema,
  expiryDashboardListResponseSchema,
  expiryItemSchema,
  expiryListResponseSchema,
  listAllExpiriesQuerySchema,
  registerExpirySchema,
  updateExpirySchema,
} from './expiries';
import {
  createExpiryTypeSchema,
  expiryTypeItemSchema,
  expiryTypeListResponseSchema,
  listExpiryTypesQuerySchema,
  updateExpiryTypeSchema,
} from './expiry-types';
import {
  cancelFlightSchema,
  correctFlightSchema,
  flightListResponseSchema,
  listFlightsQuerySchema,
  registerFlightResponseSchema,
  registerFlightSchema,
} from './flights';
import {
  instructorCompensationDetailSchema,
  instructorCompensationQuerySchema,
  instructorCompensationSummaryResponseSchema,
  instructorPayoutItemSchema,
  recordInstructorPayoutSchema,
  setInstructorPayoutRateSchema,
} from './instructor-compensation';
import { meResponseSchema } from './me';
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
import {
  completePprRequestSchema,
  createManualPprRequestSchema,
  createPprRequestSchema,
  listPprRequestsQuerySchema,
  pprLandingFeeDefaultSchema,
  pprOperatingInstructionsSchema,
  pprRequestCreatedResponseSchema,
  pprRequestItemSchema,
  pprRequestListResponseSchema,
  rejectPprRequestSchema,
} from './ppr';
import { chargeMembershipFeeResponseSchema, chargeMembershipFeeSchema } from './membership';
import { metarResponseSchema } from './metar';
import {
  airfieldBrandingSchema,
  clubIdentitySchema,
  membershipFeeSettingSchema,
  metarStationDtoSchema,
  metarStationInputSchema,
  schedulingSettingsDtoSchema,
  schedulingSettingsSchema,
  smtpSettingsDtoSchema,
  smtpSettingsInputSchema,
  testEmailResultSchema,
  treasurySettingsSchema,
} from './settings';
import { statsQuerySchema, statsResponseSchema } from './stats';
import {
  listTransactionsQuerySchema,
  recordTransactionResponseSchema,
  recordTransactionSchema,
  transactionListResponseSchema,
} from './transactions';
import { createUserSchema, updateUserSchema, userListItemSchema } from './users';

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

/**
 * Bearer token for `/api/v1/jobs/*` (story 6.3, AD-9) — the EXTERNAL cron's
 * credential, never a user session. Deliberately a SEPARATE scheme from
 * `cookieAuth` above (different transport, different comparison —
 * timing-safe against `JOBS_SECRET`, not Auth.js), the only route family
 * that uses it.
 */
const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'JOBS_SECRET bearer token (AD-9) — presented by the external cron invoking /api/v1/jobs/*, never a user session.',
});

const jobsSecurity = [{ [bearerAuth.name]: [] }];

/**
 * Reusable `Idempotency-Key` request header (story TD-2, AC 7) — registered
 * once and referenced (`headers: [idempotencyKeyHeader]`) on the 5
 * money-mutating POSTs `src/lib/api/handler.ts`'s `idempotency` option
 * covers. Optional (opt-in, AC 3): a request without it behaves exactly as
 * before.
 */
const idempotencyKeyHeader = registry.registerParameter(
  'IdempotencyKey',
  z
    .string()
    .min(1)
    .max(200)
    .optional()
    .openapi({
      param: { name: 'Idempotency-Key', in: 'header' },
      description:
        'Opt-in replay-safe key for this request (1-200 chars, e.g. a UUID). A retry with the IDENTICAL request replays the first response (`Idempotency-Replayed: true`) instead of re-executing the mutation; a concurrent request with the same key gets 409 `IDEMPOTENCY_IN_PROGRESS`. Reusing the key for a DIFFERENT request (different body/params) gets 422 `IDEMPOTENCY_KEY_MISMATCH` instead of replaying the wrong response (security audit 2026-07-22, finding M1).',
      example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    }),
);

/**
 * Story 12.7 (AC 3) — the FIRST route where `Idempotency-Key` is MANDATORY,
 * not opt-in: `POST /api/v1/instructor-payouts` rejects a request without
 * it (422 `IDEMPOTENCY_KEY_REQUIRED`, checked in the route itself, since
 * `src/lib/api/handler.ts`'s shared `idempotency` option stays opt-in for
 * every other caller, story TD-2 AC 3 unchanged) — a separate registered
 * parameter (required `.min(1).max(200)`, no `.optional()`) documents that
 * distinction accurately rather than reusing {@link idempotencyKeyHeader}.
 */
const requiredIdempotencyKeyHeader = registry.registerParameter(
  'RequiredIdempotencyKey',
  z
    .string()
    .min(1)
    .max(200)
    .openapi({
      param: { name: 'Idempotency-Key', in: 'header' },
      description:
        'MANDATORY replay-safe key (1-200 chars, e.g. a UUID) — unlike every other money-mutating POST, this endpoint 422s without it. A retry with the SAME key replays the first response instead of recording a second payout.',
      example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    }),
);

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
registry.register('AogBookingImpact', aogBookingImpactSchema);
registry.register('SetOutOfServiceResponse', setOutOfServiceResponseSchema);
registry.register('CreateHourMeterAdjustmentRequest', createHourMeterAdjustmentSchema);
registry.register('HourMeterAdjustmentList', hourMeterAdjustmentListResponseSchema);
registry.register('AircraftRate', aircraftRateItemSchema);
registry.register('AircraftRateList', aircraftRateListResponseSchema);
registry.register('CreateAircraftRateRequest', createAircraftRateSchema);
registry.register('AccountOverview', accountOverviewSchema);
registry.register('AccountOverviewWithAlert', accountOverviewWithAlertSchema);
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
registry.register('ReclassifyCashMovement', reclassifyCashMovementSchema);
registry.register('CashReport', cashReportResponseSchema);
registry.register('RegisterFlightRequest', registerFlightSchema);
registry.register('RegisterFlightResponse', registerFlightResponseSchema);
registry.register('FlightList', flightListResponseSchema);
registry.register('CancelFlightRequest', cancelFlightSchema);
registry.register('CorrectFlightRequest', correctFlightSchema);
registry.register('User', userListItemSchema);
registry.register('CreateUserRequest', createUserSchema);
registry.register('UpdateUserRequest', updateUserSchema);
registry.register('SetPasswordRequest', setPasswordSchema);
registry.register('ForgotPasswordRequest', forgotPasswordSchema);
registry.register('ExpiryType', expiryTypeItemSchema);
registry.register('ExpiryTypeList', expiryTypeListResponseSchema);
registry.register('CreateExpiryTypeRequest', createExpiryTypeSchema);
registry.register('UpdateExpiryTypeRequest', updateExpiryTypeSchema);
registry.register('Expiry', expiryItemSchema);
registry.register('ExpiryList', expiryListResponseSchema);
registry.register('RegisterExpiryRequest', registerExpirySchema);
registry.register('UpdateExpiryRequest', updateExpirySchema);
registry.register('ExpiryAlertsJobResult', expiryAlertsJobResultSchema);
registry.register('ExpiryDashboardItem', expiryDashboardItemSchema);
registry.register('ExpiryDashboardList', expiryDashboardListResponseSchema);
registry.register('Booking', bookingItemSchema);
registry.register('BookingList', bookingListResponseSchema);
registry.register('CreateBookingRequest', createBookingSchema);
registry.register('CreateBookingResponse', createBookingResponseSchema);
registry.register('UpdateBookingRequest', updateBookingSchema);
registry.register('TransitionBookingRequest', transitionBookingSchema);
registry.register('CreatePprRequestRequest', createPprRequestSchema);
registry.register('PprRequestCreatedResponse', pprRequestCreatedResponseSchema);
registry.register('PprRequest', pprRequestItemSchema);
registry.register('PprRequestList', pprRequestListResponseSchema);
registry.register('RejectPprRequestRequest', rejectPprRequestSchema);
registry.register('CompletePprRequestRequest', completePprRequestSchema);
registry.register('PprOperatingInstructions', pprOperatingInstructionsSchema);
registry.register('PprLandingFeeDefault', pprLandingFeeDefaultSchema);
registry.register('AirfieldBranding', airfieldBrandingSchema);
registry.register('Stats', statsResponseSchema);
// Story 12.13 (F5, review 12.11 action item) — the 9 routes story 12.11
// shipped without ever registering: settings sub-resources, METAR, the
// manual expiry-alerts trigger, and the per-person membership-fee charge.
registry.register('ClubIdentity', clubIdentitySchema);
registry.register('SchedulingSettings', schedulingSettingsDtoSchema);
registry.register('SmtpSettings', smtpSettingsDtoSchema);
registry.register('TestEmailResult', testEmailResultSchema);
registry.register('MetarStation', metarStationDtoSchema);
registry.register('MembershipFeeSetting', membershipFeeSettingSchema);
registry.register('MetarData', metarResponseSchema);
registry.register('ChargeMembershipFeeRequest', chargeMembershipFeeSchema);
registry.register('ChargeMembershipFeeResponse', chargeMembershipFeeResponseSchema);
// Story Billing-1, AC 3 — the treasury opening balances (getter/setter +
// this PUT route only; the Impostazioni card is Billing-2's job).
registry.register('TreasurySettings', treasurySettingsSchema);

const idParams = z.object({ id: z.string().meta({ description: 'User id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const personIdParams = z.object({ id: z.string().meta({ description: 'Person id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const aircraftIdParams = z.object({ id: z.string().meta({ description: 'Aircraft id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const flightIdParams = z.object({ id: z.string().meta({ description: 'Flight id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const bookingIdParams = z.object({ id: z.string().meta({ description: 'Booking id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const pprRequestIdParams = z.object({ id: z.string().meta({ description: 'PPR request id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

const ERROR_DESCRIPTIONS: Record<number, string> = {
  401: 'Not authenticated (AD-8 `UNAUTHENTICATED`).',
  403: 'Forbidden — the actor lacks the required permission (AD-5).',
  404: 'The requested resource does not exist.',
  409: 'The request conflicts with the current state of the resource.',
  422: 'Validation failed (Zod schema or domain-level).',
  429: 'Too many requests from this source (story 8.1, AD-8 `RATE_LIMITED`).',
};

/**
 * Standard AD-8 error responses reused across every documented path — every
 * endpoint can also fail unexpectedly, so 500 is always included (closes
 * story 1.3 review F2: even unmapped errors now have a documented,
 * leak-free envelope).
 */
function errorResponses(...statuses: Array<401 | 403 | 404 | 409 | 422 | 429>): Record<number, ResponseConfig> {
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

/**
 * Story 10.1 (AC 1/6): the xlsx counterpart of `jsonContent` — documents
 * the binary `?format=xlsx` branch alongside the unchanged JSON one on the
 * SAME 200 response (`content: { ...jsonContent(schema), ...xlsxContent() }`),
 * one entry per of the 10 covered list endpoints.
 */
function xlsxContent() {
  return { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: z.string().openapi({ format: 'binary' }) } };
}

/** Story 10.2 (AC 2/6): the `application/pdf` counterpart of `xlsxContent` — a dedicated PDF export route's ONLY response content type (unlike the xlsx branch, there is no sibling JSON content on these paths). */
function pdfContent() {
  return { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } };
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
    200: { description: 'A page of persons, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).', content: { ...jsonContent(personListResponseSchema), ...xlsxContent() } },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people',
  summary: 'Create a person — optionally one-step (profiles + expiries + access)',
  description:
    'The base anagrafica create (`firstName`/`lastName`/...) is unchanged; three OPTIONAL blocks (story 13.1, AC 5) turn this into the one-step "Aggiungi pilota" flow, all inside ONE atomic transaction (any failure rolls back the whole person): `profiles` activates pilot/student/instructor (same per-type shape as `PUT /people/{id}/profiles/{type}`); `expiries` registers `{ expiryTypeId, expiresAt }` pairs against the just-activated profiles (`expiresAt` mandatory, R-13.1-c; unknown/inactive type or scope mismatch → 422); `access` creates a linked user + sends the invite email (requires `users.manage` on top of `people.manage` — 403 if missing, never silently dropped).',
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
    'Append-only (AD-3, story 3.1, AC 2/3) — in one transaction, upserts the `Account`, creates an immutable `AccountMovement` (TOP_UP) and its automatic `CashMovement` twin under the seeded "Ricariche" category. There is no update/delete endpoint for either ledger. Requires `finance.manage` (ADMIN-only) — never "own". Accepts the opt-in `Idempotency-Key` header (story TD-2).',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, headers: [idempotencyKeyHeader], body: { content: jsonContent(recordTopUpSchema), required: true } },
  responses: {
    200: { description: 'The account overview, refreshed after the top-up.', content: jsonContent(accountOverviewSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/account/movements',
  summary: "List a person's full account statement (paginated, most recent first)",
  description:
    'The full, paginated ledger (story 3.2) behind `GET /api/v1/people/{id}/account`\'s 5-entry preview. A person without an `Account` yet gets an empty page (`total: 0`), NOT a 404 — only an unknown person is. `actorEmail` (who registered the movement) is included ONLY when the caller has `people.read` (AC 2\'s operational detail for an admin) — absent for a titolare reading their own statement. Readable with `people.read` (any person) or "own" access: `self.read` plus a matching `personId` (same rule as `GET /api/v1/people/{id}/account`).',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, query: listAccountMovementsQuerySchema },
  responses: {
    200: {
      description: "A page of the person's account statement, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).",
      content: { ...jsonContent(accountStatementResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/account/pdf',
  summary: "PDF export of a person's account statement, optionally scoped to a period (story 10.2, AC 2; story 12.9, AC 5)",
  description:
    'Dedicated PDF route (spine :105), NOT `?format=pdf` on the movements endpoint above. `from`/`to` are ADDITIVE optional bounds (story 12.9): absent means the COMPLETE history (unchanged default), present narrows the rows to that period — the balance totals line always shows the account\'s CURRENT balance either way. Same own/`people.read` access rule as `GET /api/v1/people/{id}/account/movements`. Above `2000` rows: 422 `EXPORT_TOO_LARGE` (use the xlsx export instead).',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, query: accountStatementPdfQuerySchema },
  responses: {
    200: { description: 'The account statement as a PDF document.', content: pdfContent() },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/account/adjustments',
  summary: 'Record a motivated adjustment (rettifica) on a person\'s account',
  description:
    'Append-only (AD-3, story 3.3, AC 1) — creates a NEW, independent `AccountMovement` (`ADJUSTMENT`); the original movement is never touched. `originalMovementId`, when given, links this adjustment to the movement it corrects and must belong to the same account (404 otherwise, never revealing another account\'s movement) and must not already have a linked adjustment (409). Triggers the negative-balance alert email (AC 2/3) when the balance band worsens. `balanceAlert` (story 14.4 review F7, ratifica R-14.4-d) is a WIDER in-app signal — true whenever the balance was already negative before this write or ends up negative after it, regardless of the email\'s own band transition. Requires `finance.manage` — never "own". Accepts the opt-in `Idempotency-Key` header (story TD-2).',
  tags: ['Accounts'],
  security,
  request: { params: personIdParams, headers: [idempotencyKeyHeader], body: { content: jsonContent(recordAdjustmentSchema), required: true } },
  responses: {
    200: { description: 'The account overview, refreshed after the adjustment.', content: jsonContent(accountOverviewWithAlertSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/instructor-rates',
  summary: "List a person's historicized instructor-rate history (most recent validFrom first)",
  description:
    'Story 4.2, AC 1 — the twin of `GET /api/v1/aircraft/{id}/rates`, a plain array (no pagination, capped at 500). A person without an (active) instructor profile gets an empty array, NOT a 404 — only an unknown person is. Requires `people.read` (ADMIN-only — a wider read than the `settings.manage` write below, since instructor data lives under `people`).',
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
  path: '/api/v1/accounts/negative-balances',
  summary: 'List every account with a negative balance, most negative first',
  description:
    'The staff-facing "saldi negativi" list (story 3.3, AC 2) shown on `/dashboard/billing` since story 12.9. Balance is always `SUM(AccountMovement.amountCents)` (AD-3). Requires `finance.manage`.',
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
    200: {
      description: 'A page of cash movements, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(cashMovementListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cash-movements',
  summary: 'Record a manual cash movement (entrata or uscita)',
  description:
    'Append-only (AD-3, story 3.4, AC 2): there is no update/delete endpoint — corrections go through `POST /api/v1/cash-movements/{id}/reverse` (NOT idempotency-key-protected, already covered by `reversalOfId`). The category must exist and be active (409 if deactivated). `amountCents` is SIGNED: positive = entrata, negative = uscita. Requires `finance.manage`. Accepts the opt-in `Idempotency-Key` header (story TD-2).',
  tags: ['Cash'],
  security,
  request: { headers: [idempotencyKeyHeader], body: { content: jsonContent(recordCashMovementSchema), required: true } },
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
  method: 'get',
  path: '/api/v1/cash-report/pdf',
  summary: 'PDF export of the period financial report (story 10.2, AC 2)',
  description:
    'Dedicated PDF route (spine :105), same mandatory `from`/`to` as `GET /api/v1/cash-report` above, plus `locale`. The categories table mirrors the JSON `categories` array; the totals line carries `totalInCents`/`totalOutCents`/`netCents`. Requires `finance.manage`.',
  tags: ['Cash'],
  security,
  request: { query: cashReportPdfQuerySchema },
  responses: {
    200: { description: 'The financial report as a PDF document.', content: pdfContent() },
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

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cash-movements/{id}',
  summary: 'Reclassify an unattributed cash movement (assign its payment method)',
  description:
    'Story Billing-2, AC 3 — the secchiello: assigns `paymentMethod` to a historical movement recorded/backfilled without one. Only `paymentMethod` changes; the movement must currently have NONE (409 otherwise — reclassification is not a general edit, and every automatic twin/storno already carries a method by construction). Requires `finance.manage`.',
  tags: ['Cash'],
  security,
  request: { params: cashMovementIdParams, body: { content: jsonContent(reclassifyCashMovementSchema), required: true } },
  responses: {
    200: { description: 'The reclassified movement.', content: jsonContent(cashMovementItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- Unified billing ledger (epic 12, story 12.9) ---------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/transactions',
  summary: 'List the unified billing ledger — AccountMovement ∪ CashMovement (paginated, filterable)',
  description:
    'Read-only union of the account and cash ledgers, normalized to a club-centric sign (a charge/ricavo is positive, a payment received is negative — the OPPOSITE of the raw `AccountMovement.amountCents` column) and deduplicated so an automatic twin (e.g. a cash top-up) never appears as two rows. Ordered `effectiveDate desc, createdAt desc, id desc` across BOTH sources, paginated correctly on the union (never per-source). `movementType` and `categoryId` are mutually exclusive (422 if both given). Requires `finance.manage`.',
  tags: ['Billing'],
  security,
  request: { query: listTransactionsQuerySchema },
  responses: {
    200: {
      description: 'A page of ledger rows, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(transactionListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/transactions',
  summary: 'Record a new transaction — top-up, account adjustment, or cash movement (AirOps "Nuova transazione")',
  description:
    'A discriminated union over 3 branches (`kind`), each a pure dispatch onto a PRE-EXISTING writer, unchanged and still independently reachable on their own routes: `TOP_UP` -> `POST /api/v1/people/{id}/account/top-ups`\' `recordTopUp`; `ADJUSTMENT` -> `POST /api/v1/people/{id}/account/adjustments`\' `recordAdjustment` (the wire `amountCents` is the positive "importo addebito", negated server-side into that model\'s DB sign convention for a charge); `CASH` -> `POST /api/v1/cash-movements`\' `recordCashMovement`. `finance.manage` is enforced by each delegate. `Idempotency-Key` is MANDATORY here (unlike the 5 opt-in TD-2 routes it delegates to) — same pattern as `POST /api/v1/instructor-payouts` (story 12.7).',
  tags: ['Billing'],
  security,
  request: { headers: [idempotencyKeyHeader], body: { content: jsonContent(recordTransactionSchema), required: true } },
  responses: {
    201: { description: 'The delegated writer\'s fresh result — an account overview (TOP_UP/ADJUSTMENT) or the created cash movement (CASH).', content: jsonContent(recordTransactionResponseSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- Flights (epic 5, story 5.1, FR-9/FR-14/FR-15) --------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/flights',
  summary: 'List flights (paginated, most recent first, own-access or all with filters)',
  description:
    'Story 5.1/5.4, AC 1/2/3/4; story 9.3, AC 4 — `flights.manage` (ADMIN-only) sees every flight with all filters (`dateFrom`/`dateTo`/`aircraftId`/`personId`/`instructorPersonId`/`flightType`/`status`, AND-combined); otherwise `self.read` and the scope is forced to the flights where the actor is the person OR the instructor aboard (CANCELLED included). A non-admin `personId`/`instructorPersonId` filter for anyone but themselves answers 403 (this is how the logbook\'s own-instructor drill-down reaches the registry as a non-admin instructor). `breakdown.totalAmountCents` is always computed (aircraft + optional instructor cost), never a persisted column; `actorEmail` is present only for an admin.',
  tags: ['Flights'],
  security,
  request: { query: listFlightsQuerySchema },
  responses: {
    200: {
      description: 'A page of registered flights, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(flightListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/flights/pdf',
  summary: 'PDF export of the flight log (story 10.2, AC 2)',
  description:
    'Dedicated PDF route (spine :105), same query schema and own/admin scoping as `GET /api/v1/flights` above (`page`/`pageSize`/`format` are accepted but ignored — this always re-pages internally up to the PDF cap). Totals line: sum of `minutes` (`H:MM`) and sum of `breakdown.totalAmountCents`, computed here, never in `flights.service.ts`. Above `2000` filtered rows: 422 `EXPORT_TOO_LARGE`.',
  tags: ['Flights'],
  security,
  request: { query: listFlightsQuerySchema },
  responses: {
    200: { description: 'The flight log as a PDF document.', content: pdfContent() },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/flights',
  summary: 'Register a flight and its automatic charge (FR-9/FR-14/FR-15)',
  description:
    'Story 5.1, AC 1/2/3 — in one transaction: creates the `Flight` (AD-4 rate snapshot at `flightDate`), the `FLIGHT_CHARGE` `AccountMovement` (amount NEGATIVE — aircraft cost + optional instructor cost, no insufficient-balance block), and advances `Aircraft.hourMeterMinutes` by the flight\'s minutes. Exactly one of `minutes` or the `hourMeterStart`/`hourMeterEnd` pair must be given. `isSolo` (story 9.4) is only meaningful on a `SCHOOL` flight (dual/false vs solo/true — a solo still carries and bills the instructor, the student is PIC) and defaults to `false`. Domain-state failures (archived aircraft/person, missing pilot/student profile, future date, invalid hour-meter pair, a SCHOOL flight without an instructor, `isSolo` on a non-SCHOOL flight, an instructor without an active profile, no rate in effect) all answer 422 with a SPECIFIC stable code (AC 3) rather than the generic `VALIDATION_ERROR`. Story 14.4 (ratifica R4): a blocking expired document (`ExpiryType.blocksBooking`) on the pilot/student OR the instructor, valid at `flightDate`, answers 422 `FLIGHT_BLOCKED_BY_EXPIRY` (`details.documents`) — bypassable ONLY with `force: true` + a mandatory `forceReason`, and only by an actor holding `flights.forceExpiry` (ADMIN, 403 otherwise). Story AOG-1a (P2, ratifica R-AOG-c): a grounded aircraft answers 422 `AIRCRAFT_OUT_OF_SERVICE` (`details.reason`/`outOfServiceUntil`, plus `details.documents` in the same shape when that same request is ALSO blocked by a document — review MAJOR-1: the ONE `force` covers both blocks, so both are reported before it is given), checked right after `AIRCRAFT_ARCHIVED` and therefore BEFORE the flight-date guard; a correction that KEEPS the same aircraft is exempt. Story 16.2 (F3): a `REGISTERED` flight on the SAME aircraft whose `[takeoffAt, landingAt)` interval OVERLAPS the requested one answers **409 `FLIGHT_OVERLAP`**, with `details.flightId`/`details.takeoffAt`/`details.landingAt` (ISO 8601 UTC) naming the earliest conflicting flight. The interval is SEMI-OPEN, exactly like a `Booking`\'s: two flights that merely touch (`landingAt` of one equal to `takeoffAt` of the other) do NOT overlap. Only `REGISTERED` flights occupy an interval — a `CANCELLED` one frees it. The check runs INSIDE the transaction, under the same `Aircraft` `FOR UPDATE` lock as the contaore, so two concurrent identical requests answer exactly one 201 and one 409. It is NOT derogable by `force`/`forceReason` (unlike `FLIGHT_BLOCKED_BY_EXPIRY`/`AIRCRAFT_OUT_OF_SERVICE`): the way out is to cancel or correct the flight the 409 names. This is the server-side second line of defence behind the opt-in `Idempotency-Key`: the same request sent twice WITHOUT the header gets 201 then 409 (one flight, one charge, one contaore advance), while WITH the header the second call replays the first response (`Idempotency-Replayed: true`, contract unchanged). Story 16.2 (F14) also tightens two declared bounds: `takeoffs`/`landings` are `[1, 500]` (a `0` is a 422 at the Zod boundary — the schema has always documented "at least one of each"), and a flight shorter than ONE minute answers 422 `FLIGHT_TIMES_INVALID` instead of being rounded up to a 1-minute flight (the 1440-minute ceiling answers with that same code, as before). The response\'s `balanceAlert` flags a worsened balance band (story 3.3/14.4) without blocking the registration. Requires `flights.manage` (FR-14: only an admin registers a flight). Accepts the opt-in `Idempotency-Key` header (story TD-2) — NOT `/flights/{id}/cancel`/`/correct`, already protected by `reversalOfId`.',
  tags: ['Flights'],
  security,
  request: { headers: [idempotencyKeyHeader], body: { content: jsonContent(registerFlightSchema), required: true } },
  responses: {
    201: { description: 'The registered flight, plus the refreshed account overview.', content: jsonContent(registerFlightResponseSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
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
    'Story 5.3, AC 2/3/4 — in one transaction: storno of the original flight (identical to /cancel) followed immediately by a brand-new registration with the given data, re-validated from scratch (the same 404/422 guards as POST /flights apply to the NEW data) — linked via Flight.correctionOfId. If the new registration fails, the whole transaction (storno included) rolls back. Already-cancelled -> 409. Story 16.2: the overlap guard of `POST /api/v1/flights` applies to the CORRECTED data too, on the corrected data\'s aircraft (a correction that MOVES the flight onto another airframe is checked THERE) — 409 `FLIGHT_OVERLAP` with the same `details` shape, before the storno, so nothing at all is written. The flight being corrected is EXCLUDED from the check, so a correction that keeps its own slot (changed notes, cycles or hour-meter readings) is never a conflict with itself; `force` does not derogate it. The tightened `takeoffs`/`landings` `[1, 500]` and one-minute minimum duration apply here as well. Requires `flights.manage`.',
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
    200: {
      description: 'A page of aircraft, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(aircraftListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/aircraft',
  summary: 'Create an aircraft',
  description:
    'Registration (marche) must be unique — conflict is a 409. The optional `rate` block (story 14.8) creates the first hourly rate in the SAME transaction and additionally requires the `settings.manage` permission (admin-only): a caller with only `aircraft.manage` gets 403 when `rate` is present, 201 without it.',
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
  description:
    'Not archiving (story 2.5, AC 1) — the aircraft stays in the default fleet list, just flagged as ungrounded/not currently airworthy. Conflict if already out of service. Story AOG-1a: the optional `outOfServiceUntil` (`YYYY-MM-DD`, nullable — an omitted key and an explicit `null` both mean "return date not yet known") records the LAST day the aircraft is grounded, INCLUSIVE (ratifica R-AOG-a); it is informative only and never returns the aircraft to service by itself — `POST /return-to-service` clears it together with the reason.',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams, body: { content: jsonContent(setOutOfServiceSchema), required: true } },
  responses: {
    200: {
      description:
        'The aircraft, now out of service, PLUS the number of live bookings the grounding just impacted (story AOG-1b, ratifica R-AOG-b). The count is recomputed INSIDE the grounding transaction, so it is authoritative for that instant; it is split into `pending` (already frozen — an approval on a grounded aircraft answers 422) and `approved` (nothing in the app stops these, and their holders receive the best-effort grounding email). `impactedBookings.effectiveUntil` is the bound the count was actually taken over: it equals `outOfServiceUntil` for a live bound, and is `null` both when no date was given AND when the given day had already passed (such a bound is no bound, so the count is not delimited). Present the number with the sentence that field implies, never with one rebuilt from `outOfServiceUntil`.',
      content: jsonContent(setOutOfServiceResponseSchema),
    },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/aircraft/{id}/out-of-service-impact',
  summary: 'Preview how many live bookings a grounding would impact',
  description:
    'Story AOG-1b (AD-2): the number the admin sees BEFORE grounding an aircraft. `until` is the CANDIDATE expected-return date (`YYYY-MM-DD`); the counting window is `[now, end of that calendar day]`, INCLUSIVE (ratifica R-AOG-a). OMITTING `until` means the window is NOT delimited (`[now, +infinity)`), which is a different answer from "delimited by today". An `until` whose day has ALREADY PASSED is no bound either: the count is not delimited and `effectiveUntil` answers `null`, so a client can tell that case apart from the omitted one (it sent the date) and word it accordingly. Only `PENDING` and `APPROVED` bookings count; a booking that has already started never does. This is a STIMA: the authoritative number is the one `POST /out-of-service` returns, computed inside its own transaction.',
  tags: ['Aircraft'],
  security,
  request: { params: aircraftIdParams, query: outOfServiceImpactQuerySchema },
  responses: {
    200: { description: 'The impacted-booking counts, split by state, plus the bound the count was actually taken over.', content: jsonContent(aogBookingImpactSchema) },
    ...errorResponses(401, 403, 404, 422),
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
    'Story 4.1, AC 1 — a plain array (no pagination, small admin-managed list, capped at 500). Requires `aircraft.manage` (ADMIN-only — sees fleet pricing, a wider read than the `settings.manage` write below).',
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
  method: 'post',
  path: '/api/v1/users',
  summary: 'Create (invite) a user',
  description: "Story 12.13: the sibling GET (list) handler was removed — the Piloti page reads its roster from `people.service.ts#listPilotsPageData` directly, never from this endpoint.",
  tags: ['Users'],
  security,
  request: { body: { content: jsonContent(createUserSchema), required: true } },
  responses: {
    201: { description: 'The created user.', content: jsonContent(userListItemSchema) },
    ...errorResponses(401, 403, 409, 422),
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

// --- Expiry types (epic 6, story 6.1, FR-35) --------------------------------
// First resource of epic 6 — a new `Expiries` tag. Catalogue only (see
// `ExpiryType` doc-comment): the actual scadenze registered against these
// types (`Expiry`), the alert job and the urgency dashboard arrive in
// stories 6.2/6.3/6.4.

const expiryTypeIdParams = z.object({ id: z.string().meta({ description: 'Expiry type id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

registry.registerPath({
  method: 'get',
  path: '/api/v1/expiry-types',
  summary: 'List the expiry-type catalogue (standard + custom, FR-35)',
  description:
    'Active types only by default — pass `includeInactive=true` (the admin management page does) to also get deactivated ones (story 6.1, AC 1). Requires `expiries.manage` (ADMIN-only — registers scadenze against this catalogue, story 6.2).',
  tags: ['Expiries'],
  security,
  request: { query: listExpiryTypesQuerySchema },
  responses: {
    200: { description: 'Every expiry type.', content: jsonContent(expiryTypeListResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/expiry-types',
  summary: 'Create an expiry type',
  description:
    'Name must be unique — conflict is a 409 (story 6.1, AC 1/2). Requires `settings.manage` (admin-only catalogue configuration, same split as `POST /api/v1/cash-categories`).',
  tags: ['Expiries'],
  security,
  request: { body: { content: jsonContent(createExpiryTypeSchema), required: true } },
  responses: {
    201: { description: 'The created expiry type.', content: jsonContent(expiryTypeItemSchema) },
    ...errorResponses(401, 403, 409, 422),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/expiry-types/{id}',
  summary: 'Update an expiry type (partial patch)',
  description:
    'Every field optional; `isActive` toggling the lifecycle is a plain field on this same PATCH — there is no dedicated deactivate/reactivate endpoint (story 6.1, AC 1/2). Editing a type already in use is legal (a registered scadenza, story 6.2, references it by id, never a name snapshot). Requires `settings.manage`.',
  tags: ['Expiries'],
  security,
  request: { params: expiryTypeIdParams, body: { content: jsonContent(updateExpiryTypeSchema), required: true } },
  responses: {
    200: { description: 'The updated expiry type.', content: jsonContent(expiryTypeItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/expiry-types/{id}',
  summary: 'Delete an expiry type (only if never used)',
  description:
    'An expiry type referenced by a recorded scadenza cannot be deleted — 409 suggesting deactivation instead (story 6.1, AC 2; story 6.2 adds the `Expiry.expiryTypeId` FK RESTRICT this backstops). Requires `settings.manage`.',
  tags: ['Expiries'],
  security,
  request: { params: expiryTypeIdParams },
  responses: {
    204: { description: 'The expiry type was deleted.' },
    ...errorResponses(401, 403, 404, 409),
  },
});

// --- Expiries (epic 6, story 6.2/6.4) ---------------------------------------
// Person expiries with computed status (`ok`/`expiring`/`expired`, never
// persisted).

const expiryIdParams = z.object({ id: z.string().meta({ description: 'Expiry id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

registry.registerPath({
  method: 'get',
  path: '/api/v1/people/{id}/expiries',
  summary: "List a person's scadenze, with computed status (AC 1/2, FR-36)",
  description:
    'Ordered by `expiresAt asc` (soonest-expiring first), capped at 200. `status` (`ok`/`expiring`/`expired`) is always server-computed, never persisted. Readable with `expiries.manage` (any person) or own-access (`self.read` plus a matching `personId`, same rule as the account statement/packages endpoints).',
  tags: ['Expiries'],
  security,
  request: { params: personIdParams },
  responses: {
    200: { description: "The person's scadenze.", content: jsonContent(expiryListResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/expiries',
  summary: 'The urgency dashboard: every scadenza across every person, filterable (story 6.4, AC 1, FR-38)',
  description:
    'Ordered by `expiresAt asc, id asc` (soonest-expiring/most-overdue first, tie-broken for stable pagination). Filters `expiryTypeId`/`scope`/`status` are optional and AND-combinable; `status` maps to an `expiresAt` date range server-side (never post-filtered), always agreeing with the per-row `status` field by construction (same `today`/`EXPIRY_WARNING_DAYS` boundary as `computeExpiryStatus`). Requires `expiries.manage`.',
  tags: ['Expiries'],
  security,
  request: { query: listAllExpiriesQuerySchema },
  responses: {
    200: {
      description: 'A page of scadenze, ordered by urgency, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(expiryDashboardListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/expiries/pdf',
  summary: 'PDF export of the urgency dashboard (story 10.2, AC 2)',
  description:
    'Dedicated PDF route (spine :105), same query schema as `GET /api/v1/expiries` above. The status column is colored with the SAME red/yellow/green palette as the dashboard badge. No totals (a status list has nothing summable). Requires `expiries.manage`.',
  tags: ['Expiries'],
  security,
  request: { query: listAllExpiriesQuerySchema },
  responses: {
    200: { description: 'The urgency dashboard as a PDF document.', content: pdfContent() },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/expiries',
  summary: 'Register a new scadenza for a person (AC 1)',
  description:
    "Verification order: person exists -> archived -> expiry type exists -> deactivated -> ambito/profile compatibility (422 `SCOPE_MISMATCH`) -> duplicate (person, type) -> 409 pointing at the update endpoint instead. A scadenza already in the past may legitimately be registered (the real state of the world). Requires `expiries.manage`.",
  tags: ['Expiries'],
  security,
  request: { body: { content: jsonContent(registerExpirySchema), required: true } },
  responses: {
    201: { description: 'The created scadenza.', content: jsonContent(expiryItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/expiries/{id}',
  summary: 'Update a scadenza (partial patch, AC 1)',
  description:
    "Every field optional; `personId`/`expiryTypeId` are NOT patchable (a wrong type/person is corrected by delete + re-register). A PENDING proposal already filed against this scadenza is left untouched. Requires `expiries.manage`.",
  tags: ['Expiries'],
  security,
  request: { params: expiryIdParams, body: { content: jsonContent(updateExpirySchema), required: true } },
  responses: {
    200: { description: 'The updated scadenza.', content: jsonContent(expiryItemSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/expiries/{id}',
  summary: 'Delete a scadenza (admin correction tool, AC 1)',
  description:
    'For correcting a wrong type/person registration — deletes the scadenza and cascades to any `ExpiryUpdateProposal` rows (pending included). Requires `expiries.manage`.',
  tags: ['Expiries'],
  security,
  request: { params: expiryIdParams },
  responses: {
    204: { description: 'The scadenza was deleted.' },
    ...errorResponses(401, 403, 404),
  },
});

// --- Bookings (epic 7, story 7.1, FR-18) ------------------------------------
// Reserves a `[startsAt, endsAt)` interval on an aircraft for a person — see
// `bookings.service.ts`'s module doc-comment for the full creation matrix.

registry.registerPath({
  method: 'get',
  path: '/api/v1/bookings',
  summary: 'List bookings (paginated, filterable by period/aircraft/person, AC 1)',
  description:
    'Ordered by `startsAt asc, id asc` (soonest-first, tie-broken for stable pagination). `from`/`to` use the SAME semi-open `[startsAt, endsAt)` semantics as the overlap guard (`endsAt > from`, `startsAt < to`). Readable with `self.read` — every authenticated role holds it (FR-19, anticipated to its minimum for this story). Privacy masking (story 14.5): an actor without the `bookings.read.names` permission (PILOT/STUDENT) gets `personName`/`instructorName`/`instructorProfileId`/`notes`/`denyReason` forced to `null` on every booking that is not their own — `null` means "Occupato" (the slot is taken, identity withheld), never "no person". `personId` may only be used as a filter to query the actor\'s OWN bookings for such an actor (403 otherwise); an actor holding `bookings.read.names` sees every field unmasked and may filter by any `personId`.',
  tags: ['Bookings'],
  security,
  request: { query: listBookingsQuerySchema },
  responses: {
    200: {
      description: 'A page of bookings, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(bookingListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/bookings/pdf',
  summary: 'PDF export of the bookings list (story 13.7, AC 2)',
  description:
    "Dedicated PDF route (spine :105), NOT `?format=pdf` on the endpoint above — same query schema and period/aircraft/person/status filters as `GET /api/v1/bookings` (`page`/`pageSize`/`format`, also present on that schema, are ignored here; this always re-pages internally up to the PDF cap). Same columns as the `?format=xlsx` export. Readable with `self.read` (every authenticated role, same as the list). Same privacy masking as `GET /api/v1/bookings` (story 14.5): the Pilota column reads \"Occupato\" — never a name — for every booking that is not the requesting actor's own, unless the actor holds `bookings.read.names`.",
  tags: ['Bookings'],
  security,
  request: { query: listBookingsQuerySchema },
  responses: {
    200: { description: 'The bookings list as a PDF document.', content: pdfContent() },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/bookings',
  summary: 'Book an aircraft for a person over a future interval (AC 1/2/3, FR-18; story 7.4 AC 1/2: expiry block + admin force)',
  description:
    "`bookings.manage.any` (ADMIN-only) books for anyone, with an optional instructor. `bookings.manage.own` books for the actor's own person (an active pilot or instructor only, no instructor may be indicated — 403 otherwise) OR, for an instructor, on behalf of an allievo with an active student profile (mandatory `instructorProfileId` matching the actor's own profile, 403 checked BEFORE any query on the target person). Concurrency (AC 2): a `FOR UPDATE` lock on the `Aircraft` row inside one transaction serializes the overlap pre-check against every concurrent request on the same aircraft — two overlapping concurrent POSTs always yield exactly one 201 and one 409. `[startsAt, endsAt)` is semi-open: back-to-back bookings do not overlap. Story 16.3 (ops F2, ratifica R-16-a): the same PERSON, or the same INSTRUCTOR, may not hold two APPROVED bookings over overlapping intervals on ANY aircraft — 409 `PERSON_BUSY` / `INSTRUCTOR_BUSY`, with `details.bookingId`/`details.startsAt`/`details.endsAt` (ISO 8601 UTC) naming the earliest conflicting booking of that same person/instructor. Same semantics as the aircraft check (semi-open interval, only `APPROVED` occupies a slot, a `PENDING` never blocks), NOT derogable by `force`, and serialized by row locks on the `Person` and `InstructorProfile` rows (`FOR NO KEY UPDATE`: they never block a foreign-key check elsewhere) taken after the `Aircraft` one. Precedence when several subjects are busy: the aircraft 409 (code `CONFLICT`, no `details`, unchanged) wins, then `PERSON_BUSY`, then `INSTRUCTOR_BUSY`. Domain failures answer 422 with a stable code: `AIRCRAFT_OUT_OF_SERVICE` (with the reason), `BOOKING_IN_PAST`, `PERSON_NOT_BOOKABLE`. Story 7.4 (FR-21): the target person's registered scadenze are checked against the FLIGHT DAY — an expired document of a `blocksBooking` type answers 422 `EXPIRED_DOCUMENTS` (`details.documents` lists the blocking types); a non-blocking expired document is only a `warnings` entry in the 201 body. `force: true` (only usable with `bookings.manage.any` — 403 otherwise, checked before any further query) plus a mandatory `forceReason` bypasses a real block and is tracked (`forcedAt`/`forcedByUserId`/`forceReason`, only when something was actually bypassed).",
  tags: ['Bookings'],
  security,
  request: { body: { content: jsonContent(createBookingSchema), required: true } },
  responses: {
    201: {
      description: 'The created booking, plus any non-blocking expired-document warnings (`{ booking, warnings }`).',
      content: jsonContent(createBookingResponseSchema),
    },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/bookings/calendar',
  summary: 'List every booking overlapping a bounded date/time range, for the calendar view (AC 1, FR-19)',
  description:
    'Deliberately UNPAGINATED (a calendar renders a bounded window, never "page 2") — see `bookings.service.ts#listCalendarBookings`\'s doc-comment. `from`/`to` are BOTH required and compared as instants; `to` must be strictly after `from` and the range cannot exceed 8 days (`RANGE_TOO_WIDE`). Same semi-open overlap predicate and ordering as `GET /api/v1/bookings`. Readable with `self.read` (every authenticated role, FR-19). Same privacy masking as `GET /api/v1/bookings` (story 14.5): `personName`/`instructorName`/`instructorProfileId`/`notes`/`denyReason` are `null` on every entry that is not the requesting actor\'s own, for an actor without `bookings.read.names` — `null` means "Occupato", never "no person"; no `personId` filter exists on this endpoint.',
  tags: ['Bookings'],
  security,
  request: { query: calendarBookingsQuerySchema },
  responses: {
    200: { description: 'Every booking overlapping the range.', content: jsonContent(calendarBookingsResponseSchema) },
    ...errorResponses(401, 403, 422),
  },
});

// --- Booking edit/cancel (epic 7, story 7.3, FR-20) -------------------------
// Soft-cancel + tracked edit — see `bookings.service.ts#updateBooking`/
// `#cancelBooking`'s doc-comments for the full matrix.

registry.registerPath({
  method: 'patch',
  path: '/api/v1/bookings/{id}',
  summary: 'Move a booking: change its aircraft/interval/notes (AC 1/2, FR-20)',
  description:
    "Partial PATCH — `aircraftId`/`startsAt`/`endsAt`/`notes` only (`personId`/`instructorProfileId` are immutable, absent from the schema); the resulting merged interval is what gets validated. `bookings.manage.any` (ADMIN-only) may move ANY booking, with NO temporal constraint (can even correct one already in progress). `bookings.manage.own` may move only a booking where `personId`/`instructorProfileId` matches the actor's own person/active instructor profile, and only while it has not yet started (422 `BOOKING_ALREADY_STARTED`) — the NEW interval must also be future (422 `BOOKING_IN_PAST`). Concurrency (same discipline as `POST /api/v1/bookings`): the destination aircraft AND the current one (if different) are locked together (`ORDER BY id FOR UPDATE`) inside one transaction; the destination is re-validated (404/409 archived/422 `AIRCRAFT_OUT_OF_SERVICE`, even for an admin) and the overlap pre-check excludes this booking and every CANCELLED row. Story 16.3: the pre-check covers the booking's own person and instructor too, on the NEW interval — 409 `PERSON_BUSY` / `INSTRUCTOR_BUSY` with the same `details` shape as `POST /api/v1/bookings`, same precedence (the aircraft 409 first). An already-cancelled booking answers 409.",
  tags: ['Bookings'],
  security,
  request: { params: bookingIdParams, body: { content: jsonContent(updateBookingSchema), required: true } },
  responses: {
    200: { description: 'The updated booking.', content: jsonContent(bookingItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/bookings/{id}/cancel',
  summary: 'Cancel (soft) a booking, freeing its slot (AC 1/2, FR-20)',
  description:
    "No body — FR-20 tracks who/when (`cancelledAt`/`cancelledByUserId`), not why (mirrors `POST /api/v1/flights/{id}/cancel`'s shape, minus its mandatory `reason`). Same permission/temporal matrix as `PATCH /api/v1/bookings/{id}` (`bookings.manage.any` always allowed; `bookings.manage.own` only before the booking starts, 422 `BOOKING_ALREADY_STARTED` otherwise). Never locks any `Aircraft` row (cancelling can only free a slot, never create a conflict) — an atomic `updateMany` guard makes a double-cancel race answer 409 for the loser.",
  tags: ['Bookings'],
  security,
  request: { params: bookingIdParams },
  responses: {
    200: { description: 'The cancelled booking.', content: jsonContent(bookingItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- Booking approval workflow (epic 12, story 12.2) ------------------------
// PENDING/APPROVED/DENIED/FLOWN/NO_SHOW — see
// `bookings.service.ts#transitionBooking`'s doc-comment for the full matrix.

registry.registerPath({
  method: 'post',
  path: '/api/v1/bookings/{id}/transition',
  summary: 'Move a booking through the approval workflow: approve/deny/flown/no-show/riapri (AC 3, epic 12 story 12.2)',
  description:
    "`bookings.manage.any` only, for EVERY transition (`to` excludes `CANCELLED` — cancelling stays `POST /api/v1/bookings/{id}/cancel`'s own endpoint). `PENDING -> APPROVED` re-runs the create-time checks, in the create-time order and with the create-time codes — story 16.3 (ops F4): the booking's person (409 archived, 422 `PERSON_NOT_BOOKABLE` without an active flying profile) and instructor (409 deactivated) FIRST; then 422 `EXPIRED_DOCUMENTS`, 422 `BOOKING_OUTSIDE_WINDOW`, 409 archived / 422 `AIRCRAFT_OUT_OF_SERVICE` under an `Aircraft` `FOR UPDATE` lock, and the overlap pre-check on the aircraft (409 `CONFLICT`) AND on the booking's person and instructor (409 `PERSON_BUSY` / `INSTRUCTOR_BUSY`, same `details` shape and precedence as `POST /api/v1/bookings`) — and stamps `decidedAt`/`decidedByUserId`. Ratified (R-16-b): approving a booking that has ALREADY STARTED, or is entirely in the past, is PERMITTED — there is no `BOOKING_IN_PAST` on approval (staff regularize bookings after the fact). `PENDING -> DENIED` requires a `reason` (422 `BOOKING_DENY_REASON_REQUIRED` otherwise), stamps `denyReason`+`decidedAt`/`decidedByUserId`, and sends a best-effort email to the booking-holder. `APPROVED -> FLOWN | NO_SHOW` stamps `closedAt`/`closedByUserId` — only once the slot has STARTED (story 16.3, ops F9, ratifica R-16-b): on a booking whose `startsAt` is still in the future it answers 422 `BOOKING_NOT_STARTED` (a slot in progress can already be closed). `DENIED | FLOWN | NO_SHOW -> PENDING` (\"riapri\") clears every decision/closure field, whenever the booking starts. Any other pair answers 422 `BOOKING_TRANSITION_INVALID`. Race-safe: an atomic `updateMany` guard answers 409 if the booking's status changed since it was read.",
  tags: ['Bookings'],
  security,
  request: { params: bookingIdParams, body: { content: jsonContent(transitionBookingSchema), required: true } },
  responses: {
    200: { description: 'The booking in its new status.', content: jsonContent(bookingItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- Jobs (epic 6, story 6.3, AD-9) -----------------------------------------
// Bearer-protected routes invoked by an EXTERNAL cron, never a user session
// (`jobsSecurity`/`bearerAuth` above) — the only route family besides `Auth`
// that isn't `cookieAuth`-gated.

registry.registerPath({
  method: 'post',
  path: '/api/v1/jobs/expiry-alerts',
  summary: 'Run the automatic expiry-alert job (FR-37)',
  description:
    "Story 6.3, AC 1/2 — for every scadenza whose 60/30/7/0-day alert threshold(s) are newly due, sends ONE email to the titolare (their own locale) plus, if the run consumed at least one alert, ONE digest email to every active ADMIN user (their own locale). Idempotent (AD-9): `SentAlert` has a unique `(expiryId, threshold)` constraint, so running this twice for the same day sends no duplicate email and creates no duplicate row. Authenticated with a `JOBS_SECRET` bearer token — NOT a user session/RBAC (401 on missing/wrong token; 500 if `JOBS_SECRET` itself is unconfigured, never an insecure fallback).",
  tags: ['Jobs'],
  security: jobsSecurity,
  responses: {
    200: { description: 'The job ran (possibly with nothing to do — see `alertsCreated`).', content: jsonContent(expiryAlertsJobResultSchema) },
    ...errorResponses(401),
  },
});

// --- PPR (epic 8, story 8.1, FR-22) -----------------------------------------
// The first fully PUBLIC path (`security: []`, no `cookieAuth`/`bearerAuth`
// at all — unlike `Jobs`, which is bearer-protected) reachable by anyone who
// has the URL, anti-abuse protected only by the honeypot field and the
// per-IP rate limit (see `ppr.service.ts`).

registry.registerPath({
  method: 'post',
  path: '/api/v1/ppr-requests',
  summary: 'Submit a public PPR (prior permission to land) request',
  description:
    'Story 8.1, AC 1/2 — no authentication, reachable from the public `/[locale]/ppr` form. Creates a `PENDING` PprRequest and best-effort sends a localized receipt email (never fails the request). A `website` field left non-empty is treated as a honeypot: the SAME 201 body is returned, but nothing is persisted, no email is sent, and the attempt does not count toward the rate limit (indistinguishable from success). Otherwise, more than 5 requests from the same IP within the last hour answer 429 `RATE_LIMITED`. `eta` in the past answers 422 `ETA_IN_PAST`; a present `etd` at or before `eta` answers 422 `ETD_NOT_AFTER_ETA`.',
  tags: ['Ppr'],
  security: [],
  request: { body: { content: jsonContent(createPprRequestSchema), required: true } },
  responses: {
    201: { description: 'The request was recorded as PENDING (or silently accepted as a honeypot catch).', content: jsonContent(pprRequestCreatedResponseSchema) },
    ...errorResponses(422, 429),
  },
});

// --- PPR admin approval queue (epic 8, story 8.2, FR-23) --------------------
// Authenticated, `ppr.manage`-gated. The GET below shares its pathname with
// the public POST above (`PUBLIC_API_PATHS` in `src/proxy.ts` bypasses the
// middleware's OWN session check for that exact path, every method) — see
// the route file's doc-comment: `apiRoute`'s own default (`auth: 'required'`)
// plus `authorize()` inside the service are what actually guard it (AD-5).
// The approve/reject/settings paths below are NOT in `PUBLIC_API_PATHS`.

registry.registerPath({
  method: 'post',
  path: '/api/v1/ppr-requests/manual',
  summary: 'Admin manual PPR intake, optionally auto-approved (AC 1, epic 12 story 12.4)',
  description:
    "Admin-entered PPR (console's \"PPR manuale\" slide-over, or the movements page's \"Registra arrivo\" with `approveImmediately: true` in the SAME body shape) — no honeypot, no rate limit (an admin enters it, not the public), no receipt/approval email. `email` is optional (a manual entry may have only a phone) but at least one of `email`/`phone` is required. Unlike the public POST, a past `eta` is ACCEPTED (\"Registra arrivo\" logs an aircraft that has just landed); a present `etd` at or before `eta` still answers 422 `ETD_NOT_AFTER_ETA`. With `approveImmediately: true`, issues the next atomic per-year PPR number in the SAME transaction as the create. Requires `ppr.manage`. Supports `Idempotency-Key`.",
  tags: ['Ppr'],
  security,
  request: { headers: [idempotencyKeyHeader], body: { content: jsonContent(createManualPprRequestSchema), required: true } },
  responses: {
    201: { description: 'The created request — PENDING, or APPROVED with its assigned pprNumber when `approveImmediately` was set.', content: jsonContent(pprRequestItemSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/ppr-requests',
  summary: 'List the admin PPR approval queue, or the filterable register (AC 1/2, story 8.3 AC 2)',
  description:
    "Defaults to `status=PENDING` (the actionable queue, FIFO `createdAt asc`); pass `APPROVED`/`REJECTED`/`COMPLETED`/`CANCELLED`, or `ALL` for no status filter (the register, story 8.3). Optional `from`/`to` (`YYYY-MM-DD`) bound `eta` — a semi-open Europe/Rome day range, since the register is a register of ARRIVALS. Optional `pprNumber` (`PPR-<year>-NNNN`, story 15.9) filters on the issued number with an exact match — a malformed value answers 422, a well-formed unknown one an empty page; the number exists only on approved/completed requests. Every detail field EXCEPT `submitterIp` (never exposed — anti-abuse technical datum). Paginated `{ items, total, page, pageSize }`, same shape as `GET /api/v1/cash-movements`. Requires `ppr.manage`.",
  tags: ['Ppr'],
  security,
  request: { query: listPprRequestsQuerySchema },
  responses: {
    200: {
      description: 'A page of PPR requests, or (`?format=xlsx`) the same rows as an Excel workbook (story 10.1).',
      content: { ...jsonContent(pprRequestListResponseSchema), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/ppr-requests/pdf',
  summary: 'PDF export of the PPR queue/register (story 13.6, AC 4/5)',
  description:
    "Dedicated PDF route (spine :105), NOT `?format=pdf` on the endpoint above — same query schema and status/from/to filters as `GET /api/v1/ppr-requests` (`page`/`pageSize`/`format`, also present on that schema, are ignored here; this always re-pages internally up to the PDF cap). Same columns as the `?format=xlsx` export, reused from both the movements view and the PPR approval console's own export menu. Requires `ppr.manage`.",
  tags: ['Ppr'],
  security,
  request: { query: listPprRequestsQuerySchema },
  responses: {
    200: { description: 'The PPR queue/register as a PDF document.', content: pdfContent() },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/ppr-requests/{id}/approve',
  summary: 'Approve a pending PPR request (AC 1)',
  description:
    "No body. Assigns the next atomic per-year PPR number ('PPR-<year>-NNNN', Europe/Rome calendar year) and sends a best-effort outcome email to the requester (their OWN form locale), including the admin-configured operating instructions when non-empty for that locale. 404 on an unknown id; already-decided (by ANY outcome, including a concurrent decision) answers 409 `PPR_ALREADY_DECIDED` and never consumes a PPR number. Requires `ppr.manage`. Supports `Idempotency-Key`.",
  tags: ['Ppr'],
  security,
  request: { params: pprRequestIdParams, headers: [idempotencyKeyHeader] },
  responses: {
    200: { description: 'The approved request, with its assigned pprNumber.', content: jsonContent(pprRequestItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/ppr-requests/{id}/reject',
  summary: 'Reject a pending PPR request with a mandatory reason (AC 2)',
  description:
    'Body `{ reason }` (1-500 chars, mandatory). Never touches the PPR number counter. Sends a best-effort outcome email including the reason, in the requester\'s own form locale. 404 on an unknown id; already-decided answers 409 `PPR_ALREADY_DECIDED`. Requires `ppr.manage`. Supports `Idempotency-Key`.',
  tags: ['Ppr'],
  security,
  request: { params: pprRequestIdParams, headers: [idempotencyKeyHeader], body: { content: jsonContent(rejectPprRequestSchema), required: true } },
  responses: {
    200: { description: 'The rejected request.', content: jsonContent(pprRequestItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- PPR closure (epic 8, story 8.3, FR-24) ----------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/v1/ppr-requests/{id}/complete',
  summary: 'Complete an APPROVED PPR request, charging the landing fee (AC 1)',
  description:
    'Body `{ landingFeeCents }` (integer euro cents, 0 admitted — a waived fee). When positive, records a `CashMovement` in the "PPR" cash category, linked to this request, in the SAME transaction as the closure (both commit or neither does). 404 on an unknown id; any status other than `APPROVED` (still open, or already closed) answers 409 `PPR_NOT_APPROVED`. Requires `ppr.manage`. Supports `Idempotency-Key`.',
  tags: ['Ppr'],
  security,
  request: { params: pprRequestIdParams, headers: [idempotencyKeyHeader], body: { content: jsonContent(completePprRequestSchema), required: true } },
  responses: {
    200: { description: 'The completed request, with its recorded landingFeeCents.', content: jsonContent(pprRequestItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/ppr-requests/{id}/cancel',
  summary: 'Cancel an APPROVED PPR request that never showed up (AC 2)',
  description:
    'No body — no fee, no cash movement. 404 on an unknown id; any status other than `APPROVED` answers 409 `PPR_NOT_APPROVED`. Requires `ppr.manage`. Supports `Idempotency-Key`.',
  tags: ['Ppr'],
  security,
  request: { params: pprRequestIdParams, headers: [idempotencyKeyHeader] },
  responses: {
    200: { description: 'The cancelled request.', content: jsonContent(pprRequestItemSchema) },
    ...errorResponses(401, 403, 404, 409),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/ppr-operating-instructions',
  summary: 'Read the PPR approval-email operating instructions (AC 1)',
  description:
    "`{ it, en }` — the free-text note appended (per-locale, only when non-empty) to the PPR approval email. Absent/never-configured reads as `''` for both languages, never `null`. Requires `ppr.manage` (an admin sees these from the queue page; only `settings.manage` can edit them, see the PUT sibling below). First real use of the `AppSetting` K/V store.",
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current instructions.', content: jsonContent(pprOperatingInstructionsSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/ppr-operating-instructions',
  summary: 'Set the PPR approval-email operating instructions (AC 1)',
  description: 'Body `{ it, en }` (max 2000 chars each) — both locales are always written together. Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(pprOperatingInstructionsSchema), required: true } },
  responses: {
    200: { description: 'The saved instructions.', content: jsonContent(pprOperatingInstructionsSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/ppr-landing-fee',
  summary: 'Read the default PPR landing fee (story 8.3, AC 1)',
  description:
    "`{ landingFeeCents }` — the admin-configured default landing fee (integer euro cents), used to prefill the completion panel. Absent/never-configured reads as `0`. Requires `ppr.manage` (an admin sees it while completing a PPR; only `settings.manage` can edit it, see the PUT sibling below).",
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current default landing fee.', content: jsonContent(pprLandingFeeDefaultSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/ppr-landing-fee',
  summary: 'Set the default PPR landing fee (story 8.3, AC 1)',
  description: 'Body `{ landingFeeCents }` (integer euro cents, 0..2147483647). Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(pprLandingFeeDefaultSchema), required: true } },
  responses: {
    200: { description: 'The saved default landing fee.', content: jsonContent(pprLandingFeeDefaultSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/airfield',
  summary: 'Read the airfield branding used in exported PDFs (story 10.2, AC 1; name-only since story 13.8, AC 4)',
  description:
    "`{ name }` — the name shown in every exported PDF's header. Absent/never-configured reads as `{ name: 'AirManager' }`. NO permission gate beyond an authenticated session: every role that can export a PDF needs the header, and the branding itself is not sensitive.",
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current airfield branding.', content: jsonContent(airfieldBrandingSchema) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/airfield',
  summary: 'Set the airfield branding (story 10.2, AC 1; name-only since story 13.8, AC 4)',
  description: "Body `{ name }` — `name` 1..200 chars. Admin-only (`settings.manage`).",
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(airfieldBrandingSchema), required: true } },
  responses: {
    200: { description: 'The saved airfield branding.', content: jsonContent(airfieldBrandingSchema) },
    ...errorResponses(401, 403, 422),
  },
});

// --- Settings sub-resources + METAR (epic 12, story 12.11 — registered in
// 12.13, F5/review 12.11 action item) ----------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/club',
  summary: 'Read the club identity (ICAO + contact email, story 12.11, AC 1)',
  description:
    "`{ icao, contactEmail }` — two `AppSetting` keys read/written together as one DTO (`airfield.name` stays on the separate `settings/airfield` above). NO permission gate beyond an authenticated session (same asymmetry as `settings/airfield`).",
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current club identity.', content: jsonContent(clubIdentitySchema) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/club',
  summary: 'Set the club identity (story 12.11, AC 1/2)',
  description: 'Body `{ icao, contactEmail }`. Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(clubIdentitySchema), required: true } },
  responses: {
    200: { description: 'The saved club identity.', content: jsonContent(clubIdentitySchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/scheduling',
  summary: 'Read the booking-window scheduling settings (story 12.11, AC 1/4)',
  description:
    "`{ openTime, closeTime, minSlotMinutes, turnaroundMinutes, maxAdvanceDays }` — advisory defaults booking create/approve enforce (422 `BOOKING_OUTSIDE_WINDOW`); each field reads `null` until an admin saves the card once (backward-safe: absent keys impose no new constraint). NO permission gate: any actor creating a booking needs these, not just an admin.",
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current scheduling settings.', content: jsonContent(schedulingSettingsDtoSchema) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/scheduling',
  summary: 'Set the booking-window scheduling settings (story 12.11, AC 1/4)',
  description: 'Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(schedulingSettingsSchema), required: true } },
  responses: {
    200: { description: 'The saved scheduling settings.', content: jsonContent(schedulingSettingsDtoSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/smtp',
  summary: 'Read the SMTP settings (story 12.11, AC 1/2)',
  description:
    '`{ host, port, security, user, from, hasPassword }` — `pass` is write-only, NEVER present on the GET response (`hasPassword` tells the UI whether one is already stored). Admin-only (`settings.manage`): unlike `settings/scheduling`, nobody but the admin editing this card needs to see it.',
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current SMTP settings (password omitted).', content: jsonContent(smtpSettingsDtoSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/smtp',
  summary: 'Set the SMTP settings (story 12.11, AC 1/2)',
  description: 'Body `{ host, port, security, user, pass?, from }` — `pass` optional (omit to keep the existing one). Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(smtpSettingsInputSchema), required: true } },
  responses: {
    200: { description: 'The saved SMTP settings (password omitted).', content: jsonContent(smtpSettingsDtoSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/settings/smtp/test-email',
  summary: 'Send a test email through the configured SMTP settings (story 12.11, AC 1/2)',
  description: '`{ sent: boolean }` — `sent: false` on a mail-transport failure, never a 5xx (the service\'s own contract). Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The send attempt result.', content: jsonContent(testEmailResultSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/metar-station',
  summary: 'Read the METAR station ICAO (story 12.11, AC 1/5)',
  description: '`{ station }` — the ICAO the sidebar weather widget fetches. NO permission gate: the widget renders for every authenticated role.',
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current METAR station.', content: jsonContent(metarStationDtoSchema) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/metar-station',
  summary: 'Set the METAR station ICAO (story 12.11, AC 1/5)',
  description: 'Body `{ station }`. Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(metarStationInputSchema), required: true } },
  responses: {
    200: { description: 'The saved METAR station.', content: jsonContent(metarStationDtoSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/settings/membership-fee',
  summary: 'Read the default annual membership fee (ratifica utente 1, story 12.11, AC 1)',
  description:
    '`{ annualFeeCents }` — the admin-configured default, prefilled by the Scadenze "Quota associativa" action. Requires `finance.manage` (ADMIN-only).',
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current default membership fee.', content: jsonContent(membershipFeeSettingSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/membership-fee',
  summary: 'Set the default annual membership fee (ratifica utente 1, story 12.11, AC 1)',
  description: 'Body `{ annualFeeCents }` (integer euro cents). Admin-only (`settings.manage`).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(membershipFeeSettingSchema), required: true } },
  responses: {
    200: { description: 'The saved default membership fee.', content: jsonContent(membershipFeeSettingSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/settings/treasury',
  summary: 'Set the treasury opening balances (story Billing-1, AC 3)',
  description:
    'Body `{ openingCashCents, openingBankCents, openingDate }` — the baseline `getBillingSummary`\'s cash/bank running balances add every subsequent `CASH`/`BANK_TRANSFER`+`POS` `CashMovement` from `openingDate` onward to. Admin-only (`settings.manage`). No GET route yet (Billing-2\'s Impostazioni card is the first reader-through-HTTP; `getBillingSummary` reads the stored values directly, server-side).',
  tags: ['Settings'],
  security,
  request: { body: { content: jsonContent(treasurySettingsSchema), required: true } },
  responses: {
    200: { description: 'The saved treasury opening balances.', content: jsonContent(treasurySettingsSchema) },
    ...errorResponses(401, 403, 422),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/metar',
  summary: 'Read the current METAR for the configured station (story 12.11, AC 5)',
  description:
    'Authenticated, no further gate: every role sees the sidebar weather card. `null` whenever no station is configured or the upstream fetch to aviationweather.gov failed — NEVER a 4xx/5xx for that case, this is a best-effort widget (10-min in-memory cache).',
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The current METAR, or `null` if unavailable.', content: jsonContent(metarResponseSchema) },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/expiry-alerts/trigger',
  summary: 'Manually re-run the expiry-alerts job (story 12.11, AC 3; ratifica utente 4)',
  description:
    "Session-authenticated counterpart to the bearer-only `POST /api/v1/jobs/expiry-alerts` (INTACT, unchanged) — re-runs the SAME idempotent job (`SentAlert`-guarded, story 6.3, AD-9): a manual re-run is a no-op when nothing new is due. Admin-only (`settings.manage`, gated directly in the route).",
  tags: ['Settings'],
  security,
  responses: {
    200: { description: 'The job run result.', content: jsonContent(expiryAlertsJobResultSchema) },
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/people/{id}/membership-fee',
  summary: "Charge a person's annual membership fee and renew their membership expiry (story 12.11, AC 7; ratifiche utente 1/1a/1b)",
  description:
    'Body `{ amountCents, override? }` — `override: true` (ADMIN-only, `settings.manage`) bypasses the insufficient-balance refusal. `Idempotency-Key` is MANDATORY (422 `IDEMPOTENCY_KEY_REQUIRED` without it, same "money-mutating discriminated write" convention as `POST /api/v1/transactions`) — a network retry of this addebito+renewal gesture must replay, never double-charge. Requires `finance.manage`.',
  tags: ['People'],
  security,
  request: { params: personIdParams, headers: [requiredIdempotencyKeyHeader], body: { content: jsonContent(chargeMembershipFeeSchema), required: true } },
  responses: {
    200: { description: 'The refreshed account overview plus the renewed membership expiry.', content: jsonContent(chargeMembershipFeeResponseSchema) },
    ...errorResponses(401, 403, 404, 422),
  },
});

// --- Instructor compensation (epic 12, story 12.7) ---------------------------

const instructorPersonIdParams = z.object({
  personId: z.string().meta({ description: "Instructor's Person id (cuid).", example: 'clx1a2b3c4d5e6f7g8h9' }),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/instructor-compensation',
  summary: 'Compensation summary (all ACTIVE instructors), or one instructor DETAIL with `?personId=`',
  description:
    "No `personId`: every active instructor's mtd/ytd/total flown minutes and owed cents (`payoutRateCents: null` -> `owed*Cents: null`, shown as \"—\"). With `?personId=`: the SAME row plus the 5 most recent SCHOOL flights as CFI and the distinct students among them (the profile slide-over — no additional endpoint). `?format=xlsx` exports the summary (never the detail). Requires `finance.manage` (ADMIN-only).",
  tags: ['InstructorCompensation'],
  security,
  request: { query: instructorCompensationQuerySchema },
  responses: {
    200: {
      description: 'The summary array, or (`?personId=`) the single detail object, or (`?format=xlsx`) the summary as an Excel workbook.',
      content: { ...jsonContent(z.union([instructorCompensationSummaryResponseSchema, instructorCompensationDetailSchema])), ...xlsxContent() },
    },
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/instructor-payouts',
  summary: 'Record an instructor payout',
  description:
    "Body `{ instructorPersonId, amountCents, periodStart, periodEnd, method, notes? }` — `amountCents > 0`, `periodStart <= periodEnd`. 404 on an unknown `instructorPersonId`; 409 if the person has no active instructor profile. `Idempotency-Key` is MANDATORY (422 `IDEMPOTENCY_KEY_REQUIRED` without it) — see `requiredIdempotencyKeyHeader`'s doc-comment. Requires `payouts.manage` (ADMIN-only).",
  tags: ['InstructorCompensation'],
  security,
  request: { headers: [requiredIdempotencyKeyHeader], body: { content: jsonContent(recordInstructorPayoutSchema), required: true } },
  responses: {
    201: { description: 'The recorded payout.', content: jsonContent(instructorPayoutItemSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/instructor-compensation/{personId}/rate',
  summary: "Set (or clear) an instructor's hourly payout rate",
  description:
    'Body `{ payoutRateCents }` — an integer `>= 0`, or `null` to unset it (the summary/detail then show "—" and `owed*Cents: null`). Distinct from `PUT /api/v1/people/{id}/instructor-rates` (the STUDENT-charged rate, `settings.manage`, D8) — this is the amount PAID to the instructor. 404 on an unknown person; 409 if the person has no active instructor profile. Requires `payouts.manage` (ADMIN-only).',
  tags: ['InstructorCompensation'],
  security,
  request: { params: instructorPersonIdParams, body: { content: jsonContent(setInstructorPayoutRateSchema), required: true } },
  responses: {
    200: { description: 'The current payout rate.', content: jsonContent(setInstructorPayoutRateSchema) },
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

// --- Statistics/reports (epic 12, story 12.10) ---------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/stats',
  summary: 'Aggregated statistics (KPIs, monthly series, fleet/movement/instructor/pilot breakdowns)',
  description:
    "Read-only aggregation over flights/PPR/ledger/compensation, no new model. `period` (`month`|`year`, REQUIRED) picks the KPI window's granularity; `ref` (`YYYY-MM`, optional, defaults to the current Europe/Rome month) anchors it — full history is supported, a FUTURE `ref` answers 422. The chart series is always a ROLLING window ending at `ref` (6 points for `period=month`, 12 for `period=year`), independent of the KPI window's own calendar alignment. `kpis.revenueCents`/`series.revenueCents` are the club-centric ledger total (`transactions.service.ts#getLedgerRevenueCents`, same sign-normalization as `GET /api/v1/transactions`'s KPIs); `fleet[].revenueCents`/`topPilots[].spentCents` are FLIGHT-charge totals instead (a deliberately different notion). `instructors[].owedCents` is `null` unless `ref` is the CURRENT period. Requires `finance.manage` (ADMIN-only).",
  tags: ['Stats'],
  security,
  request: { query: statsQuerySchema },
  responses: {
    200: { description: 'The aggregated statistics for the requested period.', content: jsonContent(statsResponseSchema) },
    ...errorResponses(401, 403, 422),
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
