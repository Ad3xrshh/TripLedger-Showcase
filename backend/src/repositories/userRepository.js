import pool from '../config/db.js';

// Columns safe to return to clients. Never select password_hash into
// anything that gets serialized back in a response.
const PUBLIC_COLUMNS = `id, email, display_name, avatar_url, created_at`;

export async function createUserWithPassword({ email, passwordHash, displayName }) {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, passwordHash, displayName]
  );
  return result.rows[0];
}

export async function createUserWithGoogle({ email, googleId, displayName, avatarUrl }) {
  const result = await pool.query(
    `INSERT INTO users (email, google_id, display_name, avatar_url)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, googleId, displayName, avatarUrl || null]
  );
  return result.rows[0];
}

// Returns the full row INCLUDING password_hash — only for internal use
// during login, never returned directly to a controller response.
export async function findByEmailWithSecrets(email) {
  const result = await pool.query(
    `SELECT id, email, password_hash, google_id, display_name, avatar_url, created_at, deleted_at
     FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  return result.rows[0] || null;
}

// 9.9.9 QA fix #5: delete-trip requires verifying the owner's CURRENT
// password before proceeding (see TripService.deleteTrip). The existing
// findByEmailWithSecrets is keyed by email (right for a login flow, where
// email is all the caller has); this is the by-id equivalent for an
// already-authenticated request, where req.user.id is already known and
// trusted from the JWT - never re-deriving identity from a
// client-supplied email. Same contract as findByEmailWithSecrets: full
// row INCLUDING password_hash, only for internal use, never returned
// directly to a controller response.
export async function findByIdWithSecrets(id) {
  const result = await pool.query(
    `SELECT id, email, password_hash, google_id, display_name, avatar_url, created_at, deleted_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] || null;
}

export async function findByGoogleId(googleId) {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE google_id = $1 AND deleted_at IS NULL`,
    [googleId]
  );
  return result.rows[0] || null;
}

export async function findById(id) {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] || null;
}

export async function linkGoogleIdToUser(userId, googleId) {
  const result = await pool.query(
    `UPDATE users SET google_id = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [userId, googleId]
  );
  return result.rows[0];
}

export async function updateProfile(userId, { displayName, avatarUrl }) {
  const result = await pool.query(
    `UPDATE users
     SET display_name = COALESCE($2, display_name),
         avatar_url = COALESCE(NULLIF($3, ''), avatar_url)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [userId, displayName ?? null, avatarUrl ?? null]
  );
  return result.rows[0] || null;
}
