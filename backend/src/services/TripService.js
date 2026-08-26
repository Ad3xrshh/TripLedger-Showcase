import { AppError } from '../utils/AppError.js';
import { generateJoinCode } from '../utils/joinCode.js';
import { comparePassword } from '../utils/password.js';
import pool, { withTransaction } from '../config/db.js';
import * as tripRepository from '../repositories/tripRepository.js';
import * as settlementUnitRepository from '../repositories/settlementUnitRepository.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import * as transferRequestRepository from '../repositories/transferRequestRepository.js';
import * as HistoryService from './HistoryService.js';
import * as NotificationService from './NotificationService.js';
import { assertLedgerIsMutable } from './tripClosure/closureRules.js';

const MAX_JOIN_CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505'; // Postgres error code

export async function createTrip(authUser, tripInput) {
  // authUser (req.user, from Phase 2's requireAuth) only carries { id, email }.
  // We need the full profile (display_name) to seed the creator's individual
  // settlement unit, so fetch it here rather than modifying requireAuth.
  const user = await userRepository.findById(authUser.id);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return withTransaction(async (client) => {
    let trip;
    let attempts = 0;

    // Retry on join_code collision (extremely unlikely with a 7-char
    // alphabet of 32 characters, but handled properly rather than assumed
    // away).
    while (!trip) {
      attempts += 1;
      const joinCode = generateJoinCode();
      try {
        trip = await tripRepository.insertTrip(client, {
          ...tripInput,
          createdBy: user.id,
          joinCode,
        });
      } catch (err) {
        const isJoinCodeCollision = err.code === UNIQUE_VIOLATION && err.constraint === 'trips_join_code_key';
        if (isJoinCodeCollision && attempts < MAX_JOIN_CODE_ATTEMPTS) {
          continue;
        }
        throw err;
      }
    }

    const unit = await settlementUnitRepository.insertIndividualUnit(client, {
      tripId: trip.id,
      displayName: user.display_name,
    });

    const membership = await tripMemberRepository.insertMember(client, {
      tripId: trip.id,
      userId: user.id,
      settlementUnitId: unit.id,
      role: 'owner',
    });

    return { trip, membership };
  });
}

export async function joinTrip(authUser, joinCode) {
  const user = await userRepository.findById(authUser.id);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const trip = await tripRepository.findTripByJoinCode(pool, joinCode);
  if (!trip) {
    throw new AppError('No trip found with that join code', 404, 'TRIP_NOT_FOUND');
  }

  if (trip.status !== 'active') {
    throw new AppError('This trip is no longer accepting new members', 409, 'TRIP_NOT_JOINABLE');
  }

  const existingMembership = await tripMemberRepository.findMembership(pool, trip.id, user.id);
  if (existingMembership) {
    throw new AppError('You are already a member of this trip', 409, 'ALREADY_MEMBER');
  }

  return withTransaction(async (client) => {
    const unit = await settlementUnitRepository.insertIndividualUnit(client, {
      tripId: trip.id,
      displayName: user.display_name,
    });

    const membership = await tripMemberRepository.insertMember(client, {
      tripId: trip.id,
      userId: user.id,
      settlementUnitId: unit.id,
      role: 'member',
    });

    // Phase 6: history + notification, inside the same transaction so they
    // roll back together with the membership if anything above fails.
    await HistoryService.recordEvent(client, {
      tripId: trip.id,
      actorMemberId: membership.id,
      entityType: 'trip_member',
      entityId: membership.id,
      action: 'member_joined',
      metadata: { displayName: user.display_name },
    });

    const owner = await tripMemberRepository.findOwnerMembership(client, trip.id);
    // owner is never null in practice (every trip has exactly one, set at
    // creation) but this guards against the joining user somehow being the
    // owner's own re-join, which existing ALREADY_MEMBER check above
    // already prevents anyway.
    if (owner && owner.user_id !== user.id) {
      await NotificationService.notifyUser(client, {
        userId: owner.user_id,
        tripId: trip.id,
        type: NotificationService.NOTIFICATION_TYPES.TRIP_MEMBER_JOINED,
        message: `${user.display_name} joined "${trip.name}".`,
      });
    }

    return { trip, membership };
  });
}

export async function listTripsForUser(user) {
  return tripRepository.findTripsForUser(pool, user.id);
}

