import { OAuth2Client } from 'google-auth-library';

let client;

function getClient() {
  if (!client) {
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
}

/**
 * Verifies a Google ID token (obtained on the frontend via Google Identity
 * Services) and returns the verified profile fields we care about.
 * Throws if the token is invalid, expired, or issued for a different
 * client ID than ours.
 */
export async function verifyGoogleIdToken(idToken) {
  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    displayName: payload.name || payload.email,
    avatarUrl: payload.picture || null,
  };
}
