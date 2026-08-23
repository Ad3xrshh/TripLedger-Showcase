const EXPENSE_COLUMNS = `
  id, trip_id, paid_by_member_id, payer_settlement_unit_id, amount_minor,
  description, category, occurred_at, status, created_at, updated_at
`;

export async function insertExpense(
  client,
  { tripId, paidByMemberId, payerSettlementUnitId, amountMinor, description, category, occurredAt, status }
) {
  const result = await client.query(
    `INSERT INTO expenses (
       trip_id, paid_by_member_id, payer_settlement_unit_id, amount_minor, description, category, occurred_at, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${EXPENSE_COLUMNS}`,
    [tripId, paidByMemberId, payerSettlementUnitId, amountMinor, description, category ?? null, occurredAt, status]
  );
  return result.rows[0];
}

export async function findExpenseById(pool, expenseId) {
  const result = await pool.query(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1`,
    [expenseId]
  );
  return result.rows[0] || null;
}

export async function listExpensesForTrip(pool, tripId, { status } = {}) {
  if (status) {
    const result = await pool.query(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE trip_id = $1 AND status = $2 ORDER BY occurred_at DESC`,
      [tripId, status]
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE trip_id = $1 ORDER BY occurred_at DESC`,
    [tripId]
  );
  return result.rows;
}

// Partial update - only sets the fields actually provided (COALESCE against
// existing values), so the caller doesn't need to pass every column.
export async function updateExpense(client, expenseId, { amountMinor, description, category, occurredAt }) {
  const result = await client.query(
    `UPDATE expenses
     SET amount_minor = COALESCE($2, amount_minor),
         description = COALESCE($3, description),
         category = COALESCE($4, category),
         occurred_at = COALESCE($5, occurred_at),
         updated_at = now()
     WHERE id = $1
     RETURNING ${EXPENSE_COLUMNS}`,
    [expenseId, amountMinor ?? null, description ?? null, category ?? null, occurredAt ?? null]
  );
  return result.rows[0] || null;
}

export async function findExpenseByIdForUpdate(client, expenseId) {
  const result = await client.query(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1 FOR UPDATE`,
    [expenseId]
  );
  return result.rows[0] || null;
}

export async function updateExpenseStatus(client, expenseId, status) {
  const result = await client.query(
    `UPDATE expenses
     SET status = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING ${EXPENSE_COLUMNS}`,
    [expenseId, status]
  );
  return result.rows[0] || null;
}

// Sum of verified expenses for a trip, in integer minor units. Returns 0
// (not null) when there are no verified expenses.
export async function sumVerifiedAmountForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
     FROM expenses
     WHERE trip_id = $1 AND status = 'verified'`,
    [tripId]
  );
  return Number(result.rows[0].total);
}

// Added in Phase 6 for the dashboard expense summary. Returns a count for
// every status, including statuses with zero expenses (COALESCE via the
// generated series of known statuses), so the dashboard never has to
// special-case a missing key.
export async function countExpensesByStatusForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM expenses
     WHERE trip_id = $1
     GROUP BY status`,
    [tripId]
  );
  const counts = { pending: 0, verified: 0, disputed: 0, rejected: 0, locked: 0 };
  for (const row of result.rows) {
    counts[row.status] = row.count;
  }
  counts.total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

// Added in Phase 6 for the dashboard's "recent expenses" panel. Joins payer
// display name in the same query to avoid N+1 lookups. Bounded by `limit`
// (caller is responsible for passing a sane value - the dashboard uses 10).
export async function listRecentExpensesForTrip(pool, tripId, limit = 10) {
  const result = await pool.query(
    `SELECT
       e.id, e.trip_id, e.amount_minor, e.description, e.category,
       e.occurred_at, e.status, e.created_at,
       e.paid_by_member_id, u.display_name AS paid_by_display_name
     FROM expenses e
     JOIN trip_members tm ON tm.id = e.paid_by_member_id
     JOIN users u ON u.id = tm.user_id
     WHERE e.trip_id = $1
     ORDER BY e.occurred_at DESC, e.created_at DESC
     LIMIT $2`,
    [tripId, limit]
  );
  return result.rows;
}

// Added in Phase 7 for settlement calculation. Only verified expenses count
// toward fair-share/settlement (pending/disputed/rejected/locked are all
// excluded - see Phase 7 spec "verified expenses only").
//
// 9.9.9 Batch 1 issue #3: payer_settlement_unit_id is read directly from
// the expenses row (the creation-time snapshot - see the migration and
// ExpenseService.createExpense) instead of being resolved live via a join
// through trip_members. A payer who later moves to a different settlement
// unit no longer silently changes which unit their past expenses are
// attributed to.
export async function listVerifiedExpensesForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT
       id, amount_minor, description, paid_by_member_id,
       payer_settlement_unit_id
     FROM expenses
     WHERE trip_id = $1 AND status = 'verified'
     ORDER BY occurred_at ASC, created_at ASC`,
    [tripId]
  );
  return result.rows;
}