export async function getTripDetail(tripId) {
  const trip = await tripRepository.findTripById(pool, tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  const members = await tripMemberRepository.listMembersForTrip(pool, tripId);
  const settlementUnits = await settlementUnitRepository.listVisibleUnitsForTrip(pool, tripId);
  const transferRequests = await transferRequestRepository.listRequestsForTrip(pool, tripId);
  return { trip, members, settlementUnits, transferRequests };
}

export async function listMembers(tripId) {
  return tripMemberRepository.listMembersForTrip(pool, tripId);
}

export async function createGroupUnit(tripId, displayName) {
  // 9.9.9 Batch 1 issues #1/#2: settlement-unit structure is part of the
  // ledger and must freeze the moment closure starts, same as expenses/
  // approvals. This function only receives tripId (not the caller's
  // membership), so the trip is fetched here specifically for this check.
  const trip = await tripRepository.findTripById(pool, tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  assertLedgerIsMutable(trip, 'create settlement groups');

  try {
    return await settlementUnitRepository.insertGroupUnit(pool, { tripId, displayName });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppError('A settlement unit with this name already exists in this trip', 409, 'GROUP_NAME_TAKEN');
    }
    throw err;
  }
}

// Issue #6: Requesting a transfer creates a pending request rather than immediately moving the member.
export async function requestTransfer(tripMember, targetUnitId) {
  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  assertLedgerIsMutable(trip, 'move between settlement units');

  const targetUnit = await settlementUnitRepository.findUnitById(pool, targetUnitId);
  if (!targetUnit || targetUnit.trip_id !== tripMember.tripId) {
    throw new AppError('Settlement unit not found in this trip', 404, 'SETTLEMENT_UNIT_NOT_FOUND');
  }

  if (targetUnit.archived_at) {
    throw new AppError('This settlement unit has been deleted and can no longer be joined', 410, 'SETTLEMENT_UNIT_ARCHIVED');
  }

  if (targetUnit.kind !== 'group') {
    throw new AppError('You can only move into a group settlement unit', 400, 'NOT_A_GROUP_UNIT');
  }

  const currentUnitId = tripMember.settlementUnitId || tripMember.settlement_unit_id;

  if (targetUnit.id === currentUnitId) {
    throw new AppError('You are already in this settlement unit', 400, 'ALREADY_IN_THIS_GROUP');
  }

  if (tripMember.role === 'owner') {
    const updatedMembership = await tripMemberRepository.updateMemberSettlementUnit(
      pool,
      tripMember.id,
      targetUnit.id
    );
    return { membership: updatedMembership };
  }

  const existingPending = await transferRequestRepository.findPendingRequestForMember(
    pool,
    tripMember.tripId,
    tripMember.id
  );
  if (existingPending) {
    throw new AppError(
      'You already have a pending transfer request for this trip',
      409,
      'TRANSFER_REQUEST_PENDING'
    );
  }

  return withTransaction(async (client) => {
    const transferRequest = await transferRequestRepository.insertTransferRequest(client, {
      tripId: tripMember.tripId,
      memberId: tripMember.id,
      fromUnitId: currentUnitId,
      toUnitId: targetUnit.id,
    });

    const owner = await tripMemberRepository.findOwnerMembership(client, tripMember.tripId);
    if (owner && owner.id !== tripMember.id) {
      const user = await userRepository.findById(tripMember.userId);
      await NotificationService.notifyUser(client, {
        userId: owner.user_id,
        tripId: tripMember.tripId,
        type: NotificationService.NOTIFICATION_TYPES.TRANSFER_REQUEST_CREATED,
        message: `${user ? user.display_name : 'A member'} requested to move to "${targetUnit.display_name}".`,
      });
    }

    return { transferRequest };
  });
}

export async function moveSelfToSettlementUnit(tripMember, targetUnitId) {
  return requestTransfer(tripMember, targetUnitId);
}

export async function listTransferRequests(tripId) {
  return transferRequestRepository.listRequestsForTrip(pool, tripId);
}

export async function approveTransferRequest(tripMember, requestId) {
  if (tripMember.role !== 'owner') {
    throw new AppError('Only the trip owner can approve transfer requests', 403, 'FORBIDDEN');
  }

  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  assertLedgerIsMutable(trip, 'approve settlement group transfer');

  const request = await transferRequestRepository.findRequestById(pool, requestId);
  if (!request || request.trip_id !== tripMember.tripId) {
    throw new AppError('Transfer request not found', 404, 'TRANSFER_REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('This transfer request has already been processed', 409, 'REQUEST_ALREADY_PROCESSED');
  }

  if (request.member_id === tripMember.id) {
    throw new AppError('A member cannot approve their own transfer request', 403, 'CANNOT_SELF_APPROVE');
  }

  const targetUnit = await settlementUnitRepository.findUnitById(pool, request.to_unit_id);
  if (!targetUnit || targetUnit.trip_id !== tripMember.tripId) {
    throw new AppError('Settlement unit not found in this trip', 404, 'SETTLEMENT_UNIT_NOT_FOUND');
  }

  if (targetUnit.archived_at) {
    throw new AppError('The target settlement unit has been archived', 410, 'SETTLEMENT_UNIT_ARCHIVED');
  }

  return withTransaction(async (client) => {
    const reqRow = await transferRequestRepository.findRequestByIdForUpdate(client, requestId);
    if (!reqRow || reqRow.status !== 'pending') {
      throw new AppError('This transfer request has already been processed', 409, 'REQUEST_ALREADY_PROCESSED');
    }

    const updatedMembership = await tripMemberRepository.updateMemberSettlementUnit(
      client,
      request.member_id,
      request.to_unit_id
    );

    const updatedRequest = await transferRequestRepository.updateRequestStatus(client, requestId, {
      status: 'approved',
      reviewedByMemberId: tripMember.id,
    });

    const targetMember = await tripMemberRepository.findMemberById(client, request.member_id);
    if (targetMember) {
      await NotificationService.notifyUser(client, {
        userId: targetMember.user_id,
        tripId: tripMember.tripId,
        type: NotificationService.NOTIFICATION_TYPES.TRANSFER_REQUEST_APPROVED,
        message: `Your transfer request to "${targetUnit.display_name}" was approved.`,
      });
    }

    return { transferRequest: updatedRequest, membership: updatedMembership };
  });
}

export async function rejectTransferRequest(tripMember, requestId) {
  if (tripMember.role !== 'owner') {
    throw new AppError('Only the trip owner can reject transfer requests', 403, 'FORBIDDEN');
  }

  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  assertLedgerIsMutable(trip, 'reject settlement group transfer');

  const request = await transferRequestRepository.findRequestById(pool, requestId);
  if (!request || request.trip_id !== tripMember.tripId) {
    throw new AppError('Transfer request not found', 404, 'TRANSFER_REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('This transfer request has already been processed', 409, 'REQUEST_ALREADY_PROCESSED');
  }

  if (request.member_id === tripMember.id) {
    throw new AppError('A member cannot approve or reject their own transfer request', 403, 'CANNOT_SELF_APPROVE');
  }

  return withTransaction(async (client) => {
    const reqRow = await transferRequestRepository.findRequestByIdForUpdate(client, requestId);
    if (!reqRow || reqRow.status !== 'pending') {
      throw new AppError('This transfer request has already been processed', 409, 'REQUEST_ALREADY_PROCESSED');
    }

    const updatedRequest = await transferRequestRepository.updateRequestStatus(client, requestId, {
      status: 'rejected',
      reviewedByMemberId: tripMember.id,
    });

    const targetMember = await tripMemberRepository.findMemberById(client, request.member_id);
    if (targetMember) {
      const targetUnit = await settlementUnitRepository.findUnitById(client, request.to_unit_id);
      await NotificationService.notifyUser(client, {
        userId: targetMember.user_id,
        tripId: tripMember.tripId,
        type: NotificationService.NOTIFICATION_TYPES.TRANSFER_REQUEST_REJECTED,
        message: `Your transfer request to "${targetUnit ? targetUnit.display_name : 'group'}" was rejected.`,
      });
    }

    return { transferRequest: updatedRequest };
  });
}

// 9.9.9 QA fix #5: destructive, owner-only, password-gated trip deletion.
//
// tripMember is the caller's OWN membership row (req.tripMember, from
// requireTripMembership) - same convention as moveSelfToSettlementUnit
// above. Authorization is role-based (only 'owner' may proceed), not
// identity-based, matching the existing finalizeSettlement/
// configureApprovalRules "owner or admin" pattern in
// SettlementService.js/ExpenseApprovalService.js - here it's owner-only,
// since destroying the whole trip is a strictly higher-stakes action
// than finalizing or configuring it.
//
// Password verification reuses comparePassword (utils/password.js) -
// the exact same check loginWithPassword uses - against the CALLER's own
// stored hash (via the new userRepository.findByIdWithSecrets), not
// anything client-supplied about identity. A Google-only account (no
// password_hash) can't satisfy this and is told so explicitly, the same
// way loginWithPassword already handles that case.
export async function deleteTrip(tripMember, authUser, password) {
  if (tripMember.role !== 'owner') {
    throw new AppError('Only the trip owner can delete this trip', 403, 'FORBIDDEN');
  }

  const userWithSecrets = await userRepository.findByIdWithSecrets(authUser.id);
  if (!userWithSecrets) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (!userWithSecrets.password_hash) {
    throw new AppError(
      'This account uses Google Sign-In and has no password to verify. Deleting a trip by password confirmation isn\u2019t available for this account yet.',
      401,
      'PASSWORD_LOGIN_UNAVAILABLE'
    );
  }

  const passwordMatches = await comparePassword(password, userWithSecrets.password_hash);
  if (!passwordMatches) {
    throw new AppError('Incorrect password', 401, 'INVALID_CREDENTIALS');
  }

  return withTransaction(async (client) => {
    // Row lock first (same convention as TripClosureService's use of
    // findTripByIdForUpdate) so a concurrent request against this same
    // trip can't interleave with the cascade below.
    const trip = await tripRepository.findTripByIdForUpdate(client, tripMember.tripId);
    if (!trip) {
      throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
    }

    const deleted = await tripRepository.deleteTripCascade(client, trip.id);
    if (!deleted) {
      // Can't actually happen given the row lock above, but fail loudly
      // rather than silently reporting success if it ever did.
      throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
    }

    return { deleted: true };
  });
}

// 9.9.9 QA fix #7: owner-only. Deletes an empty group unit outright when
// safe, or archives it when historical references make a hard delete
// unsafe - see the archived_at migration's comment for the full FK
// reasoning. tripMember is the caller's own membership row, same
// convention as moveSelfToSettlementUnit/deleteTrip above.
export async function deleteOrArchiveSettlementUnit(tripMember, unitId) {
  if (tripMember.role !== 'owner') {
    throw new AppError('Only the trip owner can delete a settlement unit', 403, 'FORBIDDEN');
  }

  const trip = await tripRepository.findTripById(pool, tripMember.tripId);
  if (!trip) {
    throw new AppError('Trip not found', 404, 'TRIP_NOT_FOUND');
  }
  // Same ledger-freeze guard as createGroupUnit/moveSelfToSettlementUnit
  // above - deleting a settlement unit is exactly the kind of
  // settlement-structure mutation that must stop the moment closure
  // starts.
  assertLedgerIsMutable(trip, 'delete settlement groups');

  const unit = await settlementUnitRepository.findUnitById(pool, unitId);
  if (!unit || unit.trip_id !== tripMember.tripId) {
    throw new AppError('Settlement unit not found in this trip', 404, 'SETTLEMENT_UNIT_NOT_FOUND');
  }

  if (unit.archived_at) {
    throw new AppError('This settlement unit has already been deleted', 409, 'SETTLEMENT_UNIT_ALREADY_ARCHIVED');
  }

  // Individual units are auto-created 1:1 with a trip member and aren't
  // a user-managed "group" concept at all - deleting one isn't a
  // meaningful action a person can take from the UI.
  if (unit.kind !== 'group') {
    throw new AppError('Individual settlement units cannot be deleted', 400, 'CANNOT_DELETE_INDIVIDUAL_UNIT');
  }

  const activeMemberCount = await settlementUnitRepository.countActiveMembersInUnit(pool, unitId);
  if (activeMemberCount > 0) {
    throw new AppError(
      'This settlement unit still has active members and cannot be deleted',
      409,
      'SETTLEMENT_UNIT_HAS_MEMBERS'
    );
  }

  const hasHistory = await settlementUnitRepository.hasHistoricalReferences(pool, unitId);
  if (hasHistory) {
    const archived = await settlementUnitRepository.archiveUnit(pool, unitId);
    return { settlementUnit: archived, archived: true };
  }

  await settlementUnitRepository.hardDeleteUnit(pool, unitId);
  return { settlementUnit: null, archived: false };
}
