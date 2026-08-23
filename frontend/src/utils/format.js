/**
 * Presentation-only formatting helpers. These never decide *whether*
 * something is valid or allowed - that stays on the backend - they only
 * turn already-valid backend data into readable text.
 */

const BUDGET_TYPE_LABELS = {
  fixed_total: 'Fixed total',
  fixed_per_person: 'Fixed per person',
  unlimited: 'Unlimited',
};

const FAIR_SHARE_LABELS = {
  equal_per_user: 'Equal per person',
  equal_per_unit: 'Equal per settlement unit',
  by_headcount: 'By headcount',
  custom_weight: 'Custom weight',
};

const VERIFICATION_MODE_LABELS = {
  automatic: 'Automatic',
  member_approval: 'Member approval',
  tiered: 'Tiered approval',
};

const STATUS_LABELS = {
  active: 'Active',
  closing: 'Closing',
  closed: 'Closed',
};

// Mirrors backend's trip_members.role CHECK constraint exactly (see
// backend/src/migrations/1700000000000_init-schema.sql) - not invented.
const TRIP_ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export function formatTripRole(role) {
  return TRIP_ROLE_LABELS[role] || role;
}

// Mirrors backend/src/services/ExpenseService.js EXPENSE_STATUSES exactly -
// these are not invented, they're the real enum values the backend uses.
const EXPENSE_STATUS_LABELS = {
  pending: 'Pending',
  verified: 'Verified',
  disputed: 'Disputed',
  rejected: 'Rejected',
  locked: 'Locked',
};

export function formatBudgetType(budgetType) {
  return BUDGET_TYPE_LABELS[budgetType] || budgetType;
}

export function formatExpenseStatus(status) {
  return EXPENSE_STATUS_LABELS[status] || status;
}

export function formatFairShareMethod(method) {
  return FAIR_SHARE_LABELS[method] || method;
}

export function formatVerificationMode(mode) {
  return VERIFICATION_MODE_LABELS[mode] || mode;
}

export function formatTripStatus(status) {
  return STATUS_LABELS[status] || status;
}

// Mirrors backend/src/services/BudgetService.js BUDGET_THRESHOLDS exactly -
// the backend decides green/yellow/red, this only supplies a human label
// for whichever status it returns. Never used to recompute the status.
const BUDGET_STATUS_LABELS = {
  green: 'Healthy',
  yellow: 'Approaching limit',
  red: 'Over budget',
};

export function formatBudgetStatus(status) {
  return BUDGET_STATUS_LABELS[status] || status;
}

// Mirrors the exact action strings recordEvent() is called with across the
// backend (ExpenseService, ExpenseApprovalService, TripService,
// SettlementService, TripClosureService) - see backend/src/services/*.js.
// Falls back to a readable version of the raw value for any future action
// this hasn't been updated for yet, rather than hiding it.
const HISTORY_ACTION_LABELS = {
  expense_created: 'Expense added',
  expense_approved: 'Expense approved',
  expense_verified: 'Expense verified',
  expense_rejected: 'Expense rejected',
  member_joined: 'Member joined',
  settlement_finalized: 'Settlement finalized',
  closure_confirmed: 'Closure confirmed',
  trip_closed: 'Trip closed',
};

export function formatHistoryAction(action) {
  if (HISTORY_ACTION_LABELS[action]) return HISTORY_ACTION_LABELS[action];
  if (!action) return 'Activity';
  return action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// budgetType is 'unlimited' | 'fixed_total' | 'fixed_per_person'. Percentage
// display only makes sense for the two finite types, and only when the
// backend actually returned percentageUsed (BudgetService omits it for
// unlimited) - this never derives a percentage on its own.
export function formatPercentageUsed(percentageUsed) {
  if (typeof percentageUsed !== 'number' || Number.isNaN(percentageUsed)) return null;
  return `${percentageUsed}%`;
}

// budgetAmountMinor is an integer count of the currency's minor unit
// (e.g. paise for INR, cents for USD) - display convention only.
export function formatMoneyMinor(minorAmount, currency = 'INR') {
  if (minorAmount == null) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minorAmount / 100);
  } catch {
    return `${(minorAmount / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'Dates not set';
  if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  return formatDate(startDate || endDate);
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// occurredAt / createdAt on expenses are full ISO datetimes (see
// expenseValidators.js: occurredAt is z.string().datetime()), unlike a
// trip's plain start/end dates - needs its own formatter with a time part.
export function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Converts an ISO datetime into the local value an <input type="datetime-local">
// expects ("YYYY-MM-DDTHH:mm"), so a stored UTC instant displays and edits
// in the user's own local time rather than raw UTC.
export function toDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Inverse of toDatetimeLocalValue - turns the <input type="datetime-local">
// value back into the ISO datetime string the backend's occurredAt
// validator (z.string().datetime()) requires.
export function fromDatetimeLocalValue(localValue) {
  if (!localValue) return '';
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}
