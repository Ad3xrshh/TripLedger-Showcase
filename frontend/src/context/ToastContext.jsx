import { createContext, useCallback, useMemo, useRef, useState } from 'react';

export const ToastContext = createContext(undefined);

// Success/info shouldn't linger and block the next one from showing
// cleanly; error gets longer, since "remain visible long enough to
// understand" matters more for something that went wrong - but every
// toast, error included, also has a manual dismiss button (see
// ToastViewport.jsx), so this is a ceiling, not the only way out.
const AUTO_DISMISS_MS = {
  success: 4000,
  info: 4000,
  error: 8000,
};

let nextToastId = 0;

/**
 * Lightweight, supplementary confirmation for a completed action -
 * "what just happened", not a replacement for ErrorState (page/component
 * load failures), inline form/action errors, or ConfirmDialog (irreversible
 * actions). Those three keep doing exactly what they did before 9.9.6;
 * toast only ever supplements a success that would otherwise have no
 * feedback of its own (e.g. a page navigating away, or a form silently
 * closing).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type, message) => {
      const id = ++nextToastId;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timeoutId = setTimeout(() => dismiss(id), AUTO_DISMISS_MS[type] ?? AUTO_DISMISS_MS.success);
      timeoutsRef.current.set(id, timeoutId);
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
    }),
    [show]
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
