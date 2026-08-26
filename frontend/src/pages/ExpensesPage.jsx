import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import * as expensesApi from '../api/expenses.js';
import { ExpenseCard } from '../components/expenses/ExpenseCard.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { humanizeErrorMessage, isRetryableError } from '../utils/errorPresentation.js';
import './ExpensesPage.css';

export function ExpensesPage() {
  const { tripId } = useParams();
  const { logout } = useAuth();

  const [trip, setTrip] = useState(null);
  useDocumentTitle(trip ? `Expenses \u00b7 ${trip.name} \u00b7 Trip Ledger` : 'Expenses \u00b7 Trip Ledger');
  // Map of trip_member.id -> user display_name, so an expense's
  // paid_by_member_id can be shown as a name - the expense row itself
  // doesn't carry the payer's name (see expenseRepository.js EXPENSE_COLUMNS).
  const [payerNamesByMemberId, setPayerNamesByMemberId] = useState({});
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setExpenses(null);
    setError(null);

    Promise.all([tripsApi.getTripDetail(tripId), expensesApi.listExpenses(tripId)])
      .then(([detail, expenseList]) => {
        if (cancelled) return;
        setTrip(detail.trip);
        const names = {};
        for (const member of detail.members) {
          names[member.id] = member.display_name;
        }
        setPayerNamesByMemberId(names);
        setExpenses(expenseList);
      })
      .catch((err) => {
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
  }, [tripId, logout, reloadToken]);

  if (error) {
    const isNotFound = error.code === 'TRIP_NOT_FOUND';
    return (
      <div className="expenses-page__state">
        <ErrorState
          eyebrow={isNotFound ? 'TRIP NOT FOUND' : "COULDN'T LOAD EXPENSES"}
          title={isNotFound ? "This trip doesn't exist, or you're not a member of it." : humanizeErrorMessage(error)}
          onRetry={!isNotFound && isRetryableError(error) ? () => setReloadToken((t) => t + 1) : undefined}
          actions={[{ label: 'Back to my trips', to: '/', variant: 'secondary' }]}
        />
      </div>
    );
  }

  return (
    <div className="expenses-page">
      <Link to={`/trips/${tripId}`} className="expenses-page__back-link">
        Expenses <span className="expenses-page__breadcrumb-separator" aria-hidden="true">/</span> <span className="expenses-page__breadcrumb-trip">{trip?.name || 'Trip'}</span>
      </Link>

      <div className="expenses-page__hero">
        <div className="expenses-page__heading">
          <h1 className="expenses-page__title">Expenses</h1>
          {expenses && (
            <p className="expenses-page__subtitle">
              {expenses.length === 0
                ? 'No expenses logged yet'
                : `${expenses.length} expense${expenses.length === 1 ? '' : 's'} logged`}
            </p>
          )}
        </div>
        {/* Phase 9.7: a closed trip no longer accepts new expenses
            (ExpenseService.createExpense rejects with 409
            TRIP_ALREADY_CLOSED) - hide the add-expense action rather than
            let a member navigate to a form that will fail on submit. */}
        {expenses && trip?.status !== 'closed' && (
          <Link to={`/trips/${tripId}/expenses/new`} className="btn btn--primary expenses-page__add-action">
            Add expense
          </Link>
        )}
      </div>

      {!expenses && (
        <div aria-busy="true">
          <span className="visually-hidden" role="status">
            Loading expenses…
          </span>
          <div className="expenses-page__list" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton--card" />
            ))}
          </div>
        </div>
      )}

      {expenses && expenses.length === 0 && (
        <EmptyState
          title="No expenses recorded yet"
          description="Start adding spending to keep this trip's shared ledger up to date."
          actions={
            trip?.status !== 'closed' ? [{ label: 'Add expense', to: `/trips/${tripId}/expenses/new`, variant: 'primary' }] : []
          }
        />
      )}

      {expenses && expenses.length > 0 && (
        <div className="expenses-page__list">
          {expenses.map((expense) => (
            <ExpenseCard
              key={expense.id}
              tripId={tripId}
              expense={expense}
              currency={trip?.currency}
              payerName={payerNamesByMemberId[expense.paid_by_member_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
