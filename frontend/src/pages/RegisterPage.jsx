import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { FormField } from '../components/ui/FormField.jsx';
import { Button } from '../components/ui/Button.jsx';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton.jsx';
import { humanizeErrorMessage } from '../utils/errorPresentation.js';
import './AuthForm.css';

export function RegisterPage() {
  useDocumentTitle('Create your account \u00b7 Trip Ledger');
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
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
      await register({ displayName, email, password });
      toast.success('Account created');
      navigate('/', { replace: true });
    } catch (err) {
      setError(humanizeErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1 className="auth-form__title">Create your account</h1>
      <p className="auth-form__subtitle">Set up your account to start your first ledger.</p>

      <div className="auth-form__fields">
        <FormField
          id="displayName"
          label="Display name"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
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
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <div className="auth-form__divider" role="separator">
          <span>or</span>
        </div>

        <GoogleSignInButton
          disabled={isSubmitting}
          onSuccess={() => {
            toast.success('Account created');
            navigate('/', { replace: true });
          }}
          onError={(message) => setError(message)}
        />
      </div>

      <p className="auth-form__footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
