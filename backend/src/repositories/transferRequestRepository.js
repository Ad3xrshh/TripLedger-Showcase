export async function insertTransferRequest(clientOrPool, { tripId, memberId, fromUnitId, toUnitId }) {
  const result = await clientOrPool.query(
    `INSERT INTO settlement_transfer_requests (trip_id, member_id, from_unit_id, to_unit_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, trip_id, member_id, from_unit_id, to_unit_id, status, created_at, reviewed_by_member_id, reviewed_at`,
    [tripId, memberId, fromUnitId, toUnitId]
  );
  return result.rows[0];
}

export async function findPendingRequestForMember(clientOrPool, tripId, memberId) {
  const result = await clientOrPool.query(
    `SELECT str.id, str.trip_id, str.member_id, str.from_unit_id, str.to_unit_id, str.status,
            str.created_at, str.reviewed_by_member_id, str.reviewed_at,
            u.display_name AS member_name,
            from_su.display_name AS from_unit_name,
            to_su.display_name AS to_unit_name
     FROM settlement_transfer_requests str
     JOIN trip_members tm ON tm.id = str.member_id
     JOIN users u ON u.id = tm.user_id
     JOIN settlement_units from_su ON from_su.id = str.from_unit_id
     JOIN settlement_units to_su ON to_su.id = str.to_unit_id
     WHERE str.trip_id = $1 AND str.member_id = $2 AND str.status = 'pending'`,
    [tripId, memberId]
  );
  return result.rows[0] || null;
}

export async function findRequestById(clientOrPool, requestId) {
  const result = await clientOrPool.query(
    `SELECT str.id, str.trip_id, str.member_id, str.from_unit_id, str.to_unit_id, str.status,
            str.created_at, str.reviewed_by_member_id, str.reviewed_at,
            u.display_name AS member_name,
            from_su.display_name AS from_unit_name,
            to_su.display_name AS to_unit_name
     FROM settlement_transfer_requests str
     JOIN trip_members tm ON tm.id = str.member_id
     JOIN users u ON u.id = tm.user_id
     JOIN settlement_units from_su ON from_su.id = str.from_unit_id
     JOIN settlement_units to_su ON to_su.id = str.to_unit_id
     WHERE str.id = $1`,
    [requestId]
  );
  return result.rows[0] || null;
}

export async function findRequestByIdForUpdate(client, requestId) {
  const result = await client.query(
    `SELECT str.id, str.trip_id, str.member_id, str.from_unit_id, str.to_unit_id, str.status,
            str.created_at, str.reviewed_by_member_id, str.reviewed_at
     FROM settlement_transfer_requests str
     WHERE str.id = $1
     FOR UPDATE`,
    [requestId]
  );
  return result.rows[0] || null;
}

export async function listRequestsForTrip(clientOrPool, tripId) {
  const result = await clientOrPool.query(
    `SELECT str.id, str.trip_id, str.member_id, str.from_unit_id, str.to_unit_id, str.status,
            str.created_at, str.reviewed_by_member_id, str.reviewed_at,
            u.display_name AS member_name,
            from_su.display_name AS from_unit_name,
            to_su.display_name AS to_unit_name
     FROM settlement_transfer_requests str
     JOIN trip_members tm ON tm.id = str.member_id
     JOIN users u ON u.id = tm.user_id
     JOIN settlement_units from_su ON from_su.id = str.from_unit_id
     JOIN settlement_units to_su ON to_su.id = str.to_unit_id
     WHERE str.trip_id = $1
     ORDER BY str.created_at DESC`,
    [tripId]
  );
  return result.rows;
}

export async function updateRequestStatus(clientOrPool, requestId, { status, reviewedByMemberId }) {
  const result = await clientOrPool.query(
    `UPDATE settlement_transfer_requests
     SET status = $2, reviewed_by_member_id = $3, reviewed_at = NOW()
     WHERE id = $1
     RETURNING id, trip_id, member_id, from_unit_id, to_unit_id, status, created_at, reviewed_by_member_id, reviewed_at`,
    [requestId, status, reviewedByMemberId]
  );
  return result.rows[0] || null;
}
