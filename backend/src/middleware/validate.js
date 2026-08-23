import { AppError } from '../utils/AppError.js';

/**
 * Returns an Express middleware that validates req.body against the given
 * zod schema. On success, req.body is replaced with the parsed (and
 * coerced/trimmed) value. On failure, throws an AppError with a readable
 * message built from all validation issues.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return next(new AppError(message, 422, 'VALIDATION_ERROR'));
    }
    req.body = result.data;
    next();
  };
}
