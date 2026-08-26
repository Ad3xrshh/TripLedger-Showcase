import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from './Topbar.jsx';

const USER = { id: 'u1', displayName: 'rahul test', email: 'rahul@example.com' };

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: USER, logout: vi.fn() }),
}));

describe('Topbar account avatar & modals', () => {
  it('renders the topbar avatar button displaying uppercase first letter of display name', () => {
    render(
      <MemoryRouter>
        <Topbar />
      </MemoryRouter>
    );
    const avatarButton = screen.getByRole('button', { name: 'View your profile' });
    expect(avatarButton).toBeInTheDocument();
    expect(avatarButton.textContent).toBe('R');
  });

  it('opens ProfileModal (showing display name and email) when the top-right avatar is clicked', () => {
    render(
      <MemoryRouter>
        <Topbar />
      </MemoryRouter>
    );

    expect(screen.queryByRole('dialog', { name: 'Your profile' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View your profile' }));

    const dialog = screen.getByRole('dialog', { name: 'Your profile' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('rahul test')).toBeInTheDocument();
    expect(within(dialog).getByText('rahul@example.com')).toBeInTheDocument();
  });

  it('maintains strict separation between the Help button and the Profile avatar', () => {
    render(
      <MemoryRouter>
        <Topbar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'How TripLedger works' }));
    expect(screen.getByRole('dialog', { name: 'How TripLedger works' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Your profile' })).not.toBeInTheDocument();
  });
});
