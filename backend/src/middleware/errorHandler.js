import { AppError } from '../utils/AppError.js';

/**
 * Single place where all errors become HTTP responses. Controllers/services
 * throw AppError for expected failures (bad credentials, duplicate email,
 * etc). Anything else is treated as an unexpected bug: logged with full
 * detail server-side, but never leaked to the client.
 *
 * Must be registered with app.use(errorHandler) AFTER all routes.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // express.json() throws a plain SyntaxError with a `body` marker when the
  // request body isn't valid JSON. Treat that as a client error, not a bug.
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
  }

  console.error('Unexpected error:', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
}
