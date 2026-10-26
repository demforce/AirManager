// HTTP cost harness: cold/p50/p95/max + optional burst, per target. See
// scripts/perf/README.md for full usage. Story 17.1 promotes this from a
// session scratchpad (perf-load-report.md §5) so every epic 17 story
// measures prima/dopo with the same tool.
//
// Usage:
//   BASE=http://localhost:3001 EMAIL=admin@airmanager.local PASSWORD=... \
//     node scripts/perf/bench.mjs scripts/perf/targets-hot.json [iterations] [concurrency]
//
// Logs in through the Auth.js credentials flow once, then times every
// target (sequential p50/p95/max over N iterations, plus one burst of C
// parallel requests for targets flagged "burst": true). Writes the results
// JSON under OUT (default ${TMPDIR:-/tmp}/airmanager-perf/) — never next to
// the targets file, so a run never dirties `git status` (AD-3).
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const EMAIL = process.env.EMAIL ?? 'admin@airmanager.local';
const PASSWORD = process.env.PASSWORD;
const OUT = process.env.OUT ?? path.join(process.env.TMPDIR || '/tmp', 'airmanager-perf');
const DUMP = process.env.DUMP ? path.join(OUT, 'dump') : null;
const targetsPath = process.argv[2];
const ITER = Number(process.argv[3] ?? 5);
const CONC = Number(process.argv[4] ?? 10);
if (!PASSWORD || !targetsPath) {
  console.error('need PASSWORD env and a targets.json path');
  process.exit(2);
}

