import * as ExpenseService from '../services/ExpenseService.js';

export async function createExpense(req, res, next) {
  try {
    const result = await ExpenseService.createExpense(req.tripMember, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listExpenses(req, res, next) {
  try {
    const { status } = req.query;
    const expenses = await ExpenseService.listExpenses(req.tripMember.tripId, { status });
    res.status(200).json({ expenses });
  } catch (err) {
    next(err);
  }
}

export async function getExpenseDetail(req, res, next) {
  try {
    const result = await ExpenseService.getExpenseDetail(req.tripMember.tripId, req.params.expenseId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateExpense(req, res, next) {
  try {
    const result = await ExpenseService.updateExpense(req.tripMember, req.params.expenseId, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
