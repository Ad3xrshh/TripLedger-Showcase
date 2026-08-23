import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { FormField } from '../components/ui/FormField.jsx';
import { Button } from '../components/ui/Button.jsx';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton.jsx';
import { humanizeErrorMessage } from '../utils/errorPresentation.js';
import './AuthForm.css';

export function LoginPage() {
  useDocumentTitle('Log in \u00b7 Trip Ledger');
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    // Guards against a stray Enter-key resubmit while a request is already
    // in flight (the submit button being disabled only blocks click).
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      toast.success('Logged in');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(humanizeErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1 className="auth-form__title">Log in</h1>
      <p className="auth-form__subtitle">Welcome back — pick up where you left off.</p>

      <div className="auth-form__fields">
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="auth-form__error" role="alert">
            <svg
              className="auth-form__error-icon"
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
            {error}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting} className="auth-form__submit">
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>

        <div className="auth-form__divider" role="separator">
          <span>or</span>
        </div>

        <GoogleSignInButton
          disabled={isSubmitting}
          onSuccess={() => {
            toast.success('Logged in');
            navigate(redirectTo, { replace: true });
          }}
          onError={(message) => setError(message)}
        />
      </div>

      <p className="auth-form__footer">
        New to Trip Ledger? <Link to="/register">Create an account</Link>
      </p>
    </form>
  );
}
