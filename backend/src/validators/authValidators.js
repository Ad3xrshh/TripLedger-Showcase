import { z } from 'zod';

// 9.9.9 QA fix #3: emails must be treated case-insensitively everywhere
// (registration, login, duplicate detection). Normalizing here - at the
// validate() middleware boundary, before req.body ever reaches
// AuthService/userRepository - means every write and every lookup uses
// the exact same lowercased, trimmed value, so the backend (not the
// frontend) is the actual source of truth. z.email() already validates
// shape before this transform runs, so a malformed address is still
// rejected with the same message as before.
const normalizedEmail = z
  .string()
  .email('Must be a valid email address')
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1, 'Display name is required').max(100),
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, 'Password is required'),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google idToken is required'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});
