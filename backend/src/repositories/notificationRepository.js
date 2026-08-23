const NOTIFICATION_COLUMNS = `
  id, user_id, trip_id, related_expense_id, type, message, read_at, created_at
`;

// poolOrClient so this can be called either standalone (GET endpoints) or
// inside an existing withTransaction block (state-changing events), same
// pattern as the rest of the Phase 1-5 repositories.
export async function insertNotification(
  poolOrClient,
  { userId, tripId, relatedExpenseId = null, type, message }
) {
  const result = await poolOrClient.query(
    `INSERT INTO notifications (user_id, trip_id, related_expense_id, type, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [userId, tripId ?? null, relatedExpenseId, type, message]
  );
  return result.rows[0];
}

export async function findNotificationById(pool, notificationId) {
  const result = await pool.query(
    `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE id = $1`,
    [notificationId]
  );
  return result.rows[0] || null;
}

export async function listNotificationsForUser(pool, userId, { unread, tripId, limit = 50 } = {}) {
  const conditions = ['user_id = $1'];
  const params = [userId];

  if (unread) {
    conditions.push('read_at IS NULL');
  }
  if (tripId) {
    params.push(tripId);
    conditions.push(`trip_id = $${params.length}`);
  }

  params.push(limit);
  const result = await pool.query(
    `SELECT ${NOTIFICATION_COLUMNS}
     FROM notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

export async function countUnreadForUser(pool, userId, { tripId } = {}) {
  const conditions = ['user_id = $1', 'read_at IS NULL'];
  const params = [userId];
  if (tripId) {
    params.push(tripId);
    conditions.push(`trip_id = $${params.length}`);
  }
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0].count;
}

// Used by the budget-warning dedup check: "has this user already got an
// unread warning of this type for this trip?" so repeated verifications
// don't pile up duplicate warnings before the existing one is even read.
export async function countUnreadOfTypeForUser(poolOrClient, userId, tripId, type) {
  const result = await poolOrClient.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND trip_id = $2 AND type = $3 AND read_at IS NULL`,
    [userId, tripId, type]
  );
  return result.rows[0].count;
}

export async function markRead(pool, notificationId) {
  const result = await pool.query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL RETURNING ${NOTIFICATION_COLUMNS}`,
    [notificationId]
  );
  return result.rows[0] || null;
}

export async function markAllReadForUser(pool, userId, { tripId } = {}) {
  const conditions = ['user_id = $1', 'read_at IS NULL'];
  const params = [userId];
  if (tripId) {
    params.push(tripId);
    conditions.push(`trip_id = $${params.length}`);
  }
  const result = await pool.query(
    `UPDATE notifications SET read_at = now() WHERE ${conditions.join(' AND ')} RETURNING id`,
    params
  );
  return result.rows.length;
}

// Added for Phase 6 bugfix (N2): once a member acts on an expense (approves
// or rejects it), any earlier "needs your review" EXPENSE_CREATED
// notification for that member/expense is stale and should be removed
// rather than lingering in their inbox. Scoped tightly by user_id +
// related_expense_id + type so it can never touch an unrelated
// notification, even another EXPENSE_CREATED for a different expense.
export async function deleteNotificationForUserAndExpense(poolOrClient, { userId, relatedExpenseId, type }) {
  const result = await poolOrClient.query(
    `DELETE FROM notifications
     WHERE user_id = $1 AND related_expense_id = $2 AND type = $3
     RETURNING id`,
    [userId, relatedExpenseId, type]
  );
  return result.rows.length;
}