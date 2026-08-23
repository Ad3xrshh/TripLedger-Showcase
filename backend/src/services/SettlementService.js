import pool, { withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import * as tripRepository from '../repositories/tripRepository.js';
import * as settlementUnitRepository from '../repositories/settlementUnitRepository.js';
import * as expenseRepository from '../repositories/expenseRepository.js';
import * as expenseParticipantRepository from '../repositories/expenseParticipantRepository.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as tripClosureRepository from '../repositories/tripClosureRepository.js';
import * as HistoryService from './HistoryService.js';
import * as NotificationService from './NotificationService.js';
import { allActiveMembersConfirmed } from './tripClosure/closureRules.js';
import {
  calculateFairShares,
  assertConservation,
  calculateSettlementTransactions,
} from './settlement/settlementAlgorithm.js';

/**
 * Shared calculation core used by BOTH the Phase 7 live preview
 * (getSettlementSummary) and the Phase 8 finalize flow (finalizeSettlement).
 * Runs on whatever `poolOrClient` it's given - the plain pool for the
 * read-only preview, or a transaction's client when finalizing - so the
 * exact same fair-share/conservation/transaction-minimization algorithm
 * backs both, per the Phase 8 requirement to preserve Phase 7's settlement
 * calculation behavior unchanged rather than reimplementing it.
 *
 * Extracted unchanged from the original (Phase 7) getSettlementSummary body
 * - no algorithmic behavior was altered by this refactor.
 */
async function computeSettlementCalculation(poolOrClient, trip) {
  const [units, verifiedExpenses, activeMembers] = await Promise.all([
    settlementUnitRepository.listUnitsForTrip(poolOrClient, trip.id),
    expenseRepository.listVerifiedExpensesForTrip(poolOrClient, trip.id),
    tripMemberRepository.listMembersForTrip(poolOrClient, trip.id),
  ]);

  const expenseIds = verifiedExpenses.map((e) => e.id);
  const participantRows = await expenseParticipantRepository.listParticipantsForExpenses(poolOrClient, expenseIds);

  const participantsByExpenseId = new Map();
  for (const row of participantRows) {
    if (!participantsByExpenseId.has(row.expense_id)) {
      participantsByExpenseId.set(row.expense_id, []);
    }
    participantsByExpenseId.get(row.expense_id).push(row.settlement_unit_id);
  }

  // Normalize DB rows into the plain shape the pure algorithm expects.
  // An expense with zero participant rows (shouldn't happen in practice -
  // createExpense defaults to "every unit in the trip" - but guarded here
  // rather than trusting it) is skipped rather than crashing the whole
  // calculation, since a malformed single expense shouldn't take down the
  // settlement view for the entire trip.
  const normalizedExpenses = [];
  for (const expense of verifiedExpenses) {
    const participantUnitIds = participantsByExpenseId.get(expense.id) || [];
    if (participantUnitIds.length === 0) continue;

    normalizedExpenses.push({
      expenseId: expense.id,
      amountMinor: Number(expense.amount_minor),
      payerUnitId: expense.payer_settlement_unit_id,
      participantUnitIds,
    });
  }

  const allUnitIds = units.map((u) => u.id);
  // 9.9.9 QA fix #6: calculateFairShares seeds every id in allUnitIds with
  // an all-zero placeholder balance so a currently-active unit that
  // simply hasn't been involved in any expense yet still shows up (Phase
  // 7 edge case #18 - see settlementAlgorithm.js's own comment on this).
  // That's the right behavior for a unit someone is actually in right
  // now. It's misleading for a unit that ALSO has zero active members:
  // moving everyone out of a group (see the historical-attribution
  // scenario TripService.moveSelfToSettlementUnit's own comment
  // describes) shouldn't make that now-empty group appear as a
  // "Settled ₹0" participant in the current settlement view forever
  // after, as if it still has a stake in today's balances.
  //
  // This does NOT drop a unit that genuinely has expense history -
  // calculateFairShares's own internal `ensure()` (settlementAlgorithm.js)
  // still adds any unit referenced as a payer or participant by
  // normalizedExpenses regardless of whether its id appears in
  // allUnitIds, so a unit like "Fam A" (0 active members now, but the
  // historical payer of a real, verified expense) still surfaces with
  // its true totalPaid/fairShare/netBalance - exactly the "historical
  // payer-unit integrity" behavior Batch 1 established, untouched. Only
  // the empty, contentless placeholder seeding changes: a unit with
  // BOTH zero active members AND no actual expense involvement no longer
  // gets manufactured into the balances list at all.
  const unitIdsWithActiveMembers = new Set(activeMembers.map((m) => m.settlement_unit_id));
  const placeholderSeedUnitIds = units.filter((u) => unitIdsWithActiveMembers.has(u.id)).map((u) => u.id);
  const balances = calculateFairShares(normalizedExpenses, placeholderSeedUnitIds);
  assertConservation(balances);
  const transactions = calculateSettlementTransactions(balances);

  const unitNameById = new Map(units.map((u) => [u.id, u.display_name]));

  const totalVerifiedExpensesMinor = normalizedExpenses.reduce((sum, e) => sum + e.amountMinor, 0);
  // 9.9.9 Batch 1 issue #8: the exact set of expense IDs that fed this
  // calculation, for the finalize flow's audit snapshot.
  const includedExpenseIds = normalizedExpenses.map((e) => e.expenseId);

  return {
    units,
    unitNameById,
    balances,
    transactions,
    totalVerifiedExpensesMinor,
    includedExpenseIds,
  };
}

function formatSummary({ units, unitNameById, balances, transactions, totalVerifiedExpensesMinor }) {
  return {
    totalVerifiedExpensesMinor,
    settlementUnitCount: units.length,
    balances: balances.map((b) => ({
      settlementUnitId: b.settlementUnitId,
      name: unitNameById.get(b.settlementUnitId) ?? null,
      totalPaidMinor: b.totalPaidMinor,
      fairShareMinor: b.fairShareMinor,
      netBalanceMinor: b.netBalanceMinor,
      status: b.netBalanceMinor > 0 ? 'receives' : b.netBalanceMinor < 0 ? 'owes' : 'settled',
    })),
    transactions: transactions.map((t) => ({
      fromSettlementUnitId: t.fromSettlementUnitId,
      fromSettlementUnitName: unitNameById.get(t.fromSettlementUnitId) ?? null,
      toSettlementUnitId: t.toSettlementUnitId,
      toSettlementUnitName: unitNameById.get(t.toSettlementUnitId) ?? null,
      amountMinor: t.amountMinor,
    })),
  };
}

/**
 * Read-only settlement calculation for a trip. Phase 7 only - this is a
 * live preview computed from current verified expenses, and never writes
 * anything (no history entries, no notifications, no rows in the existing
 * `settlements`/`settlement_transactions` tables). Those tables carry a
 * UNIQUE(trip_id) constraint and pair with `trip_closure_confirmations`
 * ('final_settlement' stage) - they belong to Phase 8's finalization flow,
 * not this calculation.
 *
 * Only verified expenses contribute (pending/disputed/rejected/locked are
 * all excluded). The payer of every expense is always resolved server-side
 * from expenses.paid_by_member_id -> trip_members.settlement_unit_id -
 * there is no request body on this endpoint, so there is nothing for a
 * client to spoof.
 *
 * Unchanged from Phase 7 (now delegates to the shared calculation helper
 * introduced in Phase 8, but returns byte-for-byte the same JSON shape).
 */
export async function getSettlementSummary(tripMember) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }

  const calculation = await computeSettlementCalculation(pool, trip);
  return formatSummary(calculation);
}

