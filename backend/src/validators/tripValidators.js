import { z } from 'zod';

const BUDGET_TYPES = ['fixed_total', 'fixed_per_person', 'unlimited'];
// 9.9.9 Batch 1 issue #6: the settlement engine (settlementAlgorithm.js)
// only ever implements "equal split among selected settlement units" -
// 'equal_per_user'/'by_headcount'/'custom_weight' are not read by
// calculateFairShares or anywhere else (grep confirms fair_share_method is
// only ever stored/returned, never branched on), so accepting them here
// let the API configure a mode the engine silently ignored. "Individual"
// vs "shared wallet" is a matter of how settlement UNITS are organized
// (one member per unit vs several sharing one), not a different
// calculation mode - both still use this same engine.
const FAIR_SHARE_METHODS = ['equal_per_unit'];
const VERIFICATION_MODES = ['automatic', 'member_approval', 'tiered'];

export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, 'Trip name is required').max(150),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    currency: z
      .string()
      .trim()
      .length(3, 'Currency must be a 3-letter code')
      .transform((v) => v.toUpperCase())
      .default('INR'),
    budgetType: z.enum(BUDGET_TYPES, { message: 'Invalid budget type' }),
    budgetAmountMinor: z.number().int().positive().optional(),
    fairShareMethod: z.enum(FAIR_SHARE_METHODS, { message: 'Invalid fair share method' }),
    verificationMode: z.enum(VERIFICATION_MODES, { message: 'Invalid verification mode' }),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must not be before startDate',
        path: ['endDate'],
      });
    }

    if (data.budgetType === 'unlimited' && data.budgetAmountMinor != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'budgetAmountMinor must not be set when budgetType is "unlimited"',
        path: ['budgetAmountMinor'],
      });
    }

    if (data.budgetType !== 'unlimited' && data.budgetAmountMinor == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'budgetAmountMinor is required for this budgetType',
        path: ['budgetAmountMinor'],
      });
    }
  });

export const joinTripSchema = z.object({
  // Canonicalize to uppercase here, at the backend validation boundary -
  // codes are always generated uppercase (see utils/joinCode.js's
  // ALPHABET) and trips.join_code is compared with a case-sensitive `=`
  // (tripRepository.findTripByJoinCode), so any client that sends a
  // different case must be normalized before that comparison rather than
  // relying on every client to get it right. Same transform pattern
  // createTripSchema already uses for `currency` above.
  joinCode: z
    .string()
    .trim()
    .min(1, 'joinCode is required')
    .transform((v) => v.toUpperCase()),
});

export const createSettlementUnitSchema = z.object({
  displayName: z.string().trim().min(1, 'displayName is required').max(100),
});

export const updateMySettlementUnitSchema = z.object({
  settlementUnitId: z.string().uuid('settlementUnitId must be a valid UUID'),
});

export const requestTransferSchema = z
  .object({
    targetUnitId: z.string().uuid('targetUnitId must be a valid UUID').optional(),
    settlementUnitId: z.string().uuid('settlementUnitId must be a valid UUID').optional(),
  })
  .refine((data) => data.targetUnitId || data.settlementUnitId, {
    message: 'targetUnitId or settlementUnitId is required',
    path: ['targetUnitId'],
  });

// 9.9.9 QA fix #5: deleting a trip requires the owner's current password
// as an in-band confirmation step (see TripService.deleteTrip) - not just
// a UI dialog, since a frontend-only confirmation is not sufficient
// authorization on its own.
export const deleteTripSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
