import * as SettlementService from '../services/SettlementService.js';

export async function getSettlement(req, res, next) {
  try {
    const settlement = await SettlementService.getSettlementSummary(req.tripMember);
    res.status(200).json(settlement);
  } catch (err) {
    next(err);
  }
}

// Phase 8
export async function finalizeSettlement(req, res, next) {
  try {
    const result = await SettlementService.finalizeSettlement(req.tripMember);
    // 200 either way (this call created the finalized settlement, or it
    // already existed) - idempotent calls shouldn't report 201 the second
    // time around, since nothing was newly created on repeat calls.
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// Phase 8
export async function getFinalizedSettlement(req, res, next) {
  try {
    const settlement = await SettlementService.getFinalizedSettlement(req.tripMember);
    res.status(200).json(settlement);
  } catch (err) {
    next(err);
  }
}
