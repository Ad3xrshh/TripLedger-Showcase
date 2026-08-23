import apiClient from './client.js';

/**
 * Thin wrappers around /api/trips/:tripId/settlement/*, mirroring the
 * backend exactly (see backend/src/routes/settlementRoutes.js,
 * settlementController.js and services/SettlementService.js). No business
 * logic lives here - no fair-share recalculation, no transaction
 * minimization, nothing. The backend computes everything; this file only
 * shapes requests and unwraps responses.
 *
 * All three endpoints return already-camelCase JSON assembled by
 * SettlementService (formatSummary / formatFinalizedSettlement), unlike
 * trips.js/expenses.js which pass through raw snake_case DB rows - so
 * responses are returned as-is, matching that convention.
 */

// GET /api/trips/:tripId/settlement
//   -> { totalVerifiedExpensesMinor, settlementUnitCount,
//        balances: [{ settlementUnitId, name, totalPaidMinor,
//                      fairShareMinor, netBalanceMinor,
//                      status: 'receives'|'owes'|'settled' }],
//        transactions: [{ fromSettlementUnitId, fromSettlementUnitName,
//                          toSettlementUnitId, toSettlementUnitName,
//                          amountMinor }] }
// Read-only live preview computed from currently verified expenses. Never
// writes anything server-side, safe to call as often as needed.
export async function getSettlementPreview(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/settlement`);
  return data;
}

// POST /api/trips/:tripId/settlement/finalize  -> { settlement, alreadyFinalized }
//   settlement: { id, tripId, totalExpenseMinor, generatedAt,
//                 transactions: [{ id, fromSettlementUnitId,
//                 fromSettlementUnitName, toSettlementUnitId,
//                 toSettlementUnitName, amountMinor }] }
// Owner/admin only (backend-enforced, 403 FORBIDDEN otherwise). Idempotent -
// repeat calls return the already-persisted settlement with
// alreadyFinalized: true rather than erroring or recomputing.
export async function finalizeSettlement(tripId) {
  const { data } = await apiClient.post(`/trips/${tripId}/settlement/finalize`);
  return data;
}

// GET /api/trips/:tripId/settlement/final
//   -> { id, tripId, totalExpenseMinor, generatedAt, transactions: [...] }
// 404 SETTLEMENT_NOT_FINALIZED if finalize hasn't been called yet for
// this trip - callers should treat that 404 as a normal "not finalized"
// state, not an error to surface.
export async function getFinalizedSettlement(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/settlement/final`);
  return data;
}
