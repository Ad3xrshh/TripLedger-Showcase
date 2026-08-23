-- Up Migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_by UUID REFERENCES users(id),
  join_code TEXT UNIQUE NOT NULL,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('fixed_total', 'fixed_per_person', 'none')),
  budget_amount_minor BIGINT,
  fair_share_method TEXT NOT NULL CHECK (fair_share_method IN
      ('equal_per_user', 'equal_per_unit', 'by_headcount', 'custom_weight')),
  verification_mode TEXT NOT NULL CHECK (verification_mode IN
      ('automatic', 'member_approval', 'tiered')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closing', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE settlement_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('individual', 'group')),
  display_name TEXT NOT NULL,
  weight NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trip_id, display_name)
);

CREATE TABLE trip_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  settlement_unit_id UUID NOT NULL REFERENCES settlement_units(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE (trip_id, user_id)
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  paid_by_member_id UUID NOT NULL REFERENCES trip_members(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  description TEXT NOT NULL,
  category TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
      ('pending', 'verified', 'disputed', 'rejected', 'locked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE expense_participants (
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  settlement_unit_id UUID NOT NULL REFERENCES settlement_units(id),
  PRIMARY KEY (expense_id, settlement_unit_id)
);

CREATE TABLE approval_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  min_amount_minor BIGINT NOT NULL,
  max_amount_minor BIGINT,
  required_approvals INT NOT NULL CHECK (required_approvals >= 1)
);

CREATE TABLE expense_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approved_by_member_id UUID NOT NULL REFERENCES trip_members(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (expense_id, approved_by_member_id)
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  raised_by_member_id UUID NOT NULL REFERENCES trip_members(id),
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by_member_id UUID NOT NULL REFERENCES trip_members(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES trip_members(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  total_expense_minor BIGINT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE settlement_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  from_unit_id UUID NOT NULL REFERENCES settlement_units(id),
  to_unit_id UUID NOT NULL REFERENCES settlement_units(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trip_closure_confirmations (
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES trip_members(id),
  stage TEXT NOT NULL CHECK (stage IN ('expenses_complete', 'final_settlement')),
  confirmed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (trip_id, member_id, stage)
);

CREATE INDEX idx_expenses_trip_status ON expenses(trip_id, status);
CREATE INDEX idx_expense_approvals_expense ON expense_approvals(expense_id);
CREATE INDEX idx_audit_logs_trip_created ON audit_logs(trip_id, created_at);
CREATE INDEX idx_trip_members_trip_unit ON trip_members(trip_id, settlement_unit_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);

-- Down Migration

DROP TABLE IF EXISTS trip_closure_confirmations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS settlement_transactions;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS expense_approvals;
DROP TABLE IF EXISTS approval_rules;
DROP TABLE IF EXISTS expense_participants;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS trip_members;
DROP TABLE IF EXISTS settlement_units;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS users;