function formatFinalizedSettlement(settlement, transactionRows, unitNameById) {
  return {
    id: settlement.id,
    tripId: settlement.trip_id,
    totalExpenseMinor: Number(settlement.total_expense_minor),
    generatedAt: settlement.generated_at,
    // 9.9.9 Batch 1 issue #8: null on settlements finalized before this
    // snapshot existed - never fabricated for old rows (see the migration
    // comment). pg returns JSONB columns already parsed into JS
    // values/arrays, so no JSON.parse is needed here.
    unitBalances: settlement.unit_balances ?? null,
    includedExpenseIds: settlement.included_expense_ids ?? null,
    transactions: transactionRows.map((t) => ({
      id: t.id,
      fromSettlementUnitId: t.from_unit_id,
      fromSettlementUnitName: unitNameById?.get(t.from_unit_id) ?? null,
      toSettlementUnitId: t.to_unit_id,
      toSettlementUnitName: unitNameById?.get(t.to_unit_id) ?? null,
      amountMinor: Number(t.amount_minor),
    })),
  };
}

/**
 * Phase 8: generates and permanently persists the final settlement for a
 * trip, locking in a snapshot of the fair-share calculation at this moment
 * so it no longer moves if expenses change afterward.
 *
 * Preconditions (all checked, all 409s so a client can distinguish "you're
 * not allowed" (403) from "the trip isn't in the right state yet" (409)):
 *   - trip must not already be closed
 *   - every currently-active trip member must have confirmed the
 *     'expenses_complete' closure stage (see TripClosureService) - this is
 *     the gate that says "everyone agrees no more expenses are coming"
 *     before the numbers get locked in
 *
 * Authorization: owner or admin only, matching the existing
 * createApprovalRule convention - finalizing is a consequential,
 * trip-wide, hard-to-undo action, not a self-service one like a closure
 * confirmation.
 *
 * Idempotency: if a settlement already exists for this trip (i.e. this is
 * a repeat call), the existing persisted settlement + transactions are
 * returned as-is rather than erroring OR recomputing. This is deliberate:
 * `settlements.trip_id` is UNIQUE so a second physical INSERT is
 * impossible anyway, and re-deriving from current expenses could produce a
 * different answer than what was already handed to members as "final" -
 * silently changing a number that's already been called final would be
 * worse than just returning what's already there.
 */
