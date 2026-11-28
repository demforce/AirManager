import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { requireMailTestDatabase } from '../scripts/mail-test-database';

/** One independent process for the browser suite. Never launch against an unmarked database. */
export default async function setup() {
  requireMailTestDatabase('browser');
  if (!['localhost','127.0.0.1','::1'].includes(process.env.SMTP_HOST ?? 'localhost')) {
    throw new Error('The isolated browser worker needs a loopback SMTP fallback.');
  }
  const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/mail-worker.ts', '--interval-ms=1000', '--test-loopback'], {
    stdio: 'inherit'
  });
  const closed = once(worker, 'close');
  return async () => {
    worker.kill('SIGTERM');
    const [code] = await closed;
    if (typeof code === 'number' && code !== 0) throw new Error('The isolated credential worker failed.');
  };
}
