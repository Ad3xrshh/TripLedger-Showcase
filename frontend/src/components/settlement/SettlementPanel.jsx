import { useEffect, useState } from 'react';
import * as settlementApi from '../../api/settlement.js';
import * as closureApi from '../../api/closure.js';
import { useToast } from '../../hooks/useToast.js';
import { Button } from '../ui/Button.jsx';
import { ErrorState } from '../ui/ErrorState.jsx';
import { InlineError } from '../ui/InlineError.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { TicketDivider } from '../ui/TicketDivider.jsx';
import { humanizeErrorMessage, isRetryableError } from '../../utils/errorPresentation.js';
import { formatMoneyMinor, formatDateTime } from '../../utils/format.js';
import { SettlementBalances } from './SettlementBalances.jsx';
import { SettlementTransactions } from './SettlementTransactions.jsx';
import './SettlementPanel.css';

// Mirrors SettlementBalances.jsx's own STATUS_LABELS mapping
// ('receives' | 'owes' | 'settled', from SettlementService.formatSummary -
// never recomputed here) but phrased as a direct, first-person headline
// for the current member's own balance specifically.
const MY_BALANCE_HEADLINE = {
  receives: "YOU'RE OWED",
  owes: 'YOU OWE',
  settled: "YOU'RE SETTLED UP",
};

// Maps the actual AppError codes SettlementService/TripClosureService throw
// (see backend/src/services/SettlementService.js,
// backend/src/services/TripClosureService.js) to user-facing text. Nothing
// here is invented - every key is a real code found in the backend source.
const FINALIZE_ERROR_MESSAGES = {
  FORBIDDEN: 'You do not have permission to finalize this settlement.',
  TRIP_ALREADY_CLOSED: 'The trip has already been closed.',
  EXPENSES_NOT_COMPLETE:
    'All active trip members must confirm they\u2019re done adding expenses before the settlement can be finalized.',
  TRIP_NOT_FOUND: 'This trip doesn\u2019t exist, or you\u2019re not a member of it.',
};

const CONFIRM_ERROR_MESSAGES = {
  TRIP_ALREADY_CLOSED: 'The trip has already been closed.',
  TRIP_NOT_FOUND: 'This trip doesn\u2019t exist, or you\u2019re not a member of it.',
};

/**
 * Exposes the already-built, already-tested Phase 7/8 settlement system
 * through the UI. Every number shown here - balances, fair shares, the
 * minimized who-pays-whom transaction list - is computed server-side by
 * SettlementService; this component only requests it and renders it.
 *
 * Self-fetches (same convention as ExpenseVerificationPanel /
 * ApprovalRulesPanel) rather than depending on the dashboard payload,
 * since settlement isn't part of DashboardService's response.
 *
 * Scope note (Phase 9.6): this also surfaces the minimum closure-stage
 * piece that finalization actually depends on - progress on the
 * 'expenses_complete' confirmation, and a way for the current member to
 * confirm it themselves - because finalizeSettlement hard-refuses with
 * 409 EXPENSES_NOT_COMPLETE otherwise. It does not confirm
 * 'final_settlement' or render any closed-trip/closure-timeline UI; that's
 * Phase 9.7.
 */
