import './require-mail-integration-db';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { prisma } from '@/server/db/prisma';
import { createUser, createUserCore } from '@/server/services/users.service';
import { createPerson } from '@/server/services/people.service';
import { requestPasswordReset, setPasswordWithToken } from '@/server/services/auth-tokens.service';
import { readInviteStatus, resendInvite } from '@/server/services/credential-mail.service';
import { beginHandoff, completeHandoff, deferMailPreparation, processMailAttempt, reserveMail, runMailCycle } from '@/server/services/credential-mail-worker';
import { sendSmtpTestEmail, readMailHealth } from '@/server/services/smtp-test-email.service';
import { submitObservedMail } from '@/server/adapters/mail/observed-smtp';
import { startSyntheticSmtp } from './synthetic-smtp';
const admin = {
  userId: 'fixture-operator-a',
  personId: null,
  roles: ['ADMIN'] as ['ADMIN']
};
const otherAdmin = {
  ...admin,
  userId: 'fixture-operator-b'
};
const ordinary = {
  userId: 'fixture-ordinary',
  personId: null,
  roles: ['PILOT'] as ['PILOT']
};
const suffix = '@queue.invalid';
const club = 'club@probe.invalid';
const msg = {
  to: 'test@queue.invalid',
  subject: 'fixture',
  text: 'fixture'
};
let smtp: Awaited<ReturnType<typeof startSyntheticSmtp>>;
const smtpKeys = ['smtp.host', 'smtp.port', 'smtp.security', 'smtp.user', 'smtp.pass', 'smtp.from', 'club.contactEmail', 'airfield.contactEmail'];
const fixtures: string[] = [];
const emails: string[] = [];
const manualIds: string[] = [];
let fixtureReady = false;
async function manualTest() {
  const result = await sendSmtpTestEmail(admin);
  manualIds.push(result.attemptId);
  return result;
}
let originalSettings: {
  key: string;
  value: string;
}[];
before(async () => {
  assert.equal(await prisma.credentialMail.count(), 0, 'Start with a clean credential queue');
  originalSettings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: smtpKeys
      }
    },
    select: {
      key: true,
      value: true
    }
  });
  assert.equal(await prisma.mailAttempt.count(), 0, 'Start with a fresh disposable queue');
  smtp = await startSyntheticSmtp();
  fixtureReady = true;
});
async function setting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: {
      key
    },
    create: {
      key,
      value
    },
    update: {
      value
    }
  });
}
async function resetChannel() {
  await prisma.$executeRaw`UPDATE "MailChannel" SET mode='ACTIVE', reason=NULL, failures=0, "probeId"=NULL, "probeAfter"=NULL, manual=NULL, automatic=NULL WHERE id=1`;
}
beforeEach(async () => {
  smtp.controls.reply = 'accept';
  smtp.controls.accepted = 0;
  smtp.controls.recipients.length = 0;
  smtp.controls.finish = undefined;
  await setting('smtp.host', '127.0.0.1');
  await setting('smtp.port', String(smtp.port));
  await setting('smtp.security', 'NONE');
  await setting('smtp.from', 'from@queue.invalid');
  await prisma.appSetting.deleteMany({
    where: {
      key: 'airfield.contactEmail'
    }
  });
  await prisma.appSetting.deleteMany({
    where: {
      key: {
        in: ['smtp.user', 'smtp.pass']
      }
    }
  });
  await resetChannel();
});
async function removeFixtureUsers() {
  await prisma.authToken.deleteMany({
    where: {
      user: {
        email: {
          in: emails
        }
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: emails
      }
    }
  });
}
afterEach(async () => {
  if (!fixtureReady) return;
  await removeFixtureUsers();
  await prisma.person.deleteMany({
    where: {
      id: {
        in: fixtures.splice(0)
      }
    }
  });
  await prisma.passwordResetAttempt.deleteMany({
    where: {
      email: {
        in: emails
      }
    }
  });
  await prisma.mailAttempt.deleteMany({
    where: {
      id: { in: manualIds.splice(0) }
    }
  });
  emails.length = 0;
});
after(async () => {
  if (smtp) {
    await smtp.close();
    await prisma.appSetting.deleteMany({
      where: {
        key: {
          in: smtpKeys
        }
      }
    });
    await prisma.appSetting.createMany({
      data: originalSettings
    });
    await resetChannel();
  }
  await prisma.$disconnect();
});
const address = () => {
  const value = randomUUID() + suffix;
  emails.push(value);
  return value;
};
async function newUser() {
  return createUser(admin, {
    email: address(),
    roles: ['PILOT'],
    locale: 'it'
  });
}
async function intent(userId: string, purpose: 'INVITE' | 'PASSWORD_RESET' = 'INVITE') {
  return prisma.credentialMail.findFirstOrThrow({
    where: {
      userId,
      purpose
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}
async function due(id: string) {
  await prisma.credentialMail.update({
    where: {
      id
    },
    data: {
      nextAt: new Date(0)
    }
  });
}
async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000;
  while (!(await check()) && Date.now() < deadline) await delay(30);
  assert.ok(await check(), 'timed out waiting for fixture state');
}
test('rollback and both committed creation paths, followed by an independent worker process with no HTTP traffic', async () => {
  await assert.rejects(prisma.$transaction(async tx => {
    await createUserCore(tx, {
      email: address(),
      roles: ['PILOT'],
      locale: 'it'
    });
    throw new Error('rollback fixture');
  }), /rollback fixture/);
  assert.equal(await prisma.credentialMail.count(), 0);
  const a = await newUser();
  const person = await createPerson(admin, {
    firstName: 'Fixture',
    lastName: 'SMTP',
    access: {
      email: address(),
      roles: ['PILOT']
    }
  });
  fixtures.push(person.id);
  assert.equal(await prisma.credentialMail.count(), 2);
  assert.equal(smtp.controls.accepted, 0);
  const proc = spawn(process.execPath, ['--import', 'tsx', 'scripts/mail-worker.ts', '--once'], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let diagnostic = '';
  proc.stderr.on('data', chunk => {
    diagnostic += chunk;
  });
  const [code] = await once(proc, 'close');
  assert.equal(code, 0);
  assert.equal(diagnostic.includes('fixture-sensitive') || diagnostic.includes(suffix) || diagnostic.includes('token='), false);
  assert.equal((await intent(a.id)).state, 'ACCEPTED');
  assert.equal(smtp.controls.accepted, 2);
});
test('RCPT 451 delays retry, rotates the token at constant expiry, then stops after final 250', async () => {
  const user = await newUser();
  smtp.controls.reply = 'temporary';
  await runMailCycle();
  const first = await intent(user.id);
  assert.equal(first.state, 'QUEUED');
  assert.ok(+first.nextAt - +first.observedAt >= 60_000 && +first.nextAt - +first.observedAt < 65_000);
  assert.equal(await runMailCycle(), 0);
  smtp.controls.reply = 'accept';
  await due(first.id);
  await runMailCycle();
  const final = await intent(user.id);
  assert.equal(final.state, 'ACCEPTED');
  assert.equal(final.attempts, 2);
  assert.equal(+first.expiresAt, +final.expiresAt);
  assert.ok(final.tokenId !== first.tokenId);
  assert.equal(await prisma.authToken.count({
    where: {
      userId: user.id,
      usedAt: null,
      expiresAt: first.expiresAt
    }
  }), 1);
  assert.equal(await runMailCycle(), 0);
});
test('three attempts total and two-minute margin; permanent RCPT rejection terminates separately', async () => {
  const a = await newUser();
  smtp.controls.reply = 'temporary';
  for (let n = 1; n <= 3; n++) {
    const row = await intent(a.id);
    await due(row.id);
    await runMailCycle();
    if (n === 2) {
      const retried = await intent(a.id);
      assert.ok(+retried.nextAt - +retried.observedAt >= 300_000);
    }
  }
  assert.equal((await intent(a.id)).state, 'EXHAUSTED');
  const b = await newUser();
  smtp.controls.reply = 'permanent';
  await runMailCycle();
  assert.equal((await intent(b.id)).state, 'PERMANENT');
  const c = await newUser();
  smtp.controls.reply = 'temporary';
  await prisma.credentialMail.update({
    where: {
      id: (await intent(c.id)).id
    },
    data: {
      expiresAt: new Date(Date.now() + 125_000)
    }
  });
  await runMailCycle();
  assert.equal((await intent(c.id)).reason, 'WINDOW');
});
test('missing final reply is uncertain; explicit negative after DATA is temporary, without ambiguous auto-retry', async () => {
  const a = await newUser();
  smtp.controls.reply = 'loseReply';
  await runMailCycle();
  await runMailCycle();
  const row = await intent(a.id);
  assert.equal(row.state, 'UNCERTAIN');
  assert.equal(smtp.controls.accepted, 1);
  assert.equal(await prisma.authToken.count({
    where: {
      id: row.tokenId!,
      usedAt: null
    }
  }), 1);
  await resendInvite(admin, a.id, 'unique-replacement');
  assert.equal(await prisma.authToken.count({
    where: {
      id: row.tokenId!,
      usedAt: null
    }
  }), 0);
  smtp.controls.reply = 'finalTemporary';
  await runMailCycle();
  const next = await intent(a.id);
  const attempt = await prisma.mailAttempt.findUniqueOrThrow({
    where: {
      id: next.attemptId!
    }
  });
  assert.deepEqual([attempt.outcome, attempt.phase, attempt.smtpCode], ['TEMPORARY', 'FINAL', 451]);
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({
    where: {
      id: row.id
    }
  })).state, 'UNCERTAIN');
});
test('lease before handoff is recoverable; after the fence it is uncertain even after process restart', async () => {
  const u = await newUser();
  const noSend = await reserveMail(false, 1000);
  assert.ok(noSend);
  await prisma.mailAttempt.update({
    where: {
      id: noSend.id
    },
    data: {
      leaseUntil: new Date(0)
    }
  });
  const recovery = await reserveMail(false, 1000);
  assert.ok(recovery);
  assert.equal(await beginHandoff(noSend), null);
  const handoff = await beginHandoff(recovery);
  assert.ok(handoff?.credential);
  // Normal transport accepts, but the worker disappears before writing its observation.
  const accepted = await submitObservedMail({
    host: '127.0.0.1',
    port: smtp.port,
    from: 'from@queue.invalid',
    secure: false,
    requireTLS: false,
    auth: null
  }, msg);
  assert.equal(accepted.outcome, 'ACCEPTED');
  await prisma.mailAttempt.update({
    where: {
      id: recovery.id
    },
    data: {
      leaseUntil: new Date(0)
    }
  });
  const process2 = spawn(process.execPath, ['--import', 'tsx', 'scripts/mail-worker.ts', '--once'], {
    stdio: 'ignore'
  });
  assert.equal((await once(process2, 'close'))[0], 0);
  assert.equal((await intent(u.id)).state, 'UNCERTAIN');
  assert.equal(smtp.controls.accepted, 1);
  await resendInvite(admin, u.id, 'late-result-fixture');
  await completeHandoff(recovery.id, accepted);
  const historical = await prisma.credentialMail.findUniqueOrThrow({
    where: {
      id: recovery.intentId!
    }
  });
  assert.equal(historical.state, 'ACCEPTED');
  assert.ok(historical.revokedAt);
  assert.equal((await intent(u.id)).state, 'QUEUED');
});
test('two workers and concurrent keyed reissue, HTTP replay, independent operators and cooldown', async () => {
  const u = await newUser();
  const issued = await Promise.all([resendInvite(admin, u.id, 'same-action'), resendInvite(admin, u.id, 'same-action')]);
  assert.deepEqual(issued[0], issued[1]);
  assert.deepEqual(await resendInvite(admin, u.id, 'same-action'), issued[0]);
  await assert.rejects(resendInvite(otherAdmin, u.id, 'another-action'), {
    code: 'INVITE_COOLDOWN'
  });
  await assert.rejects(resendInvite(ordinary, u.id, 'same-action'), {
    code: 'FORBIDDEN'
  });
  smtp.controls.reply = 'holdReply';
  const workers = Promise.all([runMailCycle(), runMailCycle()]);
  await waitFor(async () => !!smtp.controls.finish);
  assert.equal(smtp.controls.accepted, 1);
  smtp.controls.finish!();
  await workers;
  await prisma.credentialMail.update({
    where: {
      id: issued[0].invite!.id
    },
    data: {
      createdAt: new Date(Date.now() - 86_401_000)
    }
  });
  const fresh = await resendInvite(admin, u.id, 'same-action');
  assert.ok(fresh.invite?.id !== issued[0].invite?.id);
});
test('inactive account, replacement, address change and legacy/new public requests stay separate', async () => {
  const u = await newUser();
  await requestPasswordReset(u.email);
  let row = await intent(u.id, 'PASSWORD_RESET');
  await requestPasswordReset(u.email);
  await requestPasswordReset(u.email);
  await requestPasswordReset(u.email);
  const inactive = await prisma.credentialMail.findUniqueOrThrow({
    where: {
      id: row.id
    }
  });
  assert.equal(inactive.state, 'SUPPRESSED');
  assert.equal(await prisma.passwordResetAttempt.count({
    where: {
      email: u.email
    }
  }), 3);
  const unknown = address();
  assert.equal(await requestPasswordReset(unknown), undefined);
  assert.equal(await prisma.passwordResetAttempt.count({
    where: {
      email: unknown
    }
  }), 1);
  await prisma.user.update({
    where: {
      id: u.id
    },
    data: {
      isActive: false
    }
  });
  await runMailCycle();
  assert.equal(smtp.controls.accepted, 0);
  const b = await newUser();
  await runMailCycle();
  row = await intent(b.id);
  await prisma.user.update({
    where: {
      id: b.id
    },
    data: {
      email: address()
    }
  });
  assert.equal(await prisma.authToken.count({
    where: {
      id: row.tokenId!,
      usedAt: null
    }
  }), 0);
  const historical = await prisma.credentialMail.findUniqueOrThrow({
    where: {
      id: row.id
    }
  });
  assert.equal(historical.state, 'ACCEPTED');
  assert.ok(historical.revokedAt);
  await assert.rejects(readInviteStatus(ordinary, b.id), {
    code: 'FORBIDDEN'
  });
});
test('configuration pause, one probe, version fence, automatic retry without a club contact and durable manual observation', async () => {
  const u = await newUser();
  await setting('smtp.security', 'STARTTLS');
  await runMailCycle();
  assert.equal((await readMailHealth(admin)).mode, 'PAUSED');
  assert.equal(await runMailCycle(), 0);
  await assert.rejects(sendSmtpTestEmail(ordinary), {
    code: 'FORBIDDEN'
  });
  await setting('smtp.security', 'NONE');
  await due((await intent(u.id)).id);
  const probes = (await Promise.all([reserveMail(false, 1000), reserveMail(false, 1000)])).filter(p => p !== null);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].origin, 'AUTO');
  smtp.controls.reply = 'holdReply';
  const first = processMailAttempt(probes[0]);
  await waitFor(async () => !!smtp.controls.finish);
  await setting('smtp.from', 'corrected@queue.invalid');
  smtp.controls.finish!();
  await first;
  assert.equal((await readMailHealth(admin)).mode, 'PAUSED');
  smtp.controls.reply = 'accept';
  assert.equal(await runMailCycle(), 0);
  const next = await newUser();
  await runMailCycle();
  const recovered = await readMailHealth(admin);
  assert.equal(recovered.mode, 'ACTIVE');
  assert.equal((await intent(next.id)).state, 'ACCEPTED');
  assert.ok(recovered.automatic);
  assert.equal(recovered.manual, null);
  assert.ok(smtp.controls.recipients.every(r => !r.includes(club)));
  await setting('airfield.contactEmail', club);
  const manual = await manualTest();
  assert.equal(manual.sent, true);
  assert.ok(smtp.controls.recipients.at(-1)?.includes(club));
  const health = await readMailHealth(admin);
  assert.ok(health.manual);
  assert.ok(health.automatic);
});
test('shared rate and concurrency limits hold across worker instances and restart', async () => {
  for (let i = 0; i < 12; i++) await newUser();
  const first = await Promise.all([reserveMail(false, 30_000), reserveMail(false, 30_000), reserveMail(false, 30_000)]);
  const granted = first.filter(a => a !== null);
  assert.equal(granted.length, 2);
  await Promise.all(granted.map(a => processMailAttempt(a)));
  await Promise.all([runMailCycle(), runMailCycle()]);
  assert.equal(smtp.controls.accepted, 10);
  assert.equal(await prisma.credentialMail.count({
    where: {
      state: 'QUEUED'
    }
  }), 2);
  await prisma.mailAttempt.updateMany({
    where: { intent: { user: { email: { in: emails } } } },
    data: {
      startedAt: new Date(Date.now() - 35_000)
    }
  });
  await runMailCycle();
  assert.equal(smtp.controls.accepted, 12);
});
test('a synthetic untrusted certificate pauses on configuration without submitting DATA', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'credential-smtp-cert-'));
  const key = join(dir, 'key.pem'),
    cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', key, '-out', cert], {
    stdio: 'ignore'
  });
  const server = tls.createServer({
    key: await readFile(key),
    cert: await readFile(cert)
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const observation = await submitObservedMail({
      host: '127.0.0.1',
      port: addr.port,
      from: 'from@queue.invalid',
      secure: true,
      requireTLS: false,
      auth: null
    }, msg);
    assert.equal(observation.outcome, 'CONFIGURATION');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, {
      recursive: true,
      force: true
    });
  }
});
test('a failed manual probe cannot reopen or schedule unattended recovery from a configuration pause', async () => {
  await prisma.mailChannel.update({
    where: {
      id: 1
    },
    data: {
      mode: 'PAUSED',
      reason: 'CONFIGURATION',
      probeAfter: null
    }
  });
  await assert.rejects(sendSmtpTestEmail(admin), {
    code: 'NO_CONTACT_EMAIL'
  });
  await setting('airfield.contactEmail', club);
  smtp.controls.reply = 'permanent';
  const observed = await manualTest();
  assert.equal(observed.outcome, 'PERMANENT');
  const state = await prisma.mailChannel.findUniqueOrThrow({
    where: {
      id: 1
    }
  });
  assert.deepEqual([state.mode, state.reason, state.probeAfter], ['PAUSED', 'CONFIGURATION', null]);
  const u = await newUser();
  assert.equal(await runMailCycle(), 0);
  smtp.controls.reply = 'accept';
  await manualTest();
  await runMailCycle();
  assert.equal((await intent(u.id)).state, 'ACCEPTED');
});
test('service-wide failures pause after three; expired and superseded backlog stays unsent at recovery', async () => {
  const group = [];
  for (let i = 0; i < 4; i++) group.push(await newUser());
  const disposed = await startSyntheticSmtp();
  const port = disposed.port;
  await disposed.close();
  await setting('smtp.port', String(port));
  await runMailCycle();
  assert.equal((await readMailHealth(admin)).mode, 'PAUSED');
  const old = await intent(group[0].id);
  await prisma.credentialMail.update({
    where: {
      id: old.id
    },
    data: {
      expiresAt: new Date(0)
    }
  });
  const replaced = await intent(group[1].id);
  await resendInvite(admin, group[1].id, 'replacement-recovery');
  await setting('smtp.port', String(smtp.port));
  await prisma.credentialMail.updateMany({
    where: {
      state: 'QUEUED'
    },
    data: {
      nextAt: new Date(0)
    }
  });
  await runMailCycle();
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({
    where: {
      id: old.id
    }
  })).state, 'EXPIRED');
  assert.equal((await prisma.credentialMail.findUniqueOrThrow({
    where: {
      id: replaced.id
    }
  })).state, 'SUPPRESSED');
  assert.equal((await readMailHealth(admin)).mode, 'ACTIVE');
});
test('public acknowledgement during pause and pre-existing IP throttle', async () => {
  const u = await newUser();
  await prisma.mailChannel.update({
    where: {
      id: 1
    },
    data: {
      mode: 'PAUSED',
      reason: 'CONFIGURATION',
      probeAfter: null
    }
  });
  assert.equal(await requestPasswordReset(u.email), undefined);
  assert.equal((await intent(u.id, 'PASSWORD_RESET')).state, 'QUEUED');
  const ip = '192.0.2.3';
  await prisma.passwordResetAttempt.createMany({
    data: Array.from({
      length: 10
    }, () => ({
      email: address(),
      ip
    }))
  });
  assert.equal(await requestPasswordReset(address(), ip), undefined);
  assert.equal(await prisma.passwordResetAttempt.count({
    where: {
      ip
    }
  }), 10);
});

