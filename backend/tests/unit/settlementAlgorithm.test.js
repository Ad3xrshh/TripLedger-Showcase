import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  divideAmount,
  calculateFairShares,
  assertConservation,
  calculateSettlementTransactions,
} from '../../src/services/settlement/settlementAlgorithm.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const D = '44444444-4444-4444-4444-444444444444';

// ---------------------------------------------------------------------------
// divideAmount / remainder handling
// ---------------------------------------------------------------------------

test('divideAmount: even split between 2 participants', () => {
  const shares = divideAmount(10000, [A, B]);
  assert.equal(shares.get(A), 5000);
  assert.equal(shares.get(B), 5000);
});

test('divideAmount: 100 minor units / 3 participants - deterministic remainder', () => {
  const shares = divideAmount(100, [C, A, B]);
  // sorted ascending: A, B, C - first `remainder` (1) gets +1
  assert.equal(shares.get(A), 34);
  assert.equal(shares.get(B), 33);
  assert.equal(shares.get(C), 33);
  assert.equal(shares.get(A) + shares.get(B) + shares.get(C), 100);
});

test('divideAmount: never loses or creates money for any participant count', () => {
  for (const amount of [1, 7, 99, 100, 101, 999999]) {
    for (const ids of [[A], [A, B], [A, B, C], [A, B, C, D]]) {
      const shares = divideAmount(amount, ids);
      const total = [...shares.values()].reduce((s, v) => s + v, 0);
      assert.equal(total, amount, `amount=${amount} participants=${ids.length}`);
    }
  }
});

test('divideAmount: single participant gets the full amount', () => {
  const shares = divideAmount(12345, [A]);
  assert.equal(shares.get(A), 12345);
});

// ---------------------------------------------------------------------------
// calculateFairShares
// ---------------------------------------------------------------------------

test('calculateFairShares: 2 participants, equal split, one payer', () => {
  const balances = calculateFairShares([
    { amountMinor: 10000, payerUnitId: A, participantUnitIds: [A, B] },
  ]);

  const a = balances.find((b) => b.settlementUnitId === A);
  const b = balances.find((b) => b.settlementUnitId === B);
  assert.equal(a.totalPaidMinor, 10000);
  assert.equal(a.fairShareMinor, 5000);
  assert.equal(a.netBalanceMinor, 5000);
  assert.equal(b.totalPaidMinor, 0);
  assert.equal(b.fairShareMinor, 5000);
  assert.equal(b.netBalanceMinor, -5000);
});

test('calculateFairShares: 3 participants, equal split', () => {
  const balances = calculateFairShares([
    { amountMinor: 900, payerUnitId: A, participantUnitIds: [A, B, C] },
  ]);
  for (const unit of balances) {
    assert.equal(unit.fairShareMinor, 300);
  }
  assert.equal(balances.find((b) => b.settlementUnitId === A).netBalanceMinor, 600);
  assert.equal(balances.find((b) => b.settlementUnitId === B).netBalanceMinor, -300);
  assert.equal(balances.find((b) => b.settlementUnitId === C).netBalanceMinor, -300);
});

test('calculateFairShares: different participant sets per expense - the excluded unit is not charged', () => {
  const balances = calculateFairShares([
    { amountMinor: 900, payerUnitId: A, participantUnitIds: [A, B, C] },
    { amountMinor: 600, payerUnitId: A, participantUnitIds: [A, B] }, // C not involved
  ]);

  const c = balances.find((b) => b.settlementUnitId === C);
  assert.equal(c.fairShareMinor, 300); // only from expense 1
  assert.equal(c.totalPaidMinor, 0);
});

test('calculateFairShares: worked example from the Phase 7 spec (Family A/B/C)', () => {
  const balances = calculateFairShares([
    { amountMinor: 30000, payerUnitId: A, participantUnitIds: [A, B, C] },
    { amountMinor: 20000, payerUnitId: B, participantUnitIds: [A, B, C] },
    { amountMinor: 10000, payerUnitId: C, participantUnitIds: [A, B, C] },
  ]);

  const a = balances.find((b) => b.settlementUnitId === A);
  const b = balances.find((b) => b.settlementUnitId === B);
  const c = balances.find((b) => b.settlementUnitId === C);

  assert.equal(a.totalPaidMinor, 30000);
  assert.equal(b.totalPaidMinor, 20000);
  assert.equal(c.totalPaidMinor, 10000);

  // Note: 30000 divides evenly by 3 (10000/10000/10000), but 20000 and
  // 10000 do NOT divide evenly by 3 - each of those two expenses has its
  // own remainder distributed independently (per-expense, per the
  // deterministic rule: sorted-ascending participant IDs get the +1s), so
  // the totals below are 20001/20000/19999 rather than an idealized
  // 20000/20000/20000. This is correct, expected behavior, not a rounding
  // bug - the spec's rupee example (33.34/33.33/33.33) makes the same
  // point. The only hard guarantee is exact conservation, verified below.
  assert.equal(a.fairShareMinor, 20001);
  assert.equal(b.fairShareMinor, 20000);
  assert.equal(c.fairShareMinor, 19999);

  const sumFairShare = a.fairShareMinor + b.fairShareMinor + c.fairShareMinor;
  assert.equal(sumFairShare, 60000);

  const sumNet = a.netBalanceMinor + b.netBalanceMinor + c.netBalanceMinor;
  assert.equal(sumNet, 0);
  assert.equal(b.netBalanceMinor, 0);
});

