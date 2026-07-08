import type { ExpiryProposalStatus, ExpiryScope } from '@/generated/prisma/client';
import { paginate, paginationOffset } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { computeExpiryStatus, type ExpiryStatus } from '@/lib/expiry-status';
import type {
  ListExpiryProposalsQuery,
  ProposeExpiryInput,
  RegisterExpiryInput,
  UpdateExpiryInput,
} from '@/lib/schemas/expiries';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

/**
 * Person expiries with computed status and a titolare-facing update-proposal
 * queue (epic 6, story 6.2; FR-36) — builds on the catalogue from story 6.1
 * (`ExpiryType`). See `Expiry`/`ExpiryUpdateProposal`'s Prisma doc-comments
 * for the full domain rationale (one current row per person+type, status
 * NEVER persisted, proposal = separate entity, at most one PENDING proposal
 * per scadenza via the hand-appended partial unique index).
 */

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

// --- Person expiries (AC 1) --------------------------------------------------

export type PendingProposalSummary = {
  id: string;
  proposedIssuedAt: string;
  proposedExpiresAt: string;
  proposedNotes: string | null;
  createdAt: Date;
};

export type ExpiryListItem = {
  id: string;
  expiryTypeId: string;
  typeName: string;
  typeScope: ExpiryScope;
  issuedAt: string;
  expiresAt: string;
  notes: string | null;
  status: ExpiryStatus;
  pendingProposal: PendingProposalSummary | null;
};

const EXPIRY_SELECT = {
  id: true,
  expiryTypeId: true,
  expiryType: { select: { name: true, scope: true } },
  issuedAt: true,
  expiresAt: true,
  notes: true,
  proposals: {
    where: { status: 'PENDING' as ExpiryProposalStatus },
    select: { id: true, proposedIssuedAt: true, proposedExpiresAt: true, proposedNotes: true, createdAt: true },
    // At most one PENDING proposal per expiry (the hand-appended partial
    // unique index) — `take: 1` is a defensive cap, not a real limit.
    take: 1,
  },
} as const;

type SelectedExpiry = {
  id: string;
  expiryTypeId: string;
  expiryType: { name: string; scope: ExpiryScope };
  issuedAt: Date;
  expiresAt: Date;
  notes: string | null;
  proposals: Array<{ id: string; proposedIssuedAt: Date; proposedExpiresAt: Date; proposedNotes: string | null; createdAt: Date }>;
};

function toListItem(expiry: SelectedExpiry, today: Date): ExpiryListItem {
  const pending = expiry.proposals[0];

  return {
    id: expiry.id,
    expiryTypeId: expiry.expiryTypeId,
    typeName: expiry.expiryType.name,
    typeScope: expiry.expiryType.scope,
    issuedAt: toDateOnlyString(expiry.issuedAt),
    expiresAt: toDateOnlyString(expiry.expiresAt),
    notes: expiry.notes,
    status: computeExpiryStatus(expiry.expiresAt, today),
    pendingProposal: pending
      ? {
          id: pending.id,
          proposedIssuedAt: toDateOnlyString(pending.proposedIssuedAt),
          proposedExpiresAt: toDateOnlyString(pending.proposedExpiresAt),
          proposedNotes: pending.proposedNotes,
          createdAt: pending.createdAt,
        }
      : null,
  };
}

/**
 * Lists a person's scadenze (AC 1/2). Access: `expiries.manage` (any
 * person) OR own-access (`self.read` AND `actor.personId === personId`,
 * checked BEFORE any query — pattern from `flights.service.ts#listFlights`,
 * story 5.4). 404 on an unknown person is only meaningful for the
 * `expiries.manage` path — an own-access actor's person is themselves by
 * definition, so there is nothing further to look up. Ordered by
 * `expiresAt asc` (soonest-expiring first) and defensively capped at
 * `take: 200`.
 */
export async function listPersonExpiries(actor: Actor, personId: string): Promise<ExpiryListItem[]> {
  const canManage = hasPermission(actor, 'expiries.manage');
  const isOwnAccess = hasPermission(actor, 'self.read') && actor.personId === personId;
  if (!canManage && !isOwnAccess) {
    throw new ForbiddenError('Actor may not read this person\'s expiries.');
  }

  if (canManage) {
    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      throw new NotFoundError('Person not found.');
    }
  }

  const today = todayDateOnlyUtc();

  const expiries = await prisma.expiry.findMany({
    where: { personId },
    select: EXPIRY_SELECT,
    orderBy: { expiresAt: 'asc' },
    take: 200,
  });

  return expiries.map((expiry) => toListItem(expiry, today));
}

