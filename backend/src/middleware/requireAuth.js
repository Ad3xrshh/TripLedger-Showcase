import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';

/**
 * Protects a route: requires a valid "Authorization: Bearer <token>"
 * header. On success, attaches { id, email } to req.user.
 *
 * This is the ONLY place a request's identity is trusted from — no
 * downstream code should ever read a user id from the request body.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Missing or malformed Authorization header', 401, 'UNAUTHENTICATED'));
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401, 'UNAUTHENTICATED'));
  }
}
