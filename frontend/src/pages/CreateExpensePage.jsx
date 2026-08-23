import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import * as expensesApi from '../api/expenses.js';
import { ExpenseForm } from '../components/expenses/ExpenseForm.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { humanizeErrorMessage, isRetryableError } from '../utils/errorPresentation.js';
import './ExpenseFormPage.css';

export function CreateExpensePage() {
  useDocumentTitle('Add expense \u00b7 Trip Ledger');
  const { tripId } = useParams();
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [settlementUnits, setSettlementUnits] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    tripsApi
      .getTripDetail(tripId)
      .then((detail) => {
        if (!cancelled) {
          setTrip(detail.trip);
          setSettlementUnits(detail.settlementUnits);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.code === 'UNAUTHENTICATED') {
          logout();
          return;
        }
        setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, logout, reloadToken]);

  async function handleSubmit(payload) {
    // Defense in depth: the form itself is replaced by the closed-trip
    // state below once trip.status === 'closed', but the handler also
    // refuses to fire - matches the backend, which rejects new expenses
    // on a closed trip with 409 TRIP_ALREADY_CLOSED regardless of what
    // the client sends.
    if (isSubmitting || trip?.status === 'closed') return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { expense } = await expensesApi.createExpense(tripId, payload);
      toast.success('Expense added');
      navigate(`/trips/${tripId}/expenses/${expense.id}`, { replace: true });
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setSubmitError(humanizeErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  if (loadError) {
    const isNotFound = loadError.code === 'TRIP_NOT_FOUND';
    return (
      <div className="expense-form-page__state">
        <ErrorState
          eyebrow={isNotFound ? 'TRIP NOT FOUND' : "COULDN'T LOAD THIS TRIP"}
          title={isNotFound ? "This trip doesn't exist, or you're not a member of it." : loadError.message}
          onRetry={!isNotFound && isRetryableError(loadError) ? () => setReloadToken((t) => t + 1) : undefined}
          actions={[{ label: 'Back to trip', to: `/trips/${tripId}`, variant: 'secondary' }]}
        />
      </div>
    );
  }

  if (!settlementUnits || !trip) {
    return (
      <div className="expense-form-page" aria-busy="true">
        <span className="visually-hidden" role="status">
          Loading…
        </span>
        <div className="skeleton skeleton--card" aria-hidden="true" />
      </div>
    );
  }

  // Pass 2.8: ExpensesPage/TripDetailPage already hide the "Add expense"
  // link once a trip is closed (ExpenseService.createExpense rejects with
  // 409 TRIP_ALREADY_CLOSED), but someone landing on this route directly -
  // a stale tab, a bookmark, browser back/forward - would otherwise still
  // see an apparently-usable form that can only fail on submit. Show the
  // closed state instead of the form in that case.
  if (trip.status === 'closed') {
    return (
      <div className="expense-form-page__state">
        <ErrorState
          eyebrow="TRIP CLOSED"
          title="This trip is complete and read-only."
          description="New expenses can no longer be added."
          actions={[{ label: 'Back to trip', to: `/trips/${tripId}`, variant: 'secondary' }]}
        />
      </div>
    );
  }

  return (
    <div className="expense-form-page">
      <Link to={`/trips/${tripId}/expenses`} className="expense-form-page__back-link">
        &larr; Expenses
      </Link>

      <div className="expense-form-page__header">
        <h1 className="expense-form-page__title">Add expense</h1>
        <p className="expense-form-page__description">
          Log what was spent — everyone on the trip will see it in the shared ledger.
        </p>
      </div>

      <ExpenseForm
        settlementUnits={settlementUnits}
        onSubmit={handleSubmit}
        submitting={isSubmitting}
        submitError={submitError}
        submitLabel="Add expense"
      />
    </div>
  );
}