export async function finalizeSettlement(tripMember) {
  if (tripMember.role !== 'owner' && tripMember.role !== 'admin') {
    throw new AppError('Only trip owners or admins can finalize the settlement', 403, 'FORBIDDEN');
  }

  return withTransaction(async (client) => {
    const trip = await tripRepository.findTripByIdForUpdate(client, tripMember.tripId);
    if (!trip) {
      throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
    }
    if (trip.status === 'closed') {
      throw new AppError('Trip is already closed', 409, 'TRIP_ALREADY_CLOSED');
    }

    // Idempotency: a settlement for this trip already exists - hand back
    // exactly what was already finalized, without touching anything.
    const existing = await settlementRepository.findSettlementByTripIdForUpdate(client, trip.id);
    if (existing) {
      const transactionRows = await settlementRepository.listTransactionsForSettlement(client, existing.id);
      const units = await settlementUnitRepository.listUnitsForTrip(client, trip.id);
      const unitNameById = new Map(units.map((u) => [u.id, u.display_name]));
      return {
        settlement: formatFinalizedSettlement(existing, transactionRows, unitNameById),
        alreadyFinalized: true,
      };
    }

    const activeMembers = await tripMemberRepository.listMembersForTrip(client, trip.id);
    const activeMemberIds = activeMembers.map((m) => m.id);
    const confirmedMemberIds = await tripClosureRepository.listConfirmedMemberIdsForTrip(
      client,
      trip.id,
      'expenses_complete'
    );

    if (!allActiveMembersConfirmed(activeMemberIds, confirmedMemberIds)) {
      throw new AppError(
        'All active trip members must confirm "expenses_complete" before the settlement can be finalized',
        409,
        'EXPENSES_NOT_COMPLETE'
      );
    }

    const calculation = await computeSettlementCalculation(client, trip);

    // 9.9.9 Batch 1 issue #8: snapshot each unit's paid/fair-share/balance
    // and display name (not just the net transactions) - all of this is
    // already sitting in `calculation` from the call above, so this is
    // free to persist.
    const unitBalances = calculation.balances.map((b) => ({
      settlementUnitId: b.settlementUnitId,
      name: calculation.unitNameById.get(b.settlementUnitId) ?? null,
      totalPaidMinor: b.totalPaidMinor,
      fairShareMinor: b.fairShareMinor,
      netBalanceMinor: b.netBalanceMinor,
    }));

    const settlementRow = await settlementRepository.insertSettlement(client, {
      tripId: trip.id,
      totalExpenseMinor: calculation.totalVerifiedExpensesMinor,
      unitBalances,
      includedExpenseIds: calculation.includedExpenseIds,
    });

    const formattedTransactions = calculation.transactions.map((t) => ({
      fromSettlementUnitId: t.fromSettlementUnitId,
      toSettlementUnitId: t.toSettlementUnitId,
      amountMinor: t.amountMinor,
    }));
    const transactionRows = await settlementRepository.insertSettlementTransactions(
      client,
      settlementRow.id,
      formattedTransactions
    );

    await HistoryService.recordEvent(client, {
      tripId: trip.id,
      actorMemberId: tripMember.id,
      entityType: 'settlement',
      entityId: settlementRow.id,
      action: 'settlement_finalized',
      metadata: {
        totalExpenseMinor: calculation.totalVerifiedExpensesMinor,
        transactionCount: transactionRows.length,
      },
    });

    // Everyone on the trip is financially affected by this - notify every
    // active member, not just the owner (unlike the owner-only budget
    // warning), matching the "notification systems for user updates"
    // pattern used elsewhere for trip-wide events.
    for (const member of activeMembers) {
      await NotificationService.notifyUser(client, {
        userId: member.user_id,
        tripId: trip.id,
        type: NotificationService.NOTIFICATION_TYPES.SETTLEMENT_FINALIZED,
        message: `The final settlement for "${trip.name}" has been generated.`,
      });
    }

    return {
      settlement: formatFinalizedSettlement(settlementRow, transactionRows, calculation.unitNameById),
      alreadyFinalized: false,
    };
  });
}

/**
 * Phase 8: retrieves the already-persisted final settlement for a trip.
 * Read-only, no transaction needed. 404s (not an empty object) if the
 * trip hasn't been finalized yet, so a client can't confuse "finalized
 * with zero transactions" (a real, valid outcome for an already-settled
 * trip) with "not finalized yet".
 */
export async function getFinalizedSettlement(tripMember) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }

  const settlement = await settlementRepository.findSettlementByTripId(pool, trip.id);
  if (!settlement) {
    throw new AppError('This trip does not have a finalized settlement yet', 404, 'SETTLEMENT_NOT_FINALIZED');
  }

  const [transactionRows, units] = await Promise.all([
    settlementRepository.listTransactionsForSettlement(pool, settlement.id),
    settlementUnitRepository.listUnitsForTrip(pool, trip.id),
  ]);
  const unitNameById = new Map(units.map((u) => [u.id, u.display_name]));

  return formatFinalizedSettlement(settlement, transactionRows, unitNameById);
}
