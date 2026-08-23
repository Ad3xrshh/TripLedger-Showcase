import { formatExpenseStatus } from '../../utils/format.js';
import './ExpenseStatus.css';

// Separate from components/trips/StatusBadge.jsx because expense statuses
// (pending/verified/disputed/rejected/locked) are a different enum from
// trip statuses (active/closing/closed) - see
// backend/src/services/ExpenseService.js EXPENSE_STATUSES.
export function ExpenseStatus({ status }) {
  return <span className={`badge expense-status expense-status--${status}`}>{formatExpenseStatus(status)}</span>;
}
