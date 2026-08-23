import { useState } from 'react';
import { FormField } from '../ui/FormField.jsx';
import { Button } from '../ui/Button.jsx';
import { InlineError } from '../ui/InlineError.jsx';
import { fromDatetimeLocalValue } from '../../utils/format.js';
import './ExpenseForm.css';

/**
 * Shared form for creating and editing an expense. The backend
 * (expenseValidators.js) is the source of truth for every constraint here -
 * this file only adds usability-level checks on top, matching
 * CreateTripPage.jsx's convention of client validation + backend authority.
 *
 * settlementUnits: the trip's current units (id, kind, display_name) from
 * GET /api/trips/:tripId (see settlementUnitRepository.js UNIT_COLUMNS).
 * initialValues (edit mode only): { amount, description, category,
 * occurredAtLocal, participantSettlementUnitIds }.
 */
export function ExpenseForm({ settlementUnits, initialValues, onSubmit, submitting, submitError, submitLabel }) {
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [category, setCategory] = useState(initialValues?.category ?? '');
  const [occurredAtLocal, setOccurredAtLocal] = useState(initialValues?.occurredAtLocal ?? '');
  const [participantIds, setParticipantIds] = useState(
    () => new Set(initialValues?.participantSettlementUnitIds ?? settlementUnits.map((u) => u.id))
  );
  const [validationError, setValidationError] = useState(null);

  function toggleParticipant(unitId) {
    setParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    setValidationError(null);

    const amountNumber = Number(amount);
    if (!amount || Number.isNaN(amountNumber) || amountNumber <= 0) {
      setValidationError('Enter a valid amount greater than 0.');
      return;
    }
    if (!description.trim()) {
      setValidationError('Description is required.');
      return;
    }
    if (!occurredAtLocal) {
      setValidationError('Choose when the expense occurred.');
      return;
    }
    if (participantIds.size === 0) {
      setValidationError('Select at least one participant.');
      return;
    }

    const payload = {
      // Entered in the currency's main unit for readability; converted to
      // integer minor units only here at submit time, matching
      // CreateTripPage.jsx's budgetAmount pattern. Never floating-point
      // beyond this single rounding step.
      amountMinor: Math.round(amountNumber * 100),
      description: description.trim(),
      occurredAt: fromDatetimeLocalValue(occurredAtLocal),
      participantSettlementUnitIds: Array.from(participantIds),
    };
    if (category.trim()) payload.category = category.trim();

    onSubmit(payload);
  }

  return (
    <form className="card card--lg expense-form" onSubmit={handleSubmit} noValidate>
      <FormField
        id="amount"
        label="Amount"
        type="number"
        min="0.01"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
      />

      <FormField
        id="description"
        label="Description"
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={300}
        required
      />

      <FormField
        id="category"
        label="Category (optional)"
        type="text"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        maxLength={50}
      />

      <FormField
        id="occurredAt"
        label="Occurred at"
        type="datetime-local"
        value={occurredAtLocal}
        onChange={(e) => setOccurredAtLocal(e.target.value)}
        required
      />

      <fieldset className="expense-form__participants">
        <legend className="eyebrow expense-form__participants-legend">Participants</legend>
        <div className="expense-form__participant-list">
          {settlementUnits.map((unit) => (
            <label
              key={unit.id}
              className={
                participantIds.has(unit.id)
                  ? 'expense-form__participant expense-form__participant--checked'
                  : 'expense-form__participant'
              }
            >
              <input
                type="checkbox"
                className="expense-form__participant-input"
                checked={participantIds.has(unit.id)}
                onChange={() => toggleParticipant(unit.id)}
              />
              {unit.display_name}
            </label>
          ))}
        </div>
      </fieldset>

      {(validationError || submitError) && <InlineError>{validationError || submitError}</InlineError>}

      <Button type="submit" disabled={submitting} isLoading={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
