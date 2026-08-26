import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pool from '../../src/config/db.js';
import authRoutes from '../../src/routes/authRoutes.js';
import tripRoutes from '../../src/routes/tripRoutes.js';
import expenseRoutes from '../../src/routes/expenseRoutes.js';
import settlementRoutes from '../../src/routes/settlementRoutes.js';
import closureRoutes from '../../src/routes/closureRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

let server;
let baseUrl;

const PASSWORD = 'Password123!';

async function cleanupTestData() {
  await pool.query(
    `DELETE FROM expense_participants WHERE expense_id IN (
       SELECT e.id FROM expenses e
       JOIN trips t ON t.id = e.trip_id
       JOIN users u ON u.id = t.created_by
       WHERE u.email LIKE 'tr_test_%@example.com'
     )`
  );
  await pool.query(
    `DELETE FROM expenses WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'tr_test_%@example.com')
     )`
  );
  await pool.query(
    `DELETE FROM trips WHERE created_by IN (
       SELECT id FROM users WHERE email LIKE 'tr_test_%@example.com'
     )`
  );
  await pool.query(`DELETE FROM users WHERE email LIKE 'tr_test_%@example.com'`);
}

async function registerAndLogin(email, displayName) {
  let res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, displayName }),
  });
  let data = await res.json();
  if (!data.token) {
    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    data = await res.json();
  }
  return { token: data.token, user: data.user };
}

async function createTrip(token, name = 'Transfer Test Trip') {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name,
      budgetType: 'unlimited',
      fairShareMethod: 'equal_per_unit',
      verificationMode: 'automatic',
    }),
  });
  return res.json();
}

async function createGroupUnit(token, tripId, displayName) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  });
  return res.json();
}

before(async () => {
  await cleanupTestData();

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/trips/:tripId/expenses', expenseRoutes);
  app.use('/api/trips/:tripId/settlement', settlementRoutes);
  app.use('/api/trips/:tripId/closure', closureRoutes);
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await cleanupTestData();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('1. Member assigned to group / initial setup', async () => {
  const owner = await registerAndLogin('tr_test_owner1@example.com', 'Owner One');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');

  const member = await registerAndLogin('tr_test_member1@example.com', 'Member One');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  const detailRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  const detail = await detailRes.json();
  const m = detail.members.find((row) => row.user_id === member.user.id);
  assert.ok(m);
  assert.ok(m.settlement_unit_id);
});

test('2 & 3. Member attempts to move directly → no immediate move & transfer request is created', async () => {
  const owner = await registerAndLogin('tr_test_owner2@example.com', 'Owner Two');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');

  const member = await registerAndLogin('tr_test_member2@example.com', 'Member Two');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  // Attempt move directly
  const patchRes = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ settlementUnitId: groupA.id }),
  });

  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.ok(patchData.transferRequest, 'Transfer request should be returned');
  assert.equal(patchData.transferRequest.status, 'pending');

  // Verify no immediate move happened
  const detailRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  const detail = await detailRes.json();
  const m = detail.members.find((row) => row.user_id === member.user.id);
  assert.notEqual(m.settlement_unit_id, groupA.id, 'Member must not immediately change group');
});

test('4. Duplicate pending transfer request is rejected/prevented', async () => {
  const owner = await registerAndLogin('tr_test_owner3@example.com', 'Owner Three');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const { settlementUnit: groupB } = await createGroupUnit(owner.token, trip.id, 'Fam B');

  const member = await registerAndLogin('tr_test_member3@example.com', 'Member Three');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  // First request
  const req1 = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  assert.equal(req1.status, 201);

  // Duplicate request
  const req2 = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupB.id }),
  });
  assert.equal(req2.status, 409);
  const errData = await req2.json();
  assert.equal(errData.error.code, 'TRANSFER_REQUEST_PENDING');
});

