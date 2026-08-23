import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  formatTripStatus,
  formatExpenseStatus,
  formatMoneyMinor,
} from './format.js';

// Pass 3 regression coverage for Pass 2.3 (date/time presentation audit).
// The audit itself was a source-level review confirming every UI surface
// routes through these functions rather than raw Date/ISO strings - these
// tests instead pin down what the functions themselves actually produce,
// so a future change to this file that reintroduces a raw ISO/locale leak
// fails a test instead of only being caught by re-reading the source again.

describe('formatDate', () => {
  it('formats a plain YYYY-MM-DD trip date without a time component', () => {
    // A trip's start_date/end_date are DATE columns (see backend's
    // src/config/db.js type-parser override) - plain calendar dates with
    // no time or timezone attached.
    const result = formatDate('2026-08-14');
    expect(result).not.toMatch(/T\d{2}:\d{2}/); // no raw ISO datetime leaking through
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/14/);
  });

  it('returns an empty string for a missing date rather than "Invalid Date"', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('falls back to the raw string for an unparseable date rather than throwing', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateRange', () => {
  it('joins a start and end date with an en dash', () => {
    const result = formatDateRange('2026-08-14', '2026-08-30');
    expect(result).toContain('–');
    expect(result).toMatch(/2026/);
  });

  it('falls back to a single date when only one side is present', () => {
    expect(formatDateRange('2026-08-14', null)).not.toContain('–');
    expect(formatDateRange(null, '2026-08-30')).not.toContain('–');
  });

  it('returns a readable placeholder when both dates are missing', () => {
    expect(formatDateRange(null, null)).toBe('Dates not set');
  });
});

describe('formatDateTime', () => {
  it('formats a full ISO datetime with both a date and a time component', () => {
    const result = formatDateTime('2026-08-19T02:39:00.000Z');
    // Exact wall-clock text depends on the runner's timezone, but a
    // datetime (unlike formatDate above) must always include a time part.
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/:/); // has a time separator somewhere
    expect(result).not.toMatch(/Z$/); // never leaks the raw ISO 'Z' suffix
  });

  it('returns an empty string for a missing value', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('')).toBe('');
  });
});

describe('toDatetimeLocalValue / fromDatetimeLocalValue round-trip', () => {
  it('round-trips an ISO datetime through the datetime-local input format', () => {
    const original = '2026-08-19T10:15:00.000Z';
    const localValue = toDatetimeLocalValue(original);
    // datetime-local inputs expect exactly "YYYY-MM-DDTHH:mm", no seconds
    // or timezone suffix.
    expect(localValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    const roundTripped = fromDatetimeLocalValue(localValue);
    // Converting back must yield a valid ISO string the backend's
    // z.string().datetime() validator will accept.
    expect(() => new Date(roundTripped).toISOString()).not.toThrow();
    expect(new Date(roundTripped).getTime()).toBe(new Date(original).getTime());
  });

  it('both directions return an empty string for a missing value rather than throwing', () => {
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue('')).toBe('');
    expect(fromDatetimeLocalValue(null)).toBe('');
    expect(fromDatetimeLocalValue('')).toBe('');
  });
});

describe('formatTripStatus / formatExpenseStatus', () => {
  it('maps every real backend status value to a human label', () => {
    // Mirrors the backend's actual enum values (see format.js's own
    // comments citing ExpenseService.js/the trips schema) - not invented.
    expect(formatTripStatus('active')).toBe('Active');
    expect(formatTripStatus('closing')).toBe('Closing');
    expect(formatTripStatus('closed')).toBe('Closed');
    expect(formatExpenseStatus('pending')).toBe('Pending');
    expect(formatExpenseStatus('verified')).toBe('Verified');
  });

  it('falls back to the raw value for an unrecognized status rather than hiding it', () => {
    expect(formatTripStatus('some_future_status')).toBe('some_future_status');
  });
});

describe('formatMoneyMinor', () => {
  it('converts minor units to a formatted currency string', () => {
    const result = formatMoneyMinor(150000, 'INR');
    expect(result).toMatch(/1,?500/); // 150000 minor units = 1500.00 major
  });

  it('returns null for a missing amount rather than "NaN"', () => {
    expect(formatMoneyMinor(null)).toBeNull();
    expect(formatMoneyMinor(undefined)).toBeNull();
  });
});
