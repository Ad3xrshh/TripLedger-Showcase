import { describe, it, expect } from 'vitest';
import { humanizeErrorMessage, isRetryableError } from './errorPresentation.js';

// 9.9.9 QA fix #4: proves the exact reported scenario (a raw
// VALIDATION_ERROR dump shown during account creation) now reads as
// plain sentences, while every other error code - already human-phrased
// by the backend's service layer - passes through completely unchanged,
// per the "do not alter backend error codes/messages" constraint.
describe('humanizeErrorMessage', () => {
  it('returns an empty string for a missing error', () => {
    expect(humanizeErrorMessage(null)).toBe('');
    expect(humanizeErrorMessage(undefined)).toBe('');
  });

  it('strips the field-path prefix from a single-field VALIDATION_ERROR', () => {
    const error = { code: 'VALIDATION_ERROR', message: 'email: Must be a valid email address' };
    expect(humanizeErrorMessage(error)).toBe('Must be a valid email address.');
  });

  it('turns a multi-field VALIDATION_ERROR into plain, prefix-free sentences', () => {
    const error = {
      code: 'VALIDATION_ERROR',
      message: 'email: Must be a valid email address; password: Password must be at least 8 characters',
    };
    expect(humanizeErrorMessage(error)).toBe(
      'Must be a valid email address. Password must be at least 8 characters.'
    );
  });

  it('handles nested field paths (e.g. displayName) the same way', () => {
    const error = { code: 'VALIDATION_ERROR', message: 'displayName: Display name is required' };
    expect(humanizeErrorMessage(error)).toBe('Display name is required.');
  });

  it('does not add a duplicate period when the segment already ends with punctuation', () => {
    const error = { code: 'VALIDATION_ERROR', message: 'email: Invalid email!' };
    expect(humanizeErrorMessage(error)).toBe('Invalid email!');
  });

  it('leaves non-validation error messages completely unchanged', () => {
    const error = { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' };
    expect(humanizeErrorMessage(error)).toBe('An account with this email already exists');
  });

  it('leaves messages with no error code unchanged (e.g. network failures)', () => {
    const error = { message: 'Network error - please check your connection' };
    expect(humanizeErrorMessage(error)).toBe('Network error - please check your connection');
  });
});

// Pre-existing behavior (see isRetryableError's own JSDoc) - not part of
// the 9.9.9 QA pass, kept here only because it lives in the same file
// and previously had no dedicated test file.
describe('isRetryableError', () => {
  it('treats network failures (status 0) and server errors (5xx) as retryable', () => {
    expect(isRetryableError({ status: 0 })).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('treats expected 4xx errors as not retryable', () => {
    expect(isRetryableError({ status: 404 })).toBe(false);
    expect(isRetryableError({ status: 422 })).toBe(false);
  });

  it('returns false for a missing error', () => {
    expect(isRetryableError(null)).toBe(false);
  });
});
