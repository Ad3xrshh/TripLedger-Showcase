import apiClient from './client.js';

/**
 * Thin wrappers around /api/trips/:tripId/closure/*, mirroring the backend
 * exactly (see backend/src/routes/closureRoutes.js,
 * tripClosureController.js and services/TripClosureService.js).
 *
 * Phase 9.6 scope note: the full closure workflow (confirming
 * 'final_settlement', the closed-trip UI, closure timeline) is Phase 9.7.
 * This file only exposes what settlement finalization actually depends on -
 * SettlementService.finalizeSettlement refuses with 409
 * EXPENSES_NOT_COMPLETE until every active member has confirmed the
 * 'expenses_complete' stage, so the settlement UI needs read access to
 * that progress and a way for the current member to confirm it themselves.
 * Nothing here confirms 'final_settlement' or renders a closure timeline.
 */

// GET /api/trips/:tripId/closure
//   -> { tripId, status, settlementFinalized,
//        stages: { expenses_complete: { confirmedCount, totalActiveMembers,
//                    allConfirmed, missingMemberIds },
//                  final_settlement: { ...same shape } } }
export async function getClosureStatus(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/closure`);
  return data;
}

// POST /api/trips/:tripId/closure/confirmations  { stage } -> closure status
//   (same shape as getClosureStatus, plus { alreadyConfirmed, confirmedStage })
// Self-service only - the backend always resolves the confirming member
// from req.tripMember, never from the request body. Confirming a stage
// twice is a no-op, not an error.
export async function confirmClosureStage(tripId, stage) {
  const { data } = await apiClient.post(`/trips/${tripId}/closure/confirmations`, { stage });
  return data;
}
