import { useEffect, useState } from 'react';
import * as expensesApi from '../../api/expenses.js';
import { useToast } from '../../hooks/useToast.js';
import { Button } from '../ui/Button.jsx';
import { ErrorState } from '../ui/ErrorState.jsx';
import { InlineError } from '../ui/InlineError.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { humanizeErrorMessage, isRetryableError } from '../../utils/errorPresentation.js';
import { formatDateTime, formatVerificationMode } from '../../utils/format.js';
import './ExpenseVerificationPanel.css';

// Only these statuses can still receive an approve/reject action - mirrors
// the "pending" checks in ExpenseApprovalService.approveExpense/rejectExpense.
// Any other status (verified/rejected/locked) means the decision is final.
const ACTIONABLE_STATUS = 'pending';

// Plain-language explanation of why an expense needs approval at all -
// this panel is only ever rendered for these two modes (ExpenseDetailPage
// skips it entirely for 'automatic', see its own comment there), so
// 'automatic' has no entry here.
const VERIFICATION_MODE_EXPLANATION = {
  member_approval: 'This trip requires another member to approve an expense before it counts toward settlement.',
  tiered: "This trip's required approvals scale with the expense amount, per the trip's approval rules.",
};

/**
 * Shows the approval/verification state for one expense and lets an
 * eligible member act on it. Only rendered by ExpenseDetailPage for trips
 * whose verification_mode isn't "automatic" (automatic expenses are
 * verified the instant they're created - see ExpenseService.initialStatusFor
 * - so there is nothing to show or act on here for them).
 *
 * Fetches its own verification detail (GET .../verification) rather than
 * having the parent page fetch it, since it's a self-contained concern.
 * On a successful approve/reject it reports the updated expense back up
 * via onExpenseUpdated so the page header's status badge stays in sync.
 */
