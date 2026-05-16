/**
 * migrate-with-retry.js
 *
 * Wraps `prisma migrate deploy` with bounded retries on the
 * advisory-lock-timeout error (P1002).
 *
 * Why this exists: every Prisma migrate run takes an advisory lock
 * `pg_advisory_lock(72707369)` on the target database. If two
 * deploys are racing (e.g. a Vercel preview + a production deploy
 * triggered by the same push) or a previous deploy was killed
 * before releasing the lock, the second migrate fails with P1002
 * after a 10-second timeout. The fix is usually just "wait a bit
 * and retry" — the holder either finishes or its session times out.
 *
 * We do NOT retry on any other error. Schema drift, syntax errors,
 * connection failures to the database, etc. all should fail loudly
 * and immediately — they are not transient.
 *
 * Tuning rationale:
 *   - 3 attempts. The advisory lock is released within seconds of
 *     the holder finishing or its session dying; if 3 attempts with
 *     ~50s of total backoff don't get it, something more serious is
 *     wrong (e.g. a stuck Neon connection) and the build should
 *     fail loudly so a human looks at it.
 *   - 15s then 30s backoff. Neon's default idle-pooler timeout is
 *     ~5 minutes, so we are not trying to outwait that — we are
 *     trying to outwait a concurrent deploy's own ~30s-60s migrate
 *     run. If a deploy genuinely takes longer than 75s after the
 *     first failure, the human-attention case applies.
 *   - We do NOT pass-through `prisma migrate deploy`'s exit code
 *     verbatim, because Prisma sometimes exits non-zero with a
 *     warning (e.g. `migrations are not in sync` with --skip-seed)
 *     that the build should not retry. Match strictly on the P1002
 *     substring in stderr.
 */

const { spawnSync } = require('node:child_process');

const ATTEMPTS    = 3;
const BACKOFFS_MS = [15_000, 30_000]; // length = ATTEMPTS - 1

const ADVISORY_LOCK_MARKER = 'P1002';

function runMigrate() {
  return spawnSync('prisma', ['migrate', 'deploy'], {
    stdio:  ['inherit', 'inherit', 'pipe'],
    shell:  true,
    encoding: 'utf-8',
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const isLast = attempt === ATTEMPTS;
    const result = runMigrate();

    // Pass through stderr so the human can see the actual Prisma
    // output regardless of whether we retry.
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) {
      if (attempt > 1) {
        console.log(`[migrate-with-retry] succeeded on attempt ${attempt}`);
      }
      process.exit(0);
    }

    // Distinguish "advisory lock timeout — transient, retry" from
    // every other failure ("real bug — fail loudly").
    const isAdvisoryLockTimeout =
      typeof result.stderr === 'string' &&
      result.stderr.includes(ADVISORY_LOCK_MARKER);

    if (!isAdvisoryLockTimeout || isLast) {
      console.error(
        `[migrate-with-retry] migrate deploy failed${
          !isAdvisoryLockTimeout ? ' (non-transient error — not retrying)' : ''
        }${isLast ? ' — out of retries' : ''}`,
      );
      process.exit(result.status ?? 1);
    }

    const backoff = BACKOFFS_MS[attempt - 1] ?? 30_000;
    console.warn(
      `[migrate-with-retry] attempt ${attempt}/${ATTEMPTS} hit P1002 advisory-lock timeout; waiting ${backoff / 1000}s before retry`,
    );
    await sleep(backoff);
  }
}

main().catch((err) => {
  console.error('[migrate-with-retry] unexpected error', err);
  process.exit(1);
});
