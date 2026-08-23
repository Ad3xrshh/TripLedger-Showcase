import { Router } from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Not trip-scoped (no :tripId, no requireTripMembership) - a user's
// notifications span every trip they're in. Ownership is enforced inside
// NotificationService itself (every row is checked against req.user.id).
const router = Router();

router.use(requireAuth);

router.get('/', notificationController.listNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/:notificationId/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);

export default router;
