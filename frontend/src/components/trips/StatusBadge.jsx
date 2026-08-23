import { formatTripStatus } from '../../utils/format.js';
import './StatusBadge.css';

export function StatusBadge({ status }) {
  return <span className={`badge status-badge status-badge--${status}`}>{formatTripStatus(status)}</span>;
}
