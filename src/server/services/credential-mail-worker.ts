import { createHash, randomBytes } from 'node:crypto';
import type { CredentialMail, MailAttempt, MailChannel, Prisma } from '@/generated/prisma/client';
import { prisma } from '@/server/db/prisma';
import { env } from '@/lib/env';
import { buildCredentialEmail } from '@/server/adapters/mail/templates';
import { InvalidMailConfiguration, readObservedSmtpConfig, submitObservedMail } from '@/server/adapters/mail/observed-smtp';
import type { SmtpObservation } from '@/server/adapters/mail/smtp-observation';
import { databaseNow, lockMailAccount } from './credential-mail.service';
import { ConflictError } from './errors';
export const DEFAULT_SCAN_MS = 30_000;
const LEASE = 120_000;
const RETRY_MARGIN = 120_000;
type Tx = Prisma.TransactionClient;
type Origin = 'MANUAL' | 'AUTO' | 'CREDENTIAL';
const after = (now: Date, ms: number) => new Date(now.getTime() + ms);
const terminal = ['ACCEPTED', 'UNCERTAIN', 'PERMANENT', 'EXHAUSTED', 'EXPIRED', 'SUPPRESSED'];
async function lockChannel(tx: Tx) {
  await tx.$queryRaw`SELECT id FROM "MailChannel" WHERE id = 1 FOR UPDATE`;
  return tx.mailChannel.findUniqueOrThrow({
    where: {
      id: 1
    }
  });
}
function saveProbe(channel: MailChannel, attempt: MailAttempt, result: SmtpObservation, at: Date): Prisma.MailChannelUpdateInput {
  if (attempt.origin === 'CREDENTIAL') return {};
  const field = attempt.origin === 'MANUAL' ? 'manual' : 'automatic';
  const previous = channel[field] as {
    sequence?: string;
  } | null;
  const startedAt = attempt.startedAt.toISOString();
  if (previous?.sequence && BigInt(previous.sequence) > attempt.sequence) return {};
  return {
    [field]: {
      id: attempt.id,
      startedAt,
      sequence: attempt.sequence.toString(),
      at: at.toISOString(),
      config: attempt.config,
      outcome: result.outcome,
      phase: result.phase,
      code: result.code ?? null
    }
  };
}
async function recordOutcome(tx: Tx, channel: MailChannel, attempt: MailAttempt, result: SmtpObservation, now: Date) {
  const late = attempt.outcome === 'UNCERTAIN' && result.outcome === 'ACCEPTED';
  if (attempt.finishedAt && !late) return;
  await tx.mailAttempt.update({
    where: {
      id: attempt.id
    },
    data: {
      finishedAt: now,
      phase: result.phase,
      outcome: result.outcome,
      smtpCode: result.code ?? null
    }
  });
  if (attempt.intentId) {
    const owner = await tx.credentialMail.findUnique({
      where: {
        id: attempt.intentId
      },
      select: {
        userId: true
      }
    });
    if (owner) await lockMailAccount(tx, owner.userId);
    const intent = await tx.credentialMail.findUnique({
      where: {
        id: attempt.intentId
      }
    });
    if (intent?.attemptId === attempt.id) {
      const retryable = ['TEMPORARY', 'UNAVAILABLE', 'CONFIGURATION'].includes(result.outcome);
      const wait = (intent.attempts === 1 ? 60_000 : 300_000) + Math.floor(Math.random() * 5_000);
      const nextAt = after(now, wait);
      let state: string = result.outcome;
      let reason: string = result.outcome;
      if (retryable) {
        if (intent.revokedAt) {
          state = 'SUPPRESSED';
        } else if (intent.attempts >= 3) {
          state = 'EXHAUSTED';
          reason = 'BUDGET';
        } else if (+nextAt + RETRY_MARGIN >= +intent.expiresAt) {
          state = 'EXPIRED';
          reason = 'WINDOW';
        } else {
          state = 'QUEUED';
        }
      }
      await tx.credentialMail.updateMany({
        where: {
          id: intent.id,
          attemptId: attempt.id,
          state: {
            in: ['HANDOFF', 'UNCERTAIN']
          }
        },
        data: {
          state,
          observedAt: now,
          reason,
          ...(state === 'QUEUED' && {
            nextAt
          })
        }
      });
    }
  }
  const observation = saveProbe(channel, attempt, result, now);
  const sameConfig = channel.config === attempt.config;
  const assignedProbe = channel.probeId === attempt.id;
  const update: Prisma.MailChannelUpdateInput = {
    ...observation
  };
  if (sameConfig && !late && (channel.mode === 'ACTIVE' || assignedProbe)) {
    if (result.outcome === 'ACCEPTED') {
      Object.assign(update, {
        mode: 'ACTIVE',
        failures: 0,
        reason: null,
        probeId: null,
        probeAfter: null
      });
    } else if (result.outcome === 'CONFIGURATION' || assignedProbe || result.channel && channel.failures >= 2) {
      Object.assign(update, {
        mode: 'PAUSED',
        failures: result.channel ? channel.failures + 1 : channel.failures,
        reason: result.outcome === 'CONFIGURATION' || assignedProbe && channel.reason === 'CONFIGURATION' && channel.probeAfter === null ? 'CONFIGURATION' : result.outcome,
        probeId: null,
        probeAfter: result.outcome === 'CONFIGURATION' || assignedProbe && channel.reason === 'CONFIGURATION' && channel.probeAfter === null ? null : after(now, 60_000)
      });
    } else if (result.channel) update.failures = {
      increment: 1
    };else if (result.phase === 'RECIPIENT') update.failures = 0;
  }
  if (Object.keys(update).length) await tx.mailChannel.update({
    where: {
      id: 1
    },
    data: update
  });
}
async function recover(tx: Tx, now: Date) {
  const stale = await tx.mailAttempt.findMany({
    where: {
      finishedAt: null,
      leaseUntil: {
        lte: now
      }
    }
  });
  for (const attempt of stale) {
    const channel = await tx.mailChannel.findUniqueOrThrow({
      where: {
        id: 1
      }
    });
    if (attempt.phase === 'HANDOFF') {
      await recordOutcome(tx, channel, attempt, {
        outcome: 'UNCERTAIN',
        phase: 'MESSAGE',
        channel: false
      }, now);
      continue;
    }
    await cancelReservation(tx, attempt, now);
  }
  await tx.credentialMail.updateMany({
    where: {
      state: 'QUEUED',
      expiresAt: {
        lte: now
      }
    },
    data: {
      state: 'EXPIRED',
      reason: 'EXPIRED',
      observedAt: now
    }
  });
  await tx.credentialMail.updateMany({
    where: {
      state: 'QUEUED',
      attempts: {
        gt: 0
      },
      expiresAt: {
        lte: after(now, RETRY_MARGIN)
      }
    },
    data: {
      state: 'EXPIRED',
      reason: 'WINDOW',
      observedAt: now
    }
  });
}
async function cancelReservation(tx: Tx, attempt: MailAttempt, now: Date) {
  await tx.mailAttempt.updateMany({
    where: {
      id: attempt.id,
      finishedAt: null
    },
    data: {
      finishedAt: now,
      outcome: 'CANCELLED'
    }
  });
  if (attempt.intentId) await tx.credentialMail.updateMany({
    where: {
      id: attempt.intentId,
      attemptId: attempt.id,
      state: 'CLAIMED'
    },
    data: {
      state: 'QUEUED',
      observedAt: now
    }
  });
  const channel = await tx.mailChannel.findUniqueOrThrow({
    where: {
      id: 1
    }
  });
  if (channel.probeId === attempt.id) {
    const manualCorrectionRequired = channel.reason === 'CONFIGURATION' && channel.probeAfter === null;
    await tx.mailChannel.update({
      where: {
        id: 1
      },
      data: {
        mode: 'PAUSED',
        probeId: null,
        probeAfter: manualCorrectionRequired ? null : after(now, 60_000)
      }
    });
  }
}
export async function reserveMail(manual: boolean, intervalMs: number) {
  return prisma.$transaction(async tx => {
    await lockChannel(tx);
    const now = await databaseNow(tx);
    if (!manual) await tx.mailChannel.update({ where: { id: 1 }, data: { heartbeatAt: now } });
    await recover(tx, now);
    const channel = await tx.mailChannel.findUniqueOrThrow({
      where: {
        id: 1
      }
    });
    const active = await tx.mailAttempt.count({
      where: {
        finishedAt: null
      }
    });
    if (active >= 2 || channel.mode === 'PROBING') return null;
    const paused = channel.mode === 'PAUSED';
    if (paused && !manual && (!channel.probeAfter || channel.probeAfter > now)) return null;
    let intent: CredentialMail | null = null;
    if (!manual) {
      const used = await tx.mailAttempt.count({
        where: {
          startedAt: {
            gt: after(now, -intervalMs)
          }
        }
      });
      if (used >= 10) return null;
      intent = await tx.credentialMail.findFirst({
        where: {
          state: 'QUEUED',
          revokedAt: null,
          nextAt: {
            lte: now
          },
          expiresAt: {
            gt: now
          }
        },
        orderBy: [{
          nextAt: 'asc'
        }, {
          id: 'asc'
        }]
      });
      if (!intent) return null;
    }
    const origin: Origin = manual ? 'MANUAL' : paused ? 'AUTO' : 'CREDENTIAL';
    const attempt = await tx.mailAttempt.create({
      data: {
        intentId: intent?.id,
        origin,
        config: channel.config,
        number: intent ? intent.attempts + 1 : 1,
        phase: 'CLAIMED',
        startedAt: now,
        leaseUntil: after(now, LEASE)
      }
    });
    if (intent) {
      const claim = await tx.credentialMail.updateMany({
        where: {
          id: intent.id,
          state: 'QUEUED',
          revokedAt: null
        },
        data: {
          state: 'CLAIMED',
          attemptId: attempt.id
        }
      });
      if (!claim.count) {
        await cancelReservation(tx, attempt, now);
        return null;
      }
    }
    if (paused) await tx.mailChannel.update({
      where: {
        id: 1
      },
      data: {
        mode: 'PROBING',
        probeId: attempt.id
      }
    });
    return attempt;
  });
}

