// Phase 8: pure trip-closure readiness rules. Deliberately has NO database
// imports and NO Express dependencies, same convention as
// ../settlement/settlementAlgorithm.js - it operates entirely on plain JS
// arrays passed in by the caller, which makes it trivial to unit-test in
// isolation (tests/unit/closureRules.test.js) without a running Postgres
// instance.

import { AppError } from '../../utils/AppError.js';

/**
 * 9.9.9 Batch 1: central ledger-freeze guard.
 *
 * The intended lifecycle is:
 *   active  -> normal financial mutations allowed
 *   closing -> ledger frozen (closure in progress, waiting on final
 *              settlement - nothing that could change the numbers being
 *              agreed on is allowed to move)
 *   closed  -> permanently read-only
 *
 * Before this fix, every mutation site (createExpense, updateExpense,
 * approveExpense, rejectExpense, createApprovalRule, createGroupUnit,
 * moveSelfToSettlementUnit) re-derived its own `status === 'closed'` check
 * independently, and none of them accounted for 'closing' at all - a trip
 * mid-closure could still have expenses added/edited/approved/rejected,
 * new approval rules created, and settlement units created/reassigned,
 * silently invalidating the very settlement everyone was in the middle of
 * agreeing on. This is the single place that rule now lives; every
 * ledger-affecting service function calls this instead of comparing
 * trip.status itself, so there is exactly one definition of "is the
 * ledger open for mutation" in the codebase.
 *
 * `action` is a short present-tense verb phrase (e.g. "add new expenses")
 * substituted into the error message, so each call site keeps a message
 * specific to what was actually attempted without duplicating the status
 * comparison itself.
 */
export function assertLedgerIsMutable(trip, action = 'do this') {
  if (trip.status === 'closing') {
    throw new AppError(
      `This trip is being closed, so you can't ${action} while its ledger is frozen`,
      409,
      'TRIP_LEDGER_FROZEN'
    );
  }
  if (trip.status === 'closed') {
    throw new AppError(`This trip is closed, so you can't ${action}`, 409, 'TRIP_ALREADY_CLOSED');
  }
}

/**
 * True iff every currently-active member has confirmed the stage in
 * question. Compares by member id set membership (not just count), so it
 * stays correct even if membership changes mid-process - e.g. a member who
 * left the trip after confirming doesn't count toward "active", and a
 * member who joined after others already confirmed still needs to confirm
 * themselves.
 */
export function allActiveMembersConfirmed(activeMemberIds, confirmedMemberIds) {
  if (activeMemberIds.length === 0) return false;
  const confirmedSet = new Set(confirmedMemberIds);
  return activeMemberIds.every((id) => confirmedSet.has(id));
}

/**
 * The subset of active members who have NOT yet confirmed - used to power
 * the closure-status endpoint so a client can show "waiting on: ...".
 */
export function missingConfirmations(activeMemberIds, confirmedMemberIds) {
  const confirmedSet = new Set(confirmedMemberIds);
  return activeMemberIds.filter((id) => !confirmedSet.has(id));
}
