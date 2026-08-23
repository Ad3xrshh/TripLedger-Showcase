-- Up Migration

-- 9.9.9 Batch 1 issue #3: expenses.paid_by_member_id -> trip_members.settlement_unit_id
-- was previously resolved LIVE at settlement-calculation time (see
-- expenseRepository.listVerifiedExpensesForTrip's join). If a member later
-- moved to a different settlement unit, every one of their historical
-- expenses would silently be re-attributed to the new unit. This column
-- snapshots the payer's settlement unit at the moment the expense was
-- created, so historical attribution no longer moves when a member is
-- reassigned afterward.
ALTER TABLE expenses ADD COLUMN payer_settlement_unit_id UUID REFERENCES settlement_units(id);

-- Backfill existing rows with the best information actually available:
-- the payer's CURRENT unit (i.e. preserve today's live-lookup behavior for
-- expenses that already exist, since there is no way to know what unit a
-- historical payer was in at the time without inventing data). Every new
-- expense created after this migration gets the true creation-time
-- snapshot instead.
UPDATE expenses e
SET payer_settlement_unit_id = tm.settlement_unit_id
FROM trip_members tm
WHERE tm.id = e.paid_by_member_id
  AND e.payer_settlement_unit_id IS NULL;

ALTER TABLE expenses ALTER COLUMN payer_settlement_unit_id SET NOT NULL;

-- 9.9.9 Batch 1 issue #8: finalized settlements previously persisted only
-- the net transactions between units (settlement_transactions) and a
-- grand total (settlements.total_expense_minor) - not each unit's own
-- paid/fair-share/balance breakdown, and not which expenses were actually
-- included. Both are nullable (existing finalized settlements predate this
-- column and cannot have this backfilled without inventing numbers - see
-- SettlementService.formatFinalizedSettlement, which returns null for
-- these on old rows rather than fabricating a value).
ALTER TABLE settlements ADD COLUMN unit_balances JSONB;
ALTER TABLE settlements ADD COLUMN included_expense_ids JSONB;

-- Down Migration

ALTER TABLE settlements DROP COLUMN IF EXISTS included_expense_ids;
ALTER TABLE settlements DROP COLUMN IF EXISTS unit_balances;
ALTER TABLE expenses DROP COLUMN IF EXISTS payer_settlement_unit_id;
