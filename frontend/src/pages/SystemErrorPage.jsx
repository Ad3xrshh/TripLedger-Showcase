import { useRouteError } from 'react-router-dom';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import './NotFoundPage.css';

/**
 * Registered as `errorElement` on the router's top-level route branches
 * (see app/router.jsx). React Router renders this in place of whatever
 * crashed - a render error or a thrown value anywhere in that branch -
 * instead of leaving a blank screen. This is the last line of defense,
 * not a replacement for the page/component-level ErrorState handling
 * everywhere else; ordinary API failures never reach this (they're caught
 * and displayed by the page itself).
 *
 * Never renders the crashed subtree's own chrome (it doesn't know what
 * state that subtree was in), and never surfaces the raw error to the
 * user - it's logged to the console for diagnosis instead.
 */
export function SystemErrorPage() {
  useDocumentTitle('Something went wrong \u00b7 Trip Ledger');
  const error = useRouteError();
  // eslint-disable-next-line no-console
  console.error('Unexpected application error:', error);

  return (
    <div className="not-found-page">
      <ErrorState
        eyebrow="SOMETHING WENT WRONG"
        title="Trip Ledger ran into an unexpected problem."
        description="Your data is safe - this is just a display issue. Reloading usually fixes it."
        onRetry={() => window.location.reload()}
        retryLabel="Reload"
        actions={[{ label: 'Back to my trips', to: '/', variant: 'secondary' }]}
      />
    </div>
  );
}
