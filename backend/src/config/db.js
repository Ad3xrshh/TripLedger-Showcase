import 'dotenv/config';
import pg from 'pg';

// node-pg's default parser for DATE columns (OID 1082) returns a JS Date
// object at local midnight. Express's res.json() then serializes that via
// Date.prototype.toJSON()/toISOString(), which converts local midnight to
// UTC - producing a full ISO datetime string (e.g.
// "2026-08-15T18:30:00.000Z") for what is actually a plain, timezone-less
// calendar date in the trips.start_date/end_date columns. Depending on the
// server's local timezone offset, that can even shift the apparent
// calendar date by a day. Overriding the parser to return the raw
// "YYYY-MM-DD" string PostgreSQL sends on the wire fixes this at its
// single source rather than patching every place a DATE column is read -
// the stored value and every query/comparison against it are completely
// unaffected, since this only changes how already-correct data is handed
// to JS.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

// Pass 3: which connection string this pool uses depends on NODE_ENV, not
// on which file happens to import it. Every integration test file in
// tests/integration/ imports this same singleton pool (for both the
// Express app under test AND its own cleanup queries) - `npm test`
// exports NODE_ENV=test before invoking the test runner (see
// package.json's "test" script), so that's the only thing that needs to
// flip for the whole suite to run against TEST_DATABASE_URL instead of
// DATABASE_URL. `npm run dev` / `npm start` never set NODE_ENV=test, so
// normal development continues to use DATABASE_URL exactly as before -
// this is additive, not a change to non-test behavior.
const isTestEnv = process.env.NODE_ENV === 'test';

if (isTestEnv && !process.env.TEST_DATABASE_URL) {
  // Fail loudly and immediately rather than silently falling back to
  // DATABASE_URL, which would mean the test suite quietly runs its
  // DELETE/INSERT cleanup and fixture queries against the real
  // development database - exactly the scenario TEST_DATABASE_URL exists
  // to prevent. See backend/.env.example for the expected shape.
  throw new Error(
    'NODE_ENV=test but TEST_DATABASE_URL is not set. Refusing to fall back ' +
      'to DATABASE_URL, which would run tests against the development ' +
      'database. Set TEST_DATABASE_URL in your .env (see .env.example).'
  );
}

const connectionString = isTestEnv ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

// Single shared pool for the whole process. Repositories import this
// instead of each creating their own pool.
const pool = new pg.Pool({ connectionString });

pool.on('error', (err) => {
  // Catches errors on idle clients (e.g. connection dropped) so they
  // don't crash the process.
  console.error('Unexpected error on idle Postgres client', err);
});

export default pool;

/**
 * Runs `fn` inside a single Postgres transaction. `fn` receives a checked-out
 * client and must use it for every query (not the shared pool), so all
 * queries run on the same connection/transaction. Commits on success, rolls
 * back on any thrown error, and always releases the client back to the pool.
 *
 * Added in Phase 3 for multi-table writes (e.g. creating a trip + its
 * settlement unit + its membership row atomically). Existing Phase 1/2 code
 * is unaffected — this is a new named export alongside the untouched
 * default pool export.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

