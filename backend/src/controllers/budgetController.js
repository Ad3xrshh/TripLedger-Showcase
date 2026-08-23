import * as BudgetService from '../services/BudgetService.js';

export async function getBudgetSummary(req, res, next) {
  try {
    const summary = await BudgetService.getBudgetSummary(req.tripMember.tripId);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}
