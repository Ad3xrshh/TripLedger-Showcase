import * as ExpenseApprovalService from '../services/ExpenseApprovalService.js';

export async function approveExpense(req, res, next) {
  try {
    const result = await ExpenseApprovalService.approveExpense(req.tripMember, req.params.expenseId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function rejectExpense(req, res, next) {
  try {
    const reason = req.body?.reason;
    const result = await ExpenseApprovalService.rejectExpense(req.tripMember, req.params.expenseId, reason);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getVerificationDetails(req, res, next) {
  try {
    const result = await ExpenseApprovalService.getVerificationDetails(req.tripMember, req.params.expenseId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createApprovalRule(req, res, next) {
  try {
    const rule = await ExpenseApprovalService.createApprovalRule(req.tripMember, req.body);
    res.status(201).json({ rule });
  } catch (err) {
    next(err);
  }
}

export async function listApprovalRules(req, res, next) {
  try {
    const rules = await ExpenseApprovalService.listApprovalRules(req.tripMember);
    res.status(200).json({ rules });
  } catch (err) {
    next(err);
  }
}