test('guarded worker refuses a stored non-local target before opening the SMTP connection', async () => {
  const u = await newUser();
  await setting('smtp.host','fixture.invalid');
  const proc = spawn(process.execPath, ['--import','tsx','scripts/mail-worker.ts','--once','--test-loopback'], {stdio:['ignore','ignore','pipe']});
  let diagnostic = '';
  proc.stderr.on('data', chunk => { diagnostic += chunk; });
  assert.equal((await once(proc,'close'))[0],1);
  assert.match(diagnostic, /non-local test relay refused/);
  const current = await intent(u.id);
  assert.deepEqual([current.state,current.attempts,smtp.controls.accepted],['QUEUED',0,0]);
});

test('post-lock issuance order wins even when the earlier transaction has a later timestamp; revoked history stays ordered', async () => {
  const u = await newUser();
  const old = await intent(u.id);
  await resendInvite(admin,u.id,'ordered-issuance');
  await prisma.credentialMail.update({where:{id:old.id},data:{ createdAt: new Date(Date.now()+60_000), reason:'OLDER' }});
  assert.equal((await readInviteStatus(admin,u.id))?.state,'QUEUED');
  await prisma.user.update({where:{id:u.id},data:{isActive:false}});
  assert.notEqual((await readInviteStatus(admin,u.id))?.reason,'OLDER');
});

