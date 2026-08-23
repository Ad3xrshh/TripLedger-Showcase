import { Router } from 'express';
import * as settlementController from '../controllers/settlementController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.get('/', settlementController.getSettlement);

// Phase 8
router.post('/finalize', settlementController.finalizeSettlement);
router.get('/final', settlementController.getFinalizedSettlement);

export default router;
