import { describe, expect, it } from 'vitest';
import { classifySmtpError } from './smtp-observation';

describe('SMTP handoff evidence', () => {
  it('distinguishes a definitive DATA rejection from a lost final reply', () => {
    expect(classifySmtpError({ command: 'DATA', responseCode: 451 }, 'MESSAGE')).toEqual({ outcome: 'TEMPORARY', phase: 'DATA', code: 451, channel: true });
    expect(classifySmtpError({ code: 'ETIMEDOUT', command: 'CONN' }, 'MESSAGE')).toEqual({ outcome: 'UNCERTAIN', phase: 'MESSAGE', channel: false });
  });
  it('isolates a permanent recipient rejection from a channel fault', () => {
    expect(classifySmtpError({ command: 'RCPT TO', responseCode: 550 }, 'MESSAGE')).toEqual({ outcome: 'PERMANENT', phase: 'RECIPIENT', code: 550, channel: false });
    expect(classifySmtpError({ code: 'EAUTH', responseCode: 535 }, 'AUTH')).toEqual({ outcome: 'CONFIGURATION', phase: 'AUTH', code: 535, channel: true });
  });
  it('knows a connection failure before submission cannot have been accepted', () => {
    expect(classifySmtpError({ code: 'ECONNREFUSED' }, 'CONNECT')).toEqual({ outcome: 'UNAVAILABLE', phase: 'CONNECT', channel: true });
  });
});
