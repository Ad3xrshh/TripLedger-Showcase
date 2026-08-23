import { z } from 'zod';

const participantIdsSchema = z.array(z.string().uuid('Each participant settlement unit ID must be a valid UUID'));

export const createExpenseSchema = z.object({
  amountMinor: z.number().int().positive('amountMinor must be a positive integer'),
  description: z.string().trim().min(1, 'description is required').max(300),
  category: z.string().trim().max(50).optional(),
  occurredAt: z.string().datetime({ message: 'occurredAt must be a valid ISO datetime' }),
  participantSettlementUnitIds: participantIdsSchema.optional(),
});

// All fields optional (partial update), but at least one must be present.
export const updateExpenseSchema = z
  .object({
    amountMinor: z.number().int().positive('amountMinor must be a positive integer').optional(),
    description: z.string().trim().min(1).max(300).optional(),
    category: z.string().trim().max(50).optional(),
    occurredAt: z.string().datetime({ message: 'occurredAt must be a valid ISO datetime' }).optional(),
    participantSettlementUnitIds: participantIdsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
