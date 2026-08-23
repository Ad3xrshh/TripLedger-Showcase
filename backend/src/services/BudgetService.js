import pool from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import * as tripRepository from '../repositories/tripRepository.js';
import * as expenseRepository from '../repositories/expenseRepository.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';

// Single source of truth for budget status thresholds - referenced only
// here, never duplicated elsewhere.
export const BUDGET_THRESHOLDS = {
  YELLOW_AT_PERCENT: 70,
  RED_AT_PERCENT: 100,
};

/**
 * Pure calculation, no DB access - unit-testable in isolation.
 *
 * budgetType: 'unlimited' | 'fixed_total' | 'fixed_per_person'
 * budgetAmountMinor: the trip's configured budget_amount_minor (integer minor units)
 * totalVerifiedMinor: sum of verified expenses (integer minor units)
 * memberCount: current active member count (only used for fixed_per_person)
 */
export function calculateBudgetSummary({ budgetType, budgetAmountMinor, totalVerifiedMinor, memberCount }) {
  if (budgetType === 'unlimited') {
    return { budgetType, totalVerifiedMinor };
  }

  const budgetLimitMinor =
    budgetType === 'fixed_per_person' ? budgetAmountMinor * memberCount : budgetAmountMinor;

  // Percentage computed via floating point ONLY for the display value -
  // totalVerifiedMinor and budgetLimitMinor themselves stay integers
  // throughout; this division never feeds back into a stored money value.
  const percentageUsed = budgetLimitMinor === 0 ? 0 : (totalVerifiedMinor / budgetLimitMinor) * 100;
  const roundedPercentage = Math.round(percentageUsed * 100) / 100;

  let status;
  if (percentageUsed >= BUDGET_THRESHOLDS.RED_AT_PERCENT) {
    status = 'red';
  } else if (percentageUsed >= BUDGET_THRESHOLDS.YELLOW_AT_PERCENT) {
    status = 'yellow';
  } else {
    status = 'green';
  }

  return {
    budgetType,
    budgetAmountMinor: budgetLimitMinor,
    totalVerifiedMinor,
    percentageUsed: roundedPercentage,
    status,
  };
}

export async function getBudgetSummary(tripId) {
  const trip = await tripRepository.findTripById(pool, tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }

  const totalVerifiedMinor = await expenseRepository.sumVerifiedAmountForTrip(pool, tripId);

  let memberCount = null;
  if (trip.budget_type === 'fixed_per_person') {
    memberCount = await tripMemberRepository.countActiveMembers(pool, tripId);
  }

  return calculateBudgetSummary({
    budgetType: trip.budget_type,
    budgetAmountMinor: trip.budget_amount_minor,
    totalVerifiedMinor,
    memberCount,
  });
}
