import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import { TripCard } from '../components/trips/TripCard.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { humanizeErrorMessage, isRetryableError } from '../utils/errorPresentation.js';
import './HomePage.css';

// Real trip.status values from the backend (see utils/format.js's
// STATUS_LABELS, which mirrors the same enum) - grouping order puts what
// needs attention first and fully wrapped-up trips last.
const STATUS_GROUPS = [
  { status: 'active', heading: 'Active' },
  { status: 'closing', heading: 'Closing' },
  { status: 'closed', heading: 'Past trips' },
];

/**
 * "My Trips" - the authenticated landing page. Loads the real list of
 * trips the current user belongs to from GET /api/trips.
 */
export function HomePage() {
  useDocumentTitle('My Trips \u00b7 Trip Ledger');
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    tripsApi
      .listMyTrips()
      .then((data) => {
        if (!cancelled) setTrips(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.code === 'UNAUTHENTICATED') {
          logout();
          return;
        }
        setError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [logout, reloadToken]);

  // Purely presentational grouping of the exact same list the API
  // returned - no field is added, removed, or reinterpreted.
  const groupedTrips = useMemo(() => {
    if (!trips) return [];
    return STATUS_GROUPS.map((group) => ({
      ...group,
      trips: trips.filter((trip) => trip.status === group.status),
    })).filter((group) => group.trips.length > 0);
  }, [trips]);

  const firstName = user?.displayName?.split(' ')[0];

  // 9.9.9 QA fix #5: the delete request itself already succeeded server-
  // side (TripCard only calls this after a 204) - this just keeps this
  // page's own list in sync without a full reload, the same "report the
  // outcome, don't re-fetch" shape used elsewhere in this codebase.
  function handleTripDeleted(tripId) {
    setTrips((current) => (current ? current.filter((t) => t.id !== tripId) : current));
    toast.success('Trip deleted');
  }

  return (
    <div className="home-page">
      <div className="home-page__header">
        <div className="home-page__heading">
          <h1 className="home-page__title">{firstName ? `Welcome back, ${firstName}` : 'My Trips'}</h1>
          <p className="home-page__subtitle">Your trips, expenses, and settlements — all in one place.</p>
        </div>
        <div className="home-page__actions">
          <Button variant="secondary" onClick={() => navigate('/trips/join')}>
            Join a trip
          </Button>
          <Button variant="primary" onClick={() => navigate('/trips/new')}>
            Create trip
          </Button>
        </div>
      </div>

      {error && (
        <ErrorState
          eyebrow="COULDN'T LOAD YOUR TRIPS"
          title={humanizeErrorMessage(error)}
          onRetry={isRetryableError(error) ? () => setReloadToken((t) => t + 1) : undefined}
        />
      )}

      {trips === null && !error && (
        <div aria-busy="true">
          <span className="visually-hidden" role="status">
            Loading your trips…
          </span>
          <div className="home-page__grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton skeleton--card" />
            ))}
          </div>
        </div>
      )}

      {trips !== null && trips.length === 0 && (
        <EmptyState
          title="Your ledger is empty"
          description="Create a trip or join one with a code from a friend to start tracking shared expenses."
          actions={[
            { label: 'Create trip', to: '/trips/new', variant: 'primary' },
            { label: 'Join a trip', to: '/trips/join', variant: 'secondary' },
          ]}
        />
      )}

      {trips !== null &&
        trips.length > 0 &&
        groupedTrips.map((group) => (
          <section className="home-page__section" key={group.status} aria-labelledby={`trip-group-${group.status}`}>
            <h2 className="home-page__section-heading" id={`trip-group-${group.status}`}>
              {group.heading}
            </h2>
            <div className="home-page__grid">
              {group.trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} onDeleted={handleTripDeleted} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
