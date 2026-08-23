import * as TripClosureService from '../services/TripClosureService.js';

export async function confirmStage(req, res, next) {
  try {
    const { stage } = req.body;
    const result = await TripClosureService.confirmStage(req.tripMember, stage);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getClosureStatus(req, res, next) {
  try {
    const status = await TripClosureService.getClosureStatus(req.tripMember);
    res.status(200).json(status);
  } catch (err) {
    next(err);
  }
}
