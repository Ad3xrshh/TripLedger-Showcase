import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { HeroScene } from '../components/landing/HeroScene.jsx';
import { HOW_IT_WORKS_STEPS } from '../content/howItWorksSteps.jsx';
import './LandingPage.css';

/**
 * The public landing page (see app/router.jsx's RootRoute - this renders
 * for `/` only when the visitor is not authenticated).
 *
 * Integrated with Three.js 3D ticket scene, pointer repulsion physics,
 * GSAP state-switch flip animations, and punch particles.
 */
export function LandingPage() {
  useDocumentTitle('Trip Ledger — Split trips. Settle fair.');
  const [view, setView] = useState('home'); // 'home' | 'how' | 'faq'
  const [heroState, setHeroState] = useState('open'); // 'open' | 'settled'
  // Pass 2.7: .landing-nav (Home/How it works/FAQ) is hidden outright
  // below 640px (see LandingPage.css) with nothing standing in for it -
  // this tracks whether the mobile replacement menu is open.
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  function selectMobileView(nextView) {
    setView(nextView);
    setIsMobileNavOpen(false);
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = view === 'home' ? 'hidden' : '';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [view]);

  const isSettled = heroState === 'settled';

  return (
    <div
      className={`landing-page${isSettled ? ' landing-page--settled' : ''}${
        view !== 'home' ? ' landing-page--scrollable' : ''
      }`}
    >
      <header className="landing-header">
        <div className="landing-header__logo">
          <svg
            className="landing-header__logo-icon"
            width="34"
            height="30"
            viewBox="0 0 100 90"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="34" y="6" width="18" height="78" fill="#f6f5f1" />
            <rect x="34" y="64" width="48" height="14" fill="#f6f5f1" />
            <rect x="58" y="26" width="34" height="7" fill="#f6f5f1" />
            <rect x="58" y="38" width="26" height="7" fill="#f6f5f1" />
            <rect x="58" y="50" width="30" height="7" fill="#f6f5f1" />
            <rect x="12" y="4" width="76" height="18" rx="9" fill="#2dbfa1" />
          </svg>
          <span className="landing-header__logo-word">
            <span className="landing-header__logo-trip">Trip</span>
            <span className="landing-header__logo-ledger">Ledger</span>
          </span>
        </div>

        <nav className="landing-nav" aria-label="Landing page">
          <button
            type="button"
            className={`landing-nav__item${view === 'home' ? ' landing-nav__item--active' : ''}`}
            onClick={() => setView('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={`landing-nav__item${view === 'how' ? ' landing-nav__item--active' : ''}`}
            onClick={() => setView('how')}
          >
            How it works
          </button>
          <button
            type="button"
            className={`landing-nav__item${view === 'faq' ? ' landing-nav__item--active' : ''}`}
            onClick={() => setView('faq')}
          >
            FAQ
          </button>
        </nav>

        <Link to="/login" className="landing-header__cta">
          Get started
        </Link>

        {/* Pass 2.7: mobile-only stand-in for .landing-nav, which hides
            outright at this width (see LandingPage.css). Same three
            destinations as the desktop pill nav, opened from a hamburger
            toggle instead of always-visible buttons. */}
        <button
          type="button"
          className="landing-mobile-nav-toggle"
          onClick={() => setIsMobileNavOpen((open) => !open)}
          aria-expanded={isMobileNavOpen}
          aria-controls="landing-mobile-nav"
          aria-label={isMobileNavOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileNavOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </header>

      {isMobileNavOpen && (
        <div id="landing-mobile-nav" className="landing-mobile-nav" aria-label="Landing page">
          <button
            type="button"
            className={`landing-mobile-nav__item${view === 'home' ? ' landing-mobile-nav__item--active' : ''}`}
            onClick={() => selectMobileView('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={`landing-mobile-nav__item${view === 'how' ? ' landing-mobile-nav__item--active' : ''}`}
            onClick={() => selectMobileView('how')}
          >
            How it works
          </button>
          <button
            type="button"
            className={`landing-mobile-nav__item${view === 'faq' ? ' landing-mobile-nav__item--active' : ''}`}
            onClick={() => selectMobileView('faq')}
          >
            FAQ
          </button>
          <Link to="/login" className="landing-mobile-nav__cta" onClick={() => setIsMobileNavOpen(false)}>
            Get started
          </Link>
        </div>
      )}

      {view === 'home' && (
        <div className="landing-page__view landing-page__view--home">
          <HeroScene heroState={heroState} view={view} />

          <main className="landing-hero">
            <div className="landing-hero__content">
              <div className="landing-hero__left">
                <h1 className="landing-hero__title">
                  <span className="landing-hero__title-outline">Split trips.</span>
                  <br />
                  <span className="landing-hero__title-accent">Settle fair.</span>
                </h1>
                <p className="landing-hero__description">
                  One shared ledger for every rupee spent on the trip. Log expenses as you go — split it fair the
                  moment someone hits settle. No spreadsheets, no chasing anyone for change.
                </p>
                <Link to="/login" className="landing-hero__primary-btn">
                  Start a ledger
                  <span className="landing-hero__plus-icon" aria-hidden="true">
                    +
                  </span>
                </Link>
                <div className="landing-hero__trust">
                  <div className="landing-hero__trust-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="landing-hero__trust-text">
                    <span className="landing-hero__trust-title">TRUSTED BY TRAVELERS</span>
                    <span className="landing-hero__trust-num mono">12,480 trips settled</span>
                  </div>
                </div>
              </div>

              <div className="landing-hero__right">
                <div className="landing-switcher">
                  <span className="landing-switcher__eyebrow">Every trip has two states</span>
                  <div className="landing-state-cards">
                    <button
                      type="button"
                      className={`landing-state-card${heroState === 'open' ? ' landing-state-card--active' : ''}`}
                      onClick={() => setHeroState('open')}
                      aria-pressed={heroState === 'open'}
                    >
                      <span className="landing-state-card__icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="1.6" />
                          <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="landing-state-card__label">Open Ledger</span>
                      <span className="landing-state-card__sub">Live balance</span>
                    </button>
                    <button
                      type="button"
                      className={`landing-state-card${heroState === 'settled' ? ' landing-state-card--active' : ''}`}
                      onClick={() => setHeroState('settled')}
                      aria-pressed={heroState === 'settled'}
                    >
                      <span className="landing-state-card__icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M5 13l4 4L19 7"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="landing-state-card__label">Settled Up</span>
                      <span className="landing-state-card__sub">All square</span>
                    </button>
                  </div>
                </div>
                <h2 className="landing-hero__side-title">
                  <span className="landing-hero__title-outline">Fair to</span>
                  <br />
                  <span className="landing-hero__title-accent">the last rupee.</span>
                </h2>
              </div>
            </div>
          </main>
        </div>
      )}

      {view === 'how' && <HowItWorksView />}
      {view === 'faq' && <FaqView />}
    </div>
  );
}

function HowItWorksView() {
  const steps = HOW_IT_WORKS_STEPS;

  return (
    <section className="landing-page__view landing-page__view--content">
      <div className="landing-page__inner">
        <span className="landing-page__eyebrow">The whole flow</span>
        <h1 className="landing-page__title">How Trip Ledger works</h1>
        <p className="landing-page__lede">
          Seven steps, start to close. Nothing here is a guess about what the product should do — it's what it
          actually does.
        </p>

        <div className="landing-steps">
          {steps.map((step) => (
            <div className="landing-step-card" key={step.tag}>
              <span className="landing-step-card__tag mono">{step.tag}</span>
              <h3>{step.title}</h3>
              {step.html ? <p dangerouslySetInnerHTML={{ __html: step.html }} /> : <p>{step.node ?? step.body}</p>}
            </div>
          ))}
        </div>

        <div className="landing-page__note">
          <p>
            <strong>One thing worth being upfront about:</strong> Trip Ledger doesn't move money. It tells you who
            owes whom, in as few payments as possible — you settle up however your group already does, cash or
            UPI or anything else.
          </p>
        </div>
      </div>
    </section>
  );
}

function FaqView() {
  const groups = [
    {
      title: 'GETTING STARTED',
      items: [
        {
          q: 'What exactly is Trip Ledger?',
          a: "A shared ledger for group trips. Everyone logs what they paid for, and Trip Ledger works out who owes whom when it's time to settle up. It's not a payments app — it doesn't move money for you.",
        },
        {
          q: 'How do I start tracking a trip?',
          a: 'Create a trip and you automatically get a short join code to share with your group. You become the trip’s owner.',
        },
        {
          q: 'How does everyone else join?',
          a: 'They sign up or log in, then enter your trip’s join code. New members land with their own individual balance unless you’ve set up a shared unit for them.',
        },
        {
          q: 'What’s a "settlement unit," and why would I want a group one?',
          a: 'It’s who a balance actually belongs to. Most people are tracked individually, but a couple or family sharing one wallet can be set up as a single group unit, so the app doesn’t try to split fairly-shared money between them.',
        },
      ],
    },
    {
      title: 'LOGGING & SPLITTING EXPENSES',
      items: [
        {
          q: 'Can I split one expense differently from the rest of the trip?',
          a: 'Yes. Every expense has its own participant list — leave it blank and it defaults to the whole trip, or pick specific people and only they share that cost.',
        },
        {
          q: "What happens to leftover paise when an amount doesn't divide evenly?",
          a: "It's split deterministically, never rounded in anyone's favour. The amount divides as evenly as possible, and if there's a remainder it goes to the same people every time that exact split repeats — not floating-point guesswork.",
        },
        {
          q: 'Does every expense need someone else’s sign-off?',
          a: 'Depends how the trip is configured: automatic (logged means verified, instantly), member approval (needs at least one other member’s confirmation), or tiered (bigger amounts need more approvals than small ones).',
        },
        {
          q: 'Can I approve my own expense to speed things along?',
          a: "No. That's blocked on the backend regardless of the trip's settings — it always has to be someone else.",
        },
      ],
    },
    {
      title: 'BUDGET & SETTLING UP',
      items: [
        {
          q: 'How does the budget indicator work?',
          a: 'A trip can have no budget, a fixed total, or a fixed amount per person. Whichever it is, it turns yellow once verified spending crosses 70% of the limit, and red at 100% or more.',
        },
        {
          q: 'How does Trip Ledger figure out who owes whom?',
          a: "Every verified expense's fair share is calculated from just that expense's own participants. Add it up per person, and whoever paid more than their fair share is owed money — whoever paid less owes it. Trip Ledger then works out a simplified set of payments to settle everyone, instead of everyone paying everyone.",
        },
        {
          q: "Can a settlement change after I've already paid someone back?",
          a: 'Finalizing a settlement locks it in as the record for that point in time. Closing the trip afterward seals it permanently, and the trip becomes read-only.',
        },
        {
          q: 'What happens when a trip closes?',
          a: 'Every currently active member has to confirm before it closes. After that, no one can log new expenses, approve anything, or edit old ones — it stands as a permanent record of what happened.',
        },
      ],
    },
    {
      title: 'NOTIFICATIONS & TRUST',
      items: [
        {
          q: 'Will I get notified about any of this?',
          a: 'Yes — new expenses that need your review, approvals or rejections on your own expenses, verifications, budget warnings, new members joining, and whenever a settlement or trip closure is finalized.',
        },
        {
          q: 'Is my password stored safely? Can I use Google instead?',
          a: "Passwords are hashed, never stored in plain text. Google Sign-In is supported as an alternative — accounts created that way don't have a password at all.",
        },
      ],
    },
  ];

  return (
    <section className="landing-page__view landing-page__view--content">
      <div className="landing-page__inner">
        <span className="landing-page__eyebrow">Questions</span>
        <h1 className="landing-page__title">Frequently asked</h1>
        <p className="landing-page__lede">
          The real answers, not marketing hand-waving — pulled straight from how the product is actually built.
        </p>

        {groups.map((group) => (
          <div className="landing-faq-group" key={group.title}>
            <span className="landing-faq-group__title mono">{group.title}</span>
            {group.items.map((item) => (
              <details className="landing-faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
