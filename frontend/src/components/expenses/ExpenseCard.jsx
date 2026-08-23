import { Link } from 'react-router-dom';
import { ExpenseStatus } from './ExpenseStatus.jsx';
import { formatDateTime, formatMoneyMinor } from '../../utils/format.js';
import './ExpenseCard.css';

/**
 * Presentational card for one row from GET /api/trips/:tripId/expenses.
 * Only shows fields that endpoint actually returns (see
 * expenseRepository.js EXPENSE_COLUMNS) - participants aren't included in
 * the list response (only in expense detail), so they aren't shown here.
 *
 * payerName is resolved by the caller from the trip's member list (the
 * expense row itself only carries paid_by_member_id, not a display name).
 */
export function ExpenseCard({ tripId, expense, currency, payerName }) {
  return (
    <Link to={`/trips/${tripId}/expenses/${expense.id}`} className="card card--interactive expense-card">
      <div className="expense-card__top">
        <h3 className="expense-card__description">{expense.description}</h3>
        <ExpenseStatus status={expense.status} />
      </div>
      <p className="expense-card__amount">{formatMoneyMinor(expense.amount_minor, currency)}</p>
      <div className="expense-card__meta">
        <span>{payerName ? `Paid by ${payerName}` : 'Paid by \u2014'}</span>
        <span>·</span>
        <span>{formatDateTime(expense.occurred_at)}</span>
        <span className="expense-card__arrow" aria-hidden="true">
          &rarr;
        </span>
      </div>
      {expense.category && <span className="eyebrow expense-card__category">{expense.category}</span>}
    </Link>
  );
}
