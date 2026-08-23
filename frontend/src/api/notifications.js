import apiClient from './client.js';

/**
 * Thin wrappers around /api/notifications, mirroring the backend exactly
 * (see backend/src/routes/notificationRoutes.js and
 * notificationController.js). Not trip-scoped in the URL - a user's
 * notifications span every trip - so tripId is passed as a query param,
 * same as the backend controller expects it (req.query.tripId).
 *
 * Response rows are raw snake_case DB columns (id, user_id, trip_id,
 * related_expense_id, type, message, read_at, created_at) per
 * NOTIFICATION_COLUMNS in notificationRepository.js - that SELECT has no
 * column aliasing, same convention as trips.js/expenses.js. No shaping
 * performed here.
 */

// GET /api/notifications?tripId=&unread=  -> { notifications }
export async function listNotifications({ tripId, unread } = {}) {
  const { data } = await apiClient.get('/notifications', { params: { tripId, unread } });
  return data.notifications;
}

// GET /api/notifications/unread-count?tripId=  -> { unreadCount }
export async function getUnreadCount({ tripId } = {}) {
  const { data } = await apiClient.get('/notifications/unread-count', { params: { tripId } });
  return data.unreadCount;
}