test('later worker waves refresh the heartbeat while a cycle remains active',async()=>{
  for(let i=0;i<3;i++) await newUser();
  const a=await reserveMail(false,1000);
  assert.ok(a);
  const first=(await readMailHealth(admin)).heartbeatAt;
  assert.ok(first);
  await processMailAttempt(a);
  await delay(10);
  const b=await reserveMail(false,1000);
  assert.ok(b);
  const second=(await readMailHealth(admin)).heartbeatAt;
  assert.ok(second && +second > +first);
  await processMailAttempt(b);
});

for (const final of ['ACCEPTED','TEMPORARY'] as const) {
  test('late probe completion before the next scanner leaves the channel paused: ' + final, async () => {
    await newUser();
    await prisma.mailChannel.update({where:{id:1},data:{mode:'PAUSED',reason:'UNAVAILABLE',probeAfter:new Date(0)}});
    const probe=await reserveMail(false,1000); assert.ok(probe);
    await beginHandoff(probe);
    await prisma.mailAttempt.update({where:{id:probe.id},data:{leaseUntil:new Date(0)}});
    await completeHandoff(probe.id,{outcome:final,phase:'FINAL',code:final==='ACCEPTED'?250:451,channel:final!=='ACCEPTED'});
    const current=await prisma.credentialMail.findUniqueOrThrow({where:{id:probe.intentId!}});
    assert.equal(current.state,final==='ACCEPTED'?'ACCEPTED':'UNCERTAIN');
    assert.equal((await readMailHealth(admin)).mode,'PAUSED');
    assert.equal(await runMailCycle(),0);
  });
}

