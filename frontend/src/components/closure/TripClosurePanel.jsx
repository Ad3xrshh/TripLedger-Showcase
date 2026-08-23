import { useEffect, useState } from 'react';
import * as closureApi from '../../api/closure.js';
import * as settlementApi from '../../api/settlement.js';
import { useToast } from '../../hooks/useToast.js';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ErrorState } from '../ui/ErrorState.jsx';
import { InlineError } from '../ui/InlineError.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { humanizeErrorMessage, isRetryableError } from '../../utils/errorPresentation.js';
import { formatDateTime, formatMoneyMinor } from '../../utils/format.js';
import { TripClosedState } from './TripClosedState.jsx';
import './TripClosurePanel.css';

// Maps the actual AppError codes TripClosureService/SettlementService throw
// (see backend/src/services/TripClosureService.js,
// backend/src/services/SettlementService.js) to user-facing text. Nothing
// here is invented - every key is a real code found in the backend source.
const CONFIRM_ERROR_MESSAGES = {
  TRIP_ALREADY_CLOSED: 'The trip has already been closed.',
  TRIP_NOT_FOUND: 'This trip doesn\u2019t exist, or you\u2019re not a member of it.',
  SETTLEMENT_NOT_FINALIZED: 'The settlement must be finalized before final settlement can be confirmed.',
  VALIDATION_ERROR: 'That confirmation stage isn\u2019t recognized.',
};

/**
 * Phase 9.7: the trip closure workflow (ACTIVE -> CLOSING -> CLOSED),
 * built entirely on the already-tested Phase 8 backend
 * (TripClosureService, SettlementService) - this component only requests
 * state and calls the two existing closure endpoints
 * (GET/POST /api/trips/:tripId/closure...) plus the read-only
 * GET /api/trips/:tripId/settlement/final. No fair-share math, no
 * eligibility rules, and no state-transition logic live here; the backend
 * decides all of that and this panel just reflects it.
 *
 * Self-fetches (same convention as SettlementPanel / ExpenseVerificationPanel
 * / ApprovalRulesPanel) rather than depending on the parent page's payload.
 *
 * Deliberately does NOT duplicate SettlementPanel's live balance preview or
 * its "finalize settlement" button (owner/admin action) - those already
 * exist and work. This panel picks up the piece SettlementPanel's own
 * scope note explicitly deferred: the 'expenses_complete' member checklist
 * (by name, not just a count), 'final_settlement' confirmation, and the
 * closed-trip read-only view.
 */