test('5. Non-owner cannot approve', async () => {
  const owner = await registerAndLogin('tr_test_owner5@example.com', 'Owner Five');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');

  const member1 = await registerAndLogin('tr_test_member5a@example.com', 'Member Five A');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member1.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  const member2 = await registerAndLogin('tr_test_member5b@example.com', 'Member Five B');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member2.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  // Member1 requests transfer
  const reqRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member1.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  const { transferRequest } = await reqRes.json();

  // Member2 (non-owner) tries to approve
  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${transferRequest.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member2.token}` },
  });
  assert.equal(approveRes.status, 403);
  const errData = await approveRes.json();
  assert.equal(errData.error.code, 'FORBIDDEN');
});

test('6. Trip Owner moves directly without creating transfer request', async () => {
  const owner = await registerAndLogin('tr_test_owner6@example.com', 'Owner Six');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');

  // Owner submits move for self
  const moveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ settlementUnitId: groupA.id }),
  });
  assert.equal(moveRes.status, 200);
  const moveData = await moveRes.json();
  assert.ok(moveData.membership, 'Owner move should immediately return updated membership');
  assert.equal(moveData.membership.settlement_unit_id, groupA.id);

  // Verify no pending transfer request was created in DB
  const reqRows = await pool.query(
    `SELECT * FROM settlement_transfer_requests WHERE trip_id = $1 AND status = 'pending'`,
    [trip.id]
  );
  assert.equal(reqRows.rows.length, 0, 'No pending transfer request should exist for owner self-move');
});

test('7. Owner approves → member moves successfully', async () => {
  const owner = await registerAndLogin('tr_test_owner7@example.com', 'Owner Seven');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');

  const member = await registerAndLogin('tr_test_member7@example.com', 'Member Seven');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  // Member requests move to Fam A
  const reqRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  const { transferRequest } = await reqRes.json();

  // Owner approves
  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${transferRequest.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(approveRes.status, 200);
  const approveData = await approveRes.json();
  assert.equal(approveData.transferRequest.status, 'approved');
  assert.equal(approveData.membership.settlement_unit_id, groupA.id);

  // Check detail
  const detailRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  const detail = await detailRes.json();
  const m = detail.members.find((row) => row.user_id === member.user.id);
  assert.equal(m.settlement_unit_id, groupA.id);
});

test('8. Owner rejects → member remains in original group', async () => {
  const owner = await registerAndLogin('tr_test_owner8@example.com', 'Owner Eight');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const { settlementUnit: groupB } = await createGroupUnit(owner.token, trip.id, 'Fam B');

  const member = await registerAndLogin('tr_test_member8@example.com', 'Member Eight');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  // Move member to Fam A first
  const req1 = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  const { transferRequest: tr1 } = await req1.json();
  await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${tr1.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });

  // Member requests move to Fam B
  const req2 = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupB.id }),
  });
  const { transferRequest: tr2 } = await req2.json();

  // Owner rejects
  const rejectRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${tr2.id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(rejectRes.status, 200);
  const rejectData = await rejectRes.json();
  assert.equal(rejectData.transferRequest.status, 'rejected');

  // Verify member remains in Fam A
  const detailRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  const detail = await detailRes.json();
  const m = detail.members.find((row) => row.user_id === member.user.id);
  assert.equal(m.settlement_unit_id, groupA.id);
});

test('9 & 10. Historical records remain intact after transfer & settlement calculations do not rewrite historical info', async () => {
  const owner = await registerAndLogin('tr_test_owner9@example.com', 'Owner Nine');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: groupA } = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const { settlementUnit: groupB } = await createGroupUnit(owner.token, trip.id, 'Fam B');

  const member = await registerAndLogin('tr_test_member9@example.com', 'Member Nine');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });

  // Move member to Fam A
  const req1 = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  const { transferRequest: tr1 } = await req1.json();
  await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${tr1.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });

  // Create expense while in Fam A
  const expRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({
      amountMinor: 10000,
      description: 'Dinner in Fam A',
      occurredAt: new Date().toISOString(),
    }),
  });
  const { expense } = await expRes.json();
  assert.equal(expense.payer_settlement_unit_id, groupA.id);

  // Now member requests transfer to Fam B and owner approves
  const req2 = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupB.id }),
  });
  const { transferRequest: tr2 } = await req2.json();
  await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${tr2.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });

  // Verify historical expense still has payer_settlement_unit_id === groupA.id
  const expCheck = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expense.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const expData = await expCheck.json();
  assert.equal(expData.expense.payer_settlement_unit_id, groupA.id);
});

test('11. Cross-trip group transfer is rejected', async () => {
  const owner1 = await registerAndLogin('tr_test_owner11a@example.com', 'Owner Eleven A');
  const { trip: trip1 } = await createTrip(owner1.token, 'Trip 1');
  const { settlementUnit: group1 } = await createGroupUnit(owner1.token, trip1.id, 'Group 1');

  const owner2 = await registerAndLogin('tr_test_owner11b@example.com', 'Owner Eleven B');
  const { trip: trip2 } = await createTrip(owner2.token, 'Trip 2');

  const member = await registerAndLogin('tr_test_member11@example.com', 'Member Eleven');
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip2.join_code }),
  });

  // Member of Trip 2 attempts to request transfer to Group 1 (which belongs to Trip 1)
  const reqRes = await fetch(`${baseUrl}/api/trips/${trip2.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: group1.id }),
  });
  assert.equal(reqRes.status, 404);
  const errData = await reqRes.json();
  assert.equal(errData.error.code, 'SETTLEMENT_UNIT_NOT_FOUND');
});

