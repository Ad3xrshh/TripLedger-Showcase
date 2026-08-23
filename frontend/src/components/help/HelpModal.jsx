import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HOW_IT_WORKS_STEPS } from '../../content/howItWorksSteps.jsx';
import './HelpModal.css';

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * "How TripLedger works", opened from the sidebar's Help button (9.9.9 QA
 * fix) so a user never has to leave the authenticated app to remember the
 * flow. Renders the exact same step content as the landing page's
 * HowItWorksView (see content/howItWorksSteps.jsx) - never a second,
 * divergent copy - but with its own light-surface layout instead of the
 * landing page's full-bleed dark view, since this has to sit inside the
 * app shell.
 *
 * This is a read-only reference, not a confirm/cancel action, so it isn't
 * built on top of ConfirmDialog's confirm/cancel button API - but it
 * deliberately reuses that component's exact portal/focus-trap/
 * escape/backdrop-lock/scroll-lock mechanics (see ConfirmDialog.jsx's
 * comments for the reasoning behind each one) rather than inventing a
 * second, divergent dialog implementation.
 */
export function HelpModal({ open, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector('[data-help-modal-autofocus]');
    (initial || dialog)?.focus();

    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
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
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  }

  return createPortal(
    <div className="help-modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div ref={dialogRef} className="help-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="help-modal__header">
          <p className="help-modal__title" id={titleId}>
            How TripLedger works
          </p>
          <button
            type="button"
            className="help-modal__close"
            onClick={onClose}
            aria-label="Close"
            data-help-modal-autofocus="true"
          >
            &times;
          </button>
        </div>

        <div className="help-modal__body">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div className="help-modal__step" key={step.tag}>
              <span className="help-modal__step-tag mono">{step.tag}</span>
              <div className="help-modal__step-content">
                <h3 className="help-modal__step-title">{step.title}</h3>
                {step.html ? (
                  <p dangerouslySetInnerHTML={{ __html: step.html }} />
                ) : (
                  <p>{step.node ?? step.body}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
