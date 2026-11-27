export type SmtpPhase = 'CONFIG' | 'CONNECT' | 'AUTH' | 'SENDER' | 'RECIPIENT' | 'DATA' | 'MESSAGE' | 'FINAL';
export type SmtpOutcome = 'SUPPRESSED' | 'ACCEPTED' | 'TEMPORARY' | 'PERMANENT' | 'CONFIGURATION' | 'UNAVAILABLE' | 'UNCERTAIN';
export type SmtpObservation = {
  outcome: SmtpOutcome;
  phase: SmtpPhase;
  code?: number;
  channel: boolean;
};

/** Only structured, allow-listed evidence leaves the transport boundary. */
export function classifySmtpError(error: unknown, stage: SmtpPhase): SmtpObservation {
  const e = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  const code = typeof e.responseCode === 'number' && Number.isInteger(e.responseCode) && e.responseCode >= 400 && e.responseCode <= 599 ? e.responseCode : undefined;
  const phase = e.command === 'RCPT TO' ? 'RECIPIENT' : e.command === 'MAIL FROM' ? 'SENDER' : e.command === 'DATA' ? e.code === 'EMESSAGE' ? 'FINAL' : 'DATA' : stage;
  if (code && code < 500) return {
    outcome: 'TEMPORARY',
    phase,
    code,
    channel: phase !== 'RECIPIENT' || code === 421
  };
  const numeric = code ? {
    code
  } : {};
  if (code === 530 || code === 535 || stage === 'CONFIG' || stage === 'AUTH' && code !== undefined || e.code === 'ETLS' || e.code === 'EAUTH' || e.code === 'ESOCKET' && stage === 'CONNECT' && typeof e.message === 'string' && /certificate|self.signed|unable to verify|ssl routines|wrong version number/i.test(e.message) || typeof e.code === 'string' && /CERT|SELF_SIGNED|VERIFY_LEAF|SSL|TLS/.test(e.code) || code && (phase === 'CONNECT' || phase === 'SENDER')) {
    return {
      outcome: 'CONFIGURATION',
      phase,
      ...numeric,
      channel: true
    };
  }
  if (code) return {
    outcome: 'PERMANENT',
    phase,
    code,
    channel: false
  };
  if (stage === 'CONNECT' || stage === 'AUTH') return {
    outcome: 'UNAVAILABLE',
    phase,
    channel: true
  };
  return {
    outcome: 'UNCERTAIN',
    phase,
    channel: false
  };
}