const jar = new Map();
function storeCookies(res) {
  // Headers.get('set-cookie') collapses multiple cookies into one string;
  // Auth.js's login sends more than one, so getSetCookie() is required here
  // (do not "simplify" this back to .get() — CLAUDE.md/story trap #13).
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === '' || /Max-Age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function req(pathname, init = {}) {
  // redirect: 'manual' measures the server's own response, not a followed
  // redirect chain — also how an unresolved-path target surfaces as a 307
  // instead of silently following it (AC 5).
  const res = await fetch(BASE + pathname, {
    ...init,
    redirect: 'manual',
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  storeCookies(res);
  return res;
}

async function login() {
  const csrfRes = await req('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: BASE + '/it/dashboard' });
  const res = await req('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const me = await req('/api/v1/me');
  if (me.status !== 200) {
    console.error('login failed', res.status, me.status, await me.text());
    process.exit(3);
  }
  const j = await me.json();
  console.error(`logged in as ${EMAIL} (${JSON.stringify(j.roles ?? j.data?.roles ?? '')})`);
}

// Placeholder resolution (AD-2): {PERSON}/{AIRCRAFT} come from env if set,
// otherwise from a live API call — no `psql` on this host, so this cannot
// live in a shell script. Dates are computed in UTC, not imported from
// `date-only.ts`: a `.mjs` outside the bundle has no toolchain to pull that
// module in, and a benchmark window off by the local UTC offset does not
// change any measurement here (unlike the domain's "one calendar" rule).
async function resolvePlaceholders() {
  const now = new Date();
  const todayOnly = now.toISOString().slice(0, 10);
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const weekFromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const weekToDate = new Date(weekFromDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  let person = process.env.PERSON;
  let personFrom = 'env';
  if (!person) {
    const res = await req('/api/v1/people?page=1');
    const j = await res.json();
    person = j.items?.[0]?.id;
    personFrom = 'api';
  }

  let aircraft = process.env.AIRCRAFT;
  let aircraftFrom = 'env';
  if (!aircraft) {
    const res = await req('/api/v1/aircraft');
    const j = await res.json();
    aircraft = j.items?.[0]?.id;
    aircraftFrom = 'api';
  }

  return {
    values: {
      '{PERSON}': person ?? '',
      '{AIRCRAFT}': aircraft ?? '',
      '{TODAY}': todayOnly,
      '{MONTH_START}': monthStart,
      '{WEEK_FROM}': weekFromDate.toISOString(),
      '{WEEK_TO}': weekToDate.toISOString(),
    },
    provenance: { person, personFrom, aircraft, aircraftFrom },
  };
}

function applyPlaceholders(target, values) {
  let path_ = target.path;
  for (const [key, value] of Object.entries(values)) {
    path_ = path_.split(key).join(value);
  }
  return { ...target, path: path_ };
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

async function timeOne(t) {
  const start = performance.now();
  const res = await req(t.path, { method: t.method ?? 'GET', headers: t.headers ?? {} });
  const buf = await res.arrayBuffer();
  const ms = performance.now() - start;
  if (DUMP) {
    fs.mkdirSync(DUMP, { recursive: true });
    fs.writeFileSync(path.join(DUMP, t.name.replace(/[^a-z0-9]+/gi, '_') + '.bin'), Buffer.from(buf));
  }
  let count = null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(Buffer.from(buf).toString('utf8'));
      count = j.total ?? j.data?.total ?? (Array.isArray(j.data) ? j.data.length : Array.isArray(j.items) ? j.items.length : Array.isArray(j) ? j.length : null);
    } catch {
      // Non-JSON or malformed body (e.g. a PDF or an error page): leave count null.
    }
  }
  return { ms, status: res.status, bytes: buf.byteLength, count, ct: ct.split(';')[0] };
}

// The six keys `resolvePlaceholders()` always returns (AD-2's table) — used
// to validate target names BEFORE logging in, so an unknown placeholder
// exits without sending a single request (AC 3).
const KNOWN_PLACEHOLDERS = ['{PERSON}', '{AIRCRAFT}', '{TODAY}', '{MONTH_START}', '{WEEK_FROM}', '{WEEK_TO}'];

async function main() {
  const rawTargets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));

  // Fail-fast (AD-2), before any network call: an unknown placeholder name
  // is a typo in the target list, not something login or the API resolves.
  for (const t of rawTargets) {
    const unresolved = t.path.match(/\{[A-Z_]+\}/);
    if (unresolved && !KNOWN_PLACEHOLDERS.includes(unresolved[0])) {
      console.error(`unknown placeholder ${unresolved[0]} in target "${t.name}" (${t.path})`);
      process.exit(2);
    }
  }

  await login();
  const { values, provenance } = await resolvePlaceholders();

  // A known placeholder resolved to '' (e.g. an empty people/aircraft list)
  // would silently measure a malformed path (`/api/v1/people//account`)
  // instead of failing — worse than not running at all (AD-2).
  for (const [key, value] of Object.entries(values)) {
    if (value === '' && rawTargets.some((t) => t.path.includes(key))) {
      console.error(`placeholder ${key} resolved to an empty value (used by at least one target)`);
      process.exit(2);
    }
  }

  const targets = rawTargets.map((t) => applyPlaceholders(t, values));
  for (const t of targets) {
    const stillOpen = t.path.match(/\{[A-Z_]+\}/);
    if (stillOpen) {
      console.error(`placeholder ${stillOpen[0]} did not resolve for target "${t.name}" (${t.path})`);
      process.exit(2);
    }
  }

  const results = [];
  for (const t of targets) {
    // warm-up
    const warm = await timeOne(t);
    const samples = [];
    let last = warm;
    for (let i = 0; i < ITER; i++) {
      last = await timeOne(t);
      samples.push(last.ms);
    }
    samples.sort((a, b) => a - b);
    const row = {
      name: t.name,
      path: t.path,
      status: last.status,
      ct: last.ct,
      bytes: last.bytes,
      count: last.count,
      cold_ms: Math.round(warm.ms),
      p50_ms: Math.round(pct(samples, 50)),
      p95_ms: Math.round(pct(samples, 95)),
      max_ms: Math.round(samples[samples.length - 1]),
    };
    if (t.burst) {
      const s = performance.now();
      const burst = await Promise.all(Array.from({ length: CONC }, () => timeOne(t)));
      row.burst_wall_ms = Math.round(performance.now() - s);
      row.burst_p95_ms = Math.round(pct(burst.map((b) => b.ms).sort((a, b) => a - b), 95));
      row.burst_errors = burst.filter((b) => b.status >= 400).length;
    }
    results.push(row);
    console.error(`${row.status} ${String(row.p50_ms).padStart(6)}ms p50 ${String(row.p95_ms).padStart(6)}ms p95 ${String(row.bytes).padStart(8)}B ${row.count ?? ''} ${row.name}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, path.basename(targetsPath, '.json') + '.results.json');
  fs.writeFileSync(
    out,
    JSON.stringify({ base: BASE, email: EMAIL, iter: ITER, conc: CONC, at: new Date().toISOString(), ...provenance, results }, null, 2),
  );

  // markdown table
  const cols = ['name', 'status', 'cold_ms', 'p50_ms', 'p95_ms', 'max_ms', 'bytes', 'count', 'burst_wall_ms', 'burst_p95_ms', 'burst_errors'];
  console.log('| ' + cols.join(' | ') + ' |');
  console.log('|' + cols.map(() => '---').join('|') + '|');
  for (const r of results) console.log('| ' + cols.map((c) => r[c] ?? '').join(' | ') + ' |');
  console.error(`results -> ${out}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
