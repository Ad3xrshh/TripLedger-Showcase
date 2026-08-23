import pool from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import * as tripRepository from '../repositories/tripRepository.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';
import * as expenseRepository from '../repositories/expenseRepository.js';
import * as expenseApprovalRepository from '../repositories/expenseApprovalRepository.js';
import * as BudgetService from './BudgetService.js';

const RECENT_EXPENSES_LIMIT = 10;

/**
 * Read-only aggregation of the current state of a trip. No writes, no
 * notifications, no history entries are ever produced here - this is a
 * pure GET, consistent with Phase 6 spec section B4/E ("GET requests are
 * reads, not activity").
 *
 * Every number here comes from an existing repository/service - budget
 * math in particular is delegated entirely to BudgetService.getBudgetSummary
 * so the dashboard can never disagree with the standalone budget endpoint.
 */
export async function getDashboard(tripMember) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }

  const [members, budget, expenseCounts, recentExpenses, pendingApprovals] = await Promise.all([
    tripMemberRepository.listMembersForTrip(pool, trip.id),
    BudgetService.getBudgetSummary(trip.id),
    expenseRepository.countExpensesByStatusForTrip(pool, trip.id),
    expenseRepository.listRecentExpensesForTrip(pool, trip.id, RECENT_EXPENSES_LIMIT),
    expenseApprovalRepository.findPendingApprovalsForMember(pool, trip.id, tripMember.id, RECENT_EXPENSES_LIMIT),
  ]);

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      status: trip.status,
      verificationMode: trip.verification_mode,
      startDate: trip.start_date,
      endDate: trip.end_date,
      currency: trip.currency,
      budgetType: trip.budget_type,
      budgetAmountMinor: trip.budget_amount_minor,
    },
    members: {
      count: members.length,
      list: members.map((m) => ({
        memberId: m.id,
        role: m.role,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        settlementUnitId: m.settlement_unit_id,
        settlementUnitKind: m.settlement_unit_kind,
        settlementUnitName: m.settlement_unit_name,
        joinedAt: m.joined_at,
      })),
    },
    budget,
    expenseSummary: {
      total: expenseCounts.total,
      verified: expenseCounts.verified,
      pending: expenseCounts.pending,
      rejected: expenseCounts.rejected,
      disputed: expenseCounts.disputed,
      locked: expenseCounts.locked,
      verifiedSpendingMinor: budget.totalVerifiedMinor,
    },
    recentExpenses: recentExpenses.map((e) => ({
      expenseId: e.id,
      description: e.description,
      amountMinor: e.amount_minor,
      category: e.category,
      payer: { memberId: e.paid_by_member_id, displayName: e.paid_by_display_name },
      occurredAt: e.occurred_at,
      status: e.status,
    })),
    pendingApprovals: pendingApprovals.map((e) => ({
      expenseId: e.id,
      description: e.description,
      amountMinor: e.amount_minor,
      category: e.category,
      payer: { memberId: e.paid_by_member_id, displayName: e.paid_by_display_name },
      occurredAt: e.occurred_at,
    })),
  };
}
