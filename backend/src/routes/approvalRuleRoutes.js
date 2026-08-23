import { Router } from 'express';
import * as expenseApprovalController from '../controllers/expenseApprovalController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';
import { validate } from '../middleware/validate.js';
import { createApprovalRuleSchema } from '../validators/expenseApprovalValidators.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.post('/', validate(createApprovalRuleSchema), expenseApprovalController.createApprovalRule);
router.get('/', expenseApprovalController.listApprovalRules);

export default router;