test('a transient storage failure before handoff defers preparation with no SMTP budget or token', async () => {
  const u=await newUser();
  const reservation=await reserveMail(false,1000); assert.ok(reservation);
  // Isolate only this dependency. No ACL or production service is modified.
  const delegate=prisma.appSetting as unknown as {findMany: (...args: unknown[]) => Promise<unknown>};
  const original=delegate.findMany;
  delegate.findMany=async()=>{throw new Error('fixture-sensitive-response');};
  try { assert.equal((await processMailAttempt(reservation))?.outcome,'UNAVAILABLE'); }
  finally { delegate.findMany=original; }
  const row=await intent(u.id);
  assert.deepEqual([row.state,row.attempts,row.tokenId,smtp.controls.accepted],['QUEUED',0,null,0]);
  assert.ok(+row.nextAt >= +row.observedAt+60_000);
  assert.equal((await readMailHealth(admin)).mode,'ACTIVE');
});

test('worker stderr stays sanitized on 451, 550 and a lost final reply', async () => {
  for (const reply of ['temporary','permanent','loseReply'] as const) {
    await newUser(); smtp.controls.reply=reply;
    const proc=spawn(process.execPath,['--import','tsx','scripts/mail-worker.ts','--once','--test-loopback'],{stdio:['ignore','pipe','pipe']});
    let log='';
    proc.stderr.on('data',chunk=>{ log+=chunk; });
    proc.stdout.on('data',chunk=>{ log+=chunk; });
    assert.equal((await once(proc,'close'))[0],0);
    assert.equal(/fixture-sensitive|@queue\.invalid|token=|RCPT TO|smtp:\/\//i.test(log),false);
  }
});

test('worker loads a synthetic dotenv file while retaining supervisor precedence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'credential-mail-env-'));
  const file=join(dir,'.env');
  const keys=['DATABASE_URL','TEST_DATABASE_URL','AUTH_SECRET','APP_URL','SMTP_HOST','SMTP_PORT','MAIL_FROM'] as const;
  try {
    const childEnv: NodeJS.ProcessEnv = {...process.env,DOTENV_CONFIG_PATH:file};
    await writeFile(file,keys.map(k=>k+'='+process.env[k]).join('\n')+'\n',{ mode:0o600 });
    for(const key of keys) delete childEnv[key];
    const fileWorker=spawn(process.execPath,['--import','tsx','scripts/mail-worker.ts','--once','--test-loopback'],{env:childEnv,stdio:'ignore'});
    assert.equal((await once(fileWorker,'close'))[0],0);
    // This value must remain shadowed by the explicitly supplied isolated environment.
    await writeFile(file,'TEST_DATABASE_URL=not-a-database\n');
    const managed=spawn(process.execPath,['--import','tsx','scripts/mail-worker.ts','--once','--test-loopback'],{
      env:{...process.env,DOTENV_CONFIG_PATH:file},stdio:'ignore',
    });
    assert.equal((await once(managed,'close'))[0],0);
  } finally {await rm(dir,{recursive:true,force:true});}
});


