import { Router } from 'express';
import * as budgetController from '../controllers/budgetController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.get('/', budgetController.getBudgetSummary);

export default router;
