import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TripCard } from './TripCard.jsx';
import * as tripsApi from '../../api/trips.js';

vi.mock('../../api/trips.js', () => ({
  deleteTrip: vi.fn(),
}));

const OWNER_TRIP = {
  id: 'trip-1',
  name: 'Goa Trip',
  status: 'active',
  start_date: '2026-08-01',
  end_date: '2026-08-05',
  budget_type: 'unlimited',
  currency: 'INR',
  my_role: 'owner',
};

const MEMBER_TRIP = { ...OWNER_TRIP, id: 'trip-2', my_role: 'member' };

function renderCard(trip, onDeleted = vi.fn()) {
  return render(
    <MemoryRouter>
      <TripCard trip={trip} onDeleted={onDeleted} />
    </MemoryRouter>
  );
}

// 9.9.9 QA fix #5: proves the delete entry point is owner-only in the UI
// (backend independently enforces this too - see deleteTrip.test.js),
// requires a password before the destructive action fires, and reports
// success back to the caller without navigating away via the wrapping
// <Link>.
describe('TripCard delete trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show a delete option for a non-owner', () => {
    renderCard(MEMBER_TRIP);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows a delete option for the owner, which opens a confirmation dialog without navigating', () => {
    renderCard(OWNER_TRIP);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Goa Trip' }));
    expect(screen.getByRole('dialog', { name: 'Delete this trip?' })).toBeInTheDocument();
    expect(screen.getByText(/permanently deletes/i)).toBeInTheDocument();
  });

  it('requires a password field in the confirmation dialog', () => {
    renderCard(OWNER_TRIP);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Goa Trip' }));
    const passwordInput = screen.getByLabelText(/your password/i);
    expect(passwordInput).toBeRequired();
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('calls the delete API with the entered password and reports success', async () => {
    tripsApi.deleteTrip.mockResolvedValueOnce(undefined);
    const onDeleted = vi.fn();
    renderCard(OWNER_TRIP, onDeleted);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goa Trip' }));
    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'MyPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('trip-1'));
    expect(tripsApi.deleteTrip).toHaveBeenCalledWith('trip-1', 'MyPassword123!');
  });

  it('shows a human-readable error and does not call onDeleted when the password is wrong', async () => {
    tripsApi.deleteTrip.mockRejectedValueOnce({
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect password',
    });
    const onDeleted = vi.fn();
    renderCard(OWNER_TRIP, onDeleted);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Goa Trip' }));
    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'WrongPassword' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));

    expect(await screen.findByText('Incorrect password')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
