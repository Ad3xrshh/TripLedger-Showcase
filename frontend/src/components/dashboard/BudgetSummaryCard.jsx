import { formatBudgetStatus, formatBudgetType, formatMoneyMinor, formatPercentageUsed } from '../../utils/format.js';
import './DashboardCards.css';
import './BudgetSummaryCard.css';

/**
 * Renders exactly what BudgetService.getBudgetSummary returns (see
 * backend/src/services/BudgetService.js) - never recomputes a percentage
 * or a status. The two response shapes it actually returns:
 *
 *   unlimited:      { budgetType, totalVerifiedMinor }
 *   fixed_total /
 *   fixed_per_person: { budgetType, budgetAmountMinor, totalVerifiedMinor,
 *                        percentageUsed, status }
 *
 * "Remaining" is a plain integer subtraction of two backend-provided minor
 * amounts for display only - it is not a threshold decision, so it stays
 * safe to compute here (status/color always come straight from `status`).
 */
export function BudgetSummaryCard({ budget, currency }) {
  const isUnlimited = budget.budgetType === 'unlimited';
  const remainingMinor = isUnlimited ? null : budget.budgetAmountMinor - budget.totalVerifiedMinor;

  return (
    <div className="card dashboard-card">
      <h2 className="dashboard-card__title">Budget</h2>

      <div className="budget-summary__headline">
        <span className="budget-summary__headline-label">{formatBudgetType(budget.budgetType)}</span>
        <span className="budget-summary__headline-value">
          {isUnlimited ? 'Unlimited' : formatMoneyMinor(budget.budgetAmountMinor, currency)}
        </span>
      </div>

      {!isUnlimited && (
        <div className="budget-summary__bar-track" role="progressbar" aria-valuenow={Math.min(budget.percentageUsed, 100)} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`budget-summary__bar-fill budget-summary__bar-fill--${budget.status}`}
            style={{ width: `${Math.min(budget.percentageUsed, 100)}%` }}
          />
        </div>
      )}

      <div className="budget-summary__stats">
        <div className="budget-summary__stat">
          <span className="budget-summary__stat-label">Spent</span>
          <span className="budget-summary__stat-value">{formatMoneyMinor(budget.totalVerifiedMinor, currency)}</span>
        </div>
        {!isUnlimited && (
          <div className="budget-summary__stat">
            <span className="budget-summary__stat-label">Remaining</span>
            <span className="budget-summary__stat-value">{formatMoneyMinor(remainingMinor, currency)}</span>
          </div>
        )}
      </div>

      {isUnlimited ? (
        <p className="budget-summary__note">No fixed spending limit for this trip.</p>
      ) : (
        <div className="budget-summary__footer">
          <span>{formatPercentageUsed(budget.percentageUsed)} used</span>
          <span className={`budget-summary__status budget-summary__status--${budget.status}`}>
            {formatBudgetStatus(budget.status)}
          </span>
        </div>
      )}
    </div>
  );
}