type ScopeCheckPerson = {
  pilotProfile: { deactivatedAt: Date | null } | null;
  studentProfile: { deactivatedAt: Date | null } | null;
  instructorProfile: { deactivatedAt: Date | null } | null;
};

/**
 * Registration-time ambito↔person compatibility check (AC 1; `ExpiryType`'s
 * doc-comment names this story as its owner). `ALL` matches everyone; every
 * other scope requires the corresponding profile to exist AND be currently
 * ACTIVE (`deactivatedAt === null`) — a deactivated or never-activated
 * profile is treated the same as "no profile", both fail the check.
 */
function assertScopeCompatible(scope: ExpiryScope, person: ScopeCheckPerson): void {
  if (scope === 'ALL') {
    return;
  }

  const isCompatible =
    (scope === 'PILOTS' && person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null) ||
    (scope === 'STUDENTS' && person.studentProfile !== null && person.studentProfile.deactivatedAt === null) ||
    (scope === 'INSTRUCTORS' && person.instructorProfile !== null && person.instructorProfile.deactivatedAt === null);

  if (!isCompatible) {
    throw new ValidationError(
      "This expiry type's scope does not match any of the person's active profiles.",
      undefined,
      'SCOPE_MISMATCH',
    );
  }
}

/**
 * Registers a new scadenza (AC 1). `expiries.manage` only. Verification
 * order (404-before-409-before-422, no state leak — the lesson from every
 * prior epic): person exists -> archived -> type exists -> type deactivated
 * -> scope compatibility -> duplicate (person, type). The duplicate check is
 * pre-check + `P2002` backstop (the check-then-write race, same pattern as
 * every other unique constraint in this codebase) — `@@unique([personId,
 * expiryTypeId])` is the DB-level guarantee this backstops.
 */