test('using the live credential invalidates a pending generation and preserves the historical transport result',async()=>{
  const u=await newUser();
  const reservation=await reserveMail(false,1000); assert.ok(reservation);
  const handoff=await beginHandoff(reservation); assert.ok(handoff?.credential);
  await requestPasswordReset(u.email);
  await setPasswordWithToken(handoff.credential.raw,'Fixture-Only-Password-01');
  await completeHandoff(reservation.id,{outcome:'ACCEPTED',phase:'FINAL',code:250,channel:false});
  const sent=await intent(u.id);
  const reset=await intent(u.id,'PASSWORD_RESET');
  assert.equal(sent.state,'ACCEPTED'); assert.ok(sent.revokedAt);
  assert.equal(reset.state,'SUPPRESSED');
  assert.equal(await prisma.authToken.count({where:{id:sent.tokenId!,usedAt:null}}),0);
  assert.equal(await runMailCycle(),0);
});


test('review R10: stored username alone uses the unauthenticated relay and a real 530 pauses the channel', async () => {
  await setting('smtp.user','fixture-user');
  const a = await newUser();
  await runMailCycle();
  assert.equal((await intent(a.id)).state,'ACCEPTED');
  assert.equal(smtp.controls.accepted,1);
  const b = await newUser();
  smtp.controls.reply = 'requireAuth';
  await runMailCycle();
  const second = await intent(b.id);
  const attempt = await prisma.mailAttempt.findUniqueOrThrow({where:{id:second.attemptId!}});
  assert.deepEqual([attempt.outcome,attempt.phase,attempt.smtpCode],['CONFIGURATION','RECIPIENT',530]);
  assert.equal((await readMailHealth(admin)).mode,'PAUSED');
});

