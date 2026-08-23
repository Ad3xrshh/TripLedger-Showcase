-- 9.9.9 QA fix #7: deleting an empty settlement group.
--
-- A group unit can only ever be hard-deleted when it has ZERO historical
-- references (never a payer_settlement_unit_id snapshot, never an
-- expense_participants row, never a settlement_transactions endpoint) -
-- in that case there is nothing to preserve and no FK can be violated.
-- Once a unit HAS been used for real money, though, expenses.
-- payer_settlement_unit_id, expense_participants.settlement_unit_id, and
-- settlement_transactions.from_unit_id/to_unit_id all reference it with
-- NO ON DELETE clause (NO ACTION) - a hard DELETE would either violate
-- those constraints outright, or (if the schema were changed to
-- ON DELETE SET NULL instead) silently blank out the unit name on every
-- historical expense/transaction/finalized settlement snapshot that
-- still needs it. Neither is acceptable, so a used-but-now-empty group
-- is archived instead of deleted: the row (and therefore its name)
-- stays intact for every historical reference, it's simply excluded from
-- the "current" unit listing used for display and for new-expense
-- participant selection (SettlementUnitService.deleteOrArchiveUnit /
-- settlementUnitRepository.listVisibleUnitsForTrip).

-- Up Migration

ALTER TABLE settlement_units ADD COLUMN archived_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE settlement_units DROP COLUMN archived_at;