export function SettlementPanel({ tripId, currency, myMemberId, myRole, mySettlementUnitId }) {
  const [preview, setPreview] = useState(null);
  const [closureStatus, setClosureStatus] = useState(null);
  const [finalizedSettlement, setFinalizedSettlement] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadToken, setLoadToken] = useState(0);

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setClosureStatus(null);
    setFinalizedSettlement(null);
    setLoadError(null);
    setFinalizeError(null);
    setConfirmError(null);

    Promise.all([settlementApi.getSettlementPreview(tripId), closureApi.getClosureStatus(tripId)])
      .then(async ([previewData, closureData]) => {
        if (cancelled) return;
        setPreview(previewData);
        setClosureStatus(closureData);

        if (closureData.settlementFinalized) {
          try {
            const finalData = await settlementApi.getFinalizedSettlement(tripId);
            if (!cancelled) setFinalizedSettlement(finalData);
          } catch (err) {
            // Defensive only: closureStatus just said it's finalized, so
            // this shouldn't 404 in practice. If it somehow does, fall
            // back to the live preview's transactions rather than
            // blocking the whole panel on it.
            if (!cancelled && err.code !== 'SETTLEMENT_NOT_FINALIZED') setLoadError(err);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, loadToken]);

  function refresh() {
    setLoadToken((t) => t + 1);
  }

  async function handleConfirmExpensesComplete() {
    if (isConfirming) return;
    setConfirmError(null);
    setIsConfirming(true);
    try {
      await closureApi.confirmClosureStage(tripId, 'expenses_complete');
      refresh();
      toast.success('Confirmed - you\u2019re done adding expenses');
    } catch (err) {
      setConfirmError(CONFIRM_ERROR_MESSAGES[err.code] || humanizeErrorMessage(err));
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleFinalize() {
    if (isFinalizing) return;
    setFinalizeError(null);
    setIsFinalizing(true);
    try {
      await settlementApi.finalizeSettlement(tripId);
      setIsFinalizeDialogOpen(false);
      refresh();
      toast.success('Settlement finalized');
    } catch (err) {
      setFinalizeError(FINALIZE_ERROR_MESSAGES[err.code] || humanizeErrorMessage(err));
    } finally {
      setIsFinalizing(false);
    }
  }

  if (loadError) {
    // A missing trip won't reappear on retry - a stale trip context, or a
    // membership that no longer exists, doesn't fix itself by re-asking.
    const isNotFound = loadError.code === 'TRIP_NOT_FOUND';
    return (
      <section className="card card--lg settlement-panel">
        <h2 className="settlement-panel__title">Settlement</h2>
        <ErrorState
          compact
          title={
            isNotFound ? 'This trip doesn\u2019t exist, or you\u2019re not a member of it.' : loadError.message
          }
          onRetry={!isNotFound && isRetryableError(loadError) ? refresh : undefined}
        />
      </section>
    );
  }

  if (!preview || !closureStatus) {
    return (
      <section className="card card--lg settlement-panel" aria-busy="true">
        <h2 className="settlement-panel__title">Settlement</h2>
        <span className="visually-hidden" role="status">
          Loading settlement…
        </span>
        <div className="skeleton-stack" aria-hidden="true">
          <span className="skeleton skeleton--text" style={{ width: '45%', height: '1.5em' }} />
          <span className="skeleton skeleton--text" style={{ width: '70%' }} />
          <span className="skeleton skeleton--text" style={{ width: '55%' }} />
        </div>
      </section>
    );
  }

  const isFinalized = closureStatus.settlementFinalized;
  const expensesStage = closureStatus.stages?.expenses_complete;
  const iHaveConfirmed = expensesStage ? !expensesStage.missingMemberIds.includes(myMemberId) : true;
  const canShowFinalizeButton = !isFinalized && (myRole === 'owner' || myRole === 'admin');
  const transactionsToShow =
    isFinalized && finalizedSettlement ? finalizedSettlement.transactions : preview.transactions;
  // Same balances array SettlementBalances renders below - this just picks
  // out the current member's own row so their position doesn't require
  // scanning the full list to find. No new calculation: status and
  // netBalanceMinor are both already computed server-side.
  const myBalance = mySettlementUnitId ? preview.balances.find((b) => b.settlementUnitId === mySettlementUnitId) : null;

  return (
    <section className="card card--lg settlement-panel">
      <div className="settlement-panel__header">
        <h2 className="settlement-panel__title">Settlement</h2>
        <span className={`settlement-panel__badge settlement-panel__badge--${isFinalized ? 'final' : 'preview'}`}>
          {isFinalized ? 'Finalized' : 'Preview'}
        </span>
      </div>

      {myBalance && (
        <div className={`settlement-panel__my-balance settlement-panel__my-balance--${myBalance.status}`}>
          <span className="eyebrow settlement-panel__my-balance-label">{MY_BALANCE_HEADLINE[myBalance.status]}</span>
          <span className="settlement-panel__my-balance-value">
            {myBalance.status === 'settled' ? '\u2014' : formatMoneyMinor(Math.abs(myBalance.netBalanceMinor), currency)}
          </span>
        </div>
      )}

      <TicketDivider />

      <div className="settlement-panel__summary">
        <div className="settlement-panel__summary-stat">
          <span className="settlement-panel__summary-value">
            {formatMoneyMinor(
              isFinalized && finalizedSettlement
                ? finalizedSettlement.totalExpenseMinor
                : preview.totalVerifiedExpensesMinor,
              currency
            )}
          </span>
          <span className="settlement-panel__summary-label">Total verified expenses</span>
        </div>
        <div className="settlement-panel__summary-stat">
          <span className="settlement-panel__summary-value">{preview.settlementUnitCount}</span>
          <span className="settlement-panel__summary-label">Settlement units</span>
        </div>
      </div>

      {isFinalized && finalizedSettlement && (
        <p className="settlement-panel__hint">
          Finalized on {formatDateTime(finalizedSettlement.generatedAt)}. These numbers are locked in and won\u2019t
          change even if expenses are edited later.
        </p>
      )}

      <div className="settlement-panel__section">
        <h3 className="settlement-panel__section-title">Balances</h3>
        <SettlementBalances balances={preview.balances} currency={currency} myUnitId={mySettlementUnitId} />
      </div>

      <div className="settlement-panel__section">
        <h3 className="settlement-panel__section-title">Who pays whom</h3>
        <SettlementTransactions transactions={transactionsToShow} currency={currency} />
      </div>

      {!isFinalized && (
        <div className="settlement-panel__finalize">
          <h3 className="settlement-panel__section-title">Ready to finalize?</h3>
          <p className="settlement-panel__hint">
            {expensesStage
              ? `${expensesStage.confirmedCount} of ${expensesStage.totalActiveMembers} members have confirmed they\u2019re done adding expenses.`
              : 'Waiting on member confirmations.'}
          </p>

          {confirmError && <InlineError>{confirmError}</InlineError>}

          {!iHaveConfirmed && (
            <Button variant="secondary" onClick={handleConfirmExpensesComplete} disabled={isConfirming} isLoading={isConfirming}>
              {isConfirming ? 'Confirming\u2026' : 'I\u2019m done adding expenses'}
            </Button>
          )}

          {finalizeError && !isFinalizeDialogOpen && <InlineError>{finalizeError}</InlineError>}

          {canShowFinalizeButton && (
            <Button
              variant="primary"
              onClick={() => setIsFinalizeDialogOpen(true)}
              disabled={isFinalizing || !expensesStage?.allConfirmed}
            >
              Finalize settlement
            </Button>
          )}

          {!canShowFinalizeButton && myRole && (
            <p className="settlement-panel__hint">Only the trip owner or an admin can finalize the settlement.</p>
          )}

          <ConfirmDialog
            open={isFinalizeDialogOpen}
            title="Finalize the settlement?"
            description="This locks in exactly who owes what, using the currently verified expenses. Once finalized, these amounts won't change even if expenses are edited or added later - this can't be undone."
            confirmLabel="Finalize settlement"
            cancelLabel="Cancel"
            tone="danger"
            isLoading={isFinalizing}
            onConfirm={handleFinalize}
            onCancel={() => setIsFinalizeDialogOpen(false)}
          >
            {finalizeError && <InlineError>{finalizeError}</InlineError>}
          </ConfirmDialog>
        </div>
      )}
    </section>
  );
}
