-- Up Migration
--
-- Phase 9.3.1: rename the 'none' budget type to 'unlimited'.
--
-- 'none' already had exactly the behavior a later "unlimited budget" type
-- needs: budget_amount_minor stays NULL, no amount is required at
-- creation, and BudgetService.calculateBudgetSummary already returns only
-- the running total (no misleading percentage/denominator) for it. Rather
-- than add a second, functionally-identical budget type, this migration
-- renames the existing one so the product has a single, clearly-named
-- concept for "no predefined budget ceiling".
--
-- Order matters: the CHECK constraint must be dropped before any row can
-- hold 'unlimited', and the data must be migrated before the new
-- constraint (which no longer permits 'none') is added.

ALTER TABLE trips DROP CONSTRAINT trips_budget_type_check;

UPDATE trips SET budget_type = 'unlimited' WHERE budget_type = 'none';

ALTER TABLE trips ADD CONSTRAINT trips_budget_type_check
  CHECK (budget_type IN ('fixed_total', 'fixed_per_person', 'unlimited'));

-- Down Migration

ALTER TABLE trips DROP CONSTRAINT trips_budget_type_check;

UPDATE trips SET budget_type = 'none' WHERE budget_type = 'unlimited';

ALTER TABLE trips ADD CONSTRAINT trips_budget_type_check
  CHECK (budget_type IN ('fixed_total', 'fixed_per_person', 'none'));
