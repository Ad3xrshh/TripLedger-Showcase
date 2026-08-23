export async function insertParticipants(client, expenseId, settlementUnitIds) {
  if (settlementUnitIds.length === 0) return [];

  const values = settlementUnitIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  const result = await client.query(
    `INSERT INTO expense_participants (expense_id, settlement_unit_id)
     VALUES ${values}
     RETURNING expense_id, settlement_unit_id`,
    [expenseId, ...settlementUnitIds]
  );
  return result.rows;
}

export async function deleteParticipants(client, expenseId) {
  await client.query('DELETE FROM expense_participants WHERE expense_id = $1', [expenseId]);
}

export async function listParticipantsForExpense(pool, expenseId) {
  const result = await pool.query(
    `SELECT ep.settlement_unit_id, su.kind, su.display_name
     FROM expense_participants ep
     JOIN settlement_units su ON su.id = ep.settlement_unit_id
     WHERE ep.expense_id = $1
     ORDER BY su.display_name ASC`,
    [expenseId]
  );
  return result.rows;
}

// Added in Phase 7 for settlement calculation. Batched by expense ID array
// so SettlementService can fetch every verified expense's participants in
// one query instead of one query per expense (N+1). expense_participants
// has a composite primary key (expense_id, settlement_unit_id), so a given
// settlement unit can never appear more than once per expense at the DB
// level - no application-side dedup is needed.
export async function listParticipantsForExpenses(pool, expenseIds) {
  if (expenseIds.length === 0) return [];

  const result = await pool.query(
    `SELECT ep.expense_id, ep.settlement_unit_id
     FROM expense_participants ep
     WHERE ep.expense_id = ANY($1::uuid[])`,
    [expenseIds]
  );
  return result.rows;
}
