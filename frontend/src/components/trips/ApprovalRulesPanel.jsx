import { useEffect, useState } from 'react';
import * as approvalRulesApi from '../../api/approvalRules.js';
import { useToast } from '../../hooks/useToast.js';
import { FormField } from '../ui/FormField.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ErrorState } from '../ui/ErrorState.jsx';
import { InlineError } from '../ui/InlineError.jsx';
import { humanizeErrorMessage, isRetryableError } from '../../utils/errorPresentation.js';
import { formatMoneyMinor } from '../../utils/format.js';
import './ApprovalRulesPanel.css';

// Mirrors the role check in ExpenseApprovalService.createApprovalRule -
// only an owner or admin may add a rule. Everyone on the trip can still
// see the configured tiers (the GET endpoint has no role restriction).
const RULE_MANAGER_ROLES = ['owner', 'admin'];

/**
 * Shown on the trip detail page only when verification_mode === 'tiered'.
 * approval_rules are amount tiers (min/max minor amount -> required
 * approvals) that ExpenseApprovalService.calculateRequiredApprovals reads
 * for every tiered-mode expense - without at least one rule covering an
 * expense's amount, approving it will fail with APPROVAL_RULE_NOT_FOUND
 * (surfaced in ExpenseVerificationPanel). This panel is how a trip owner
 * configures those tiers, and how any member can see them.
 */
export function ApprovalRulesPanel({ tripId, currency, myRole, isTripClosed = false }) {
  const [rules, setRules] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadToken, setLoadToken] = useState(0);

  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [requiredApprovals, setRequiredApprovals] = useState('1');
  const [formError, setFormError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const { toast } = useToast();

  function load() {
    return approvalRulesApi.listApprovalRules(tripId).then(setRules);
  }

  useEffect(() => {
    let cancelled = false;
    setRules(null);
    setLoadError(null);

    load().catch((err) => {
      if (!cancelled) setLoadError(err);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, loadToken]);

  async function handleCreate(event) {
    event.preventDefault();
    if (isCreating) return;

    setFormError(null);

    const minNumber = Number(minAmount);
    if (minAmount === '' || Number.isNaN(minNumber) || minNumber < 0) {
      setFormError('Enter a valid minimum amount (0 or more).');
      return;
    }
    const requiredNumber = Number(requiredApprovals);
    if (!Number.isInteger(requiredNumber) || requiredNumber < 1) {
      setFormError('Required approvals must be a whole number of 1 or more.');
      return;
    }
    let maxNumber = null;
    if (maxAmount !== '') {
      maxNumber = Number(maxAmount);
      if (Number.isNaN(maxNumber) || maxNumber <= 0) {
        setFormError('Max amount must be a positive number, or left blank for no upper bound.');
        return;
      }
    }

    setIsCreating(true);
    try {
      await approvalRulesApi.createApprovalRule(tripId, {
        minAmountMinor: Math.round(minNumber * 100),
        maxAmountMinor: maxNumber == null ? undefined : Math.round(maxNumber * 100),
        requiredApprovals: requiredNumber,
      });
      setMinAmount('');
      setMaxAmount('');
      setRequiredApprovals('1');
      await load();
      toast.success('Approval rule added');
    } catch (err) {
      setFormError(humanizeErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  }

  // Phase 9.7: a closed trip is read-only server-side
  // (ExpenseApprovalService.createApprovalRule now rejects with 409
  // TRIP_ALREADY_CLOSED) - hide the create-rule form once closed rather
  // than let a member submit it and hit that error. The configured tiers
  // above stay visible either way, since GET isn't restricted.
  const canManage = RULE_MANAGER_ROLES.includes(myRole) && !isTripClosed;

  return (
    <section className="card card--lg approval-rules">
      <h2 className="approval-rules__title">Tiered approval rules</h2>

      {loadError && (
        <ErrorState
          compact
          title={loadError.message}
          onRetry={isRetryableError(loadError) ? () => setLoadToken((t) => t + 1) : undefined}
        />
      )}

      {rules && rules.length === 0 && (
        <EmptyState
          compact
          title="No approval rules yet"
          description={
            canManage
              ? "Until at least one rule is added below, expenses can't be approved on this trip."
              : "Until the trip owner or an admin adds one, expenses can't be approved on this trip."
          }
        />
      )}

      {rules && rules.length > 0 && (
        <ul className="approval-rules__list">
          {rules.map((rule) => (
            <li key={rule.id} className="approval-rules__rule">
              <span className="approval-rules__rule-range mono">
                {formatMoneyMinor(rule.min_amount_minor, currency)}
                {rule.max_amount_minor != null ? ` \u2013 ${formatMoneyMinor(rule.max_amount_minor, currency)}` : '+'}
              </span>
              <span className="badge approval-rules__rule-count">
                {rule.required_approvals} approval{rule.required_approvals === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form className="approval-rules__form" onSubmit={handleCreate}>
          <div className="approval-rules__form-row">
            <FormField
              id="minAmount"
              label="Min amount"
              type="number"
              min="0"
              step="0.01"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              required
            />
            <FormField
              id="maxAmount"
              label="Max amount (blank = no limit)"
              type="number"
              min="0.01"
              step="0.01"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
            <FormField
              id="requiredApprovals"
              label="Required approvals"
              type="number"
              min="1"
              step="1"
              value={requiredApprovals}
              onChange={(e) => setRequiredApprovals(e.target.value)}
              required
            />
          </div>
          {formError && <InlineError>{formError}</InlineError>}
          <Button type="submit" variant="secondary" disabled={isCreating} isLoading={isCreating}>
            {isCreating ? 'Adding…' : 'Add rule'}
          </Button>
        </form>
      )}
    </section>
  );
}
