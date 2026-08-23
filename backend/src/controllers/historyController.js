import * as HistoryService from '../services/HistoryService.js';

export async function listHistory(req, res, next) {
  try {
    const result = await HistoryService.listHistory(req.tripMember.tripId, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
