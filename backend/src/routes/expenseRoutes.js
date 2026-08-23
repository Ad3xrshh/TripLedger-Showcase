import { Router } from 'express';
import * as expenseController from '../controllers/expenseController.js';
import * as expenseApprovalController from '../controllers/expenseApprovalController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';
import { validate } from '../middleware/validate.js';
import { createExpenseSchema, updateExpenseSchema } from '../validators/expenseValidators.js';
import { rejectExpenseSchema } from '../validators/expenseApprovalValidators.js';

// mergeParams: true so :tripId from the parent mount path
// ('/api/trips/:tripId/expenses' in index.js) is available on req.params
// here, same as it would be for a route defined directly on that pattern.
const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.post('/', validate(createExpenseSchema), expenseController.createExpense);
router.get('/', expenseController.listExpenses);
router.get('/:expenseId/verification', expenseApprovalController.getVerificationDetails);
router.get('/:expenseId', expenseController.getExpenseDetail);
router.patch('/:expenseId', validate(updateExpenseSchema), expenseController.updateExpense);
router.post('/:expenseId/approve', expenseApprovalController.approveExpense);
router.post('/:expenseId/reject', validate(rejectExpenseSchema), expenseApprovalController.rejectExpense);

export default router;
