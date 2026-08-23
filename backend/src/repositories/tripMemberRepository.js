export async function insertMember(client, { tripId, userId, settlementUnitId, role }) {
  const result = await client.query(
    `INSERT INTO trip_members (trip_id, user_id, settlement_unit_id, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, trip_id, user_id, settlement_unit_id, role, joined_at`,
    [tripId, userId, settlementUnitId, role]
  );
  return result.rows[0];
}

// Added in Phase 6: notifications need to resolve a trip_member id (e.g.
// expenses.paid_by_member_id) to the underlying user_id to notify.
export async function findMemberById(poolOrClient, memberId) {
  const result = await poolOrClient.query(
    `SELECT id, trip_id, user_id, settlement_unit_id, role, joined_at
     FROM trip_members
     WHERE id = $1`,
    [memberId]
  );
  return result.rows[0] || null;
}

export async function findMembership(pool, tripId, userId) {
  const result = await pool.query(
    `SELECT id, trip_id, user_id, settlement_unit_id, role, joined_at
     FROM trip_members
     WHERE trip_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [tripId, userId]
  );
  return result.rows[0] || null;
}

export async function listMembersForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT
       tm.id, tm.role, tm.joined_at,
       u.id AS user_id, u.display_name, u.avatar_url,
       su.id AS settlement_unit_id, su.kind AS settlement_unit_kind,
       su.display_name AS settlement_unit_name
     FROM trip_members tm
     JOIN users u ON u.id = tm.user_id
     JOIN settlement_units su ON su.id = tm.settlement_unit_id
     WHERE tm.trip_id = $1 AND tm.left_at IS NULL
     ORDER BY tm.joined_at ASC`,
    [tripId]
  );
  return result.rows;
}

// Self-service only: a member moves themselves into a different settlement
// unit within the SAME trip (used to join a family/group unit). Callers
// are responsible for verifying the target unit belongs to this trip and
// is a 'group' unit before calling this.
export async function updateMemberSettlementUnit(pool, memberId, settlementUnitId) {
  const result = await pool.query(
    `UPDATE trip_members
     SET settlement_unit_id = $2
     WHERE id = $1
     RETURNING id, trip_id, user_id, settlement_unit_id, role, joined_at`,
    [memberId, settlementUnitId]
  );
  return result.rows[0] || null;
}

// Added in Phase 4 for fixed_per_person budget calculation. Counts current
// active members (left_at IS NULL) - deliberately dynamic, so the budget
// limit recalculates as people join.
export async function countActiveMembers(pool, tripId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM trip_members WHERE trip_id = $1 AND left_at IS NULL`,
    [tripId]
  );
  return result.rows[0].count;
}

// Added in Phase 6 to find who to notify when a new member joins. A trip
// always has exactly one 'owner' (set at creation, never reassigned by any
// existing Phase 1-5 code), so this is safe to treat as at-most-one-row.
export async function findOwnerMembership(poolOrClient, tripId) {
  const result = await poolOrClient.query(
    `SELECT tm.id, tm.trip_id, tm.user_id, tm.role
     FROM trip_members tm
     WHERE tm.trip_id = $1 AND tm.role = 'owner' AND tm.left_at IS NULL
     LIMIT 1`,
    [tripId]
  );
  return result.rows[0] || null;
}
