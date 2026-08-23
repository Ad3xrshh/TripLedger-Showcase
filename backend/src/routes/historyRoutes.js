import { Router } from 'express';
import * as historyController from '../controllers/historyController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.get('/', historyController.listHistory);

export default router;
