import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword) {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function comparePassword(plainTextPassword, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(plainTextPassword, passwordHash);
}
