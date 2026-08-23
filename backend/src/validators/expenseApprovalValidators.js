import { z } from 'zod';

export const rejectExpenseSchema = z.object({
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
});

// maxAmountMinor may be omitted/null to mean "no upper bound" (open-ended
// top tier), matching how findApprovalRuleForExpense treats a NULL max.
export const createApprovalRuleSchema = z
  .object({
    minAmountMinor: z.number().int().nonnegative('minAmountMinor must be a non-negative integer'),
    maxAmountMinor: z.number().int().positive().nullable().optional(),
    requiredApprovals: z.number().int().positive('requiredApprovals must be a positive integer'),
  })
  .superRefine((data, ctx) => {
    if (
      data.maxAmountMinor != null &&
      data.maxAmountMinor < data.minAmountMinor
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxAmountMinor must be greater than or equal to minAmountMinor',
        path: ['maxAmountMinor'],
      });
    }
  });