/** Fence the previous worker and mint exactly one short-lived link for this attempt. Network I/O starts after commit. */
export async function beginHandoff(reserved: MailAttempt, raw = randomBytes(32).toString('base64url')) {
  return prisma.$transaction(async tx => {
    const channel = await lockChannel(tx);
    const attempt = await tx.mailAttempt.findUniqueOrThrow({
      where: {
        id: reserved.id
      }
    });
    if (attempt.finishedAt || attempt.phase !== 'CLAIMED') return null;
    const current = attempt.intentId ? await tx.credentialMail.findUnique({
      where: {
        id: attempt.intentId
      },
      select: {
        userId: true
      }
    }) : null;
    if (current) await lockMailAccount(tx, current.userId);
    const now = await databaseNow(tx);
    if (attempt.leaseUntil <= now || attempt.config !== channel.config || channel.mode !== 'ACTIVE' && channel.probeId !== attempt.id) {
      await cancelReservation(tx, attempt, now);
      return null;
    }
    let credential = null;
    if (attempt.intentId) {
      const intent = await tx.credentialMail.findUniqueOrThrow({
        where: {
          id: attempt.intentId
        },
        include: {
          user: true
        }
      });
      if (intent.attemptId !== attempt.id || intent.state !== 'CLAIMED' || intent.revokedAt || !intent.user.isActive || intent.purpose === 'INVITE' && intent.user.passwordHash !== null) {
        await cancelReservation(tx, attempt, now);
        return null;
      }
      if (intent.expiresAt <= now || intent.attempts > 0 && +intent.expiresAt <= +now + RETRY_MARGIN) {
        await tx.credentialMail.update({
          where: {
            id: intent.id
          },
          data: {
            state: 'EXPIRED',
            reason: intent.expiresAt <= now ? 'EXPIRED' : 'WINDOW',
            observedAt: now
          }
        });
        await cancelReservation(tx, attempt, now);
        return null;
      }
      if (intent.tokenId) {
        const old = await tx.authToken.updateMany({
          where: {
            id: intent.tokenId,
            usedAt: null
          },
          data: {
            usedAt: now
          }
        });
        if (!old.count) {
          await tx.credentialMail.update({
            where: {
              id: intent.id
            },
            data: {
              revokedAt: now,
              observedAt: now,
              state: 'SUPPRESSED',
              reason: 'REVOKED'
            }
          });
          await cancelReservation(tx, attempt, now);
          return null;
        }
      }
      const token = await tx.authToken.create({
        data: {
          userId: intent.userId,
          type: intent.purpose,
          expiresAt: intent.expiresAt,
          tokenHash: createHash('sha256').update(raw).digest('hex')
        }
      });
      await tx.credentialMail.update({
        where: {
          id: intent.id
        },
        data: {
          tokenId: token.id,
          state: 'HANDOFF',
          observedAt: now,
          attempts: {
            increment: 1
          }
        }
      });
      credential = {
        raw,
        expiresAt: intent.expiresAt,
        purpose: intent.purpose,
        locale: intent.user.locale === 'en' ? 'en' as const : 'it' as const,
        to: intent.user.email
      };
    }
    await tx.mailAttempt.update({
      where: {
        id: attempt.id
      },
      data: {
        phase: 'HANDOFF',
        leaseUntil: after(now, LEASE)
      }
    });
    return {
      credential
    };
  });
}
export async function completeHandoff(id: string, result: SmtpObservation) {
  await prisma.$transaction(async tx => {
    let channel = await lockChannel(tx);
    let attempt = await tx.mailAttempt.findUnique({ where: { id } });
    if (!attempt || (!attempt.finishedAt && attempt.phase !== 'HANDOFF')) return;
    const now = await databaseNow(tx);
    if (!attempt.finishedAt && attempt.leaseUntil <= now) {
      // Crossing the lease boundary has the same semantics whether the scanner or callback wins the lock.
      await recordOutcome(tx, channel, attempt, { outcome: 'UNCERTAIN', phase: 'MESSAGE', channel: false }, now);
      if (result.outcome !== 'ACCEPTED') return;
      attempt = await tx.mailAttempt.findUniqueOrThrow({ where: { id } });
      channel = await tx.mailChannel.findUniqueOrThrow({ where: { id: 1 } });
    }
    await recordOutcome(tx, channel, attempt, result, now);
  });
}
/** No token or SMTP budget is consumed until the handoff transaction. */
export async function deferMailPreparation(attempt: MailAttempt, invalidConfig: boolean): Promise<SmtpObservation> {
  const result: SmtpObservation = { outcome: invalidConfig ? 'CONFIGURATION' : 'UNAVAILABLE', phase: 'CONFIG', channel: invalidConfig };
  await prisma.$transaction(async tx => {
    const channel = await lockChannel(tx);
    const now = await databaseNow(tx);
    const current = await tx.mailAttempt.findUnique({where: {id: attempt.id}});
    if (!current || current.phase !== 'CLAIMED' || current.finishedAt) return;
    await cancelReservation(tx, current, now);
    await tx.mailAttempt.update({where: {id: current.id},data:{phase:'CONFIG', outcome:result.outcome}});
    if (current.intentId) await tx.credentialMail.updateMany({
      where:{id:current.intentId,attemptId:current.id,state:'QUEUED'},data:{reason:result.outcome,nextAt:after(now,60_000)},
    });
    const update = saveProbe(channel,current,result,now);
    const ownsChannelDecision = channel.mode === 'ACTIVE' || channel.probeId === current.id;
    if (invalidConfig && channel.config === current.config && ownsChannelDecision) {
      Object.assign(update,{mode:'PAUSED',reason:'CONFIGURATION',probeAfter:null,probeId:null});
    }
    if (Object.keys(update).length) await tx.mailChannel.update({where:{id:1},data:update});
  });
  return result;
}
export class NonLocalTestRelay extends Error {}

