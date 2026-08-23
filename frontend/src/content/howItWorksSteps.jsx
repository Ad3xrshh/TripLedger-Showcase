/**
 * The seven "how it works" steps, describing the exact TripLedger flow -
 * nothing here is invented; it mirrors the app's actual implemented
 * behavior (join codes, settlement units, verification modes, budget
 * thresholds, and the closure requirement).
 *
 * Originally lived inline inside LandingPage.jsx's HowItWorksView. Pulled
 * out here (9.9.9 QA fix) so the authenticated app's Help modal
 * (components/help/HelpModal.jsx) can present the identical content
 * instead of a second, divergent copy - the landing page's own rendering
 * is unchanged, it just now imports this array instead of defining it
 * inline.
 */
export const HOW_IT_WORKS_STEPS = [
  {
    tag: '01',
    title: 'Start a ledger',
    body: "Create a trip and you get a short join code automatically. You become the trip's owner and land on it with your own individual balance already set up.",
  },
  {
    tag: '02',
    title: 'Bring your group in',
    body: 'Everyone else signs up (or logs in) and enters the join code. Most people are tracked individually, but two people sharing one wallet — a couple, say — can be grouped into a single settlement unit so money isn’t split between them for no reason.',
  },
  {
    tag: '03',
    title: 'Log expenses as they happen',
    body: "Who paid, how much, and who it's split between. Leave the participant list blank and it defaults to the whole trip; pick specific people and only they share that one cost.",
  },
  {
    tag: '04',
    title: 'Verification, your way',
    html: 'Depending on how the trip is set up: <strong>automatic</strong> (logged is verified, instantly), <strong>member approval</strong> (at least one other member has to confirm it — the payer can never approve their own expense), or <strong>tiered</strong> (bigger amounts need more approvals than small ones).',
  },
  {
    tag: '05',
    title: 'Watch the budget',
    node: (
      <>
        A trip can run with no budget at all, a fixed total, or a fixed amount per person. Whichever it is, the
        indicator turns <span className="landing-tone-yellow">yellow</span> once verified spending crosses 70% of
        the limit, and <span className="landing-tone-red">red</span> at 100% or over.
      </>
    ),
  },
  {
    tag: '06',
    title: 'Settle up',
    body: "Every verified expense's fair share is worked out from just that expense's own participants, then totalled per person. Pay more than your share and you're owed money; pay less and you owe it. Trip Ledger then works out a simplified set of payments to zero everyone out — not \"everyone pays everyone.\"",
  },
  {
    tag: '07',
    title: 'Close the trip',
    body: "Every currently active member has to confirm before a trip closes. After that it's sealed read-only, permanently — no new expenses, no more approvals, nothing gets edited once money has actually changed hands.",
  },
];
