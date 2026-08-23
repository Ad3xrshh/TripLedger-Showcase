/**
 * Shared rule for "is a Retry button meaningful for this error", used by
 * every page/component-level error state so the decision is made once,
 * consistently, instead of re-guessed per call site.
 *
 * Deliberately status-based, not code-based: apiClient.js (normalizeError)
 * already gives every error a `status` (0 for a network failure that never
 * reached the server, otherwise the real HTTP status). A network hiccup
 * (status 0) or an unexpected server failure (5xx) is transient - trying
 * again can genuinely help. Everything else the backend returns on purpose
 * (404 not found, 403 forbidden, 409 a state conflict like
 * TRIP_ALREADY_CLOSED, 422 a validation problem) describes something that
 * won't change by re-sending the same request, so retrying would just fail
 * the same way again - see AppError usages across backend/src/services/*.
 */
export function isRetryableError(error) {
  if (!error) return false;
  const { status } = error;
  return status === 0 || status === undefined || status === null || status >= 500;
}

/**
 * 9.9.9 QA fix #4: turns an error into copy that's safe to show a user.
 *
 * Every non-validation AppError message the backend throws is already
 * written for a human (see backend/src/services/*.js -
 * "Only the person who paid can edit this expense", "An account with
 * this email already exists", etc) - this function passes those through
 * completely unchanged. The one exception is validate.js's
 * VALIDATION_ERROR: it builds its message by joining zod issues as
 * `"<field path>: <issue message>"` segments (see
 * backend/src/middleware/validate.js), which is exactly right for a
 * developer reading server logs but reads as a raw, dev-oriented string
 * for a person filling out a form - e.g.
 * "email: Must be a valid email address; password: Password must be at
 * least 8 characters". This strips the field-path prefixes and rejoins
 * the same underlying per-field information as plain sentences, without
 * inventing new wording or discarding any field-specific detail.
 *
 * Deliberately the single place this reshaping happens - call sites that
 * used to render `error.message` directly now call this instead, rather
 * than each inventing its own ad hoc cleanup - and deliberately does not
 * touch the backend's actual error codes/messages (see
 * backend/src/middleware/validate.js, errorHandler.js), which existing
 * backend tests assert on directly.
 */
export function humanizeErrorMessage(error) {
  if (!error) return '';
  const rawMessage = error.message || '';

  if (error.code !== 'VALIDATION_ERROR' || !rawMessage) {
    return rawMessage;
  }

  const segments = rawMessage
    .split(';')
    .map((segment) => segment.trim())
    // "field.path: Some issue message" -> "Some issue message". Falls
    // back to the raw segment untouched if it doesn't match the shape
    // validate.js always produces, rather than mangling anything
    // unexpected.
    .map((segment) => segment.replace(/^[\w.]+:\s*/, ''))
    .filter(Boolean)
    .map((segment) => {
      const capitalized = segment.charAt(0).toUpperCase() + segment.slice(1);
      return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    });

  return segments.length > 0 ? segments.join(' ') : rawMessage;
}
