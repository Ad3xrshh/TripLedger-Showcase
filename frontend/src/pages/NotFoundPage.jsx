import { ErrorState } from '../components/ui/ErrorState.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import './NotFoundPage.css';

// A route that doesn't exist isn't fixed by asking again - no retry here,
// only a safe way back into the app. This is the router's top-level `*`
// catch-all (see app/router.jsx), rendered outside both AuthLayout and
// AppShell, so it stays a plain, self-contained block rather than
// assuming either chrome is present.
export function NotFoundPage() {
  useDocumentTitle('Not found \u00b7 Trip Ledger');
  return (
    <div className="not-found-page">
      <ErrorState
        eyebrow="NOT FOUND"
        title="That page doesn't exist."
        description="Check the link, or head back to your trips."
        actions={[{ label: 'Back to my trips', to: '/', variant: 'primary' }]}
      />
    </div>
  );
}
