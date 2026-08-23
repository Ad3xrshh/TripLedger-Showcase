const UNIT_COLUMNS = `id, trip_id, kind, display_name, weight, created_at, archived_at`;

// Used inside the create-trip / join-trip transactions to auto-wrap a
// person in their own individual settlement unit.
export async function insertIndividualUnit(client, { tripId, displayName }) {
  const result = await client.query(
    `INSERT INTO settlement_units (trip_id, kind, display_name)
     VALUES ($1, 'individual', $2)
     RETURNING ${UNIT_COLUMNS}`,
    [tripId, displayName]
  );
  return result.rows[0];
}

// Used by the "create group unit" endpoint (e.g. "Family A").
export async function insertGroupUnit(pool, { tripId, displayName }) {
  const result = await pool.query(
    `INSERT INTO settlement_units (trip_id, kind, display_name)
     VALUES ($1, 'group', $2)
     RETURNING ${UNIT_COLUMNS}`,
    [tripId, displayName]
  );
  return result.rows[0];
}

export async function findUnitById(pool, unitId) {
  const result = await pool.query(
    `SELECT ${UNIT_COLUMNS} FROM settlement_units WHERE id = $1`,
    [unitId]
  );
  return result.rows[0] || null;
}

// Every unit in the trip, archived or not. Deliberately unfiltered -
// SettlementService's fair-share/name-resolution path (unitNameById,
// and calculateFairShares's own ensure() for any unit genuinely
// referenced by an expense) needs an archived unit's row to still be
// resolvable, since archiving preserves history by design (see the
// 9.9.9 QA fix #7 migration comment) rather than deleting it.
export async function listUnitsForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT ${UNIT_COLUMNS} FROM settlement_units WHERE trip_id = $1 ORDER BY created_at ASC`,
    [tripId]
  );
  return result.rows;
}

// 9.9.9 QA fix #7: the "current" view of a trip's settlement units -
// used for display (trip detail's settlementUnits list, which feeds the
// Members page's group list and "move into group" options) where an
// archived group should no longer clutter the UI. Never used for
// settlement math/name-resolution - see listUnitsForTrip's own comment.
export async function listVisibleUnitsForTrip(pool, tripId) {
  const result = await pool.query(
    `SELECT ${UNIT_COLUMNS} FROM settlement_units WHERE trip_id = $1 AND archived_at IS NULL ORDER BY created_at ASC`,
    [tripId]
  );
  return result.rows;
}

// How many currently-active (left_at IS NULL) trip members are in this
// unit right now - same "active" definition tripMemberRepository already
// uses elsewhere (listMembersForTrip, countActiveMembers).
export async function countActiveMembersInUnit(pool, unitId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM trip_members WHERE settlement_unit_id = $1 AND left_at IS NULL`,
    [unitId]
  );
  return result.rows[0].count;
}

// Whether this unit is referenced by any real financial history: as a
// historical payer snapshot, as an expense participant, or as either
// endpoint of a settlement transaction. If true, the unit can only be
// archived, never hard-deleted - see the migration's own comment for why.
export async function hasHistoricalReferences(pool, unitId) {
  const result = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM expenses WHERE payer_settlement_unit_id = $1) OR
       EXISTS(SELECT 1 FROM expense_participants WHERE settlement_unit_id = $1) OR
       EXISTS(SELECT 1 FROM settlement_transactions WHERE from_unit_id = $1 OR to_unit_id = $1)
       AS has_references`,
    [unitId]
  );
  return result.rows[0].has_references;
}

export async function archiveUnit(pool, unitId) {
  const result = await pool.query(
    `UPDATE settlement_units SET archived_at = now() WHERE id = $1 RETURNING ${UNIT_COLUMNS}`,
    [unitId]
  );
  return result.rows[0] || null;
}

export async function hardDeleteUnit(pool, unitId) {
  const result = await pool.query(`DELETE FROM settlement_units WHERE id = $1 RETURNING id`, [unitId]);
  return result.rows[0] || null;
}
