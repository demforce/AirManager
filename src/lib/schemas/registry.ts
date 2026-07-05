import { OpenAPIRegistry, OpenApiGeneratorV31, type ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { z } from './zod-with-openapi';
import { accountOverviewSchema, recordTopUpSchema } from './accounts';
import {
  aircraftListItemSchema,
  aircraftListResponseSchema,
  createAircraftSchema,
  createHourMeterAdjustmentSchema,
  hourMeterAdjustmentListResponseSchema,
  listAircraftQuerySchema,
  listHourMeterAdjustmentsQuerySchema,
  setOutOfServiceSchema,
  updateAircraftSchema,
} from './aircraft';
import { forgotPasswordSchema, setPasswordSchema } from './auth-tokens';
import { errorEnvelopeSchema, okResponseSchema } from './common';
import { meResponseSchema } from './me';
import {
  createPersonSchema,
  instructorProfileRequestSchema,
  instructorProfileSchema,
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
registry.register('Aircraft', aircraftListItemSchema);
registry.register('AircraftList', aircraftListResponseSchema);
registry.register('CreateAircraftRequest', createAircraftSchema);
registry.register('UpdateAircraftRequest', updateAircraftSchema);
registry.register('SetOutOfServiceRequest', setOutOfServiceSchema);
registry.register('CreateHourMeterAdjustmentRequest', createHourMeterAdjustmentSchema);
registry.register('HourMeterAdjustmentList', hourMeterAdjustmentListResponseSchema);
registry.register('AccountOverview', accountOverviewSchema);
registry.register('RecordTopUpRequest', recordTopUpSchema);
registry.register('User', userListItemSchema);
registry.register('UserList', userListResponseSchema);
registry.register('CreateUserRequest', createUserSchema);
registry.register('UpdateUserRequest', updateUserSchema);
registry.register('SetPasswordRequest', setPasswordSchema);
registry.register('ForgotPasswordRequest', forgotPasswordSchema);

const idParams = z.object({ id: z.string().meta({ description: 'User id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const personIdParams = z.object({ id: z.string().meta({ description: 'Person id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });
const aircraftIdParams = z.object({ id: z.string().meta({ description: 'Aircraft id (cuid).', example: 'clx1a2b3c4d5e6f7g8h9' }) });

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
