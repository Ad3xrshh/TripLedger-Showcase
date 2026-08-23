export async function insertApproval(client, { expenseId, memberId, decision }) {
  const result = await client.query(
    `INSERT INTO expense_approvals (expense_id, approved_by_member_id, decision)
     VALUES ($1, $2, $3)
     RETURNING id, expense_id, approved_by_member_id, decision, created_at`,
    [expenseId, memberId, decision]
  );
  return result.rows[0];
}

export async function updateApprovalDecision(client, { expenseId, memberId, decision }) {
  const result = await client.query(
    `UPDATE expense_approvals
     SET decision = $3
     WHERE expense_id = $1 AND approved_by_member_id = $2
     RETURNING id, expense_id, approved_by_member_id, decision, created_at`,
    [expenseId, memberId, decision]
  );
  return result.rows[0] || null;
}

export async function findApproval(pool, expenseId, memberId) {
  const result = await pool.query(
    `SELECT id, expense_id, approved_by_member_id, decision, created_at
     FROM expense_approvals
     WHERE expense_id = $1 AND approved_by_member_id = $2`,
    [expenseId, memberId]
  );
  return result.rows[0] || null;
}

export async function countApprovals(pool, expenseId, decision = 'approved') {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM expense_approvals
     WHERE expense_id = $1 AND decision = $2`,
    [expenseId, decision]
  );
  return result.rows[0].count;
}

export async function listApprovalsForExpense(pool, expenseId) {
  const result = await pool.query(
    `SELECT
       ea.id,
       ea.expense_id,
       ea.approved_by_member_id AS member_id,
       ea.decision,
       ea.created_at AS approved_at,
       u.display_name
     FROM expense_approvals ea
     JOIN trip_members tm ON tm.id = ea.approved_by_member_id
     JOIN users u ON u.id = tm.user_id
     WHERE ea.expense_id = $1
     ORDER BY ea.created_at ASC`,
    [expenseId]
  );
  return result.rows;
}

export async function deleteApprovalsForExpense(client, expenseId) {
  await client.query(
    `DELETE FROM expense_approvals WHERE expense_id = $1`,
    [expenseId]
  );
}

export async function findApprovalRuleForExpense(pool, tripId, amountMinor) {
  const result = await pool.query(
    `SELECT id, trip_id, min_amount_minor, max_amount_minor, required_approvals
     FROM approval_rules
     WHERE trip_id = $1
       AND min_amount_minor <= $2
       AND (max_amount_minor IS NULL OR max_amount_minor >= $2)
     ORDER BY min_amount_minor DESC
     LIMIT 1`,
    [tripId, amountMinor]
  );
  return result.rows[0] || null;
}

export async function listApprovalRulesForTrip(poolOrClient, tripId) {
  const result = await poolOrClient.query(
    `SELECT id, trip_id, min_amount_minor, max_amount_minor, required_approvals
     FROM approval_rules
     WHERE trip_id = $1
     ORDER BY min_amount_minor ASC`,
    [tripId]
  );
  return result.rows;
}

// Added in Phase 6 for the dashboard's "pending approvals" panel. Returns
// pending expenses the given member can actually act on: excludes their
// own expenses (self-approval is blocked at approve-time anyway, but we
// don't want to show a dead-end action) and excludes expenses they've
// already recorded a decision on (approved or rejected).
export async function findPendingApprovalsForMember(pool, tripId, memberId, limit = 10) {
  const result = await pool.query(
    `SELECT
       e.id, e.trip_id, e.amount_minor, e.description, e.category,
       e.occurred_at, e.status, e.paid_by_member_id, u.display_name AS paid_by_display_name
     FROM expenses e
     JOIN trip_members tm ON tm.id = e.paid_by_member_id
     JOIN users u ON u.id = tm.user_id
     WHERE e.trip_id = $1
       AND e.status = 'pending'
       AND e.paid_by_member_id != $2
       AND NOT EXISTS (
         SELECT 1 FROM expense_approvals ea
         WHERE ea.expense_id = e.id AND ea.approved_by_member_id = $2
       )
     ORDER BY e.occurred_at ASC
     LIMIT $3`,
    [tripId, memberId, limit]
  );
  return result.rows;
}

export async function insertApprovalRule(clientOrPool, { tripId, minAmountMinor, maxAmountMinor, requiredApprovals }) {
  const result = await clientOrPool.query(
    `INSERT INTO approval_rules (trip_id, min_amount_minor, max_amount_minor, required_approvals)
     VALUES ($1, $2, $3, $4)
     RETURNING id, trip_id, min_amount_minor, max_amount_minor, required_approvals`,
    [tripId, minAmountMinor, maxAmountMinor ?? null, requiredApprovals]
  );
  return result.rows[0];
}
