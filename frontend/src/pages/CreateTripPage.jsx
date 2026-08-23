import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import * as tripsApi from '../api/trips.js';
import { FormField } from '../components/ui/FormField.jsx';
import { SelectField } from '../components/ui/SelectField.jsx';
import { Button } from '../components/ui/Button.jsx';
import { InlineError } from '../components/ui/InlineError.jsx';
import { TicketDivider } from '../components/ui/TicketDivider.jsx';
import { humanizeErrorMessage } from '../utils/errorPresentation.js';
import './TripFormPage.css';

// Mirrors backend/src/validators/tripValidators.js exactly - these are
// not invented, they're the real enum values the backend accepts.
const BUDGET_TYPES = [
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'fixed_total', label: 'Fixed total' },
  { value: 'fixed_per_person', label: 'Fixed per person' },
];

const VERIFICATION_MODES = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'member_approval', label: 'Member approval' },
  { value: 'tiered', label: 'Tiered approval' },
];

// 9.9.9 Batch 1 issue #6: the settlement engine only ever implements one
// calculation mode (equal split across settlement units - see
// backend/src/services/settlement/settlementAlgorithm.js). The previous
// dropdown offered three modes ('equal_per_user', 'by_headcount',
// 'custom_weight') the backend didn't actually implement, and even
// defaulted to one of them - every trip creation would have failed
// validation. There's no real choice to expose here: every trip already
// uses 'equal_per_unit', and "everyone individually" vs "some people
// share a wallet" is just a matter of which settlement units exist
// (configurable per-member from Trip Detail after creation), not a
// different fair-share algorithm.
const FAIR_SHARE_METHOD = 'equal_per_unit';

export function CreateTripPage() {
  useDocumentTitle('Create a trip \u00b7 Trip Ledger');
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [budgetType, setBudgetType] = useState('unlimited');
  // Entered in the currency's main unit (e.g. rupees) for a readable form;
  // converted to minor units (paise) only at submit time, since that's
  // purely a display/formatting concern, not a validation rule.
  const [budgetAmount, setBudgetAmount] = useState('');
  const [verificationMode, setVerificationMode] = useState('automatic');

  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    const payload = {
      name,
      currency,
      budgetType,
      fairShareMethod: FAIR_SHARE_METHOD,
      verificationMode,
    };
    if (startDate) payload.startDate = startDate;
    if (endDate) payload.endDate = endDate;
    if (budgetType !== 'unlimited' && budgetAmount !== '') {
      payload.budgetAmountMinor = Math.round(Number(budgetAmount) * 100);
    }

    try {
      const { trip } = await tripsApi.createTrip(payload);
      toast.success('Trip created');
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
    <div className="trip-form-page trip-form-page--create">
      <Link to="/" className="trip-form-page__back">
        &larr; My Trips
      </Link>

      <div className="trip-form-page__header">
        <h1 className="trip-form-page__title">Create a trip</h1>
        <p className="trip-form-page__description">
          Set up a new shared ledger — everyone you invite can log expenses and see the running fair split.
        </p>
      </div>

      <form className="card card--lg trip-form-page__form" onSubmit={handleSubmit} noValidate>
        <fieldset className="trip-form-page__section">
          <legend className="eyebrow trip-form-page__section-label">Trip basics</legend>

          <FormField
            id="name"
            label="Trip name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            required
          />

          <div className="trip-form-page__row">
            <FormField
              id="startDate"
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <FormField
              id="endDate"
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <FormField
            id="currency"
            label="Currency (3-letter code)"
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </fieldset>

        <TicketDivider />

        <fieldset className="trip-form-page__section">
          <legend className="eyebrow trip-form-page__section-label">Budget &amp; rules</legend>
          <p className="trip-form-page__section-description">
            How costs are split and verified — every member can see this, and it can be fine-tuned later.
          </p>

          <SelectField
            id="budgetType"
            label="Budget type"
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value)}
            options={BUDGET_TYPES}
          />

          {budgetType !== 'unlimited' && (
            <FormField
              id="budgetAmount"
              label={budgetType === 'fixed_per_person' ? 'Budget per person' : 'Total budget'}
              type="number"
              min="0.01"
              step="0.01"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              required
            />
          )}

          <p className="trip-form-page__field-note">
            Costs settle equally across each settlement unit. By default that's one unit per person - from Trip
            Detail, members can group into a shared unit later (e.g. a couple splitting one wallet).
          </p>

          <SelectField
            id="verificationMode"
            label="Expense verification"
            value={verificationMode}
            onChange={(e) => setVerificationMode(e.target.value)}
            options={VERIFICATION_MODES}
          />
        </fieldset>

        {error && <InlineError>{error}</InlineError>}

        <div className="trip-form-page__actions">
          <Link to="/" className="btn btn--ghost">
            Cancel
          </Link>
          <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting}>
            {isSubmitting ? 'Creating trip…' : 'Create trip'}
          </Button>
        </div>
      </form>
    </div>
  );
}
