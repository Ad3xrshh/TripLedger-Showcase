/**
 * Generic badge/pill for labels that aren't a trip status (StatusBadge) or
 * an expense status (ExpenseStatus) - e.g. a role tag like "Owner". Those
 * two keep their own components because they're driven by fixed backend
 * enums with their own formatting helpers, but all three share this same
 * visual primitive (see styles/badge.css, imported globally in
 * styles/global.css).
 *
 * tone: 'positive' | 'negative' | 'warning' | 'info' | 'neutral' | 'ink'
 */
export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
