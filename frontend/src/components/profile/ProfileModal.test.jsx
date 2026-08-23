import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileModal } from './ProfileModal.jsx';

const USER = { id: 'u1', displayName: 'Adarsh Test', email: 'adarsh@example.com' };

// 9.9.9 QA fix #2 regression coverage: the sidebar's account avatar used
// to be a plain, non-interactive <span> with no click handler (the
// reported "blue icon with no functionality"). This proves the modal it
// now opens actually surfaces the authenticated user's profile
// information, sourced entirely from AuthContext (no network call).
describe('ProfileModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ProfileModal open={false} onClose={vi.fn()} user={USER} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the authenticated user\u2019s display name and email when open', () => {
    render(<ProfileModal open onClose={vi.fn()} user={USER} />);
    expect(screen.getByText('Adarsh Test')).toBeInTheDocument();
    expect(screen.getByText('adarsh@example.com')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ProfileModal open onClose={onClose} user={USER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<ProfileModal open onClose={onClose} user={USER} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to a placeholder when displayName is missing, without crashing', () => {
    render(<ProfileModal open onClose={vi.fn()} user={{ id: 'u2', email: 'noname@example.com' }} />);
    expect(screen.getByText('noname@example.com')).toBeInTheDocument();
  });
});
