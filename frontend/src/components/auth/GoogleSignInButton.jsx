import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import './GoogleSignInButton.css';

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Vite only exposes VITE_-prefixed vars to client code (see api/client.js's
// identical convention for VITE_API_BASE_URL). Not set in frontend/.env.example
// by default - see that file's comment - since it's a per-environment value
// (each Google Cloud project gets its own client ID), not a secret to bake in.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Loaded at most once per page, no matter how many GoogleSignInButton
// instances mount (Login and Register can both be visited in one session).
// Module-scoped so the promise itself is the de-dupe key, not component
// state - a second mount while the first load is still in flight reuses
// the same in-flight promise instead of injecting a second <script> tag.
let gisScriptPromise = null;

function loadGoogleIdentityServices() {
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve(window.google);
        return;
      }
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In.')));
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Failed to load Google Sign-In.'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

/**
 * "Continue with Google" - renders Google's own Identity Services button
 * (see https://accounts.google.com/gsi/client), which handles the actual
 * sign-in UI/consent flow and hands back a signed ID token. That token is
 * the only thing this component deals with directly; it's passed straight
 * to the existing loginWithGoogle() on AuthContext (see useAuth.js /
 * api/auth.js's POST /api/auth/google), the same authenticated-session
 * flow email/password login already uses - there's no second auth
 * implementation here, just a second way to reach the same one.
 *
 * onSuccess(user) / onError(message): the caller (LoginPage/RegisterPage)
 * owns what happens next (toast + redirect, or displaying the error) -
 * this component only owns getting a verified ID token and exchanging it.
 */
export function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'unavailable'
  const domId = useId();

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const loginWithGoogleRef = useRef(loginWithGoogle);
  loginWithGoogleRef.current = loginWithGoogle;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      // Not a runtime error to surface to the person filling out the
      // form - this is a deployment/configuration gap (see
      // frontend/.env.example), so the button is simply omitted rather
      // than showing a broken control or a scary error message.
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    loadGoogleIdentityServices()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            // Guards against a stray extra callback firing while the
            // previous one is still being exchanged - mirrors the
            // isSubmitting guards LoginPage/RegisterPage already use for
            // the email/password form.
            if (!credential) {
              onErrorRef.current?.('Google sign-in did not return a credential. Please try again.');
              return;
            }
            try {
              const user = await loginWithGoogleRef.current(credential);
              onSuccessRef.current?.(user);
            } catch (err) {
              onErrorRef.current?.(err.message || 'Google sign-in failed. Please try again.');
            }
          },
        });

        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          width: 320,
          text: 'continue_with',
        });

        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('unavailable');
        onErrorRef.current?.(err.message || 'Google sign-in is unavailable right now.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'unavailable') return null;

  return (
    <div className="google-signin" aria-live="polite">
      {status === 'loading' && (
        <div className="google-signin__placeholder" aria-hidden="true">
          <span className="skeleton" style={{ width: '100%', height: '40px', borderRadius: 'var(--radius-sm)' }} />
        </div>
      )}
      {/* Google's renderButton draws directly into this node - it isn't
          controlled through React children/state, so `disabled` is
          expressed as a transparent overlay + pointer-events guard
          rather than an actual disabled attribute Google's own markup
          doesn't expose. Matches the intent of the email/password
          submit button disabling during isSubmitting, without needing
          to unmount and re-render Google's button (which would replay
          the load/initialize sequence on every keystroke's submit). */}
      <div
        id={`google-signin-button-${domId}`}
        ref={buttonRef}
        className={`google-signin__button${disabled ? ' google-signin__button--disabled' : ''}${status === 'loading' ? ' google-signin__button--hidden' : ''}`}
        aria-disabled={disabled || undefined}
      />
    </div>
  );
}
