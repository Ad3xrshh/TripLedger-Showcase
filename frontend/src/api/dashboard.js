import apiClient from './client.js';

/**
 * Thin wrapper around GET /api/trips/:tripId/dashboard, mirroring the
 * backend exactly (see backend/src/services/DashboardService.js). A single
 * read-only aggregation endpoint - trip, members, budget, expenseSummary,
 * recentExpenses (newest-first, limited to 10), and pendingApprovals for
 * the current member. No business logic here, only request shaping.
 *
 * Response fields are camelCase, matching DashboardService's own output
 * exactly - unlike trips.js/expenses.js, which pass through raw snake_case
 * DB rows, this endpoint already does its own shaping server-side.
 */
export async function getDashboard(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/dashboard`);
  return data;
}
