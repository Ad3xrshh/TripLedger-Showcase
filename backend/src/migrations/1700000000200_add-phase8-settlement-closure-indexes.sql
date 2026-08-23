-- Up Migration
--
-- Phase 8: final settlement + trip closure workflow.
--
-- No new tables are needed here - `settlements`, `settlement_transactions`,
-- and `trip_closure_confirmations` were already created back in the Phase 1
-- init-schema migration specifically to support this phase (see comments in
-- SettlementService.js). This migration is purely additive: two indexes to
-- support the query patterns Phase 8 introduces, matching the existing
-- convention of targeted FK indexes (e.g. idx_expense_approvals_expense).
--
-- No existing table, column, or constraint is touched.

-- Phase 8 fetches a finalized settlement's transactions by settlement_id on
-- every "get final settlement" call.
CREATE INDEX idx_settlement_transactions_settlement ON settlement_transactions(settlement_id);

-- Phase 8 repeatedly checks "which active members have confirmed stage X for
-- trip Y" (both when accepting a new confirmation and when computing closure
-- readiness). The existing primary key (trip_id, member_id, stage) already
-- supports trip_id-prefixed lookups, but this composite index makes the
-- trip_id + stage filter (ignoring member_id) an index-only scan instead of
-- relying on primary key range behavior.
CREATE INDEX idx_trip_closure_confirmations_trip_stage ON trip_closure_confirmations(trip_id, stage);

-- Down Migration

DROP INDEX IF EXISTS idx_trip_closure_confirmations_trip_stage;
DROP INDEX IF EXISTS idx_settlement_transactions_settlement;
