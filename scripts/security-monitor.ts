import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { prisma } from '../src/server/db/prisma';
import { scanAccessSecurity } from '../src/server/services/access-security';

async function main() {
  const once = process.argv.includes('--once');
  const stop = new AbortController();
  process.once('SIGTERM', () => stop.abort());
  process.once('SIGINT', () => stop.abort());
  try {
    do {
      try { await scanAccessSecurity(); }
      catch {
        console.error('access-security: monitor scan unavailable');
        if (once) process.exitCode = 1;
      }
      if (!once && !stop.signal.aborted) await sleep(30_000, undefined, { signal: stop.signal }).catch(() => {});
    } while (!once && !stop.signal.aborted);
  } finally { await prisma.$disconnect(); }
}

main().catch(() => { console.error('access-security: monitor unavailable'); process.exitCode = 1; });
