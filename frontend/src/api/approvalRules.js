import apiClient from './client.js';

/**
 * Thin wrappers around /api/trips/:tripId/approval-rules, mirroring the
 * backend exactly (see backend/src/routes/approvalRuleRoutes.js and
 * expenseApprovalController.js). Approval rules are the amount-tier
 * configuration used by trips with verificationMode "tiered" - see
 * ExpenseApprovalService.calculateRequiredApprovals. Any trip member can
 * list rules (so they can see the thresholds); only the backend enforces
 * who can create one (owner/admin - see createApprovalRule).
 */

// GET /api/trips/:tripId/approval-rules  -> rule[]
//   rule: { id, trip_id, min_amount_minor, max_amount_minor, required_approvals }
export async function listApprovalRules(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/approval-rules`);
  return data.rules;
}

// POST /api/trips/:tripId/approval-rules
//   body: { minAmountMinor, maxAmountMinor?, requiredApprovals } -> rule
export async function createApprovalRule(tripId, input) {
  const { data } = await apiClient.post(`/trips/${tripId}/approval-rules`, input);
  return data.rule;
}
