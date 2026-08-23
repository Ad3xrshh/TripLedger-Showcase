const TRIP_COLUMNS = `
  id, name, start_date, end_date, currency, created_by, join_code,
  budget_type, budget_amount_minor, fair_share_method, verification_mode,
  status, created_at
`;

export async function insertTrip(client, { name, startDate, endDate, currency, createdBy, joinCode, budgetType, budgetAmountMinor, fairShareMethod, verificationMode }) {
  const result = await client.query(
    `INSERT INTO trips (
       name, start_date, end_date, currency, created_by, join_code,
       budget_type, budget_amount_minor, fair_share_method, verification_mode
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${TRIP_COLUMNS}`,
    [name, startDate ?? null, endDate ?? null, currency, createdBy, joinCode, budgetType, budgetAmountMinor ?? null, fairShareMethod, verificationMode]
  );
  return result.rows[0];
}

export async function findTripByJoinCode(pool, joinCode) {
  const result = await pool.query(
    `SELECT ${TRIP_COLUMNS} FROM trips WHERE join_code = $1`,
    [joinCode]
  );
  return result.rows[0] || null;
}

export async function findTripById(pool, tripId) {
  const result = await pool.query(
    `SELECT ${TRIP_COLUMNS} FROM trips WHERE id = $1`,
    [tripId]
  );
  return result.rows[0] || null;
}

export async function findTripByIdForUpdate(client, tripId) {
  const result = await client.query(
    `SELECT ${TRIP_COLUMNS} FROM trips WHERE id = $1 FOR UPDATE`,
    [tripId]
  );
  return result.rows[0] || null;
}

// Phase 8: transitions trip.status through the existing
// active -> closing -> closed CHECK-constrained lifecycle. Always called
// with a `client` from a transaction that already holds a row lock on this
// trip (via findTripByIdForUpdate), so the read-then-write in the calling
// service is race-free.
export async function updateTripStatus(client, tripId, status) {
  const result = await client.query(
    `UPDATE trips SET status = $2 WHERE id = $1 RETURNING ${TRIP_COLUMNS}`,
    [tripId, status]
  );
  return result.rows[0] || null;
}

// 9.9.9 QA fix #5: explicit, ordered, transactional cascade for trip
// deletion. Several of the schema's foreign keys back to trip_members(id)
// and settlement_units(id) (see the init-schema migration) have no
// ON DELETE clause of their own - they rely on being cascade-deleted
// transitively via a *different* table's trip_id -> trips ON DELETE
// CASCADE. Rather than trust that a single `DELETE FROM trips` resolves
// every one of those cross-references in a safe order (Postgres's
// documented behavior handles this correctly, but the caller explicitly
// asked not to depend on "uncertain multi-level cascades" here), every
// table gets an explicit, leaf-first DELETE in one transaction. Order
// matters: nothing is deleted before every row that references it is
// already gone.
export async function deleteTripCascade(client, tripId) {
  // expenses' own children first (all keyed off expense_id, which is
  // itself scoped to this trip via the expenses subquery below).
  await client.query(
    `DELETE FROM disputes WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = $1)`,
    [tripId]
  );
  await client.query(
    `DELETE FROM receipts WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = $1)`,
    [tripId]
  );
  await client.query(
    `DELETE FROM expense_approvals WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = $1)`,
    [tripId]
  );
  await client.query(
    `DELETE FROM expense_participants WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = $1)`,
    [tripId]
  );

  // settlements' own children, same pattern via settlement_id.
  await client.query(
    `DELETE FROM settlement_transactions WHERE settlement_id IN (SELECT id FROM settlements WHERE trip_id = $1)`,
    [tripId]
  );
  await client.query(`DELETE FROM settlements WHERE trip_id = $1`, [tripId]);

  // Now safe: nothing still references these expenses.
  await client.query(`DELETE FROM expenses WHERE trip_id = $1`, [tripId]);

  // Trip-scoped tables with no further children of their own.
  await client.query(`DELETE FROM audit_logs WHERE trip_id = $1`, [tripId]);
  await client.query(`DELETE FROM notifications WHERE trip_id = $1`, [tripId]);
  await client.query(`DELETE FROM trip_closure_confirmations WHERE trip_id = $1`, [tripId]);
  await client.query(`DELETE FROM approval_rules WHERE trip_id = $1`, [tripId]);

  // Now safe: nothing still references trip_members for this trip
  // (expenses/expense_approvals/disputes/receipts/trip_closure_confirmations
  // all already gone above).
  await client.query(`DELETE FROM trip_members WHERE trip_id = $1`, [tripId]);

  // Now safe: nothing still references settlement_units for this trip
  // (trip_members/expenses/expense_participants/settlement_transactions
  // all already gone above).
  await client.query(`DELETE FROM settlement_units WHERE trip_id = $1`, [tripId]);

  // Finally the trip row itself.
  const result = await client.query(`DELETE FROM trips WHERE id = $1 RETURNING id`, [tripId]);
  return result.rows[0] || null;
}

export async function findTripsForUser(pool, userId) {
  const result = await pool.query(
    `SELECT
       t.id, t.name, t.start_date, t.end_date, t.currency, t.created_by,
       t.join_code, t.budget_type, t.budget_amount_minor, t.fair_share_method,
       t.verification_mode, t.status, t.created_at,
       tm.role AS my_role, tm.settlement_unit_id AS my_settlement_unit_id
     FROM trips t
     JOIN trip_members tm ON tm.trip_id = t.id
     WHERE tm.user_id = $1 AND tm.left_at IS NULL
     ORDER BY (t.status = 'active') DESC, t.created_at DESC`,
    [userId]
  );
  return result.rows;
}
