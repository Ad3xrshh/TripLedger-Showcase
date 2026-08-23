import jwt from 'jsonwebtoken';

const TOKEN_EXPIRY = '7d';

export function signToken(user) {
  // Keep the payload minimal and non-sensitive: just enough to identify
  // the user on subsequent requests. Never put password hashes or
  // anything sensitive in a JWT payload — it is base64, not encrypted.
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token) {
  // Throws if invalid/expired — caller (auth middleware) handles that.
  return jwt.verify(token, process.env.JWT_SECRET);
}
