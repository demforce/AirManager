/**
 * Stable mail-sending contract (architecture spine, Deferred: "Provider email
 * di produzione ... dietro MailSender"). Every future story sends email
 * through this interface, never through `nodemailer` directly, so swapping
 * Mailpit for a production provider (Resend/SES/SMTP) at go-live only means
 * writing a new implementation of this same interface.
 */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Recheck an isolated trial recipient after reading settings, immediately before submission. */
  confirmRecipient?: () => Promise<boolean>;
  /** Called immediately before submitting the prepared message to the transport. */
  onSubmit?: () => void;
};

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/** A definite change of identity at the handoff fence, distinct from a failed lookup. */
export class MailRecipientChangedError extends Error {
  constructor() { super('Recipient eligibility changed.'); }
}
