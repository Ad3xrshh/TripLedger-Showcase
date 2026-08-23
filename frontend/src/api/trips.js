import apiClient from './client.js';

/**
 * Thin wrappers around /api/trips/*, mirroring the backend exactly
 * (see backend/src/routes/tripRoutes.js and tripController.js).
 * No business logic lives here - only request shaping and response
 * unwrapping. Response rows are returned as-is (snake_case), matching
 * the backend's actual column names - no camelCase transform layer.
 */

// POST /api/trips  -> { trip, membership }
// tripInput: { name, startDate?, endDate?, currency?, budgetType,
//              budgetAmountMinor?, fairShareMethod, verificationMode }
export async function createTrip(tripInput) {
  const { data } = await apiClient.post('/trips', tripInput);
  return data;
}

// GET /api/trips  -> trips[] (each row also carries my_role, my_settlement_unit_id)
export async function listMyTrips() {
  const { data } = await apiClient.get('/trips');
  return data.trips;
}

// POST /api/trips/join  { joinCode } -> { trip, membership }
export async function joinTrip(joinCode) {
  const { data } = await apiClient.post('/trips/join', { joinCode });
  return data;
}

// GET /api/trips/:tripId  -> { trip, members, settlementUnits }
export async function getTripDetail(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}`);
  return data;
}

// GET /api/trips/:tripId/members  -> member[]
export async function listMembers(tripId) {
  const { data } = await apiClient.get(`/trips/${tripId}/members`);
  return data.members;
}

// POST /api/trips/:tripId/settlement-units  { displayName } -> settlementUnit
export async function createSettlementUnit(tripId, displayName) {
  const { data } = await apiClient.post(`/trips/${tripId}/settlement-units`, { displayName });
  return data.settlementUnit;
}

// PATCH /api/trips/:tripId/members/me/settlement-unit  { settlementUnitId } -> membership
export async function updateMySettlementUnit(tripId, settlementUnitId) {
  const { data } = await apiClient.patch(`/trips/${tripId}/members/me/settlement-unit`, {
    settlementUnitId,
  });
  return data.membership;
}

// DELETE /api/trips/:tripId  { password } -> 204 No Content
// Owner-only, password-gated, permanent (see TripService.deleteTrip).
export async function deleteTrip(tripId, password) {
  await apiClient.delete(`/trips/${tripId}`, { data: { password } });
}

// DELETE /api/trips/:tripId/settlement-units/:unitId -> { settlementUnit, archived }
// Owner-only, and only when the unit currently has 0 active members (see
// TripService.deleteOrArchiveSettlementUnit). `archived` tells the caller
// which of the two safe outcomes happened: hard-deleted (never used in
// any expense) or archived (has historical references worth preserving).
export async function deleteSettlementUnit(tripId, unitId) {
  const { data } = await apiClient.delete(`/trips/${tripId}/settlement-units/${unitId}`);
  return data;
}
