import { z } from 'zod';

export const confirmStageSchema = z.object({
  stage: z.enum(['expenses_complete', 'final_settlement'], {
    errorMap: () => ({ message: 'stage must be either "expenses_complete" or "final_settlement"' }),
  }),
});
