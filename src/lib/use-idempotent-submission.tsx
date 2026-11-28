'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createIdempotentSubmitter, IdempotentSubmissionError } from './idempotent-submission';

const SubmissionContext = createContext<ReturnType<typeof createIdempotentSubmitter> | null>(null);
const tabStorage = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  removeItem: (key: string) => window.sessionStorage.removeItem(key),
};

export function IdempotentSubmissionProvider({ actorId, children }: { actorId: string; children: ReactNode }) {
  const submit = useMemo(() => createIdempotentSubmitter(actorId, tabStorage, (...args) => fetch(...args)), [actorId]);
  return <SubmissionContext.Provider value={submit}>{children}</SubmissionContext.Provider>;
}

export function useIdempotentSubmission() {
  const submit = useContext(SubmissionContext);
  const t = useTranslations('IdempotentSubmission');
  if (!submit) throw new Error('IdempotentSubmissionProvider is missing');
  return {
    submitIdempotently: submit,
    submissionError: (error: unknown, fallback: string) => error instanceof IdempotentSubmissionError ? t(error.reason) : fallback,
  };
}
