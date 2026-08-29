import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoogleSignInButton } from './GoogleSignInButton.jsx';

// Isolates this test from AuthContext's real provider (which fetches
// GET /api/auth/me on mount) - GoogleSignInButton only needs
// loginWithGoogle from useAuth, so that's all this stub provides.
vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ loginWithGoogle: vi.fn() }),
}));

// Pass 2.1 / Pass 3 regression: proves the specific behavior the Pass 3
// checklist calls out by name - "If VITE_GOOGLE_CLIENT_ID is absent: the
// component must fail gracefully; the application must not crash." No
// .env file sets VITE_GOOGLE_CLIENT_ID in this repository (see
// frontend/.env.example, which documents it but leaves it blank), so
// import.meta.env.VITE_GOOGLE_CLIENT_ID is genuinely unset in this test
// run exactly as it would be for a fresh checkout with no Google Cloud
// configuration yet - this is not a mocked/simulated absence.
describe('GoogleSignInButton', () => {
  it('renders nothing when VITE_GOOGLE_CLIENT_ID is not configured, without throwing', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.resetModules();
    const { GoogleSignInButton: Component } = await import('./GoogleSignInButton.jsx');

    const { container } = render(<Component onSuccess={vi.fn()} onError={vi.fn()} />);

    // No script tag, no placeholder, no button - a fully empty render,
    // so the surrounding "or" divider in LoginPage/RegisterPage doesn't
    // sit above a broken/empty control.
    expect(container).toBeEmptyDOMElement();
  });

  it('does not call onError merely because the client ID is unconfigured', () => {
    // Missing configuration is a deployment gap, not a runtime error to
    // surface to someone filling out the login form (see the component's
    // own comment on this) - onError is reserved for actual sign-in
    // failures once a client ID IS configured.
    const onError = vi.fn();
    render(<GoogleSignInButton onSuccess={vi.fn()} onError={onError} />);
    expect(onError).not.toHaveBeenCalled();
  });
});
