import './TicketDivider.css';

/**
 * Signature element: a perforated "ticket stub" divider, echoing a
 * boarding-pass tear line and this app's own trip join codes. Used
 * between major surface changes - the topbar/content boundary in
 * AppShell, and inside a TripCard between its identity and budget
 * sections - never as a generic layout rule.
 */
export function TicketDivider() {
  return <div className="ticket-divider" role="presentation" />;
}
