import { formatDateTime, formatMoneyMinor } from '../../utils/format.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { TicketDivider } from '../ui/TicketDivider.jsx';
import './TripClosurePanel.css';

/**
 * Rendered by TripClosurePanel once closureStatus.status === 'closed' -
 * i.e. every active member has confirmed both 'expenses_complete' and
 * 'final_settlement' (see TripClosureService.confirmStage, which is the
 * only place trip.status ever becomes 'closed'). Read-only: this component
 * has no mutation actions at all, matching the backend, which now rejects
 * expense/approval-rule mutations on a closed trip with 409
 * TRIP_ALREADY_CLOSED (ExpenseService, ExpenseApprovalService).
 */
export function TripClosedState({ closureStatus, finalizedSettlement, currency, nameByMemberId }) {
  const finalStage = closureStatus.stages?.final_settlement;
  const memberIds = [...nameByMemberId.keys()];

  return (
    <section className="trip-closure-panel trip-closure-panel--closed">
      <div className="trip-closure-panel__closed-header">
        <span className="trip-closure-panel__closed-icon" aria-hidden="true">
          {'\u{1F512}'}
        </span>
        <h2 className="trip-closure-panel__title">Trip closed</h2>
      </div>

      <p className="trip-closure-panel__hint">
        This trip has been finalized and is now read-only. Expenses, approval rules, and settlement configuration
        can no longer be changed — the trip's history, dashboard, and settlement remain viewable below.
      </p>

      <TicketDivider />

      <dl className="trip-closure-panel__closed-facts">
        <div className="trip-closure-panel__closed-fact">
          <dt>Settlement</dt>
          <dd>{closureStatus.settlementFinalized ? '\u2713 Finalized' : 'Unavailable'}</dd>
        </div>
        <div className="trip-closure-panel__closed-fact">
          <dt>Final settlement</dt>
          <dd>
            {finalStage?.allConfirmed
              ? '\u2713 Confirmed by everyone'
              : finalStage
                ? `${finalStage.confirmedCount} of ${finalStage.totalActiveMembers} confirmed`
                : '\u2014'}
          </dd>
        </div>
        <div className="trip-closure-panel__closed-fact">
          <dt>Expenses</dt>
          <dd>{'\u{1F512} Locked'}</dd>
        </div>
      </dl>

      {finalizedSettlement && (
        <div className="trip-closure-panel__final-settlement">
          <h3 className="trip-closure-panel__section-title">Final settlement</h3>
          <p className="trip-closure-panel__hint">Finalized on {formatDateTime(finalizedSettlement.generatedAt)}.</p>

          {finalizedSettlement.transactions.length === 0 ? (
            <EmptyState compact tone="positive" title="All settled" description="Nobody was owed anything." />
          ) : (
            <ul className="trip-closure-panel__transactions">
              {finalizedSettlement.transactions.map((t) => (
                <li key={t.id} className="trip-closure-panel__transaction-row">
                  <span className="trip-closure-panel__transaction-parties">
                    {t.fromSettlementUnitName ?? '\u2014'}
                    <span className="trip-closure-panel__transaction-arrow" aria-hidden="true">
                      {' \u2192 '}
                    </span>
                    <span className="visually-hidden">owes </span>
                    {t.toSettlementUnitName ?? '\u2014'}
                  </span>
                  <span className="trip-closure-panel__transaction-amount">
                    {formatMoneyMinor(t.amountMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {memberIds.length > 0 && (
        <div className="trip-closure-panel__stage">
          <h3 className="trip-closure-panel__section-title">Confirmed by</h3>
          <ul className="trip-closure-panel__checklist">
            {memberIds.map((memberId) => (
              <li key={memberId} className="trip-closure-panel__checklist-item">
                <span
                  className="trip-closure-panel__checklist-mark trip-closure-panel__checklist-mark--done"
                  aria-hidden="true"
                >
                  {'\u2713'}
                </span>
                <span>{nameByMemberId.get(memberId)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