export function ExpenseVerificationPanel({
  tripId,
  expenseId,
  expenseStatus,
  isPayer,
  onExpenseUpdated,
  isTripClosed = false,
  verificationMode,
}) {
  const [verification, setVerification] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadToken, setLoadToken] = useState(0);

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState(null);

  const { toast } = useToast();

  function load() {
    return expensesApi.getVerificationDetails(tripId, expenseId).then(setVerification);
  }

  useEffect(() => {
    let cancelled = false;
    setVerification(null);
    setLoadError(null);
    setIsRejectDialogOpen(false);
    setActionError(null);

    load().catch((err) => {
      if (!cancelled) setLoadError(err);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, expenseId, loadToken]);

  async function handleApprove() {
    if (isApproving) return;
    setActionError(null);
    setIsApproving(true);
    try {
      const result = await expensesApi.approveExpense(tripId, expenseId);
      setVerification(result.verification);
      onExpenseUpdated(result.expense);
      toast.success('Expense approved');
    } catch (err) {
      setActionError(humanizeErrorMessage(err));
    } finally {
      setIsApproving(false);
    }
  }

  async function handleReject() {
    if (isRejecting) return;
    setActionError(null);
    setIsRejecting(true);
    try {
      const result = await expensesApi.rejectExpense(tripId, expenseId, rejectReason.trim() || undefined);
      setVerification(result.verification);
      onExpenseUpdated(result.expense);
      setIsRejectDialogOpen(false);
      setRejectReason('');
      toast.success(isPayer ? 'Expense withdrawn' : 'Expense rejected');
    } catch (err) {
      setActionError(humanizeErrorMessage(err));
    } finally {
      setIsRejecting(false);
    }
  }

  if (loadError) {
    // A tiered trip with no approval rule covering this amount yet is a
    // real, expected state (APPROVAL_RULE_NOT_FOUND) - surface it plainly
    // instead of a generic error, since it tells the owner what to fix.
    // Still worth a retry: adding a rule elsewhere doesn't refresh this
    // panel on its own.
    const isMissingRule = loadError.code === 'APPROVAL_RULE_NOT_FOUND';
    return (
      <section className="card card--lg expense-verification">
        <h2 className="expense-verification__title">Verification</h2>
        <ErrorState
          compact
          title={
            isMissingRule
              ? 'This trip uses tiered approval, but no approval rule covers this amount yet. Ask the trip owner to add one.'
              : loadError.message
          }
          onRetry={isMissingRule || isRetryableError(loadError) ? () => setLoadToken((t) => t + 1) : undefined}
        />
      </section>
    );
  }

  if (!verification) {
    return (
      <section className="card card--lg expense-verification" aria-busy="true">
        <h2 className="expense-verification__title">Verification</h2>
        <span className="visually-hidden" role="status">
          Loading verification status…
        </span>
        <div className="expense-verification__stats" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="expense-verification__stat skeleton-stack">
              <span className="skeleton skeleton--text" style={{ width: '24px', height: '1.5em' }} />
              <span className="skeleton skeleton--text" style={{ width: '48px', height: '0.7em' }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Phase 9.7: a closed trip is read-only server-side
  // (ExpenseApprovalService.approveExpense/rejectExpense now reject with
  // 409 TRIP_ALREADY_CLOSED) - treat it the same as a non-pending expense
  // for button purposes, while still showing the verification stats/history
  // above.
  const isActionable = expenseStatus === ACTIONABLE_STATUS && !isTripClosed;
  const canApprove = isActionable && !isPayer && !verification.currentUserApproved;
  const canReject = isActionable;

  return (
    <section className="card card--lg expense-verification">
      <h2 className="expense-verification__title">Verification</h2>

      {VERIFICATION_MODE_EXPLANATION[verificationMode] && (
        <p className="expense-verification__mode-hint">
          <span className="eyebrow">{formatVerificationMode(verificationMode)}</span>
          {' \u2014 '}
          {VERIFICATION_MODE_EXPLANATION[verificationMode]}
        </p>
      )}

      <div className="expense-verification__stats">
        <div className="expense-verification__stat">
          <span className="expense-verification__stat-value">{verification.approvalsRequired}</span>
          <span className="expense-verification__stat-label">Required</span>
        </div>
        <div className="expense-verification__stat">
          <span className="expense-verification__stat-value">{verification.approvalsReceived}</span>
          <span className="expense-verification__stat-label">Approved</span>
        </div>
        <div className="expense-verification__stat">
          <span className="expense-verification__stat-value">{verification.approvalsRemaining}</span>
          <span className="expense-verification__stat-label">Remaining</span>
        </div>
      </div>

      {verification.approvalsRequired > 0 && (
        <div
          className="expense-verification__progress"
          role="progressbar"
          aria-valuenow={verification.approvalsReceived}
          aria-valuemin={0}
          aria-valuemax={verification.approvalsRequired}
          aria-label={`${verification.approvalsReceived} of ${verification.approvalsRequired} required approvals received`}
        >
          <div
            className="expense-verification__progress-fill"
            style={{
              width: `${Math.min(100, (verification.approvalsReceived / verification.approvalsRequired) * 100)}%`,
            }}
          />
        </div>
      )}

      {verification.approvedBy.length > 0 && (
        <ul className="expense-verification__approvers">
          {verification.approvedBy.map((approval) => (
            <li key={approval.memberId} className="expense-verification__approver">
              <span className="expense-verification__approver-name">
                <span className="expense-verification__approver-check" aria-hidden="true">
                  &#10003;
                </span>
                {approval.displayName}
              </span>
              <span className="expense-verification__approver-time">{formatDateTime(approval.approvedAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {verification.currentUserApproved && isActionable && (
        <p className="expense-verification__hint">You've approved this expense.</p>
      )}
      {isPayer && isActionable && (
        <p className="expense-verification__hint">You paid this expense, so you can't approve it yourself.</p>
      )}

      {actionError && !isRejectDialogOpen && <InlineError>{actionError}</InlineError>}

      {(canApprove || canReject) && (
        <div className="expense-verification__actions">
          {canApprove && (
            <Button variant="primary" onClick={handleApprove} disabled={isApproving || isRejecting} isLoading={isApproving}>
              {isApproving ? 'Approving…' : 'Approve expense'}
            </Button>
          )}
          {canReject && (
            <Button
              variant="secondary"
              onClick={() => setIsRejectDialogOpen(true)}
              disabled={isApproving || isRejecting}
            >
              {isPayer ? 'Withdraw expense' : 'Reject expense'}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={isRejectDialogOpen}
        title={isPayer ? 'Withdraw this expense?' : 'Reject this expense?'}
        description={
          isPayer
            ? 'Withdrawing means this expense won\u2019t count toward the trip\u2019s settlement. This can\u2019t be undone - you\u2019ll need to add it again from scratch if you change your mind.'
            : 'Rejecting means this expense won\u2019t count toward the trip\u2019s settlement. This can\u2019t be undone.'
        }
        confirmLabel={isPayer ? 'Confirm withdraw' : 'Confirm reject'}
        cancelLabel="Cancel"
        tone="danger"
        isLoading={isRejecting}
        onConfirm={handleReject}
        onCancel={() => {
          setIsRejectDialogOpen(false);
          setRejectReason('');
        }}
      >
        <label htmlFor="rejectReason" className="expense-verification__reject-label">
          Reason (optional)
        </label>
        <textarea
          id="rejectReason"
          className="expense-verification__reject-textarea"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={isRejecting}
        />
        {actionError && <InlineError>{actionError}</InlineError>}
      </ConfirmDialog>
    </section>
  );
}
