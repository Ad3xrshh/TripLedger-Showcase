import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import { FormField } from '../components/ui/FormField.jsx';
import { Button } from '../components/ui/Button.jsx';
import { InlineError } from '../components/ui/InlineError.jsx';
import { humanizeErrorMessage } from '../utils/errorPresentation.js';
import './TripFormPage.css';

export function JoinTripPage() {
  useDocumentTitle('Join a trip \u00b7 Trip Ledger');
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const { trip } = await tripsApi.joinTrip(joinCode.trim());
      toast.success(`Joined "${trip.name}"`);
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        logout();
        return;
      }
      setError(humanizeErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="trip-form-page trip-form-page--join">
      <Link to="/" className="trip-form-page__back">
        &larr; My Trips
      </Link>

      <div className="trip-form-page__header">
        <h1 className="trip-form-page__title">Join a trip</h1>
        <p className="trip-form-page__description">
          Enter the code your trip owner shared with you — you'll land straight on their ledger.
        </p>
      </div>

      <form className="card card--lg trip-form-page__form" onSubmit={handleSubmit} noValidate>
        <div className="join-code-field">
          <FormField
            id="joinCode"
            label="Join code"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            placeholder="e.g. 7F3K9QT"
            className="join-code-field__input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            required
          />
          <p className="join-code-field__hint">Codes are 7 characters — ask whoever created the trip to share theirs.</p>
        </div>

        {error && <InlineError>{error}</InlineError>}

        <div className="trip-form-page__actions">
          <Link to="/" className="btn btn--ghost">
            Cancel
          </Link>
          <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting}>
            {isSubmitting ? 'Joining…' : 'Join trip'}
          </Button>
        </div>
      </form>
    </div>
  );
}
