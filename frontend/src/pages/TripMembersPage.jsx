import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import { FormField } from '../components/ui/FormField.jsx';
import { SelectField } from '../components/ui/SelectField.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { humanizeErrorMessage, isRetryableError } from '../utils/errorPresentation.js';
import './TripMembersPage.css';

export function TripMembersPage() {
  const { tripId } = useParams();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [detail, setDetail] = useState(null);
  useDocumentTitle(detail ? `Members \u00b7 ${detail.trip.name} \u00b7 Trip Ledger` : 'Members \u00b7 Trip Ledger');
  const [loadError, setLoadError] = useState(null);

  const [newUnitName, setNewUnitName] = useState('');
  const [createUnitError, setCreateUnitError] = useState(null);
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);

  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [moveError, setMoveError] = useState(null);
  const [isMoving, setIsMoving] = useState(false);

  // 9.9.9 QA fix #7: which unit's delete confirmation is currently open,
  // if any - only one at a time, mirroring TripCard's single-dialog
  // pattern for delete-trip (see TripCard.jsx).
  const [unitPendingDelete, setUnitPendingDelete] = useState(null);
  const [deleteUnitError, setDeleteUnitError] = useState(null);
  const [isDeletingUnit, setIsDeletingUnit] = useState(false);

  function loadDetail() {
    tripsApi
      .getTripDetail(tripId)
      .then(setDetail)
      .catch((err) => {
        if (err.code === 'UNAUTHENTICATED') {
          logout();
          return;
        }
        setLoadError(err);
      });
  }

  useEffect(() => {
    setDetail(null);
    setLoadError(null);
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  function retryLoad() {
    setDetail(null);
    setLoadError(null);
    loadDetail();
  }

  if (loadError) {
    const isNotFound = loadError.code === 'TRIP_NOT_FOUND';
    return (
      <div className="trip-members-page__state">
        <ErrorState
          eyebrow={isNotFound ? 'TRIP NOT FOUND' : "COULDN'T LOAD MEMBERS"}
          title={isNotFound ? "This trip doesn't exist, or you're not a member of it." : loadError.message}
          onRetry={!isNotFound && isRetryableError(loadError) ? retryLoad : undefined}
          actions={[{ label: 'Back to my trips', to: '/', variant: 'secondary' }]}
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="trip-members-page" aria-busy="true">
        <span className="visually-hidden" role="status">
          Loading members…
        </span>
        <span className="skeleton skeleton--text" style={{ width: '120px' }} aria-hidden="true" />
        <span className="skeleton skeleton--title" style={{ width: '260px', marginTop: 'var(--space-3)', marginBottom: 'var(--space-5)' }} aria-hidden="true" />

        <section className="card card--lg trip-members-page__section" aria-hidden="true">
          <span className="skeleton skeleton--text" style={{ width: '140px', marginBottom: 'var(--space-4)' }} />
          <ul className="trip-members-page__member-list">
            {[0, 1, 2].map((i) => (
              <li key={i} className="trip-members-page__member">
                <span className="skeleton skeleton--text" style={{ width: '140px' }} />
                <span className="skeleton skeleton--text" style={{ width: '90px' }} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const { trip, members, settlementUnits } = detail;
  const myMembership = members.find((m) => m.user_id === user?.id);
  const groupUnits = settlementUnits.filter((u) => u.kind === 'group');
  const moveOptions = groupUnits.filter((u) => u.id !== myMembership?.settlement_unit_id);
  // Pass 2.8: mirrors the closed-trip convention already used on
  // TripDetailPage/ExpensesPage/ApprovalRulesPanel (trip.status ===
  // 'closed') - the backend already rejects settlement-unit mutations on
  // a closed trip (409 TRIP_ALREADY_CLOSED), this just keeps the UI from
  // presenting controls that would only fail on submit.
  const isTripClosed = trip.status === 'closed';

  function unitMemberCount(unitId) {
    return members.filter((m) => m.settlement_unit_id === unitId).length;
  }

  async function handleCreateUnit(event) {
    event.preventDefault();
    // Defense in depth: the form itself is hidden once the trip is closed
    // (see the closed branch in the JSX below), but the handler also
    // refuses to fire - matches the backend, which rejects settlement-unit
    // mutations on a closed trip with 409 TRIP_ALREADY_CLOSED regardless
    // of what the client sends.
    if (isCreatingUnit || detail.trip.status === 'closed') return;

    setCreateUnitError(null);
    setIsCreatingUnit(true);
    try {
      await tripsApi.createSettlementUnit(tripId, newUnitName.trim());
      setNewUnitName('');
      loadDetail();
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setCreateUnitError(humanizeErrorMessage(err));
    } finally {
      setIsCreatingUnit(false);
    }
  }

  async function handleMove(event) {
    event.preventDefault();
    // Same defense-in-depth as handleCreateUnit above.
    if (isMoving || !selectedUnitId || detail.trip.status === 'closed') return;

    setMoveError(null);
    setIsMoving(true);
    try {
      await tripsApi.updateMySettlementUnit(tripId, selectedUnitId);
      setSelectedUnitId('');
      loadDetail();
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setMoveError(humanizeErrorMessage(err));
    } finally {
      setIsMoving(false);
    }
  }

  function closeDeleteUnitDialog() {
    if (isDeletingUnit) return;
    setUnitPendingDelete(null);
    setDeleteUnitError(null);
  }

  async function handleConfirmDeleteUnit() {
    if (isDeletingUnit || !unitPendingDelete) return;
    setDeleteUnitError(null);
    setIsDeletingUnit(true);
    try {
      const result = await tripsApi.deleteSettlementUnit(tripId, unitPendingDelete.id);
      setUnitPendingDelete(null);
      toast.success(
        result.archived
          ? `"${unitPendingDelete.display_name}" was archived - it had settlement history, so it's kept for the record but hidden from this list.`
          : `"${unitPendingDelete.display_name}" was deleted.`
      );
      loadDetail();
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setDeleteUnitError(humanizeErrorMessage(err));
    } finally {
      setIsDeletingUnit(false);
    }
  }

  return (
    <div className="trip-members-page">
      <Link to={`/trips/${tripId}`} className="trip-members-page__back-link">
        ← {trip.name}
      </Link>
      <h1 className="trip-members-page__title">Members & settlement units</h1>

      <section className="card card--lg trip-members-page__section">
        <h2 className="trip-members-page__section-title">Members ({members.length})</h2>
        <ul className="trip-members-page__member-list">
          {members.map((member) => (
            <li key={member.id} className="trip-members-page__member">
              <div className="trip-members-page__member-main">
                <span className="trip-members-page__member-name">{member.display_name}</span>
                {member.user_id === user?.id && <span className="trip-members-page__you-tag">You</span>}
              </div>
              <div className="trip-members-page__member-meta">
                <span className="trip-members-page__role">{member.role}</span>
                <span>·</span>
                <span>{member.settlement_unit_name}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card--lg trip-members-page__section">
        <h2 className="trip-members-page__section-title">Settlement units ({settlementUnits.length})</h2>
        <ul className="trip-members-page__unit-list">
          {settlementUnits.map((unit) => {
            // 9.9.9 QA fix #7: deleting a group is only ever offered when
            // it's actually eligible - the backend independently
            // re-checks the same two conditions (owner, 0 active
            // members) regardless of what this button's visibility
            // implies, but showing it only here avoids a guaranteed-to-
            // fail click. Individual units are never deletable at all
            // (see TripService.deleteOrArchiveSettlementUnit).
            const canDelete =
              !isTripClosed &&
              myMembership?.role === 'owner' &&
              unit.kind === 'group' &&
              unitMemberCount(unit.id) === 0;
            return (
              <li key={unit.id} className="trip-members-page__unit">
                <span className="trip-members-page__unit-name">{unit.display_name}</span>
                <span className="trip-members-page__unit-meta">
                  {unit.kind} · {unitMemberCount(unit.id)} member{unitMemberCount(unit.id) === 1 ? '' : 's'}
                  {canDelete && (
                    <button
                      type="button"
                      className="trip-members-page__unit-delete"
                      onClick={() => {
                        setDeleteUnitError(null);
                        setUnitPendingDelete(unit);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <ConfirmDialog
          open={Boolean(unitPendingDelete)}
          title={`Delete "${unitPendingDelete?.display_name}"?`}
          description="If this group has never been used in an expense, it will be permanently deleted. If it has past expense or settlement history, it'll be archived instead - kept out of this list, but preserved so old balances and expenses still make sense."
          confirmLabel="Delete group"
          cancelLabel="Cancel"
          tone="danger"
          isLoading={isDeletingUnit}
          onConfirm={handleConfirmDeleteUnit}
          onCancel={closeDeleteUnitDialog}
        >
          {deleteUnitError && (
            <p className="trip-members-page__error" role="alert">
              {deleteUnitError}
            </p>
          )}
        </ConfirmDialog>

        {isTripClosed ? (
          <EmptyState
            compact
            title="Settlement structure is locked"
            description="This trip is closed, so settlement units are read-only and can no longer be created or changed."
          />
        ) : (
          <form className="trip-members-page__inline-form" onSubmit={handleCreateUnit}>
            <FormField
              id="newUnitName"
              label="New group name (e.g. Family A)"
              type="text"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              maxLength={100}
              required
            />
            {createUnitError && (
              <p className="trip-members-page__error" role="alert">
                {createUnitError}
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={isCreatingUnit} isLoading={isCreatingUnit}>
              {isCreatingUnit ? 'Creating…' : 'Create group unit'}
            </Button>
          </form>
        )}
      </section>

      {/* Pass 2.8: once the trip is closed, settlement units can't be
          mutated at all (see isTripClosed above) - this whole section is
          a mutation action with no read-only counterpart worth showing,
          so it's hidden rather than shown disabled. */}
      {!isTripClosed && myMembership && groupUnits.length > 0 && (
        <section className="card card--lg trip-members-page__section">
          <h2 className="trip-members-page__section-title">Move yourself into a group</h2>
          {moveOptions.length === 0 ? (
            <EmptyState
              compact
              tone="positive"
              title="You're all set"
              description="You're already in every available group unit."
            />
          ) : (
            <form className="trip-members-page__inline-form" onSubmit={handleMove}>
              <SelectField
                id="targetUnit"
                label="Group settlement unit"
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                options={[{ value: '', label: 'Choose a group…' }, ...moveOptions.map((u) => ({ value: u.id, label: u.display_name }))]}
              />
              {moveError && (
                <p className="trip-members-page__error" role="alert">
                  {moveError}
                </p>
              )}
              <Button type="submit" variant="secondary" disabled={isMoving || !selectedUnitId} isLoading={isMoving}>
                {isMoving ? 'Moving…' : 'Move me into this group'}
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
