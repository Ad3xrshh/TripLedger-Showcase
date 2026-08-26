import { Router } from 'express';
import * as tripController from '../controllers/tripController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTripMembership } from '../middleware/requireTripMembership.js';
import { validate } from '../middleware/validate.js';
import {
  createTripSchema,
  joinTripSchema,
  createSettlementUnitSchema,
  updateMySettlementUnitSchema,
  requestTransferSchema,
  deleteTripSchema,
} from '../validators/tripValidators.js';

const router = Router();

router.use(requireAuth);

router.post('/', validate(createTripSchema), tripController.createTrip);
router.get('/', tripController.listMyTrips);
router.post('/join', validate(joinTripSchema), tripController.joinTrip);

router.get('/:tripId', requireTripMembership, tripController.getTripDetail);
router.get('/:tripId/members', requireTripMembership, tripController.listMembers);

router.post(
  '/:tripId/settlement-units',
  requireTripMembership,
  validate(createSettlementUnitSchema),
  tripController.createSettlementUnit
);

router.patch(
  '/:tripId/members/me/settlement-unit',
  requireTripMembership,
  validate(requestTransferSchema),
  tripController.updateMySettlementUnit
);

router.post(
  '/:tripId/transfer-requests',
  requireTripMembership,
  validate(requestTransferSchema),
  tripController.createTransferRequest
);

router.get(
  '/:tripId/transfer-requests',
  requireTripMembership,
  tripController.listTransferRequests
);

router.post(
  '/:tripId/transfer-requests/:requestId/approve',
  requireTripMembership,
  tripController.approveTransferRequest
);

router.post(
  '/:tripId/transfer-requests/:requestId/reject',
  requireTripMembership,
  tripController.rejectTransferRequest
);

// 9.9.9 QA fix #5: owner-only, password-gated. requireTripMembership
// attaches req.tripMember (role checked inside TripService.deleteTrip)
// - membership-level 404 is enforced the same way every other trip route
// already gets it, before ownership is even checked.
router.delete(
  '/:tripId',
  requireTripMembership,
  validate(deleteTripSchema),
  tripController.deleteTrip
);

// 9.9.9 QA fix #7: owner-only, and independently re-validated inside
// TripService.deleteOrArchiveSettlementUnit (0 active members, group
// kind only, etc) - the route itself only handles auth/membership.
router.delete(
  '/:tripId/settlement-units/:unitId',
  requireTripMembership,
  tripController.deleteSettlementUnit
);

export default router;
