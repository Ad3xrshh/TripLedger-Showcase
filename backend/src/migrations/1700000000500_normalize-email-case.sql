-- 9.9.9 QA fix #3: email case-insensitivity.
--
-- registerSchema/loginSchema (authValidators.js) and
-- AuthService.loginWithGoogle now normalize every incoming email to
-- trimmed lowercase before it ever reaches userRepository, so every
-- future write is already consistent. This migration handles the data
-- that predates that fix: any row where users.email isn't already
-- lowercase gets normalized here, once.
--
-- Guarded: if two existing rows already differ ONLY by case (i.e. a
-- duplicate account this exact bug allowed to be created before today),
-- collapsing both to the same lowercase value would violate the existing
-- users_email_key UNIQUE constraint - silently overwriting one of two
-- real accounts is not a safe automatic resolution. The check below
-- aborts the whole migration loudly instead, so any such collision has
-- to be resolved manually (e.g. merging or renaming one account) before
-- re-running it - never a guess made on the account owner's behalf.
--
-- No new index is added: because every application-boundary write path
-- now normalizes to lowercase before insert/update, the existing exact-
-- match UNIQUE(email) constraint is sufficient to catch future case-
-- based duplicates on its own - a case-insensitive functional index
-- would be redundant once the stored values themselves are guaranteed to
-- always be lowercase already.

-- Up Migration

DO $$
DECLARE
  collision_count INT;
BEGIN
  SELECT COUNT(*) INTO collision_count
  FROM (
    SELECT LOWER(email) AS normalized
    FROM users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) dupes;

  IF collision_count > 0 THEN
    RAISE EXCEPTION
      'Cannot normalize users.email to lowercase: % email(s) exist in more than one case variant. Resolve these accounts manually (merge or rename) before re-running this migration.',
      collision_count;
  END IF;
END $$;

UPDATE users SET email = LOWER(email) WHERE email <> LOWER(email);

-- Down Migration

-- Not reversible: the original mixed-case values are not recoverable
-- once lowercased (this migration doesn't store what they were), and
-- reverting would just reintroduce the case-sensitivity bug this fix
-- exists to close. Intentionally left as a no-op.
