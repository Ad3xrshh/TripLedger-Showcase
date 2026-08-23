// Phase 8: persistence for the FINALIZED settlement (as opposed to the
// live, unpersisted preview computed by SettlementService.getSettlementSummary
// / settlementAlgorithm.js). Table has been present since the Phase 1 init
// migration; this repository is the first code to actually write to it.

const SETTLEMENT_COLUMNS = `id, trip_id, total_expense_minor, generated_at, unit_balances, included_expense_ids`;
const TRANSACTION_COLUMNS = `id, settlement_id, from_unit_id, to_unit_id, amount_minor`;

// `settlements.trip_id` carries a UNIQUE constraint, so this INSERT can only
// ever succeed once per trip - callers must check findSettlementByTripId
// (ideally via the *ForUpdate variant, inside a transaction that locked the
// trip row) before calling this, or a concurrent duplicate call will hit
// the unique-violation constraint at the database level as a last line of
// defense against a double-write race.
//
// 9.9.9 Batch 1 issue #8: unitBalances/includedExpenseIds are the audit
// snapshot - each settlement unit's paid/fair-share/net-balance and
// display name, plus which expense IDs actually fed the calculation, all
// frozen at finalize time. Both are already computed in-memory by
// SettlementService's shared calculation core, so persisting them here
// costs nothing extra to calculate - it just stops throwing away
// information the finalize flow already has. Both optional/nullable so
// existing finalized settlements (created before this column existed)
// keep working unchanged.
export async function insertSettlement(client, { tripId, totalExpenseMinor, unitBalances, includedExpenseIds }) {
  const result = await client.query(
    `INSERT INTO settlements (trip_id, total_expense_minor, unit_balances, included_expense_ids)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SETTLEMENT_COLUMNS}`,
    [tripId, totalExpenseMinor, unitBalances ? JSON.stringify(unitBalances) : null, includedExpenseIds ? JSON.stringify(includedExpenseIds) : null]
  );
  return result.rows[0];
}

// Bulk-inserts every settlement transaction for a just-created settlement,
// in a single round trip. `transactions` is the plain-object array shape
// produced by settlementAlgorithm.calculateSettlementTransactions.
// No-ops (returns []) on an empty list - a fully-settled trip (everyone's
// net balance is already zero) can legitimately finalize with zero
// transactions, and an empty VALUES clause is invalid SQL.
export async function insertSettlementTransactions(client, settlementId, transactions) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  const values = [];
  const placeholders = transactions.map((t, i) => {
    const base = i * 4;
    values.push(settlementId, t.fromSettlementUnitId, t.toSettlementUnitId, t.amountMinor);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });

  const result = await client.query(
    `INSERT INTO settlement_transactions (settlement_id, from_unit_id, to_unit_id, amount_minor)
     VALUES ${placeholders.join(', ')}
     RETURNING ${TRANSACTION_COLUMNS}`,
    values
  );
  return result.rows;
}

export async function findSettlementByTripId(pool, tripId) {
  const result = await pool.query(
    `SELECT ${SETTLEMENT_COLUMNS} FROM settlements WHERE trip_id = $1`,
    [tripId]
  );
  return result.rows[0] || null;
}

// Row-locks the settlement (if one exists) for the duration of the caller's
// transaction, so two concurrent finalize requests for the same trip can't
// both observe "no settlement yet" and both attempt to insert one. Callers
// must already hold a lock on the trip row itself (findTripByIdForUpdate)
// before calling this, same convention as createApprovalRule.
export async function findSettlementByTripIdForUpdate(client, tripId) {
  const result = await client.query(
    `SELECT ${SETTLEMENT_COLUMNS} FROM settlements WHERE trip_id = $1 FOR UPDATE`,
    [tripId]
  );
  return result.rows[0] || null;
}

export async function listTransactionsForSettlement(pool, settlementId) {
  const result = await pool.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM settlement_transactions WHERE settlement_id = $1 ORDER BY id ASC`,
    [settlementId]
  );
  return result.rows;
}
