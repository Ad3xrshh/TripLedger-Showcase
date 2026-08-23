import { formatMoneyMinor } from '../../utils/format.js';
import { EmptyState } from '../ui/EmptyState.jsx';

/**
 * Renders the minimized "who pays whom" transaction list exactly as
 * returned by the backend (either the live preview's `transactions` or
 * the locked-in finalized settlement's `transactions` - same shape either
 * way: fromSettlementUnitId/Name, toSettlementUnitId/Name, amountMinor).
 * Zero transactions is a legitimate, non-error outcome for a perfectly
 * balanced trip.
 */
export function SettlementTransactions({ transactions, currency }) {
  if (transactions.length === 0) {
    return <EmptyState compact tone="positive" title="All settled" description="No payments are required between members." />;
  }

  return (
    <ul className="settlement-transactions">
      {transactions.map((t, i) => (
        <li key={t.id ?? `${t.fromSettlementUnitId}-${t.toSettlementUnitId}-${i}`} className="settlement-transactions__row">
          <div className="settlement-transactions__parties">
            <span className="settlement-transactions__from">{t.fromSettlementUnitName ?? 'Unknown'}</span>
            <span className="settlement-transactions__arrow" aria-hidden="true">→</span>
            <span className="visually-hidden"> owes </span>
            <span className="settlement-transactions__to">{t.toSettlementUnitName ?? 'Unknown'}</span>
          </div>
          <span className="settlement-transactions__amount">{formatMoneyMinor(t.amountMinor, currency)}</span>
        </li>
      ))}
    </ul>
  );
}
