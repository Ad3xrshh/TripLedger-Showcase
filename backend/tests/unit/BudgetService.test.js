import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudgetSummary, BUDGET_THRESHOLDS } from '../../src/services/BudgetService.js';

test('budgetType "unlimited" returns only the running total, no limit/percentage/status', () => {
  const result = calculateBudgetSummary({
    budgetType: 'unlimited',
    budgetAmountMinor: null,
    totalVerifiedMinor: 500000,
    memberCount: null,
  });
  assert.deepEqual(result, { budgetType: 'unlimited', totalVerifiedMinor: 500000 });
  assert.equal('budgetAmountMinor' in result, false);
  assert.equal('percentageUsed' in result, false);
  assert.equal('status' in result, false);
});

test('fixed_total: zero spending is green at 0%', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 6000000,
    totalVerifiedMinor: 0,
    memberCount: null,
  });
  assert.equal(result.percentageUsed, 0);
  assert.equal(result.status, 'green');
});

test('fixed_total: matches the worked example from the spec (70.58%, yellow)', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 6000000,
    totalVerifiedMinor: 4235000,
    memberCount: null,
  });
  assert.equal(result.percentageUsed, 70.58);
  assert.equal(result.status, 'yellow');
  assert.equal(result.budgetAmountMinor, 6000000);
});

test('fixed_total: just below yellow threshold (69.99%) is green', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 10000,
    totalVerifiedMinor: 6999,
    memberCount: null,
  });
  assert.equal(result.status, 'green');
});

test('fixed_total: exactly at yellow threshold (70%) is yellow', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 10000,
    totalVerifiedMinor: 7000,
    memberCount: null,
  });
  assert.equal(result.percentageUsed, 70);
  assert.equal(result.status, 'yellow');
});

test('fixed_total: just below red threshold (99.99%) is yellow', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 1000000,
    totalVerifiedMinor: 999900,
    memberCount: null,
  });
  assert.equal(result.status, 'yellow');
});

test('fixed_total: exactly at red threshold (100%) is red', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 10000,
    totalVerifiedMinor: 10000,
    memberCount: null,
  });
  assert.equal(result.percentageUsed, 100);
  assert.equal(result.status, 'red');
});

test('fixed_total: over budget (120%) is red', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 10000,
    totalVerifiedMinor: 12000,
    memberCount: null,
  });
  assert.equal(result.percentageUsed, 120);
  assert.equal(result.status, 'red');
});

test('fixed_per_person: budget limit scales with member count', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_per_person',
    budgetAmountMinor: 1500000, // 15,000 INR per person
    totalVerifiedMinor: 3000000,
    memberCount: 4,
  });
  // 15,000 x 4 = 60,000 limit; 30,000 / 60,000 = 50%
  assert.equal(result.budgetAmountMinor, 6000000);
  assert.equal(result.percentageUsed, 50);
  assert.equal(result.status, 'green');
});

test('fixed_per_person: limit recalculates dynamically as member count changes', () => {
  const twoMembers = calculateBudgetSummary({
    budgetType: 'fixed_per_person',
    budgetAmountMinor: 1000000,
    totalVerifiedMinor: 1500000,
    memberCount: 2,
  });
  // limit = 20,000; spent 15,000 -> 75%, yellow
  assert.equal(twoMembers.budgetAmountMinor, 2000000);
  assert.equal(twoMembers.status, 'yellow');

  const fourMembers = calculateBudgetSummary({
    budgetType: 'fixed_per_person',
    budgetAmountMinor: 1000000,
    totalVerifiedMinor: 1500000,
    memberCount: 4,
  });
  // limit = 40,000; spent 15,000 -> 37.5%, green
  assert.equal(fourMembers.budgetAmountMinor, 4000000);
  assert.equal(fourMembers.status, 'green');
});

test('thresholds are the documented constants (70 / 100)', () => {
  assert.equal(BUDGET_THRESHOLDS.YELLOW_AT_PERCENT, 70);
  assert.equal(BUDGET_THRESHOLDS.RED_AT_PERCENT, 100);
});

test('percentageUsed is rounded to 2 decimal places', () => {
  const result = calculateBudgetSummary({
    budgetType: 'fixed_total',
    budgetAmountMinor: 3,
    totalVerifiedMinor: 1,
    memberCount: null,
  });
  // 1/3 * 100 = 33.333...
  assert.equal(result.percentageUsed, 33.33);
});
