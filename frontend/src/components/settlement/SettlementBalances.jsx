import { formatMoneyMinor } from '../../utils/format.js';
import { EmptyState } from '../ui/EmptyState.jsx';

// Mirrors SettlementService.formatSummary's status field exactly
// ('receives' | 'owes' | 'settled', derived server-side from
// netBalanceMinor's sign) - never recomputed here.
const STATUS_LABELS = {
  receives: 'Gets back',
  owes: 'Owes',
  settled: 'Settled',
};

/**
 * Renders the balances array from GET .../settlement as-is. Each row is a
 * settlement unit (an individual member, or a group like "Family A"), not
 * necessarily a single user - unit.name and the netBalanceMinor sign both
 * come straight from the backend.
 */
export function SettlementBalances({ balances, currency, myUnitId }) {
  if (balances.length === 0) {
    return <EmptyState compact title="No settlement units yet" description="Balances will appear here once members join this trip." />;
  }

  return (
    <ul className="settlement-balances">
      {balances.map((b) => (
        <li
          key={b.settlementUnitId}
          className={`settlement-balances__row settlement-balances__row--${b.status}`}
        >
          <span className="settlement-balances__name">
            {b.name ?? 'Unknown'}
            {myUnitId && b.settlementUnitId === myUnitId && (
              <span className="settlement-balances__you-tag">You</span>
            )}
          </span>
          <span className="settlement-balances__status">{STATUS_LABELS[b.status] || b.status}</span>
          <span className="settlement-balances__amount">
            {formatMoneyMinor(Math.abs(b.netBalanceMinor), currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}
