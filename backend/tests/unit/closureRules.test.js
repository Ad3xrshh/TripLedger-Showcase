import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allActiveMembersConfirmed,
  missingConfirmations,
  assertLedgerIsMutable,
} from '../../src/services/tripClosure/closureRules.js';

test('allActiveMembersConfirmed: true when every active member has confirmed', () => {
  const active = ['a', 'b', 'c'];
  const confirmed = ['b', 'a', 'c']; // order/duplication-independent
  assert.equal(allActiveMembersConfirmed(active, confirmed), true);
});

test('allActiveMembersConfirmed: false when some active members have not confirmed', () => {
  const active = ['a', 'b', 'c'];
  const confirmed = ['a', 'b'];
  assert.equal(allActiveMembersConfirmed(active, confirmed), false);
});

test('allActiveMembersConfirmed: false on an empty active member list (no vacuous truth)', () => {
  assert.equal(allActiveMembersConfirmed([], []), false);
});

test('allActiveMembersConfirmed: extra confirmations from non-active (e.g. departed) members are ignored', () => {
  const active = ['a', 'b'];
  const confirmed = ['a', 'b', 'departed-member'];
  assert.equal(allActiveMembersConfirmed(active, confirmed), true);
});

test('allActiveMembersConfirmed: a newly-joined member who has not confirmed blocks completion', () => {
  const active = ['a', 'b', 'new-member'];
  const confirmed = ['a', 'b'];
  assert.equal(allActiveMembersConfirmed(active, confirmed), false);
});

test('missingConfirmations: returns exactly the active members who have not confirmed', () => {
  const active = ['a', 'b', 'c'];
  const confirmed = ['b'];
  assert.deepEqual(missingConfirmations(active, confirmed), ['a', 'c']);
});

test('missingConfirmations: empty array when everyone has confirmed', () => {
  const active = ['a', 'b'];
  const confirmed = ['a', 'b'];
  assert.deepEqual(missingConfirmations(active, confirmed), []);
});

test('missingConfirmations: all active members missing when nobody has confirmed', () => {
  const active = ['a', 'b'];
  assert.deepEqual(missingConfirmations(active, []), ['a', 'b']);
});

// 9.9.9 Batch 1 issue #1: assertLedgerIsMutable is the single central
// ledger-freeze rule every mutation site (expenses, approvals, approval
// rules, settlement units) now goes through.
test('assertLedgerIsMutable: does not throw for an active trip', () => {
  assert.doesNotThrow(() => assertLedgerIsMutable({ status: 'active' }, 'do this'));
});

test('assertLedgerIsMutable: throws TRIP_LEDGER_FROZEN (409) while closing', () => {
  assert.throws(
    () => assertLedgerIsMutable({ status: 'closing' }, 'add new expenses'),
    (err) => {
      assert.equal(err.code, 'TRIP_LEDGER_FROZEN');
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /add new expenses/);
      return true;
    }
  );
});

test('assertLedgerIsMutable: throws TRIP_ALREADY_CLOSED (409) once closed', () => {
  assert.throws(
    () => assertLedgerIsMutable({ status: 'closed' }, 'edit expenses'),
    (err) => {
      assert.equal(err.code, 'TRIP_ALREADY_CLOSED');
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /edit expenses/);
      return true;
    }
  );
});