export async function processMailAttempt(attempt: MailAttempt, club?: string, loopbackOnly = false) {
  // Resolve the configured transport and render before the short database fence.
  // No asynchronous template work or SMTP settings read intervenes between commit and submission.
  let config;
  try { config = await readObservedSmtpConfig(); }
  catch (error) { return deferMailPreparation(attempt, error instanceof InvalidMailConfiguration); }
  if (loopbackOnly) {
    if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) {
      await prisma.$transaction(async tx => {
        await lockChannel(tx);
        await cancelReservation(tx, attempt, await databaseNow(tx));
      });
      throw new NonLocalTestRelay('The isolated worker requires a loopback relay.');
    }
    // Pin the allowed localhost label without consulting DNS.
    if (config.host === 'localhost') config.host = '127.0.0.1';
  }
  const raw = randomBytes(32).toString('base64url');
  let message;
  try {
    if (attempt.intentId) {
      const intent = await prisma.credentialMail.findUnique({
        where: {
          id: attempt.intentId
        },
        include: {
          user: {
            select: {
              email: true,
              locale: true
            }
          }
        }
      });
      if (intent) {
        const url = new URL('/set-password', env.APP_URL);
        url.searchParams.set('token', raw);
        const content = await buildCredentialEmail(intent.user.locale === 'en' ? 'en' : 'it', intent.purpose, url.toString(), intent.expiresAt);
        message = {
          to: intent.user.email,
          ...content
        };
      }
    } else if (club) {
      message = {
        to: club,
        subject: 'AirManager — Email di prova / Test email',
        text: 'Email di prova / SMTP test · AirManager.'
      };
    }
  } catch {
    return deferMailPreparation(attempt,false);
  }
  if (!message) return deferMailPreparation(attempt,false);
  const handoff = await beginHandoff(attempt, raw);
  if (!handoff) return null;
  let result: SmtpObservation;
  try {
    result = await submitObservedMail(config, message);
  } catch {
    result = { outcome: 'UNCERTAIN', phase: 'MESSAGE', channel: false };
  }
  await completeHandoff(attempt.id, result);
  return result;
}
export async function runMailCycle(intervalMs = DEFAULT_SCAN_MS, loopbackOnly = false) {
  await prisma.$transaction(async tx => {
    await lockChannel(tx);
    const now = await databaseNow(tx);
    await tx.mailChannel.update({
      where: {
        id: 1
      },
      data: {
        heartbeatAt: now
      }
    });
    const cutoff = after(now, -14 * 86_400_000);
    await tx.credentialMail.deleteMany({
      where: {
        state: {
          in: terminal
        },
        observedAt: {
          lt: cutoff
        },
        expiresAt: {
          lt: now
        }
      }
    });
    await tx.mailAttempt.deleteMany({
      where: {
        intentId: null,
        finishedAt: {
          lt: cutoff
        }
      }
    });
  });
  let count = 0;
  for (let round = 0; round < 5; round++) {
    const reservations = (await Promise.all([reserveMail(false, intervalMs), reserveMail(false, intervalMs)])).filter(a => a !== null);
    if (!reservations.length) break;
    await Promise.all(reservations.map(a => processMailAttempt(a, undefined, loopbackOnly)));
    count += reservations.length;
  }
  return count;
}
export async function runManualMail(club: string) {
  const attempt = await reserveMail(true, DEFAULT_SCAN_MS);
  if (!attempt) throw new ConflictError('Another SMTP test or delivery is in progress.', undefined, 'SMTP_BUSY');
  await processMailAttempt(attempt, club);
  // The deadline fence may have turned a late transport reply into an uncertain observation.
  // Return the stored result of this click even if a newer probe already owns the channel.
  const recorded = await prisma.mailAttempt.findUnique({ where: { id: attempt.id },
    select: { outcome: true, phase: true, smtpCode: true, finishedAt: true } });
  if (!recorded?.finishedAt || !recorded.outcome || recorded.outcome === 'CANCELLED') {
    throw new ConflictError('SMTP settings changed. Test again.', undefined, 'SMTP_CHANGED');
  }
  return {
    attemptId: attempt.id,
    sent: recorded.outcome === 'ACCEPTED',
    outcome: recorded.outcome,
    phase: recorded.phase,
    ...(recorded.smtpCode !== null && { code: recorded.smtpCode }),
  };
}
