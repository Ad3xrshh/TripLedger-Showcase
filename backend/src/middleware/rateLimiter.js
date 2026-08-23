import rateLimit from 'express-rate-limit';

// Pass 4: lightweight, in-memory rate limiting for the auth endpoints
// that require no JWT to reach at all (register/login/google) - these
// are the highest-value targets for credential stuffing, brute force,
// and registration spam. In-memory storage (express-rate-limit's
// default) is fine for a single backend instance; if TripLedger is ever
// deployed behind multiple instances/a load balancer, this would need a
// shared store (e.g. Redis) instead - noted here rather than silently
// treating that deployment shape as already handled.
//
// 20 requests / 15 minutes / IP is generous enough that a real person
// mistyping their password a few times, or a developer iterating
// locally, won't get blocked, while still meaningfully blunting
// scripted brute-force attempts.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Matches the shape errorHandler.js uses for every other error
  // response ({ error: { code, message } }) - this response doesn't
  // pass through errorHandler (express-rate-limit replies directly), so
  // the shape has to be kept in sync here by hand.
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again in a few minutes.' } },
  // The integration test suite (tests/integration/auth.test.js and
  // others) registers/logs in far more than 20 times per run against
  // the same loopback address - this middleware isn't what those tests
  // are verifying, so it steps aside under NODE_ENV=test rather than
  // making unrelated tests flaky depending on run order/count.
  skip: () => process.env.NODE_ENV === 'test',
});