test('review R10: a relay rejecting the stored credential reports a sanitized 535', async () => {
  // A canonical-looking but unauthenticatable old unversioned value follows the legacy reader.
  await setting('smtp.user','fixture-user');
  await setting('smtp.pass', Buffer.alloc(60, 0xa5).toString('base64'));
  smtp.controls.reply='authFailure';
  const u=await newUser();
  await runMailCycle();
  const current=await intent(u.id);
  const observed=await prisma.mailAttempt.findUniqueOrThrow({where:{id:current.attemptId!}});
  assert.deepEqual([observed.outcome,observed.phase,observed.smtpCode,smtp.controls.accepted],['CONFIGURATION','AUTH',535,0]);
  assert.equal((await readMailHealth(admin)).mode,'PAUSED');
});

test('review R11: delayed configuration failure cannot take the probe already assigned in the same revision', async () => {
  await newUser(); await newUser();
  const first=await reserveMail(false,1000), second=await reserveMail(false,1000);
  assert.ok(first && second);
  await deferMailPreparation(second,true);
  await setting('airfield.contactEmail',club);
  smtp.controls.reply='holdReply';
  const currentProbe=manualTest();
  await waitFor(async()=>!!smtp.controls.finish);
  try {
    const before=await prisma.mailChannel.findUniqueOrThrow({where:{id:1}});
    assert.ok(before.probeId);
    await deferMailPreparation(first,true);
    const after=await prisma.mailChannel.findUniqueOrThrow({where:{id:1}});
    assert.deepEqual([after.mode,after.probeId,after.config],['PROBING',before.probeId,before.config]);
  } finally { smtp.controls.finish!(); await currentProbe; }
  assert.equal((await readMailHealth(admin)).mode,'ACTIVE');
});

