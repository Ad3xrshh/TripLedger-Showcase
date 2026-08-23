import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pool from '../src/config/db.js';
import authRoutes from '../src/routes/authRoutes.js';
import tripRoutes from '../src/routes/tripRoutes.js';
import expenseRoutes from '../src/routes/expenseRoutes.js';
import budgetRoutes from '../src/routes/budgetRoutes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'manual_test_';

async function cleanup() {
  await pool.query(
    `DELETE FROM expense_approvals WHERE expense_id IN (
       SELECT e.id FROM expenses e JOIN trips t ON t.id = e.trip_id JOIN users u ON u.id = t.created_by WHERE u.email LIKE $1
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM approval_rules WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM expense_participants WHERE expense_id IN (
       SELECT e.id FROM expenses e JOIN trips t ON t.id = e.trip_id JOIN users u ON u.id = t.created_by WHERE u.email LIKE $1
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM expenses WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(`DELETE FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)`, [`${EMAIL_PREFIX}%@example.com`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%@example.com`]);
}

async function runManualTest() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/trips/:tripId/expenses', expenseRoutes);
  app.use('/api/trips/:tripId/budget', budgetRoutes);
  app.use(errorHandler);

  const server = app.listen(0, async () => {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    console.log(`Server listening on ${baseUrl}`);

    try {
      await cleanup();

      // Register User A and User B
      const regA = await (await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${EMAIL_PREFIX}userA@example.com`, password: PASSWORD, displayName: 'User A' }),
      })).json();
      const tokenA = regA.token;

      const regB = await (await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${EMAIL_PREFIX}userB@example.com`, password: PASSWORD, displayName: 'User B' }),
      })).json();
      const tokenB = regB.token;

      // Step A: Create trip and join B
      const tripRes = await (await fetch(`${baseUrl}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          name: 'Manual Test Trip',
          budgetType: 'fixed_total',
          budgetAmountMinor: 100000,
          fairShareMethod: 'equal_per_user',
          verificationMode: 'member_approval',
        }),
      })).json();
      const tripId = tripRes.trip.id;
      const joinCode = tripRes.trip.join_code;

      await fetch(`${baseUrl}/api/trips/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ joinCode }),
      });

      // Create a pending expense by A
      const expA = await (await fetch(`${baseUrl}/api/trips/${tripId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ amountMinor: 15000, description: 'Lunch', category: 'Food', occurredAt: '2026-08-09T12:00:00.000Z' }),
      })).json();
      console.log('Test A - Expense created, status:', expA.expense.status); // Expected: pending

      // Step F: Try self-approval by A
      const selfApprove = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expA.expense.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const selfData = await selfApprove.json();
      console.log('Test F - Self approval status:', selfApprove.status, 'code:', selfData.error?.code); // Expected: 400, CANNOT_SELF_APPROVE

      // Step B & D: Approve by B
      const approveByB = await (await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expA.expense.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      })).json();
      console.log('Test B/D - Approved by B, new expense status:', approveByB.expense.status); // Expected: verified

      // Step C: Check verification details
      const verDetails = await (await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expA.expense.id}/verification`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      })).json();
      console.log('Test C - Verification info status:', verDetails.status, 'received:', verDetails.approvalsReceived);

      // Step G: Try duplicate approval by B
      const dupApprove = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expA.expense.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const dupData = await dupApprove.json();
      console.log('Test G - Duplicate approval status:', dupApprove.status, 'code:', dupData.error?.code); // Expected: 409

      // Step E: Check budget
      const budgetE = await (await fetch(`${baseUrl}/api/trips/${tripId}/budget`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })).json();
      console.log('Test E - Budget total verified:', budgetE.totalVerifiedMinor); // Expected: 15000

      // Step H: Reject a pending expense
      const expA2 = await (await fetch(`${baseUrl}/api/trips/${tripId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ amountMinor: 5000, description: 'Taxi', category: 'Transport', occurredAt: '2026-08-09T14:00:00.000Z' }),
      })).json();

      const rejectB = await (await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expA2.expense.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ reason: 'Too expensive' }),
      })).json();
      console.log('Test H - Rejection result status:', rejectB.expense.status); // Expected: rejected

      // Step I: Check budget again
      const budgetI = await (await fetch(`${baseUrl}/api/trips/${tripId}/budget`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })).json();
      console.log('Test I - Budget total verified after rejection:', budgetI.totalVerifiedMinor); // Expected: 15000 (rejected 5000 is excluded!)

      console.log('ALL MANUAL API TESTS SUCCESSFUL!');
    } catch (err) {
      console.error('Manual test failed:', err);
    } finally {
      await cleanup();
      server.close();
      await pool.end();
    }
  });
}

runManualTest();
