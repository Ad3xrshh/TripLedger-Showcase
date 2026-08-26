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

  const [unitPendingDelete, setUnitPendingDelete] = useState(null);
  const [deleteUnitError, setDeleteUnitError] = useState(null);
  const [isDeletingUnit, setIsDeletingUnit] = useState(false);

  const [processingRequestId, setProcessingRequestId] = useState(null);
  const [requestError, setRequestError] = useState(null);

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

  const { trip, members, settlementUnits, transferRequests = [] } = detail;
  const myMembership = members.find((m) => m.user_id === user?.id);
  const groupUnits = settlementUnits.filter((u) => u.kind === 'group');
  const moveOptions = groupUnits.filter((u) => u.id !== myMembership?.settlement_unit_id);
  const isTripClosed = trip.status === 'closed';

  const myPendingRequest = transferRequests.find(
    (r) => r.member_id === myMembership?.id && r.status === 'pending'
  );
  const pendingOwnerRequests = transferRequests.filter((r) => r.status === 'pending');

  function unitMemberCount(unitId) {
    return members.filter((m) => m.settlement_unit_id === unitId).length;
  }

  async function handleCreateUnit(event) {
    event.preventDefault();
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
    if (isMoving || !selectedUnitId || detail.trip.status === 'closed') return;

    setMoveError(null);
    setIsMoving(true);
    try {
      const result = await tripsApi.updateMySettlementUnit(tripId, selectedUnitId);
      setSelectedUnitId('');
      if (result?.membership) {
        toast.success('Moved to new settlement group.');
      } else {
        toast.success('Transfer request submitted and pending owner approval.');
      }
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

  async function handleApproveTransfer(requestId) {
    if (processingRequestId) return;
    setRequestError(null);
    setProcessingRequestId(requestId);
    try {
      await tripsApi.approveTransferRequest(tripId, requestId);
      toast.success('Transfer request approved.');
      loadDetail();
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setRequestError(humanizeErrorMessage(err));
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleRejectTransfer(requestId) {
    if (processingRequestId) return;
    setRequestError(null);
    setProcessingRequestId(requestId);
    try {
      await tripsApi.rejectTransferRequest(tripId, requestId);
      toast.success('Transfer request rejected.');
      loadDetail();
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setRequestError(humanizeErrorMessage(err));
    } finally {
      setProcessingRequestId(null);
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

      {/* Owner Transfer Approval Panel */}
      {!isTripClosed && myMembership?.role === 'owner' && (
        <section className="card card--lg trip-members-page__section">
          <h2 className="trip-members-page__section-title">Pending transfer requests ({pendingOwnerRequests.length})</h2>
          {requestError && (
            <p className="trip-members-page__error" role="alert">
              {requestError}
            </p>
          )}
          {pendingOwnerRequests.length === 0 ? (
            <p className="trip-members-page__subtext">No pending group transfer requests.</p>
          ) : (
            <ul className="trip-members-page__request-list">
              {pendingOwnerRequests.map((req) => {
                const isSelf = req.member_id === myMembership.id;
                return (
                  <li key={req.id} className="trip-members-page__request-item">
                    <div className="trip-members-page__request-main">
                      <div className="trip-members-page__request-header">
                        <span className="trip-members-page__request-member">{req.member_name}</span>
                        <span className="trip-members-page__pending-tag">Pending approval</span>
                      </div>
                      <div className="trip-members-page__request-transfer">
                        Current: <strong>{req.from_unit_name}</strong> → Requested: <strong>{req.to_unit_name}</strong>
                      </div>
                    </div>
                    <div className="trip-members-page__request-actions">
                      {isSelf ? (
                        <span className="trip-members-page__request-note">Cannot approve own request</span>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            disabled={Boolean(processingRequestId)}
                            isLoading={processingRequestId === req.id}
                            onClick={() => handleApproveTransfer(req.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={Boolean(processingRequestId)}
                            onClick={() => handleRejectTransfer(req.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="card card--lg trip-members-page__section">
        <h2 className="trip-members-page__section-title">Settlement units ({settlementUnits.length})</h2>
        <ul className="trip-members-page__unit-list">
          {settlementUnits.map((unit) => {
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

      {!isTripClosed && myMembership && groupUnits.length > 0 && (
        <section className="card card--lg trip-members-page__section">
          <h2 className="trip-members-page__section-title">Move to another group</h2>
          <div className="trip-members-page__current-info">
            <span>Current group: <strong>{myMembership.settlement_unit_name}</strong></span>
          </div>

          {myPendingRequest ? (
            <div className="trip-members-page__pending-notice">
              <span className="trip-members-page__pending-tag">Transfer request pending</span>
              <p className="trip-members-page__pending-route">
                From: <strong>{myPendingRequest.from_unit_name}</strong> → To: <strong>{myPendingRequest.to_unit_name}</strong>
              </p>
              <p className="trip-members-page__subtext">
                Your transfer request requires trip owner approval. You cannot submit multiple conflicting transfer requests.
              </p>
            </div>
          ) : moveOptions.length === 0 ? (
            <EmptyState
              compact
              tone="positive"
              title="You're all set"
              description="You're already in every available group unit."
            />
          ) : (
            <form className="trip-members-page__inline-form" onSubmit={handleMove}>
              <p className="trip-members-page__subtext">
                {myMembership?.role === 'owner'
                  ? 'Move directly into another group settlement unit.'
                  : 'Moving between settlement groups requires approval from the trip owner.'}
              </p>
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
                {isMoving ? 'Moving…' : myMembership?.role === 'owner' ? 'Move group' : 'Request move'}
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
