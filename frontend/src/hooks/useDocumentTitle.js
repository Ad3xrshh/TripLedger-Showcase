import { useEffect } from 'react';

/**
 * Sets document.title for the lifetime of the calling page component,
 * restoring the previous title on unmount (so navigating away - e.g. a
 * dialog's route-level fallback, or back navigation mid-transition -
 * never leaves a stale title behind). Every routed page in app/router.jsx
 * calls this once with its own title; index.html's static "Trip Ledger"
 * was otherwise never updated by anything, so a screen reader or browser
 * user had no way to tell which page they were on after client-side
 * navigation.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