test('calculateFairShares: payer paid everything, others paid nothing', () => {
  const balances = calculateFairShares([
    { amountMinor: 300, payerUnitId: A, participantUnitIds: [A, B, C] },
  ]);
  assert.equal(balances.find((b) => b.settlementUnitId === A).totalPaidMinor, 300);
  assert.equal(balances.find((b) => b.settlementUnitId === B).totalPaidMinor, 0);
  assert.equal(balances.find((b) => b.settlementUnitId === C).totalPaidMinor, 0);
});

test('calculateFairShares: allUnitIds seeds units with zero expenses into the result', () => {
  const balances = calculateFairShares(
    [{ amountMinor: 1000, payerUnitId: A, participantUnitIds: [A, B] }],
    [A, B, C] // C has no expenses at all
  );
  const c = balances.find((b) => b.settlementUnitId === C);
  assert.ok(c, 'expected unit C to appear even with zero expenses');
  assert.equal(c.totalPaidMinor, 0);
  assert.equal(c.fairShareMinor, 0);
  assert.equal(c.netBalanceMinor, 0);
});

test('calculateFairShares: zero expenses returns all-zero balances for known units', () => {
  const balances = calculateFairShares([], [A, B]);
  assert.equal(balances.length, 2);
  for (const unit of balances) {
    assert.equal(unit.totalPaidMinor, 0);
    assert.equal(unit.fairShareMinor, 0);
    assert.equal(unit.netBalanceMinor, 0);
  }
});

test('calculateFairShares: single settlement unit is trivially settled', () => {
  const balances = calculateFairShares(
    [{ amountMinor: 500, payerUnitId: A, participantUnitIds: [A] }],
    [A]
  );
  assert.equal(balances.length, 1);
  assert.equal(balances[0].netBalanceMinor, 0);
});

test('calculateFairShares: deterministic output order (sorted by settlementUnitId)', () => {
  const balances = calculateFairShares(
    [{ amountMinor: 300, payerUnitId: C, participantUnitIds: [A, B, C] }],
    [C, A, B]
  );
  assert.deepEqual(
    balances.map((b) => b.settlementUnitId),
    [A, B, C]
  );
});

test('calculateFairShares: rejects a non-positive amount', () => {
  assert.throws(() => {
    calculateFairShares([{ amountMinor: 0, payerUnitId: A, participantUnitIds: [A, B] }]);
  });
  assert.throws(() => {
    calculateFairShares([{ amountMinor: -100, payerUnitId: A, participantUnitIds: [A, B] }]);
  });
});

test('calculateFairShares: rejects an expense with no participants', () => {
  assert.throws(() => {
    calculateFairShares([{ amountMinor: 100, payerUnitId: A, participantUnitIds: [] }]);
  });
});

// ---------------------------------------------------------------------------
// assertConservation
// ---------------------------------------------------------------------------

test('assertConservation: passes when balances sum to zero', () => {
  assert.doesNotThrow(() => {
    assertConservation([
      { settlementUnitId: A, netBalanceMinor: 500 },
      { settlementUnitId: B, netBalanceMinor: -500 },
    ]);
  });
});

test('assertConservation: throws when balances do not sum to zero', () => {
  assert.throws(() => {
    assertConservation([
      { settlementUnitId: A, netBalanceMinor: 500 },
      { settlementUnitId: B, netBalanceMinor: -400 },
    ]);
  });
});

test('assertConservation: a full calculateFairShares result always conserves, including with remainders', () => {
  const balances = calculateFairShares([
    { amountMinor: 100, payerUnitId: A, participantUnitIds: [A, B, C] },
    { amountMinor: 777, payerUnitId: B, participantUnitIds: [A, B, C, D] },
  ]);
  assert.doesNotThrow(() => assertConservation(balances));
});

// ---------------------------------------------------------------------------
// calculateSettlementTransactions
// ---------------------------------------------------------------------------

