import apiClient from './client.js';

/**
 * Thin wrappers around /api/trips/:tripId/expenses/*, mirroring the backend
 * exactly (see backend/src/routes/expenseRoutes.js, expenseController.js
 * and services/ExpenseService.js). No business logic lives here - only
 * request shaping and response unwrapping. Response rows are returned
 * as-is (snake_case), matching the backend's actual column names - no
 * camelCase transform layer.
 *
 * Approval/verification endpoints (see expenseApprovalController.js /
 * ExpenseApprovalService.js) are wrapped below, mirroring the same
 * snake_case-passthrough convention as the rest of this file.
 */

// POST /api/trips/:tripId/expenses
//   body: { amountMinor, description, category?, occurredAt, participantSettlementUnitIds? }
//   -> { expense, participants }
// The payer is always the authenticated caller (req.tripMember) - the
// backend never reads a payer field from the body, so none is sent here.
export async function createExpense(tripId, input) {
  const { data } = await apiClient.post(`/trips/${tripId}/expenses`, input);
  return data;
}

// GET /api/trips/:tripId/expenses  -> expense[]
export async function listExpenses(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/expenses`);
  return data.expenses;
}

// GET /api/trips/:tripId/expenses/:expenseId  -> { expense, participants }
export async function getExpenseDetail(tripId, expenseId) {
  const { data } = await apiClient.get(`/trips/${tripId}/expenses/${expenseId}`);
  return data;
}

// PATCH /api/trips/:tripId/expenses/:expenseId  (partial update)
//   body: any of { amountMinor, description, category, occurredAt, participantSettlementUnitIds }
//   -> { expense, participants }
// Only allowed by the backend while the expense is 'pending' and the
// caller is the original payer - see ExpenseService.updateExpense.
export async function updateExpense(tripId, expenseId, updates) {
  const { data } = await apiClient.patch(`/trips/${tripId}/expenses/${expenseId}`, updates);
  return data;
}

// GET /api/trips/:tripId/expenses/:expenseId/verification
//   -> { expenseId, status, verificationMode, approvalsRequired,
//        approvalsReceived, approvalsRemaining, approvedBy: [{ memberId,
//        displayName, approvedAt }], currentUserApproved }
// See ExpenseApprovalService.buildVerificationDetails - the response is
// returned as-is (already camelCase on the wire, unlike the expense rows
// above, because it's assembled by the service rather than a raw SELECT).
export async function getVerificationDetails(tripId, expenseId) {
  const { data } = await apiClient.get(`/trips/${tripId}/expenses/${expenseId}/verification`);
  return data;
}

// POST /api/trips/:tripId/expenses/:expenseId/approve  -> { expense, verification }
// The backend derives the approver from req.tripMember (the authenticated
// caller) - no approver id is ever sent from here.
export async function approveExpense(tripId, expenseId) {
  const { data } = await apiClient.post(`/trips/${tripId}/expenses/${expenseId}/approve`);
  return data;
}

// POST /api/trips/:tripId/expenses/:expenseId/reject  { reason? } -> { expense, verification }
export async function rejectExpense(tripId, expenseId, reason) {
  const { data } = await apiClient.post(`/trips/${tripId}/expenses/${expenseId}/reject`, reason ? { reason } : {});
  return data;
}