export function TripClosurePanel({ tripId, currency, myMemberId, members }) {
  const [closureStatus, setClosureStatus] = useState(null);
  const [finalizedSettlement, setFinalizedSettlement] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadToken, setLoadToken] = useState(0);

  const [confirmingStage, setConfirmingStage] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [isFinalConfirmDialogOpen, setIsFinalConfirmDialogOpen] = useState(false);

  const { toast } = useToast();

  const nameByMemberId = new Map(members.map((m) => [m.id, m.display_name]));

  useEffect(() => {
    let cancelled = false;
    setClosureStatus(null);
    setFinalizedSettlement(null);
    setLoadError(null);
    setConfirmError(null);

    closureApi
      .getClosureStatus(tripId)
      .then(async (status) => {
        if (cancelled) return;
        setClosureStatus(status);

        if (status.settlementFinalized) {
          try {
            const final = await settlementApi.getFinalizedSettlement(tripId);
            if (!cancelled) setFinalizedSettlement(final);
          } catch (err) {
            // Defensive only: closureStatus just said it's finalized, so
            // this shouldn't 404 in practice.
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

  async function handleConfirm(stage) {
    if (confirmingStage) return;
    setConfirmError(null);
    setConfirmingStage(stage);
    try {
      await closureApi.confirmClosureStage(tripId, stage);
      if (stage === 'final_settlement') setIsFinalConfirmDialogOpen(false);
      refresh();
      toast.success(
        stage === 'final_settlement' ? 'Confirmed final settlement' : 'Confirmed - you\u2019re done adding expenses'
      );
    } catch (err) {
      setConfirmError(CONFIRM_ERROR_MESSAGES[err.code] || humanizeErrorMessage(err));
    } finally {
      setConfirmingStage(null);
    }
  }

  if (loadError) {
    const isNotFound = loadError.code === 'TRIP_NOT_FOUND';
    return (
      <section className="card card--lg trip-closure-panel">
        <h2 className="trip-closure-panel__title">Trip closure</h2>
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

  if (!closureStatus) {
    return (
      <section className="card card--lg trip-closure-panel" aria-busy="true">
        <h2 className="trip-closure-panel__title">Trip closure</h2>
        <span className="visually-hidden" role="status">
          Loading closure status…
        </span>
        <div className="skeleton-stack" aria-hidden="true">
          <span className="skeleton skeleton--text" style={{ width: '60%', height: '1.4em' }} />
          <span className="skeleton skeleton--text" style={{ width: '80%' }} />
          <span className="skeleton skeleton--text" style={{ width: '50%' }} />
        </div>
      </section>
    );
  }

  if (closureStatus.status === 'closed') {
    return (
      <TripClosedState
        closureStatus={closureStatus}
        finalizedSettlement={finalizedSettlement}
        currency={currency}
        nameByMemberId={nameByMemberId}
      />
    );
  }

  const expensesStage = closureStatus.stages?.expenses_complete;
  const finalStage = closureStatus.stages?.final_settlement;
  const isFinalized = closureStatus.settlementFinalized;

  return (
    <section className="card card--lg trip-closure-panel">
      <h2 className="trip-closure-panel__title">Trip completion</h2>

      {confirmError && !isFinalConfirmDialogOpen && <InlineError>{confirmError}</InlineError>}

      <ClosureStageChecklist
        label="Expenses complete"
        stageStatus={expensesStage}
        nameByMemberId={nameByMemberId}
        myMemberId={myMemberId}
        onConfirm={() => handleConfirm('expenses_complete')}
        isConfirming={confirmingStage === 'expenses_complete'}
      />

      {!isFinalized && (
        <p className="trip-closure-panel__hint">
          {expensesStage?.allConfirmed
            ? 'Everyone has confirmed. Waiting for the trip owner or admin to finalize the settlement below.'
            : 'Once every member confirms, the trip owner or admin can finalize the settlement below.'}
        </p>
      )}

      {isFinalized && (
        <div className="trip-closure-panel__final-settlement">
          <h3 className="trip-closure-panel__section-title">Final settlement</h3>

          {finalizedSettlement ? (
            <>
              <p className="trip-closure-panel__hint">
                Finalized on {formatDateTime(finalizedSettlement.generatedAt)}. These numbers are locked in.
              </p>
              {finalizedSettlement.transactions.length === 0 ? (
                <EmptyState compact tone="positive" title="All settled" description="Nobody owes anyone anything." />
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
            </>
          ) : (
            <div aria-busy="true">
              <span className="visually-hidden" role="status">
                Loading final settlement…
              </span>
              <ul className="trip-closure-panel__transactions" aria-hidden="true">
                {[0, 1].map((i) => (
                  <li key={i} className="trip-closure-panel__transaction-row">
                    <span className="skeleton skeleton--text" style={{ width: '140px' }} />
                    <span className="skeleton skeleton--text" style={{ width: '60px' }} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ClosureStageChecklist
            label="Final settlement"
            stageStatus={finalStage}
            nameByMemberId={nameByMemberId}
            myMemberId={myMemberId}
            onConfirm={() => handleConfirm('final_settlement')}
            onRequestConfirm={() => setIsFinalConfirmDialogOpen(true)}
            isConfirming={confirmingStage === 'final_settlement'}
          />

          <ConfirmDialog
            open={isFinalConfirmDialogOpen}
            title="Confirm the final settlement?"
            description={
              finalStage?.confirmedCount === (finalStage?.totalActiveMembers ?? 0) - 1
                ? "You're the last member to confirm - this will close the trip immediately. A closed trip is read-only: no one can add, edit, or reject expenses on it afterward. This can't be undone."
                : 'Once every member confirms, the trip closes and becomes read-only - no one can add, edit, or reject expenses on it afterward. This can\u2019t be undone.'
            }
            confirmLabel="Confirm final settlement"
            cancelLabel="Cancel"
            tone="danger"
            isLoading={confirmingStage === 'final_settlement'}
            onConfirm={() => handleConfirm('final_settlement')}
            onCancel={() => setIsFinalConfirmDialogOpen(false)}
          >
            {confirmError && <InlineError>{confirmError}</InlineError>}
          </ConfirmDialog>
        </div>
      )}
    </section>
  );
}

// One member-by-member confirmation checklist (✓ confirmed / ○ pending)
// plus a self-service confirm button for the current member, shared by
// both closure stages. stageStatus comes straight from
// TripClosureService.buildClosureStatus - confirmedCount/totalActiveMembers
// for the "X of Y confirmed" line, missingMemberIds to know who to mark as
// pending (everyone else in nameByMemberId is treated as confirmed).
//
// onRequestConfirm is optional: when given (only for the 'final_settlement'
// stage - closing the trip can't be undone from the UI, see
// TripClosureService.confirmStage), the button opens the caller's
// ConfirmDialog instead of calling onConfirm directly. Without it (the
// 'expenses_complete' stage - a self-checklist item, not itself
// destructive), the button confirms immediately, same as before this
// phase.
function ClosureStageChecklist({ label, stageStatus, nameByMemberId, myMemberId, onConfirm, onRequestConfirm, isConfirming }) {
  if (!stageStatus) return null;

  const missingSet = new Set(stageStatus.missingMemberIds);
  const memberIds = [...nameByMemberId.keys()];
  const iHaveConfirmed = !missingSet.has(myMemberId);
  const handleClick = onRequestConfirm || onConfirm;

  return (
    <div className="trip-closure-panel__stage">
      <h3 className="trip-closure-panel__section-title">{label}</h3>

      <ul className="trip-closure-panel__checklist">
        {memberIds.map((memberId) => {
          const confirmed = !missingSet.has(memberId);
          return (
            <li key={memberId} className="trip-closure-panel__checklist-item">
              <span
                className={`trip-closure-panel__checklist-mark trip-closure-panel__checklist-mark--${
                  confirmed ? 'done' : 'pending'
                }`}
                aria-hidden="true"
              >
                {confirmed ? '\u2713' : '\u25cb'}
              </span>
              <span>
                <span className="visually-hidden">{confirmed ? 'Confirmed: ' : 'Pending: '}</span>
                {nameByMemberId.get(memberId)}
                {memberId === myMemberId ? ' (you)' : ''}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="trip-closure-panel__hint">
        {stageStatus.confirmedCount} of {stageStatus.totalActiveMembers} members confirmed.
      </p>

      <Button variant="secondary" onClick={handleClick} disabled={iHaveConfirmed || isConfirming} isLoading={isConfirming}>
        {iHaveConfirmed ? 'Confirmed' : isConfirming ? 'Confirming\u2026' : `Confirm ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