test('calculateSettlementTransactions: simple one-debtor/one-creditor', () => {
  const txns = calculateSettlementTransactions([
    { settlementUnitId: A, netBalanceMinor: 6000 },
    { settlementUnitId: B, netBalanceMinor: -6000 },
  ]);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].fromSettlementUnitId, B);
  assert.equal(txns[0].toSettlementUnitId, A);
  assert.equal(txns[0].amountMinor, 6000);
});

test('calculateSettlementTransactions: multiple debtors, one creditor', () => {
  const txns = calculateSettlementTransactions([
    { settlementUnitId: A, netBalanceMinor: 10000 },
    { settlementUnitId: B, netBalanceMinor: -6000 },
    { settlementUnitId: C, netBalanceMinor: -4000 },
  ]);
  const total = txns.reduce((s, t) => s + t.amountMinor, 0);
  assert.equal(total, 10000);
  assert.ok(txns.every((t) => t.toSettlementUnitId === A));
});

test('calculateSettlementTransactions: one debtor, multiple creditors', () => {
  const txns = calculateSettlementTransactions([
    { settlementUnitId: A, netBalanceMinor: 6000 },
    { settlementUnitId: B, netBalanceMinor: 4000 },
    { settlementUnitId: C, netBalanceMinor: -10000 },
  ]);
  const total = txns.reduce((s, t) => s + t.amountMinor, 0);
  assert.equal(total, 10000);
  assert.ok(txns.every((t) => t.fromSettlementUnitId === C));
});

test('calculateSettlementTransactions: multiple debtors and multiple creditors (spec worked example)', () => {
  const txns = calculateSettlementTransactions([
    { settlementUnitId: A, netBalanceMinor: 10000 },
    { settlementUnitId: B, netBalanceMinor: 5000 },
    { settlementUnitId: C, netBalanceMinor: -7000 },
    { settlementUnitId: D, netBalanceMinor: -8000 },
  ]);

  const totalFromDebtors = txns.reduce((s, t) => s + t.amountMinor, 0);
  assert.equal(totalFromDebtors, 15000);

  const receivedByUnit = {};
  const paidByUnit = {};
  for (const t of txns) {
    receivedByUnit[t.toSettlementUnitId] = (receivedByUnit[t.toSettlementUnitId] || 0) + t.amountMinor;
    paidByUnit[t.fromSettlementUnitId] = (paidByUnit[t.fromSettlementUnitId] || 0) + t.amountMinor;
  }
  assert.equal(receivedByUnit[A], 10000);
  assert.equal(receivedByUnit[B], 5000);
  assert.equal(paidByUnit[C], 7000);
  assert.equal(paidByUnit[D], 8000);
});

test('calculateSettlementTransactions: all-zero balances produce no transactions', () => {
  const txns = calculateSettlementTransactions([
    { settlementUnitId: A, netBalanceMinor: 0 },
    { settlementUnitId: B, netBalanceMinor: 0 },
  ]);
  assert.equal(txns.length, 0);
});

test('calculateSettlementTransactions: never emits amount <= 0 or from === to', () => {
  const txns = calculateSettlementTransactions([
    { settlementUnitId: A, netBalanceMinor: 5000 },
    { settlementUnitId: B, netBalanceMinor: -5000 },
    { settlementUnitId: C, netBalanceMinor: 0 },
  ]);
  for (const t of txns) {
    assert.ok(t.amountMinor > 0);
    assert.notEqual(t.fromSettlementUnitId, t.toSettlementUnitId);
  }
});

test('calculateSettlementTransactions: deterministic - same input twice gives identical output', () => {
  const input = [
    { settlementUnitId: D, netBalanceMinor: -8000 },
    { settlementUnitId: A, netBalanceMinor: 10000 },
    { settlementUnitId: C, netBalanceMinor: -7000 },
    { settlementUnitId: B, netBalanceMinor: 5000 },
  ];
  const first = calculateSettlementTransactions(input);
  const second = calculateSettlementTransactions(input);
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// End-to-end pure pipeline (fair shares -> conservation -> transactions)
// ---------------------------------------------------------------------------

test('end-to-end: uneven division settles to exactly zero after transactions applied', () => {
  const balances = calculateFairShares([
    { amountMinor: 100, payerUnitId: A, participantUnitIds: [A, B, C] },
  ]);
  assertConservation(balances);
  const txns = calculateSettlementTransactions(balances);

  const netAfter = new Map(balances.map((b) => [b.settlementUnitId, b.netBalanceMinor]));
  for (const t of txns) {
    netAfter.set(t.fromSettlementUnitId, netAfter.get(t.fromSettlementUnitId) + t.amountMinor);
    netAfter.set(t.toSettlementUnitId, netAfter.get(t.toSettlementUnitId) - t.amountMinor);
  }
  for (const [, remaining] of netAfter) {
    assert.equal(remaining, 0);
  }
});
