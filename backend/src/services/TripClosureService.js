import pool, { withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import * as tripRepository from '../repositories/tripRepository.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';
import * as tripClosureRepository from '../repositories/tripClosureRepository.js';
import * as settlementRepository from '../repositories/settlementRepository.js';
import * as HistoryService from './HistoryService.js';
import * as NotificationService from './NotificationService.js';
import { allActiveMembersConfirmed, missingConfirmations } from './tripClosure/closureRules.js';

export const CLOSURE_STAGES = {
  EXPENSES_COMPLETE: 'expenses_complete',
  FINAL_SETTLEMENT: 'final_settlement',
};

/**
 * Phase 8 trip closure workflow, built directly on the `trips.status`
 * ('active' -> 'closing' -> 'closed') CHECK constraint and the
 * `trip_closure_confirmations` table, both already present since the
 * Phase 1 init migration.
 *
 * Two confirmation stages, gating two different things:
 *
 *   1. 'expenses_complete' - each active member confirms "I'm not adding
 *      any more expenses". The trip moves from 'active' to 'closing' the
 *      moment the FIRST such confirmation is recorded (it marks the
 *      process as having started; it does not by itself mean everyone has
 *      agreed - that's tracked by the confirmation rows, not the status
 *      string). SettlementService.finalizeSettlement refuses to run until
 *      EVERY active member has confirmed this stage.
 *
 *   2. 'final_settlement' - each active member confirms "I've seen and
 *      accept the finalized settlement". This stage cannot be confirmed
 *      until a settlement has actually been finalized. The trip
 *      transitions from 'closing' to 'closed' automatically, in the same
 *      transaction as the confirmation that completes the set, the moment
 *      every active member has confirmed this stage - there is no
 *      separate "close trip" endpoint, since closure is defined as
 *      exactly this condition.
 *
 * Confirming is self-service: a member can only ever confirm as
 * themselves (tripMember.id resolved server-side from their auth token,
 * same convention as the rest of the app - never from the request body),
 * so there's nothing for one member to spoof on another's behalf.
 * Confirming the same stage twice is a no-op, not an error.
 */
export async function confirmStage(tripMember, stage) {
  return withTransaction(async (client) => {
    const trip = await tripRepository.findTripByIdForUpdate(client, tripMember.tripId);
    if (!trip) {
      throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
    }

    if (trip.status === 'closed') {
      throw new AppError('Trip is already closed', 409, 'TRIP_ALREADY_CLOSED');
    }

    if (stage === CLOSURE_STAGES.FINAL_SETTLEMENT) {
      const settlement = await settlementRepository.findSettlementByTripId(client, trip.id);
      if (!settlement) {
        throw new AppError(
          'The settlement must be finalized before members can confirm "final_settlement"',
          409,
          'SETTLEMENT_NOT_FINALIZED'
        );
      }
    }

    const inserted = await tripClosureRepository.insertConfirmation(client, {
      tripId: trip.id,
      memberId: tripMember.id,
      stage,
    });
    const alreadyConfirmed = inserted === null;

    let updatedTrip = trip;

    // First-ever 'expenses_complete' confirmation moves the trip out of
    // 'active' and into 'closing', signalling the closure process has
    // begun. Only applies once, going forward status only ever advances.
    if (stage === CLOSURE_STAGES.EXPENSES_COMPLETE && trip.status === 'active' && !alreadyConfirmed) {
      updatedTrip = await tripRepository.updateTripStatus(client, trip.id, 'closing');
    }

    if (!alreadyConfirmed) {
      await HistoryService.recordEvent(client, {
        tripId: trip.id,
        actorMemberId: tripMember.id,
        entityType: 'trip',
        entityId: trip.id,
        action: 'closure_confirmed',
        metadata: { stage },
      });
    }

    // Check whether this confirmation was the one that completes the
    // 'final_settlement' stage for every active member - if so, close the
    // trip in the same transaction.
    if (stage === CLOSURE_STAGES.FINAL_SETTLEMENT) {
      const activeMembers = await tripMemberRepository.listMembersForTrip(client, trip.id);
      const activeMemberIds = activeMembers.map((m) => m.id);
      const confirmedMemberIds = await tripClosureRepository.listConfirmedMemberIdsForTrip(
        client,
        trip.id,
        CLOSURE_STAGES.FINAL_SETTLEMENT
      );

      if (allActiveMembersConfirmed(activeMemberIds, confirmedMemberIds)) {
        updatedTrip = await tripRepository.updateTripStatus(client, trip.id, 'closed');

        await HistoryService.recordEvent(client, {
          tripId: trip.id,
          actorMemberId: tripMember.id,
          entityType: 'trip',
          entityId: trip.id,
          action: 'trip_closed',
          metadata: null,
        });

        for (const member of activeMembers) {
          await NotificationService.notifyUser(client, {
            userId: member.user_id,
            tripId: trip.id,
            type: NotificationService.NOTIFICATION_TYPES.TRIP_CLOSED,
            message: `Trip "${trip.name}" is now closed.`,
          });
        }
      }
    }

    return buildClosureStatus(client, updatedTrip, { alreadyConfirmed, confirmedStage: stage });
  });
}

/**
 * Read-only closure status/progress view: current trip status, and for
 * each stage, which active members have and haven't confirmed yet. Lets a
 * client show "waiting on 2 of 4 members" instead of guessing.
 */
export async function getClosureStatus(tripMember) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  return buildClosureStatus(pool, trip);
}

async function buildClosureStatus(poolOrClient, trip, extra = {}) {
  const activeMembers = await tripMemberRepository.listMembersForTrip(poolOrClient, trip.id);
  const activeMemberIds = activeMembers.map((m) => m.id);
  const settlement = await settlementRepository.findSettlementByTripId(poolOrClient, trip.id);

  const stageStatuses = {};
  for (const stage of Object.values(CLOSURE_STAGES)) {
    const confirmedMemberIds = await tripClosureRepository.listConfirmedMemberIdsForTrip(poolOrClient, trip.id, stage);
    stageStatuses[stage] = {
      confirmedCount: confirmedMemberIds.filter((id) => activeMemberIds.includes(id)).length,
      totalActiveMembers: activeMemberIds.length,
      allConfirmed: allActiveMembersConfirmed(activeMemberIds, confirmedMemberIds),
      missingMemberIds: missingConfirmations(activeMemberIds, confirmedMemberIds),
    };
  }

  return {
    tripId: trip.id,
    status: trip.status,
    settlementFinalized: Boolean(settlement),
    stages: stageStatuses,
    ...extra,
  };
}
