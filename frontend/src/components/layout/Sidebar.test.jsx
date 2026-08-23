import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';

const USER = { id: 'u1', displayName: 'Adarsh Test', email: 'adarsh@example.com' };

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: USER, logout: vi.fn() }),
}));

// 9.9.9 QA fix #2: previously .sidebar__account-avatar was a decorative
// <span> with no onClick at all. This proves it's now a real, keyboard-
// reachable button that opens the profile modal - and that the
// pre-existing Help button (a completely separate control) is left
// untouched by this change.
describe('Sidebar account avatar', () => {
  it('renders the avatar as an actual button, not a decorative span', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    const avatarButton = screen.getByRole('button', { name: 'View your profile' });
    expect(avatarButton.tagName).toBe('BUTTON');
  });

  it('opens the profile modal (showing display name + email) when the avatar is clicked', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('Your profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View your profile' }));

    const dialog = screen.getByRole('dialog', { name: 'Your profile' });
    expect(dialog).toBeInTheDocument();
    // "Adarsh Test" also appears in the always-visible account chip
    // (.sidebar__account-name), so scope this assertion to the dialog.
    expect(within(dialog).getByText('Adarsh Test')).toBeInTheDocument();
    expect(within(dialog).getByText('adarsh@example.com')).toBeInTheDocument();
  });

  it('leaves the existing Help button and its modal working independently', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'How TripLedger works' }));
    expect(screen.getByText('How TripLedger works')).toBeInTheDocument();
    expect(screen.queryByText('Your profile')).not.toBeInTheDocument();
  });
});
