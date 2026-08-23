/**
 * Represents an expected, intentional failure (bad input, auth failure,
 * conflict, etc). Controllers throw this and let errorHandler translate
 * it into a consistent JSON response. Anything that is NOT an AppError
 * is treated as an unexpected bug and logged with full detail.
 */
export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
