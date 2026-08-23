import * as DashboardService from '../services/DashboardService.js';

export async function getDashboard(req, res, next) {
  try {
    const dashboard = await DashboardService.getDashboard(req.tripMember);
    res.status(200).json(dashboard);
  } catch (err) {
    next(err);
  }
}
