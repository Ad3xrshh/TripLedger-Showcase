import * as TripService from '../services/TripService.js';

export async function createTrip(req, res, next) {
  try {
    const { trip, membership } = await TripService.createTrip(req.user, req.body);
    res.status(201).json({ trip, membership });
  } catch (err) {
    next(err);
  }
}

export async function joinTrip(req, res, next) {
  try {
    const { trip, membership } = await TripService.joinTrip(req.user, req.body.joinCode);
    res.status(200).json({ trip, membership });
  } catch (err) {
    next(err);
  }
}

export async function listMyTrips(req, res, next) {
  try {
    const trips = await TripService.listTripsForUser(req.user);
    res.status(200).json({ trips });
  } catch (err) {
    next(err);
  }
}

export async function getTripDetail(req, res, next) {
  try {
    const detail = await TripService.getTripDetail(req.tripMember.tripId);
    res.status(200).json(detail);
  } catch (err) {
    next(err);
  }
}

export async function listMembers(req, res, next) {
  try {
    const members = await TripService.listMembers(req.tripMember.tripId);
    res.status(200).json({ members });
  } catch (err) {
    next(err);
  }
}

export async function createSettlementUnit(req, res, next) {
  try {
    const unit = await TripService.createGroupUnit(req.tripMember.tripId, req.body.displayName);
    res.status(201).json({ settlementUnit: unit });
  } catch (err) {
    next(err);
  }
}

export async function updateMySettlementUnit(req, res, next) {
  try {
    const membership = await TripService.moveSelfToSettlementUnit(req.tripMember, req.body.settlementUnitId);
    res.status(200).json({ membership });
  } catch (err) {
    next(err);
  }
}

export async function deleteTrip(req, res, next) {
  try {
    await TripService.deleteTrip(req.tripMember, req.user, req.body.password);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function deleteSettlementUnit(req, res, next) {
  try {
    const result = await TripService.deleteOrArchiveSettlementUnit(req.tripMember, req.params.unitId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
