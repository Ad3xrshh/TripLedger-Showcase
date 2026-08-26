import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './StatusBadge.jsx';
import { TicketDivider } from '../ui/TicketDivider.jsx';
import { FormField } from '../ui/FormField.jsx';
import { InlineError } from '../ui/InlineError.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import * as tripsApi from '../../api/trips.js';
import { humanizeErrorMessage } from '../../utils/errorPresentation.js';
import { formatBudgetType, formatDateRange, formatMoneyMinor, formatTripRole } from '../../utils/format.js';
import './TripCard.css';

/**
 * Presentational card for one row from GET /api/trips. Only shows fields
 * the list endpoint actually returns - member count isn't included there
 * (only in trip detail), so it isn't shown here.
 *
 * 9.9.9 QA fix #5: also the entry point for deleting a trip - only shown
 * to the owner (trip.my_role, already returned by GET /api/trips - no
 * extra request). This is a genuinely destructive, permanent action
 * (see TripService.deleteTrip's cascade), so it's deliberately NOT a
 * single click: it opens a password-gated ConfirmDialog, and the
 * backend independently re-verifies both the ownership and the password
 * regardless of what the UI allowed the click to happen - the frontend
 * dialog is a deliberate-action gate, not the actual authorization.
 *
 * onDeleted lets the parent (HomePage) drop this trip from its own list
 * without a full reload - same "caller owns the mutation, this card just
 * reports the outcome" shape ConfirmDialog's own contract already
 * expects.
 */
export function TripCard({ trip, onDeleted }) {
  const isUnlimited = trip.budget_type === 'unlimited';
  const budgetAmount = isUnlimited
    ? 'Unlimited'
    : (formatMoneyMinor(trip.budget_amount_minor, trip.currency) ?? '\u2014');
  const budgetCaption = isUnlimited ? 'Unlimited budget' : formatBudgetType(trip.budget_type);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openDeleteDialog(event) {
    // The whole card is a <Link> (see the wrapping element below) - this
    // button lives inside it, so without stopping propagation a click
    // here would also navigate to the trip detail page underneath the
    // dialog it just opened.
    event.preventDefault();
    event.stopPropagation();
    setDeleteError(null);
    setPassword('');
    setIsDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setIsDeleteDialogOpen(false);
    setPassword('');
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await tripsApi.deleteTrip(trip.id, password);
      setIsDeleteDialogOpen(false);
      onDeleted?.(trip.id);
    } catch (err) {
      setDeleteError(humanizeErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="trip-card-wrapper">
      <Link to={`/trips/${trip.id}`} className="card card--interactive trip-card">
        <div className="trip-card__top">
          <StatusBadge status={trip.status} />
        </div>

        <h3 className="trip-card__name">{trip.name}</h3>
        <p className="trip-card__dates">{formatDateRange(trip.start_date, trip.end_date)}</p>

        <TicketDivider />

        <div className="trip-card__budget">
          <span className="eyebrow trip-card__budget-label">Budget</span>
          <span className="trip-card__budget-amount">{budgetAmount}</span>
          {budgetCaption && <span className="trip-card__budget-caption">{budgetCaption}</span>}
        </div>

        <div className="trip-card__footer">
          <span className={trip.my_role === 'owner' ? 'trip-card__owner-tag' : 'trip-card__role-tag'}>
            {trip.my_role === 'owner' ? 'You own this trip' : formatTripRole(trip.my_role)}
          </span>
          <span className="trip-card__arrow" aria-hidden="true">
            &rarr;
          </span>
        </div>

        {trip.my_role === 'owner' && (
          <button
            type="button"
            className="trip-card__delete"
            onClick={openDeleteDialog}
            aria-label={`Delete ${trip.name}`}
          >
            Delete trip
          </button>
        )}
      </Link>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Delete this trip?"
        description={`This permanently deletes "${trip.name}" and every expense, settlement, and member record in it. This can\u2019t be undone. Enter your password to confirm.`}
        confirmLabel="Delete trip"
        cancelLabel="Cancel"
        tone="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={closeDeleteDialog}
      >
        <FormField
          label="Your password"
          id={`delete-trip-password-${trip.id}`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {deleteError && <InlineError>{deleteError}</InlineError>}
      </ConfirmDialog>
    </div>
  );
}
