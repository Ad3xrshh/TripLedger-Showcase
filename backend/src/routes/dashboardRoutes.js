import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.get('/', dashboardController.getDashboard);

export default router;
