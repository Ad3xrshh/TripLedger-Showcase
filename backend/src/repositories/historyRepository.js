// poolOrClient so this can be called inside an existing withTransaction
// block - history entries roll back together with the state change that
// produced them, same as the notification writes.
export async function insertAuditLog(
  poolOrClient,
  { tripId, actorMemberId = null, entityType, entityId, action, metadata = null }
) {
  const result = await poolOrClient.query(
    `INSERT INTO audit_logs (trip_id, actor_member_id, entity_type, entity_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, trip_id, actor_member_id, entity_type, entity_id, action, metadata, created_at`,
    [tripId, actorMemberId, entityType, entityId, action, metadata]
  );
  return result.rows[0];
}

// Joins the actor's display name for the history feed. actor_member_id is
// nullable (system-generated events with no human actor), hence LEFT JOIN.
export async function listHistoryForTrip(pool, tripId, { limit, offset }) {
  const result = await pool.query(
    `SELECT
       al.id, al.trip_id, al.entity_type, al.entity_id, al.action,
       al.metadata, al.created_at,
       al.actor_member_id, u.display_name AS actor_display_name
     FROM audit_logs al
     LEFT JOIN trip_members tm ON tm.id = al.actor_member_id
     LEFT JOIN users u ON u.id = tm.user_id
     WHERE al.trip_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [tripId, limit, offset]
  );
  return result.rows;
}

export async function countHistoryForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM audit_logs WHERE trip_id = $1`,
    [tripId]
  );
  return result.rows[0].count;
}
