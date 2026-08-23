import apiClient from './client.js';

/**
 * Thin wrapper around GET /api/trips/:tripId/history, mirroring the
 * backend exactly (see backend/src/services/HistoryService.js). Returns
 * { events, pagination } with events already newest-first (ORDER BY
 * created_at DESC in historyRepository.js) - no re-sorting needed here.
 *
 * Each event row: { id, trip_id, entity_type, entity_id, action, metadata,
 * created_at, actor_member_id, actor_display_name } - raw snake_case DB
 * columns, same convention as trips.js/expenses.js.
 */
export async function getHistory(tripId, { page, limit } = {}) {
  const { data } = await apiClient.get(`/trips/${tripId}/history`, { params: { page, limit } });
  return data;
}
