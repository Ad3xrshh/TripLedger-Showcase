-- Up Migration
--
-- Phase 6: dashboards need to link a notification back to the specific
-- expense it concerns (e.g. "your expense was approved") rather than just
-- embedding that in free-text `message`. Purely additive - the existing
-- `notifications` table and all other Phase 1-5 tables are untouched.

ALTER TABLE notifications
  ADD COLUMN related_expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE;

CREATE INDEX idx_notifications_related_expense ON notifications(related_expense_id);

-- Down Migration

DROP INDEX IF EXISTS idx_notifications_related_expense;
ALTER TABLE notifications DROP COLUMN IF EXISTS related_expense_id;
