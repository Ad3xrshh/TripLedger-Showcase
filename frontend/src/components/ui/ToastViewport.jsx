import { createPortal } from 'react-dom';
import { useToast } from '../../hooks/useToast.js';
import './Toast.css';

/**
 * One aria-live="polite" region holding every current toast - polite
 * (not assertive) on purpose, for both success and error: nothing here
 * should interrupt what the user is doing. An error serious enough to
 * need the user's immediate attention already has its own inline
 * role="alert" text (ExpenseForm, ApprovalRulesPanel, ConfirmDialog,
 * etc. from 9.9.4/9.9.5) - this is only ever supplementary.
 */
export function ToastViewport() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-viewport" aria-live="polite" aria-atomic="false" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <p className="toast__message">{t.message}</p>
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
