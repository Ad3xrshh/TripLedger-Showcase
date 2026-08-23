import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.jsx';
import './ConfirmDialog.css';

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * Shared confirmation dialog for actions that are destructive, financially
 * irreversible, or otherwise deserve a deliberate second step before they
 * fire. Integrated in 9.9.5 for finalizing a settlement
 * (SettlementPanel), confirming the final_settlement closure stage
 * (TripClosurePanel), and rejecting/withdrawing an expense
 * (ExpenseVerificationPanel) - the three actions in the app confirmed, by
 * reading TripClosureService/SettlementService/ExpenseApprovalService, to
 * have no corresponding "undo" endpoint. Ordinary reversible actions
 * (approving an expense, confirming the expenses_complete stage, joining
 * a trip, etc.) were deliberately left without a dialog.
 *
 * Deliberately dumb about the action itself: it never calls the mutation
 * on its own, never manages its own loading state, and never decides
 * whether an action needs confirming. The caller owns all of that -
 * onConfirm is whatever handler already existed (finalize, confirm stage,
 * reject), isLoading is whatever loading flag that handler already set, so
 * there is exactly one loading mechanism, not a second one layered on top.
 * onConfirm firing is the only way the wrapped action executes; Cancel,
 * Escape, and a backdrop click all only ever call onCancel.
 *
 * children is an optional slot for a small amount of extra content inside
 * the dialog body (e.g. the reject-reason field), not a general-purpose
 * form host.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  // Latest isLoading/onCancel without re-subscribing the keydown listener
  // below on every render - the listener itself only needs to exist once
  // per open/close, not once per prop change.
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus in on open, restore it to whatever triggered the dialog on
  // close - deliberately its own effect (dep: [open] only) so it never
  // re-runs (and never re-captures "previously focused" as the dialog
  // itself) just because isLoading toggles mid-dialog.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector('[data-confirm-dialog-autofocus]');
    (initial || dialog)?.focus();

    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  // Escape-to-cancel and a small manual focus trap (Tab/Shift+Tab cycle
  // within the dialog rather than escaping to the page behind it).
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        // Not "safe" mid-submit: cancelling out from under an in-flight
        // confirm would leave the caller's loading state stranded.
        if (!isLoadingRef.current) {
          event.preventDefault();
          onCancelRef.current?.();
        }
        return;
      }

      if (event.key === 'Tab') {
        const focusables = getFocusableElements(dialogRef.current);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Background shouldn't scroll behind an open dialog.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  function handleBackdropMouseDown(event) {
    if (event.target === event.currentTarget && !isLoading) {
      onCancel?.();
    }
  }

  return createPortal(
    <div className="confirm-dialog-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        className={`confirm-dialog${tone === 'danger' ? ' confirm-dialog--danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <p className="confirm-dialog__title" id={titleId}>
          {title}
        </p>
        {description && (
          <p className="confirm-dialog__description" id={descriptionId}>
            {description}
          </p>
        )}
        {children && <div className="confirm-dialog__body">{children}</div>}
        <div className="confirm-dialog__actions">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            data-confirm-dialog-autofocus="true"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={isLoading}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
