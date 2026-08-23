// Phase 8: persistence for `trip_closure_confirmations`, present since the
// Phase 1 init migration but unused until now. Primary key is
// (trip_id, member_id, stage), so a member confirming the same stage twice
// is a natural no-op at the database level rather than something calling
// code has to special-case.

const CONFIRMATION_COLUMNS = `trip_id, member_id, stage, confirmed_at`;

// ON CONFLICT DO NOTHING makes a duplicate confirmation idempotent instead
// of throwing a unique-violation. RETURNING is empty on a no-op conflict,
// so callers should treat a null return as "already confirmed" rather than
// as a failure.
export async function insertConfirmation(client, { tripId, memberId, stage }) {
  const result = await client.query(
    `INSERT INTO trip_closure_confirmations (trip_id, member_id, stage)
     VALUES ($1, $2, $3)
     ON CONFLICT (trip_id, member_id, stage) DO NOTHING
     RETURNING ${CONFIRMATION_COLUMNS}`,
    [tripId, memberId, stage]
  );
  return result.rows[0] || null;
}

export async function findConfirmation(poolOrClient, tripId, memberId, stage) {
  const result = await poolOrClient.query(
    `SELECT ${CONFIRMATION_COLUMNS}
     FROM trip_closure_confirmations
     WHERE trip_id = $1 AND member_id = $2 AND stage = $3`,
    [tripId, memberId, stage]
  );
  return result.rows[0] || null;
}

// Returns just the member_id column as a plain array - the common case is
// "which of the current active members have confirmed", which only needs
// set membership, not the full row shape.
export async function listConfirmedMemberIdsForTrip(poolOrClient, tripId, stage) {
  const result = await poolOrClient.query(
    `SELECT member_id FROM trip_closure_confirmations WHERE trip_id = $1 AND stage = $2`,
    [tripId, stage]
  );
  return result.rows.map((row) => row.member_id);
}

export async function listConfirmationsForTrip(poolOrClient, tripId) {
  const result = await poolOrClient.query(
    `SELECT ${CONFIRMATION_COLUMNS} FROM trip_closure_confirmations WHERE trip_id = $1 ORDER BY confirmed_at ASC`,
    [tripId]
  );
  return result.rows;
}
