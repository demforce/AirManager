'use client';

import { useState } from 'react';
import type { ExpiryProposalItemDto } from '@/lib/schemas/expiries';

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

/**
 * Staff proposal-validation queue (story 6.2, AC 2, Task 5) — current vs
 * proposed values side by side, FIFO (server-ordered `createdAt asc`).
 * Decided proposals are removed from local state immediately on success
 * (this queue only ever shows `status=PENDING`, same "local list mutation,
 * no full page reload" pattern as `flights-manager.tsx`'s
 * cancel/correct) — the `total`/pagination shown on the surrounding page
 * reflects the count AT LOAD time; a fresh page load (or the next page
 * link) picks up the authoritative server count.
 */
export function ProposalsQueue({ proposals: initialProposals, labels }: ProposalsQueueProps) {
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
    <p role="status" data-testid="proposals-queue-feedback" className="mb-4 text-sm text-[#346538]">
      {feedback}
    </p>
  ) : null;

  // The empty state must NOT early-return before the feedback banner above
  // — approving/rejecting the LAST pending proposal empties this list in
  // the very same render, and the confirmation message would otherwise
  // never be seen (a real bug caught during interactive Playwright MCP
  // verification, story 6.2).
  if (proposals.length === 0) {
    return (
      <div data-testid="proposals-queue">
        {feedbackBanner}
        <p className="text-sm text-[#787774]">{labels.empty}</p>
      </div>
    );
  }

  return (
    <div data-testid="proposals-queue">
      {feedbackBanner}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#EAEAEA] text-xs uppercase tracking-[0.05em] text-[#787774]">
              <th className="py-2 pr-4 font-medium">{labels.table.person}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.type}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.current}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.proposed}</th>
              <th className="py-2 pr-4 font-medium">{labels.table.proposedBy}</th>
              <th className="py-2 font-medium">{labels.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((proposal) => (
              <tr key={proposal.id} data-testid="proposal-row" className="border-b border-[#EAEAEA] align-top text-[#111111]">
                <td className="py-3 pr-4 font-medium whitespace-nowrap">{proposal.personName}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{proposal.typeName}</td>
                <td className="py-3 pr-4 whitespace-nowrap text-[#787774]">
                  <span className="block">{proposal.currentIssuedAt} &rarr; {proposal.currentExpiresAt}</span>
                  {proposal.currentNotes ? <span className="block text-xs">{proposal.currentNotes}</span> : null}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="block font-medium">
                    {proposal.proposedIssuedAt} &rarr; {proposal.proposedExpiresAt}
                  </span>
                  {proposal.proposedNotes ? <span className="block text-xs text-[#787774]">{proposal.proposedNotes}</span> : null}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-[#787774]">{proposal.proposedByEmail}</td>
                <td className="py-3">
                  {pendingConfirm?.proposalId === proposal.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[#787774]">
                        {pendingConfirm.decision === 'APPROVE' ? labels.actions.confirmApprove : labels.actions.confirmReject}
                      </span>
                      <button
                        type="button"
                        disabled={busyId === proposal.id}
                        onClick={() => void decide(proposal.id, pendingConfirm.decision)}
                        className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
                      >
                        {labels.actions.confirmYes}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingConfirm(null)}
                        className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                      >
                        {labels.actions.confirmCancel}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === proposal.id}
                        onClick={() => setPendingConfirm({ proposalId: proposal.id, decision: 'APPROVE' })}
                        className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
                      >
                        {labels.actions.approve}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === proposal.id}
                        onClick={() => setPendingConfirm({ proposalId: proposal.id, decision: 'REJECT' })}
                        className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
                      >
                        {labels.actions.reject}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
