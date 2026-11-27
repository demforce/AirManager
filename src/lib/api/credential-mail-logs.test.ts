import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

// Every service double emits a synthetic dependency failure. The real routes, validation,
// HTTP envelopes and central exception handling must preserve their public contracts.
const failing = vi.hoisted(() => vi.fn(async () => { throw new Error('fixture-sensitive-response synthetic@example.test token=fixture'); }));
vi.mock('@/server/auth/session', () => ({ getSessionActor: async () => ({ userId:'fixture-admin', roles:['ADMIN'], personId:null }) }));
vi.mock('@/server/db/prisma', () => ({ prisma: {} }));
vi.mock('@/server/services/users.service', () => ({createUser:failing}));
vi.mock('@/server/services/people.service', () => ({createPerson:failing,listPeople:vi.fn()}));
vi.mock('@/server/services/credential-mail.service', () => ({resendInvite:failing,readInviteStatus:vi.fn()}));
vi.mock('@/server/services/auth-tokens.service', () => ({requestPasswordReset:failing}));
vi.mock('@/server/services/smtp-test-email.service', () => ({sendSmtpTestEmail:failing,readMailHealth:vi.fn()}));

const users = await import('@/app/api/v1/users/route');
const people = await import('@/app/api/v1/people/route');
const invites = await import('@/app/api/v1/users/[id]/resend-invite/route');
const recovery = await import('@/app/api/v1/auth/forgot-password/route');
const smtp = await import('@/app/api/v1/settings/smtp/test-email/route');
const cases = [
  [(r: NextRequest) => users.POST(r), {email:'synthetic@example.test',roles:['PILOT']},500],
  [(r: NextRequest) => people.POST(r), {firstName:'Test',lastName:'Club',access:{email:'synthetic@example.test',roles:['PILOT']}},500],
  [(r: NextRequest) => invites.POST(r,{params:Promise.resolve({id:'fixture'})}),undefined,500],
  [(r: NextRequest) => recovery.POST(r), {email:'synthetic@example.test'},200],
  [(r: NextRequest) => smtp.POST(r),undefined,500],
] as const;
it('sanitizes application logs on every credential mail entry point and always acknowledges public recovery',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {
    for(const [route,body,status] of cases) {
      const request = new NextRequest('http://localhost/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const response = await route(request);
      expect(response.status).toBe(status);
      expect(/fixture-sensitive|@example|token=/.test(await response.text())).toBe(false);
    }
    expect(failing).toHaveBeenCalledTimes(5);
    expect(log).toHaveBeenCalledTimes(5);
    expect(/fixture-sensitive|@example|token=/.test(log.mock.calls.flat().map(String).join(' '))).toBe(false);
  } finally {log.mockRestore();}
});
