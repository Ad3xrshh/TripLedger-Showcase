import { AppError } from '../utils/AppError.js';
import pool, { withTransaction } from '../config/db.js';
import * as tripRepository from '../repositories/tripRepository.js';
import * as expenseRepository from '../repositories/expenseRepository.js';
import * as expenseParticipantRepository from '../repositories/expenseParticipantRepository.js';
import * as settlementUnitRepository from '../repositories/settlementUnitRepository.js';
import * as expenseApprovalRepository from '../repositories/expenseApprovalRepository.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';
import * as HistoryService from './HistoryService.js';
import * as NotificationService from './NotificationService.js';
import { assertLedgerIsMutable } from './tripClosure/closureRules.js';

const EDITABLE_STATUS = 'pending';

function initialStatusFor(verificationMode) {
  return verificationMode === 'automatic' ? 'verified' : 'pending';
}

// Validates that every supplied settlement unit ID actually belongs to this
// trip AND currently has at least one active member - a settlement unit
// with nobody in it isn't a valid financial participant (9.9.9 Batch 1
// issue #5: an empty group could otherwise be selected and would then
// silently absorb a share of the expense that no one actually owns).
// Never trust the client - a supplied ID could belong to another trip
// entirely. Returns the resolved list of unit IDs to use: either the
// validated supplied list, or (if none supplied) every currently-populated
// unit in the trip, per the "defaults to everyone" rule.
async function resolveParticipantUnitIds(tripId, suppliedIds) {
  const [allUnitsInTrip, activeMembers] = await Promise.all([
    settlementUnitRepository.listUnitsForTrip(pool, tripId),
    tripMemberRepository.listMembersForTrip(pool, tripId),
  ]);
  const validIdsInTrip = new Set(allUnitsInTrip.map((u) => u.id));
  const unitIdsWithActiveMembers = new Set(activeMembers.map((m) => m.settlement_unit_id));

  if (!suppliedIds || suppliedIds.length === 0) {
    return allUnitsInTrip.filter((u) => unitIdsWithActiveMembers.has(u.id)).map((u) => u.id);
  }

  for (const id of suppliedIds) {
    if (!validIdsInTrip.has(id)) {
      // Deliberately not revealing whether the ID exists at all elsewhere -
      // same non-leaking philosophy as requireTripMembership.
      throw new AppError('Settlement unit not found in this trip', 404, 'SETTLEMENT_UNIT_NOT_FOUND');
    }
    if (!unitIdsWithActiveMembers.has(id)) {
      throw new AppError(
        'A settlement unit with no active members cannot be an expense participant',
        422,
        'SETTLEMENT_UNIT_EMPTY'
      );
    }
  }

  return suppliedIds;
}