test('review R12: manual 451 after lease expiration returns exactly the recorded uncertain observation', async () => {
  await setting('airfield.contactEmail',club);
  smtp.controls.reply='holdRejection';
  const pending=manualTest();
  await waitFor(async()=>!!smtp.controls.finish);
  const inflight=await prisma.mailAttempt.findFirstOrThrow({where:{origin:'MANUAL',finishedAt:null}});
  await prisma.mailAttempt.update({where:{id:inflight.id},data:{leaseUntil:new Date(0)}});
  smtp.controls.finish!();
  const reply=await pending;
  const row=await prisma.mailAttempt.findUniqueOrThrow({where:{id:reply.attemptId}});
  assert.deepEqual([reply.sent,reply.outcome,reply.phase,reply.code??null],[false,'UNCERTAIN','MESSAGE',null]);
  assert.deepEqual([row.outcome,row.phase,row.smtpCode],[reply.outcome,reply.phase,reply.code??null]);
  const dashboard=(await readMailHealth(admin)).manual as {id:string;outcome:string;phase:string};
  assert.deepEqual([dashboard.id,dashboard.outcome,dashboard.phase],[row.id,row.outcome,row.phase]);
});

test('review R13: the closing send window exposes only the actual remaining credential validity', async () => {
  const u = await newUser();
  const queued = await readInviteStatus(admin,u.id);
  assert.equal(queued?.credentialValidUntil,null);
  const issued = await intent(u.id);
  const term = new Date(Date.now()+125_000);
  await prisma.credentialMail.update({where:{id:issued.id},data:{expiresAt:term}});
  smtp.controls.reply='temporary';
  await runMailCycle();
  const window = await readInviteStatus(admin,u.id);
  assert.equal(window?.reason,'WINDOW');
  assert.equal(window.credentialValidUntil?.getTime(),+term);
  assert.equal('tokenId' in window,false);
  await prisma.user.update({where:{id:u.id},data:{isActive:false}});
  assert.equal((await readInviteStatus(admin,u.id))?.credentialValidUntil,null);
});
