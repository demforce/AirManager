import { setTimeout as sleep } from 'node:timers/promises';
import 'dotenv/config';
import { requireMailTestDatabase } from './mail-test-database';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--test-loopback')) requireMailTestDatabase('worker');
  const { DEFAULT_SCAN_MS, NonLocalTestRelay, runMailCycle } = await import('@/server/services/credential-mail-worker');
  const { prisma } = await import('@/server/db/prisma');
  const intervalArg = args.find(a => a.startsWith('--interval-ms='));
  const interval = intervalArg ? Number(intervalArg.split('=')[1]) : DEFAULT_SCAN_MS;
  if (!Number.isSafeInteger(interval) || interval < 250 || interval > 60_000) throw new Error('Invalid worker interval.');
  const stop = new AbortController();
  process.once('SIGTERM', () => stop.abort());
  process.once('SIGINT', () => stop.abort());
  do {
    try {
      await runMailCycle(interval, args.includes('--test-loopback'));
    } catch (error) {
      if (error instanceof NonLocalTestRelay) {
        console.error('credential-mail: non-local test relay refused');
        process.exitCode = 1;
        break;
      }
      console.error('credential-mail: cycle unavailable');
      if (args.includes('--once')) process.exitCode = 1;
    }
    if (stop.signal.aborted || args.includes('--once')) break;
    await sleep(interval, undefined, {
      signal: stop.signal
    }).catch(() => {});
  } while (!stop.signal.aborted);
  await prisma.$disconnect();
}
main().catch(() => {
  console.error('credential-mail: worker unavailable');
  process.exitCode = 1;
});
