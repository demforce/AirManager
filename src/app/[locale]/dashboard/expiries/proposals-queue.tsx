'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';
import type { ExpiryProposalItemDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';

export type ProposalsQueueLabels = {
  empty: string;
  table: {
    person: string;
    type: string;
    current: string;
    proposed: string;
    proposedBy: string;
    when: string;
    actions: string;
  };
  actions: {
    approve: string;
    reject: string;
    confirmApprove: string;
    confirmReject: string;
    confirmYes: string;
    confirmCancel: string;
  };
  feedback: { approved: string; rejected: string; genericError: string };
};

type ProposalsQueueProps = {
  proposals: ExpiryProposalItemDto[];
  labels: ProposalsQueueLabels;
};

type PendingConfirm = { proposalId: string; decision: 'APPROVE' | 'REJECT' };

const COLS = 'minmax(130px,1.2fr) 130px minmax(140px,1.4fr) minmax(140px,1.4fr) minmax(140px,1.2fr) 160px';

/**
 * Staff proposal-validation queue (story 6.2, AC 2; AirOps restyle, story
 * 12.11 AC 3 — `.students` grid instead of a raw `<table>`, same
 * `data-testid`s/logic as before: current vs proposed values side by side,
 * FIFO order). "Proposte VIVE fino a 12.13" (D10) — this flow is untouched
 * functionally by this story, only its markup moved onto the AirOps
 * language.
 */
export function ProposalsQueue({ proposals: initialProposals, labels }: ProposalsQueueProps) {
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [proposals, setProposals] = useState(initialProposals);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function decide(proposalId: string, decision: 'APPROVE' | 'REJECT'): Promise<void> {
    setBusyId(proposalId);
    setPendingConfirm(null);
    const response = await fetch(`/api/v1/expiry-proposals/${proposalId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);

    if (response.ok) {
      setProposals((current) => current.filter((proposal) => proposal.id !== proposalId));
      setFeedback(decision === 'APPROVE' ? labels.feedback.approved : labels.feedback.rejected);
    } else {
      setFeedback(labels.feedback.genericError);
    }
  }

  const feedbackBanner = feedback ? (
    <p role="status" data-testid="proposals-queue-feedback" style={{ padding: '10px 20px 0', fontSize: 12.5, color: 'var(--ok)' }}>
      {feedback}
    </p>
  ) : null;

  // The empty state must NOT early-return before the feedback banner above
  // — approving/rejecting the LAST pending proposal empties this list in
  // the very same render, and the confirmation message would otherwise
  // never be seen (a real bug caught during interactive verification, story 6.2).
  if (proposals.length === 0) {
    return (
      <div data-testid="proposals-queue">
        {feedbackBanner}
        <p style={{ padding: '12px 20px', color: 'var(--ink-3)', fontSize: 13 }}>{labels.empty}</p>
      </div>
    );
  }

  return (
    <div data-testid="proposals-queue">
      {feedbackBanner}

      <div className="students">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.person}</div>
          <div>{labels.table.type}</div>
          <div>{labels.table.current}</div>
          <div>{labels.table.proposed}</div>
          <div>{labels.table.proposedBy}</div>
          <div>{labels.table.actions}</div>
        </div>
        {proposals.map((proposal) => (
          <div key={proposal.id} data-testid="proposal-row" className="student-row" style={{ gridTemplateColumns: COLS }}>
            <div className="student-name">{proposal.personName}</div>
            <div style={{ fontSize: 12.5 }}>{proposal.typeName}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              <span className="mono">
                {formatDateOnly(proposal.currentIssuedAt, moneyLocale)} &rarr; {formatDateOnly(proposal.currentExpiresAt, moneyLocale)}
              </span>
              {proposal.currentNotes ? <span style={{ display: 'block', fontSize: 11 }}>{proposal.currentNotes}</span> : null}
            </div>
            <div style={{ fontSize: 12 }}>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {formatDateOnly(proposal.proposedIssuedAt, moneyLocale)} &rarr; {formatDateOnly(proposal.proposedExpiresAt, moneyLocale)}
              </span>
              {proposal.proposedNotes ? <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{proposal.proposedNotes}</span> : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{proposal.proposedByEmail}</div>
            <div>
              {pendingConfirm?.proposalId === proposal.id ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    {pendingConfirm.decision === 'APPROVE' ? labels.actions.confirmApprove : labels.actions.confirmReject}
                  </span>
                  <button type="button" className="btn mini primary" disabled={busyId === proposal.id} onClick={() => void decide(proposal.id, pendingConfirm.decision)}>
                    {labels.actions.confirmYes}
                  </button>
                  <button type="button" className="btn mini" onClick={() => setPendingConfirm(null)}>
                    {labels.actions.confirmCancel}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    className="btn mini primary"
                    disabled={busyId === proposal.id}
                    onClick={() => setPendingConfirm({ proposalId: proposal.id, decision: 'APPROVE' })}
                  >
                    {labels.actions.approve}
                  </button>
                  <button
                    type="button"
                    className="btn mini"
                    disabled={busyId === proposal.id}
                    onClick={() => setPendingConfirm({ proposalId: proposal.id, decision: 'REJECT' })}
                  >
                    {labels.actions.reject}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
