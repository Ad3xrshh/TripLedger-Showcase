import * as NotificationService from '../services/NotificationService.js';

export async function listNotifications(req, res, next) {
  try {
    const { unread, tripId } = req.query;
    const notifications = await NotificationService.listNotifications(req.user, { unread, tripId });
    res.status(200).json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    const result = await NotificationService.getUnreadCount(req.user, { tripId: req.query.tripId });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const notification = await NotificationService.markNotificationRead(req.user, req.params.notificationId);
    res.status(200).json({ notification });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const result = await NotificationService.markAllNotificationsRead(req.user, { tripId: req.body?.tripId });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
