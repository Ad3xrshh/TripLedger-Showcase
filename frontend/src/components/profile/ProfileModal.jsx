import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ProfileModal.css';

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * 9.9.9 QA fix #2: the sidebar's account avatar (see Sidebar.jsx's
 * .sidebar__account-avatar) used to be a plain, non-interactive <span> -
 * it showed the user's initial (or a bare "?" when displayName was
 * falsy) but had no click handler at all. This is its destination: a
 * lightweight, read-only profile view.
 *
 * Deliberately reuses the exact same portal/focus-trap/escape/
 * backdrop-lock/scroll-lock mechanics as HelpModal.jsx (which itself
 * copied ConfirmDialog.jsx's) rather than inventing a third, divergent
 * dialog implementation - see HelpModal.jsx's own comment on this
 * convention. The Help button and HelpModal are untouched by this file.
 *
 * Shows only data already sitting in AuthContext (sourced from
 * GET /api/auth/me at login/register time - see AuthContext.jsx) - no
 * extra network request, and nothing here depends on Google OAuth being
 * configured. Works identically for a password account or a (future)
 * Google-linked account, since both produce the same { displayName,
 * email } shape from the backend.
 */
export function ProfileModal({ open, onClose, user }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector('[data-profile-modal-autofocus]');
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

  const initial = user?.displayName?.trim()?.charAt(0)?.toUpperCase() || '?';

  return createPortal(
    <div className="profile-modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="profile-modal__header">
          <p className="profile-modal__title" id={titleId}>
            Your profile
          </p>
          <button
            type="button"
            className="profile-modal__close"
            onClick={onClose}
            aria-label="Close"
            data-profile-modal-autofocus="true"
          >
            &times;
          </button>
        </div>

        <div className="profile-modal__body">
          <span className="profile-modal__avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="profile-modal__fields">
            <div className="profile-modal__field">
              <span className="eyebrow profile-modal__field-label">Display name</span>
              <span className="profile-modal__field-value">{user?.displayName || '\u2014'}</span>
            </div>
            <div className="profile-modal__field">
              <span className="eyebrow profile-modal__field-label">Email address</span>
              <span className="profile-modal__field-value">{user?.email || '\u2014'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
