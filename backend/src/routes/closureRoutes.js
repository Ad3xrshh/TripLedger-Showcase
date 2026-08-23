import { Router } from 'express';
import * as tripClosureController from '../controllers/tripClosureController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';
import { validate } from '../middleware/validate.js';
import { confirmStageSchema } from '../validators/tripClosureValidators.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireTripMembership);

router.post('/confirmations', validate(confirmStageSchema), tripClosureController.confirmStage);
router.get('/', tripClosureController.getClosureStatus);

export default router;
