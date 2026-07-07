import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { CreateInstructorRateInput } from '@/lib/schemas/people';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';

/**
 * Historicized instructor rates (epic 4, story 4.2, AD-4/AD-2) — the
 * deliberate twin of `rates.service.ts` (story 4.1): same historicization
 * rule (AD-4: the rate in effect for a date D is the row with the MAXIMUM
 * `validFrom <= D`), same append-only shape (AD-3's spirit — there is
 * deliberately no update/delete function here: a wrong price is corrected by
 * `createInstructorRate`-ing a NEW rate with a later `validFrom`, the history
 * never changes). The only real difference is the subject: an instructor
 * (`InstructorProfile`), resolved from the person-scoped route's `personId`,
 * instead of an `aircraftId`.
 */
export type InstructorRateListItem = {
  id: string;
  instructorProfileId: string;
  priceCentsPerHour: number;
  /** Calendar-only date (`YYYY-MM-DD`), never a timestamp — see `toDateOnlyString`. */
  validFrom: string;
  actorUserId: string;
  actorEmail: string;
  createdAt: Date;
};

const RATE_SELECT = {
  id: true,
  instructorProfileId: true,
  priceCentsPerHour: true,
  validFrom: true,
  actorUserId: true,
  actorUser: { select: { email: true } },
  createdAt: true,
} as const;

type SelectedRate = {
  id: string;
  instructorProfileId: string;
  priceCentsPerHour: number;
  validFrom: Date;
  actorUserId: string;
  actorUser: { email: string };
  createdAt: Date;
};

function toListItem(rate: SelectedRate): InstructorRateListItem {
  return {
    id: rate.id,
    instructorProfileId: rate.instructorProfileId,
    priceCentsPerHour: rate.priceCentsPerHour,
    validFrom: toDateOnlyString(rate.validFrom),
    actorUserId: rate.actorUserId,
    actorEmail: rate.actorUser.email,
    createdAt: rate.createdAt,
  };
}

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Resolves the person-scoped route's `personId` to its `InstructorProfile`
 * id (routes are `/api/v1/people/{id}/instructor-rates`, never keyed on the
 * profile id directly — same shape as `.../account/...`). Missing person →
 * 404 (never revealing an instructor profile's existence for an unknown
 * person). A person that exists but never activated the instructor profile
 * resolves to `null` — callers decide whether that's a 409 (write) or an
 * empty result (read), same split as `getPerson`'s profile handling.
 */
async function resolveInstructorProfile(
  personId: string,
): Promise<{ id: string; deactivatedAt: Date | null } | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { instructorProfile: { select: { id: true, deactivatedAt: true } } },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  return person.instructorProfile;
}

/**
 * Pre-check for the check-then-write race the `try`/`catch` around `create`
 * backstops (same pattern as `rates.service.ts#assertRateAvailable`).
 */
async function assertRateAvailable(instructorProfileId: string, validFrom: Date): Promise<void> {
  const existing = await prisma.instructorRate.findFirst({
    where: { instructorProfileId, validFrom },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('A rate with this validFrom already exists for this instructor.');
  }
}

/**
 * Records a new historicized rate (AC 1/2). `settings.manage` (admin) only —
 * pricing configuration, same choice as `createAircraftRate` (deliberately
 * stricter than the wider `people.read` this story grants to the list/
 * effective reads below).
 *
 * Instructor resolution (Dev Notes' decision point): a person who never
 * activated the instructor profile, OR whose profile was deactivated, gets a
 * **409** `ConflictError` — the person demonstrably exists (`people.read`
 * actors can already see them) so there's no enumeration concern, and this
 * mirrors `createAircraftRate`'s own "archived aircraft → 409" shape (valid
 * id, wrong state). An unknown person is a 404.
 */
export async function createInstructorRate(
  actor: Actor,
  personId: string,
  input: CreateInstructorRateInput,
): Promise<InstructorRateListItem> {
  authorize(actor, 'settings.manage');

  const instructorProfile = await resolveInstructorProfile(personId);
  if (!instructorProfile) {
    throw new ConflictError('This person has no active instructor profile.');
  }
  if (instructorProfile.deactivatedAt !== null) {
    throw new ConflictError('This person has no active instructor profile.');
  }

  const validFrom = parseDateOnlyUtc(input.validFrom);

  // Check-then-write pre-check; the try/catch below backstops the
  // concurrency race (lezione review: "mai fidarsi solo del pre-check").
  await assertRateAvailable(instructorProfile.id, validFrom);

  let rate;
  try {
    rate = await prisma.instructorRate.create({
      data: {
        instructorProfileId: instructorProfile.id,
        priceCentsPerHour: input.priceCentsPerHour,
        validFrom,
        actorUserId: actor.userId,
      },
      select: RATE_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A rate with this validFrom already exists for this instructor.');
    }
    throw error;
  }

  return toListItem(rate);
}

/**
 * Lists an instructor's full rate history, most recent `validFrom` first (AC
 * 1). `people.read` (staff+admin) — WIDER than `createInstructorRate`'s
 * `settings.manage` (Dev Notes: instructor data lives under `people`, so the
 * same permission that reads a person's profile also reads their pricing —
 * a deliberately different split from 4.1's `aircraft.manage`, documented
 * here since it's the one asymmetry between the two twins).
 *
 * A person that exists but never activated (or deactivated) the instructor
 * profile gets an empty list, NOT a 404 — same "estratto conto vuoto" choice
 * as `listAccountMovements` (story 3.2) for a person without an account yet.
 * Only an unknown person is a 404.
 */
export async function listInstructorRates(actor: Actor, personId: string): Promise<InstructorRateListItem[]> {
  authorize(actor, 'people.read');

  const instructorProfile = await resolveInstructorProfile(personId);
  if (!instructorProfile) {
    return [];
  }

  const rates = await prisma.instructorRate.findMany({
    where: { instructorProfileId: instructorProfile.id },
    select: RATE_SELECT,
    orderBy: [{ validFrom: 'desc' }],
    take: 500,
  });

  return rates.map(toListItem);
}

/**
 * The rate in effect for a given date (AD-4, the cardinal rule of this
 * story, identical to `getEffectiveRate`): the row with the MAXIMUM
 * `validFrom <= onDate`. Uses Prisma's typed query (never raw SQL against
 * the `date` column) so `@db.Date` binds as a real Postgres `date` — TZ-safe
 * (review 3.5 F1's lesson). Returns `null` when the instructor has no rate
 * on or before `onDate`, OR when the person has no (active) instructor
 * profile — this is the hook epic 5's flight snapshot will call; it is NOT
 * consumed by a dedicated route in this story, only internally (the
 * "current price" shown in the UI, `onDate = today`).
 */
export async function getEffectiveInstructorRate(
  actor: Actor,
  personId: string,
  onDate: Date,
): Promise<InstructorRateListItem | null> {
  authorize(actor, 'people.read');

  const instructorProfile = await resolveInstructorProfile(personId);
  if (!instructorProfile) {
    return null;
  }

  const rate = await prisma.instructorRate.findFirst({
    where: { instructorProfileId: instructorProfile.id, validFrom: { lte: onDate } },
    select: RATE_SELECT,
    orderBy: [{ validFrom: 'desc' }],
  });

  return rate ? toListItem(rate) : null;
}