export async function createExpense(tripMember, input) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  assertLedgerIsMutable(trip, 'add new expenses');

  const participantUnitIds = await resolveParticipantUnitIds(trip.id, input.participantSettlementUnitIds);
  const status = initialStatusFor(trip.verification_mode);

  return withTransaction(async (client) => {
    const expense = await expenseRepository.insertExpense(client, {
      tripId: trip.id,
      paidByMemberId: tripMember.id, // NEVER taken from the request body - always the authenticated caller.
      // 9.9.9 Batch 1 issue #3: snapshotted from the payer's settlement
      // unit AT THIS MOMENT, not looked up live at settlement-calculation
      // time. tripMember.settlementUnitId comes from requireTripMembership,
      // which reads it fresh from trip_members for this exact request - so
      // if the payer later moves to a different unit (moveSelfToSettlementUnit),
      // this expense's historical attribution does not silently follow them.
      payerSettlementUnitId: tripMember.settlementUnitId,
      amountMinor: input.amountMinor,
      description: input.description,
      category: input.category,
      occurredAt: input.occurredAt,
      status,
    });

    const participants = await expenseParticipantRepository.insertParticipants(client, expense.id, participantUnitIds);

    // Phase 6: history + notifications, inside the same transaction so
    // they roll back together with the expense if anything above fails.
    // These are purely additive - they never influence the expense/
    // participant rows created above.
    await HistoryService.recordEvent(client, {
      tripId: trip.id,
      actorMemberId: tripMember.id,
      entityType: 'expense',
      entityId: expense.id,
      action: 'expense_created',
      metadata: { amountMinor: expense.amount_minor, status: expense.status },
    });

    if (trip.verification_mode !== 'automatic') {
      // Notify every other active member - any of them may need to approve
      // it, and Phase 5 doesn't restrict who's allowed to approve beyond
      // "not the payer".
      const members = await tripMemberRepository.listMembersForTrip(client, trip.id);
      for (const member of members) {
        if (member.id === tripMember.id) continue;
        await NotificationService.notifyUser(client, {
          userId: member.user_id,
          tripId: trip.id,
          relatedExpenseId: expense.id,
          type: NotificationService.NOTIFICATION_TYPES.EXPENSE_CREATED,
          message: `A new expense "${expense.description}" needs your review.`,
        });
      }
    } else {
      // automatic mode: the expense is verified immediately (see
      // initialStatusFor above), so it counts toward spending right away -
      // check whether that just pushed the trip over a budget threshold.
      await NotificationService.maybeNotifyBudgetWarning(client, trip);
    }

    return { expense, participants };
  });
}

// Fetches an expense and confirms it belongs to the given trip. Throws the
// same 404 whether the expense doesn't exist at all or belongs to a
// different trip - never confirms cross-trip existence.
async function getOwnedExpenseOrThrow(tripId, expenseId) {
  const expense = await expenseRepository.findExpenseById(pool, expenseId);
  if (!expense || expense.trip_id !== tripId) {
    throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
  }
  return expense;
}

export async function getExpenseDetail(tripId, expenseId) {
  const expense = await getOwnedExpenseOrThrow(tripId, expenseId);
  const participants = await expenseParticipantRepository.listParticipantsForExpense(pool, expense.id);
  return { expense, participants };
}

const EXPENSE_STATUSES = ['pending', 'verified', 'disputed', 'rejected', 'locked'];

export async function listExpenses(tripId, { status } = {}) {
  if (status && !EXPENSE_STATUSES.includes(status)) {
    throw new AppError(`Invalid status filter: "${status}"`, 422, 'VALIDATION_ERROR');
  }
  return expenseRepository.listExpensesForTrip(pool, tripId, { status });
}

export async function updateExpense(tripMember, expenseId, updates) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (trip) {
    assertLedgerIsMutable(trip, 'edit expenses');
  }

  const expense = await getOwnedExpenseOrThrow(tripMember.tripId, expenseId);

  if (expense.paid_by_member_id !== tripMember.id) {
    throw new AppError('Only the person who paid can edit this expense', 403, 'NOT_EXPENSE_OWNER');
  }

  if (expense.status !== EDITABLE_STATUS) {
    throw new AppError(
      `Expense cannot be edited while status is "${expense.status}"`,
      409,
      'EXPENSE_NOT_EDITABLE'
    );
  }

  return withTransaction(async (client) => {
    // Invalidate existing approvals when a pending expense is edited, so old
    // approvals do not apply to modified data.
    await expenseApprovalRepository.deleteApprovalsForExpense(client, expenseId);

    const updated = await expenseRepository.updateExpense(client, expenseId, {
      amountMinor: updates.amountMinor,
      description: updates.description,
      category: updates.category,
      occurredAt: updates.occurredAt,
    });

    let participants;
    if (updates.participantSettlementUnitIds) {
      const validatedIds = await resolveParticipantUnitIds(tripMember.tripId, updates.participantSettlementUnitIds);
      await expenseParticipantRepository.deleteParticipants(client, expenseId);
      participants = await expenseParticipantRepository.insertParticipants(client, expenseId, validatedIds);
    } else {
      participants = await expenseParticipantRepository.listParticipantsForExpense(client, expenseId);
    }

    return { expense: updated, participants };
  });
}
