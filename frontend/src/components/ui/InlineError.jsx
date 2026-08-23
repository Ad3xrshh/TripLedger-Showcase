import './InlineError.css';

/**
 * Inline form-level error: an icon + message chip, close to the action
 * it relates to. Same visual language as the 9.9.8.3 auth-form error,
 * pulled into a shared component here instead of being pasted a third
 * and fourth time. role="alert" is preserved exactly as it was before
 * this component existed - the icon is aria-hidden and contributes
 * nothing to the accessible name.
 */
export function InlineError({ id, children }) {
  return (
    <p className="inline-error" id={id} role="alert">
      <svg
        className="inline-error__icon"
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1" fill="currentColor" />
      </svg>
      {children}
    </p>
  );
}