test('12. Closed/frozen trip cannot process transfers', async () => {
  const owner = await registerAndLogin('tr_test_owner12@example.com', 'Owner Twelve');
  const { trip } = await createTrip(owner.token);
  const groupRes = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const groupA = groupRes.settlementUnit || groupRes;

  const member = await registerAndLogin('tr_test_member12@example.com', 'Member Twelve');
  const joinCode = trip.joinCode || trip.join_code;
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode }),
  });

  // Close trip directly in DB or via closure API
  await pool.query("UPDATE trips SET status = 'closed' WHERE id = $1", [trip.id]);

  // Request transfer on closed trip
  const reqRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  assert.equal(reqRes.status, 409);
  const errData = await reqRes.json();
  assert.equal(errData.error.code, 'TRIP_ALREADY_CLOSED');
});

test('13. Pending request is handled correctly after target group is archived', async () => {
  const owner = await registerAndLogin('tr_test_owner13@example.com', 'Owner Thirteen');
  const { trip } = await createTrip(owner.token);
  const groupRes = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const groupA = groupRes.settlementUnit || groupRes;

  const member = await registerAndLogin('tr_test_member13@example.com', 'Member Thirteen');
  const joinCode = trip.joinCode || trip.join_code;
  await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode }),
  });

  // Member requests transfer to groupA
  const reqRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ targetUnitId: groupA.id }),
  });
  const { transferRequest } = await reqRes.json();

  // Archive groupA directly in DB
  await pool.query('UPDATE settlement_units SET archived_at = NOW() WHERE id = $1', [groupA.id]);

  // Owner tries to approve request to now-archived groupA
  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/transfer-requests/${transferRequest.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(approveRes.status, 410);
  const errData = await approveRes.json();
  assert.equal(errData.error.code, 'SETTLEMENT_UNIT_ARCHIVED');
});

test('14. Historical integrity: Owner direct move preserves historical expense attribution', async () => {
  const owner = await registerAndLogin('tr_test_owner14@example.com', 'Owner Fourteen');
  const { trip } = await createTrip(owner.token);
  const gA = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const gB = await createGroupUnit(owner.token, trip.id, 'Fam B');
  const groupA = gA.settlementUnit || gA;
  const groupB = gB.settlementUnit || gB;

  // Move owner into groupA
  const move1 = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ settlementUnitId: groupA.id }),
  });
  assert.equal(move1.status, 200);

  // Create expense while in groupA
  const expRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({
      amountMinor: 6000,
      description: 'Dinner in Group A',
      occurredAt: new Date().toISOString(),
      participantSettlementUnitIds: [groupA.id],
    }),
  });
  assert.equal(expRes.status, 201);
  const { expense } = await expRes.json();

  // Move owner into groupB
  const move2 = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ settlementUnitId: groupB.id }),
  });
  assert.equal(move2.status, 200);

  // Verify historical expense participants still reference groupA
  const partRows = await pool.query(
    'SELECT settlement_unit_id FROM expense_participants WHERE expense_id = $1',
    [expense.id]
  );
  assert.equal(partRows.rows[0].settlement_unit_id, groupA.id, 'Historical expense attribution must remain group A');
});

test('15. Owner cannot move to an individual settlement unit', async () => {
  const owner = await registerAndLogin('tr_test_owner15@example.com', 'Owner Fifteen');
  const { trip } = await createTrip(owner.token);
  const detailRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const detail = await detailRes.json();
  const individualUnit = detail.settlementUnits.find((u) => u.kind === 'individual');

  const moveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ settlementUnitId: individualUnit.id }),
  });
  assert.equal(moveRes.status, 400);
  const errData = await moveRes.json();
  assert.equal(errData.error.code, 'NOT_A_GROUP_UNIT');
});

test('16. Owner cannot move to an archived group', async () => {
  const owner = await registerAndLogin('tr_test_owner16@example.com', 'Owner Sixteen');
  const { trip } = await createTrip(owner.token);
  const gA = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const groupA = gA.settlementUnit || gA;

  await pool.query('UPDATE settlement_units SET archived_at = NOW() WHERE id = $1', [groupA.id]);

  const moveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ settlementUnitId: groupA.id }),
  });
  assert.equal(moveRes.status, 410);
  const errData = await moveRes.json();
  assert.equal(errData.error.code, 'SETTLEMENT_UNIT_ARCHIVED');
});

test('17. Owner cannot move after trip is closed', async () => {
  const owner = await registerAndLogin('tr_test_owner17@example.com', 'Owner Seventeen');
  const { trip } = await createTrip(owner.token);
  const gA = await createGroupUnit(owner.token, trip.id, 'Fam A');
  const groupA = gA.settlementUnit || gA;

  await pool.query("UPDATE trips SET status = 'closed' WHERE id = $1", [trip.id]);

  const moveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ settlementUnitId: groupA.id }),
  });
  assert.equal(moveRes.status, 409);
  const errData = await moveRes.json();
  assert.equal(errData.error.code, 'TRIP_ALREADY_CLOSED');
});