export async function registerExpiry(actor: Actor, input: RegisterExpiryInput): Promise<ExpiryListItem> {
  authorize(actor, 'expiries.manage');

  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: {
      id: true,
      archivedAt: true,
      pilotProfile: { select: { deactivatedAt: true } },
      studentProfile: { select: { deactivatedAt: true } },
      instructorProfile: { select: { deactivatedAt: true } },
    },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  if (person.archivedAt !== null) {
    throw new ConflictError('This person is archived.');
  }

  const expiryType = await prisma.expiryType.findUnique({
    where: { id: input.expiryTypeId },
    select: { id: true, scope: true, isActive: true },
  });
  if (!expiryType) {
    throw new NotFoundError('Expiry type not found.');
  }
  if (!expiryType.isActive) {
    throw new ConflictError('This expiry type is deactivated.');
  }

  assertScopeCompatible(expiryType.scope, person);

  const existing = await prisma.expiry.findUnique({
    where: { personId_expiryTypeId: { personId: input.personId, expiryTypeId: input.expiryTypeId } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('An expiry of this type is already registered for this person — update it instead.');
  }

  try {
    const created = await prisma.expiry.create({
      data: {
        personId: input.personId,
        expiryTypeId: input.expiryTypeId,
        issuedAt: parseDateOnlyUtc(input.issuedAt),
        expiresAt: parseDateOnlyUtc(input.expiresAt),
        notes: input.notes ?? null,
        actorUserId: actor.userId,
      },
      select: EXPIRY_SELECT,
    });
    return toListItem(created, todayDateOnlyUtc());
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An expiry of this type is already registered for this person — update it instead.');
    }
    throw error;
  }
}

/**
 * Partially updates a scadenza (AC 1). `expiries.manage` only. `personId`/
 * `expiryTypeId` are NOT patchable (Contesto: a wrong type/person is
 * corrected by delete + re-register). The cross-field `expiresAt >=
 * issuedAt` check runs against the RESULTING (merged current + patch)
 * values — a request patching only `expiresAt` is still validated against
 * the CURRENT `issuedAt`, and vice versa (Dev Notes' merge-validation). A
 * PENDING proposal already filed against this scadenza is left untouched —
 * staff will see it in the queue alongside the freshly updated current
 * values (doc-comment, not a guard: there is no conflict to prevent here).
 */
export async function updateExpiry(actor: Actor, id: string, input: UpdateExpiryInput): Promise<ExpiryListItem> {
  authorize(actor, 'expiries.manage');

  const existing = await prisma.expiry.findUnique({ where: { id }, select: { id: true, issuedAt: true, expiresAt: true } });
  if (!existing) {
    throw new NotFoundError('Expiry not found.');
  }

  const nextIssuedAt = input.issuedAt !== undefined ? parseDateOnlyUtc(input.issuedAt) : existing.issuedAt;
  const nextExpiresAt = input.expiresAt !== undefined ? parseDateOnlyUtc(input.expiresAt) : existing.expiresAt;
  if (nextExpiresAt < nextIssuedAt) {
    throw new ValidationError('expiresAt must not be before issuedAt.', { path: ['expiresAt'] });
  }

  const updated = await prisma.expiry.update({
    where: { id },
    data: {
      ...(input.issuedAt !== undefined ? { issuedAt: nextIssuedAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      actorUserId: actor.userId,
    },
    select: EXPIRY_SELECT,
  });

  return toListItem(updated, todayDateOnlyUtc());
}

/**
 * Deletes a scadenza — a staff correction tool (wrong type/person), AC 1.
 * `expiries.manage` only. 404 on an unknown id; the delete cascades to any
 * `ExpiryUpdateProposal` rows (pending included, `onDelete: Cascade`).
 */
export async function deleteExpiry(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'expiries.manage');

  const existing = await prisma.expiry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Expiry not found.');
  }

  await prisma.expiry.delete({ where: { id } });
}

// --- Update proposals (AC 2) -------------------------------------------------

/**
 * Files an update proposal against the actor's OWN scadenza (AC 2).
 * `expiries.propose.own` only. Verification order: expiry exists -> 404;
 * ownership (`expiry.personId === actor.personId`, an actor with no linked
 * `personId` always fails this) -> 403; pending-proposal duplicate -> 409
 * pre-check + `P2002` backstop on the hand-appended partial unique index.
 * The `Expiry` itself is NEVER touched here (AC 2: the value stays
 * authoritative until staff decides).
 */
export async function proposeExpiryUpdate(
  actor: Actor,
  expiryId: string,
  input: ProposeExpiryInput,
): Promise<PendingProposalSummary> {
  authorize(actor, 'expiries.propose.own');

  const expiry = await prisma.expiry.findUnique({ where: { id: expiryId }, select: { id: true, personId: true } });
  if (!expiry) {
    throw new NotFoundError('Expiry not found.');
  }
  if (actor.personId === null || expiry.personId !== actor.personId) {
    throw new ForbiddenError('Actor may only propose updates to their own expiries.');
  }

  const pending = await prisma.expiryUpdateProposal.findFirst({
    where: { expiryId, status: 'PENDING' },
    select: { id: true },
  });
  if (pending) {
    throw new ConflictError('A pending proposal already exists for this expiry.');
  }

  try {
    const created = await prisma.expiryUpdateProposal.create({
      data: {
        expiryId,
        proposedIssuedAt: parseDateOnlyUtc(input.issuedAt),
        proposedExpiresAt: parseDateOnlyUtc(input.expiresAt),
        proposedNotes: input.notes ?? null,
        proposedByUserId: actor.userId,
      },
      select: { id: true, proposedIssuedAt: true, proposedExpiresAt: true, proposedNotes: true, createdAt: true },
    });
    return {
      id: created.id,
      proposedIssuedAt: toDateOnlyString(created.proposedIssuedAt),
      proposedExpiresAt: toDateOnlyString(created.proposedExpiresAt),
      proposedNotes: created.proposedNotes,
      createdAt: created.createdAt,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A pending proposal already exists for this expiry.');
    }
    throw error;
  }
}

export type ExpiryProposalListItem = {
  id: string;
  expiryId: string;
  personId: string;
  personName: string;
  expiryTypeId: string;
  typeName: string;
  currentIssuedAt: string;
  currentExpiresAt: string;
  currentNotes: string | null;
  proposedIssuedAt: string;
  proposedExpiresAt: string;
  proposedNotes: string | null;
  status: ExpiryProposalStatus;
  proposedByEmail: string;
  decidedByEmail: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

export type ExpiryProposalListResult = {
  items: ExpiryProposalListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const EXPIRY_PROPOSAL_SELECT = {
  id: true,
  expiryId: true,
  proposedIssuedAt: true,
  proposedExpiresAt: true,
  proposedNotes: true,
  status: true,
  decidedAt: true,
  createdAt: true,
  expiry: {
    select: {
      personId: true,
      person: { select: { firstName: true, lastName: true } },
      expiryTypeId: true,
      expiryType: { select: { name: true } },
      issuedAt: true,
      expiresAt: true,
      notes: true,
    },
  },
  proposedByUser: { select: { email: true } },
  decidedByUser: { select: { email: true } },
} as const;

type SelectedProposal = {
  id: string;
  expiryId: string;
  proposedIssuedAt: Date;
  proposedExpiresAt: Date;
  proposedNotes: string | null;
  status: ExpiryProposalStatus;
  decidedAt: Date | null;
  createdAt: Date;
  expiry: {
    personId: string;
    person: { firstName: string; lastName: string };
    expiryTypeId: string;
    expiryType: { name: string };
    issuedAt: Date;
    expiresAt: Date;
    notes: string | null;
  };
  proposedByUser: { email: string };
  decidedByUser: { email: string } | null;
};

function toProposalListItem(proposal: SelectedProposal): ExpiryProposalListItem {
  return {
    id: proposal.id,
    expiryId: proposal.expiryId,
    personId: proposal.expiry.personId,
    personName: `${proposal.expiry.person.firstName} ${proposal.expiry.person.lastName}`,
    expiryTypeId: proposal.expiry.expiryTypeId,
    typeName: proposal.expiry.expiryType.name,
    currentIssuedAt: toDateOnlyString(proposal.expiry.issuedAt),
    currentExpiresAt: toDateOnlyString(proposal.expiry.expiresAt),
    currentNotes: proposal.expiry.notes,
    proposedIssuedAt: toDateOnlyString(proposal.proposedIssuedAt),
    proposedExpiresAt: toDateOnlyString(proposal.proposedExpiresAt),
    proposedNotes: proposal.proposedNotes,
    status: proposal.status,
    proposedByEmail: proposal.proposedByUser.email,
    decidedByEmail: proposal.decidedByUser?.email ?? null,
    decidedAt: proposal.decidedAt,
    createdAt: proposal.createdAt,
  };
}

/**
 * Lists the staff proposal queue (AC 2). `expiries.manage` only. Defaults to
 * `status: 'PENDING'` (the actionable queue, FIFO — `createdAt asc`);
 * `APPROVED`/`REJECTED` let staff review past decisions. Paginated `{
 * items, total, page, pageSize }`, same envelope/query shape as
 * `cash.service.ts#listCashMovements`.
 */
export async function listExpiryProposals(actor: Actor, query: ListExpiryProposalsQuery): Promise<ExpiryProposalListResult> {
  authorize(actor, 'expiries.manage');

  const where = { status: query.status };

  const [items, total] = await prisma.$transaction([
    prisma.expiryUpdateProposal.findMany({
      select: EXPIRY_PROPOSAL_SELECT,
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...paginationOffset(query),
    }),
    prisma.expiryUpdateProposal.count({ where }),
  ]);

  return paginate(items.map(toProposalListItem), total, query);
}

/**
 * Decides a proposal — APPROVE or REJECT (AC 2). `expiries.manage` only.
 * 404 on an unknown id; already-decided -> 409. The decision itself runs in
 * ONE transaction with an optimistic guard (`updateMany` filtered on
 * `status: 'PENDING'`, `count === 0` -> 409) against two staff members
 * deciding the same proposal concurrently — the same principle as every
 * other race guard in this codebase (epic 5), no `FOR UPDATE` needed
 * because the transition is monodirectional (PENDING -> decided, never
 * back). On APPROVE, the proposed values are applied to the target
 * `Expiry` in the SAME transaction (`actorUserId` updated too); REJECT
 * leaves the `Expiry` untouched.
 */
export async function decideExpiryProposal(
  actor: Actor,
  proposalId: string,
  decision: 'APPROVE' | 'REJECT',
): Promise<ExpiryProposalListItem> {
  authorize(actor, 'expiries.manage');

  const proposal = await prisma.expiryUpdateProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      status: true,
      expiryId: true,
      proposedIssuedAt: true,
      proposedExpiresAt: true,
      proposedNotes: true,
    },
  });
  if (!proposal) {
    throw new NotFoundError('Proposal not found.');
  }
  if (proposal.status !== 'PENDING') {
    throw new ConflictError('This proposal has already been decided.');
  }

  const decidedAt = new Date();
  const nextStatus: ExpiryProposalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  const decided = await prisma.$transaction(async (tx) => {
    const guard = await tx.expiryUpdateProposal.updateMany({
      where: { id: proposalId, status: 'PENDING' },
      data: { status: nextStatus, decidedByUserId: actor.userId, decidedAt },
    });
    if (guard.count === 0) {
      throw new ConflictError('This proposal has already been decided.');
    }

    if (decision === 'APPROVE') {
      await tx.expiry.update({
        where: { id: proposal.expiryId },
        data: {
          issuedAt: proposal.proposedIssuedAt,
          expiresAt: proposal.proposedExpiresAt,
          notes: proposal.proposedNotes,
          actorUserId: actor.userId,
        },
      });
    }

    return tx.expiryUpdateProposal.findUniqueOrThrow({ where: { id: proposalId }, select: EXPIRY_PROPOSAL_SELECT });
  });

  return toProposalListItem(decided);
}
