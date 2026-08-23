// Phase 7: pure fair-share + settlement algorithm. Deliberately has NO
// database imports and NO Express dependencies - it operates entirely on
// plain JS data passed in by SettlementService, which makes it trivial to
// unit-test in isolation (tests/unit/settlementAlgorithm.test.js) without a
// running Postgres instance.
//
// All money is integer minor units (e.g. paise) throughout. Never use
// floating point for money math anywhere in this file.

/**
 * Divides an integer amount evenly among a list of participant settlement
 * unit IDs, with a documented deterministic remainder rule.
 *
 * Strategy:
 *   base = floor(amountMinor / participantCount)
 *   remainder = amountMinor % participantCount
 *   Participant IDs are sorted ascending (stable, deterministic - IDs are
 *   UUIDs, so lexicographic sort is a stable total order).
 *   The first `remainder` participants (in that sorted order) each get one
 *   extra minor unit on top of `base`; everyone else gets exactly `base`.
 *
 * This guarantees sum(shares) === amountMinor exactly, for any
 * participantCount >= 1, with no floating point involved.
 *
 * Returns a Map<settlementUnitId, shareMinor>.
 */
function divideAmount(amountMinor, participantUnitIds) {
  const sortedIds = [...participantUnitIds].sort();
  const n = sortedIds.length;
  const base = Math.floor(amountMinor / n);
  const remainder = amountMinor % n;

  const shares = new Map();
  sortedIds.forEach((unitId, index) => {
    const share = index < remainder ? base + 1 : base;
    shares.set(unitId, share);
  });
  return shares;
}

/**
 * Computes total paid, total fair share, and net balance for every
 * settlement unit that appears in the input, given a normalized list of
 * verified expenses.
 *
 * Input shape (per expense):
 *   { amountMinor, payerUnitId, participantUnitIds }
 *
 * Each expense's amount is divided ONLY among that expense's own
 * participantUnitIds (never the trip-wide participant list) - different
 * expenses may have completely different participant sets.
 *
 * `allUnitIds` (optional) lets the caller seed the result with every
 * settlement unit in the trip, including ones with zero paid/zero share
 * (e.g. a unit with no expenses at all still appears with all-zero
 * balances, per Phase 7 edge case #18).
 *
 * Returns an array of:
 *   { settlementUnitId, totalPaidMinor, fairShareMinor, netBalanceMinor }
 * sorted by settlementUnitId ascending (deterministic output order).
 */
function calculateFairShares(expenses, allUnitIds = []) {
  const totals = new Map();

  const ensure = (unitId) => {
    if (!totals.has(unitId)) {
      totals.set(unitId, { totalPaidMinor: 0, fairShareMinor: 0 });
    }
    return totals.get(unitId);
  };

  for (const unitId of allUnitIds) {
    ensure(unitId);
  }

  for (const expense of expenses) {
    const { amountMinor, payerUnitId, participantUnitIds } = expense;

    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error(`Invalid expense amountMinor: ${amountMinor}`);
    }
    if (!participantUnitIds || participantUnitIds.length === 0) {
      throw new Error('Expense has no participant settlement units');
    }

    ensure(payerUnitId).totalPaidMinor += amountMinor;

    const shares = divideAmount(amountMinor, participantUnitIds);
    for (const [unitId, shareMinor] of shares) {
      ensure(unitId).fairShareMinor += shareMinor;
    }
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([settlementUnitId, { totalPaidMinor, fairShareMinor }]) => ({
      settlementUnitId,
      totalPaidMinor,
      fairShareMinor,
      netBalanceMinor: totalPaidMinor - fairShareMinor,
    }));
}

/**
 * Critical financial invariant: the sum of every unit's net balance must be
 * exactly zero (every minor unit paid was allocated as someone's fair
 * share, and vice versa). Throws rather than silently adjusting anything -
 * per Phase 7 spec, a conservation failure must fail safe, never produce a
 * quietly-wrong settlement.
 */
function assertConservation(balances) {
  const sum = balances.reduce((acc, b) => acc + b.netBalanceMinor, 0);
  if (sum !== 0) {
    throw new Error(
      `Settlement conservation invariant violated: net balances sum to ${sum}, expected 0`
    );
  }
}

/**
 * Generates a minimal-ish set of settlement transactions (debtors pay
 * creditors) using deterministic greedy matching.
 *
 * Ordering (both lists, for determinism - same input always produces the
 * same output):
 *   creditors: largest balance first, tie -> settlementUnitId ascending
 *   debtors:   largest debt first,    tie -> settlementUnitId ascending
 *
 * Repeatedly matches the current largest creditor against the current
 * largest debtor, transfers min(debt, credit), and advances past whichever
 * side hits zero. Never emits a transaction with amount <= 0 or
 * from === to (a unit with netBalanceMinor === 0 is neither a creditor nor
 * a debtor, so it never enters either list).
 */
function calculateSettlementTransactions(balances) {
  const creditors = balances
    .filter((b) => b.netBalanceMinor > 0)
    .map((b) => ({ settlementUnitId: b.settlementUnitId, amount: b.netBalanceMinor }))
    .sort((a, b) => b.amount - a.amount || (a.settlementUnitId < b.settlementUnitId ? -1 : 1));

  const debtors = balances
    .filter((b) => b.netBalanceMinor < 0)
    .map((b) => ({ settlementUnitId: b.settlementUnitId, amount: -b.netBalanceMinor }))
    .sort((a, b) => b.amount - a.amount || (a.settlementUnitId < b.settlementUnitId ? -1 : 1));

  const transactions = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0 && creditor.settlementUnitId !== debtor.settlementUnitId) {
      transactions.push({
        fromSettlementUnitId: debtor.settlementUnitId,
        toSettlementUnitId: creditor.settlementUnitId,
        amountMinor: amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return transactions;
}

export { divideAmount, calculateFairShares, assertConservation, calculateSettlementTransactions };
