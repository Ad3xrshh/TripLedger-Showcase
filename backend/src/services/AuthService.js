import { AppError } from '../utils/AppError.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { verifyGoogleIdToken } from '../utils/googleAuth.js';
import * as userRepository from '../repositories/userRepository.js';

export async function registerWithPassword({ email, password, displayName }) {
  const existing = await userRepository.findByEmailWithSecrets(email);
  if (existing) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.createUserWithPassword({ email, passwordHash, displayName });

  return { user, token: signToken(user) };
}

export async function loginWithPassword({ email, password }) {
  const userWithSecrets = await userRepository.findByEmailWithSecrets(email);

  // Same generic message whether the email doesn't exist or the password
  // is wrong — don't leak which one it was.
  const invalidCredentialsError = new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  if (!userWithSecrets) {
    throw invalidCredentialsError;
  }

  if (!userWithSecrets.password_hash) {
    // This account was created via Google and has no password set.
    throw new AppError(
      'This account uses Google Sign-In. Please continue with Google instead.',
      401,
      'PASSWORD_LOGIN_UNAVAILABLE'
    );
  }

  const passwordMatches = await comparePassword(password, userWithSecrets.password_hash);
  if (!passwordMatches) {
    throw invalidCredentialsError;
  }

  const { password_hash, deleted_at, google_id, ...user } = userWithSecrets;
  return { user, token: signToken(user) };
}

export async function loginWithGoogle({ idToken }) {
  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (err) {
    throw new AppError('Invalid Google token', 401, 'INVALID_GOOGLE_TOKEN');
  }

  if (!profile.emailVerified) {
    throw new AppError('Google account email is not verified', 401, 'GOOGLE_EMAIL_UNVERIFIED');
  }

  // 9.9.9 QA fix #3: Google's own email casing isn't guaranteed to match
  // whatever case an existing password-registered account used - without
  // this, linking (step 2 below) would only succeed if Google happened to
  // return the exact same case already stored, and a "brand new user"
  // (step 3) could otherwise be created with a differently-cased email
  // than an existing account, defeating case-insensitive duplicate
  // detection for exactly the account type this trip already had. Same
  // normalization boundary as registerSchema/loginSchema in
  // authValidators.js - trimmed, lowercased, before any lookup or write.
  profile = { ...profile, email: profile.email.trim().toLowerCase() };

  // 1. Already linked by google_id -> log them in.
  let user = await userRepository.findByGoogleId(profile.googleId);
  if (user) {
    return { user, token: signToken(user) };
  }

  // 2. An account exists with this email (e.g. registered via password
  //    originally) -> link the Google identity to it rather than creating
  //    a duplicate account.
  const existingByEmail = await userRepository.findByEmailWithSecrets(profile.email);
  if (existingByEmail) {
    user = await userRepository.linkGoogleIdToUser(existingByEmail.id, profile.googleId);
    return { user, token: signToken(user) };
  }

  // 3. Brand new user.
  user = await userRepository.createUserWithGoogle({
    email: profile.email,
    googleId: profile.googleId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  });
  return { user, token: signToken(user) };
}

export async function getProfile(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return user;
}

export async function updateProfile(userId, updates) {
  const user = await userRepository.updateProfile(userId, updates);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return user;
}
