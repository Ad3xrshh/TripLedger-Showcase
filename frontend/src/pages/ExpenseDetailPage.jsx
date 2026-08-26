import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import * as expensesApi from '../api/expenses.js';
import { ExpenseStatus } from '../components/expenses/ExpenseStatus.jsx';
import { ExpenseForm } from '../components/expenses/ExpenseForm.jsx';
import { ExpenseVerificationPanel } from '../components/expenses/ExpenseVerificationPanel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { humanizeErrorMessage, isRetryableError } from '../utils/errorPresentation.js';
import { formatDateTime, formatMoneyMinor, toDatetimeLocalValue } from '../utils/format.js';
import './ExpenseDetailPage.css';

// Only a pending expense, edited by the member who paid it, is editable -
// mirrors EDITABLE_STATUS in backend/src/services/ExpenseService.js. This
// only controls whether the Edit button is shown; the backend re-checks
// and remains authoritative regardless of what the UI decides to show.
const EDITABLE_STATUS = 'pending';

export function ExpenseDetailPage() {
  const { tripId, expenseId } = useParams();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [trip, setTrip] = useState(null);
  useDocumentTitle(trip ? `Expense \u00b7 ${trip.name} \u00b7 Trip Ledger` : 'Expense \u00b7 Trip Ledger');
  const [myMembership, setMyMembership] = useState(null);
  const [payerNamesByMemberId, setPayerNamesByMemberId] = useState({});
  const [settlementUnits, setSettlementUnits] = useState(null);
  const [expense, setExpense] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function load() {
    return Promise.all([tripsApi.getTripDetail(tripId), expensesApi.getExpenseDetail(tripId, expenseId)]).then(
      ([detail, expenseDetail]) => {
        setTrip(detail.trip);
        setSettlementUnits(detail.settlementUnits);
        const names = {};
        for (const member of detail.members) {
          names[member.id] = member.display_name;
        }
        setPayerNamesByMemberId(names);
        setMyMembership(detail.members.find((m) => m.user_id === user.id) || null);
        setExpense(expenseDetail.expense);
        setParticipants(expenseDetail.participants);
      }
    );
  }

  useEffect(() => {
    let cancelled = false;
    setExpense(null);
    setError(null);
    setIsEditing(false);

    load().catch((err) => {
      if (cancelled) return;
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setError(err);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, expenseId, logout, reloadToken]);

  async function handleUpdate(payload) {
    if (isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await expensesApi.updateExpense(tripId, expenseId, payload);
      await load();
      setIsEditing(false);
      toast.success('Expense updated');
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setSubmitError(humanizeErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error) {
    const isNotFound = error.code === 'EXPENSE_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND';
    return (
      <div className="expense-detail-page__state">
        <ErrorState
          eyebrow={isNotFound ? 'NOT FOUND' : "COULDN'T LOAD EXPENSE"}
          title={isNotFound ? "This expense doesn't exist, or you don't have access to it." : humanizeErrorMessage(error)}
          onRetry={!isNotFound && isRetryableError(error) ? () => setReloadToken((t) => t + 1) : undefined}
          actions={[{ label: 'Back to expenses', to: `/trips/${tripId}/expenses`, variant: 'secondary' }]}
        />
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="expense-detail-page" aria-busy="true">
        <span className="visually-hidden" role="status">
          Loading expense…
        </span>
        <span className="skeleton skeleton--text" style={{ width: '110px' }} aria-hidden="true" />
        <div className="expense-detail-page__header" aria-hidden="true">
          <span className="skeleton skeleton--title" style={{ width: '55%' }} />
          <span className="skeleton" style={{ width: '64px', height: '20px', borderRadius: '999px' }} />
        </div>
        <span className="skeleton skeleton--text" style={{ width: '140px', height: '1.4em', marginTop: 'var(--space-1)' }} aria-hidden="true" />

        <div className="card card--lg expense-detail-page__facts" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="expense-detail-page__fact">
              <span className="skeleton skeleton--text" style={{ width: '50%', height: '0.7em' }} />
              <span className="skeleton skeleton--text" style={{ width: '75%' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isTripClosed = trip?.status === 'closed';
  const isPayer = myMembership && expense.paid_by_member_id === myMembership.id;
  // Phase 9.7: a closed trip is read-only server-side
  // (ExpenseService.updateExpense now rejects with 409
  // TRIP_ALREADY_CLOSED) - hide the Edit action once closed, same
  // convention as the EDITABLE_STATUS check above.
  const isEditable = isPayer && expense.status === EDITABLE_STATUS && !isTripClosed;

  if (isEditing) {
    return (
      <div className="expense-detail-page">
        <Link to={`/trips/${tripId}/expenses/${expenseId}`} className="expense-detail-page__back-link">
          &larr; Cancel
        </Link>
        <div className="expense-detail-page__form-header">
          <h1 className="expense-detail-page__title">Edit expense</h1>
          <p className="expense-detail-page__form-description">Changes are only saved once you submit.</p>
        </div>
        <ExpenseForm
          settlementUnits={settlementUnits}
          initialValues={{
            amount: (expense.amount_minor / 100).toString(),
            description: expense.description,
            category: expense.category || '',
            occurredAtLocal: toDatetimeLocalValue(expense.occurred_at),
            participantSettlementUnitIds: participants.map((p) => p.settlement_unit_id),
          }}
          onSubmit={handleUpdate}
          submitting={isSubmitting}
          submitError={submitError}
          submitLabel="Save changes"
        />
      </div>
    );
  }

  return (
    <div className="expense-detail-page">
      <Link to={`/trips/${tripId}/expenses`} className="expense-detail-page__back-link">
        &larr; Expenses <span className="expense-detail-page__breadcrumb-separator" aria-hidden="true">/</span> <span className="expense-detail-page__breadcrumb-trip">{trip?.name || 'Trip'}</span>
      </Link>

      <div className="expense-detail-page__header">
        <h1 className="expense-detail-page__description">{expense.description}</h1>
        <ExpenseStatus status={expense.status} />
      </div>

      <p className="expense-detail-page__amount">{formatMoneyMinor(expense.amount_minor, trip?.currency)}</p>

      <div className="card card--lg expense-detail-page__facts">
        <div className="expense-detail-page__fact">
          <span className="expense-detail-page__fact-label">Paid by</span>
          <span className="expense-detail-page__fact-value">{payerNamesByMemberId[expense.paid_by_member_id] || '\u2014'}</span>
        </div>
        <div className="expense-detail-page__fact">
          <span className="expense-detail-page__fact-label">Occurred</span>
          <span className="expense-detail-page__fact-value">{formatDateTime(expense.occurred_at)}</span>
        </div>
        {expense.category && (
          <div className="expense-detail-page__fact">
            <span className="expense-detail-page__fact-label">Category</span>
            <span className="expense-detail-page__fact-value">{expense.category}</span>
          </div>
        )}
      </div>

      <div className="expense-detail-page__participants">
        <h2 className="expense-detail-page__section-title">Participants</h2>
        <ul className="expense-detail-page__participant-list">
          {participants.map((participant) => (
            <li key={participant.settlement_unit_id}>{participant.display_name}</li>
          ))}
        </ul>
      </div>

      {isEditable && (
        <div className="expense-detail-page__actions">
          <Button variant="primary" onClick={() => setIsEditing(true)}>
            Edit expense
          </Button>
        </div>
      )}

      {/* Automatic-mode expenses are verified the instant they're created
          (see ExpenseService.initialStatusFor) - there's no approval to
          show or act on, so the panel is skipped entirely rather than
          rendering an empty/always-verified state. */}
      {trip?.verification_mode !== 'automatic' && (
        <ExpenseVerificationPanel
          tripId={tripId}
          expenseId={expenseId}
          expenseStatus={expense.status}
          isPayer={isPayer}
          onExpenseUpdated={setExpense}
          isTripClosed={isTripClosed}
          verificationMode={trip?.verification_mode}
        />
      )}
    </div>
  );
}
