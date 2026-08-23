import pool from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import * as tripMemberRepository from '../repositories/tripMemberRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Requires the authenticated user (req.user, set by requireAuth) to be an
 * active member of the trip identified by :tripId. Attaches
 * req.tripMember = { id, tripId, role, settlementUnitId } for downstream
 * handlers.
 *
 * Deliberately returns 404 (not 403) whether the trip doesn't exist or the
 * user isn't a member of it — we don't want to let a request confirm the
 * existence of a trip it isn't part of. Must run AFTER requireAuth.
 */
export async function requireTripMembership(req, res, next) {
  try {
    const { tripId } = req.params;

    if (!UUID_REGEX.test(tripId)) {
      return next(new AppError('Trip not found', 404, 'TRIP_NOT_FOUND'));
    }

    const membership = await tripMemberRepository.findMembership(pool, tripId, req.user.id);

    if (!membership) {
      return next(new AppError('Trip not found', 404, 'TRIP_NOT_FOUND'));
    }

    req.tripMember = {
      id: membership.id,
      tripId: membership.trip_id,
      role: membership.role,
      settlementUnitId: membership.settlement_unit_id,
    };
    next();
  } catch (err) {
    next(err);
  }
}
