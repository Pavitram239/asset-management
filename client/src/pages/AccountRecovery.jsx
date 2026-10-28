import { useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { FormRow } from '../components';
import customFetch from '../utils/customFetch';

// Keep the link secret in the fragment and remove it from the address bar on entry.
// Never send it in a URL/query, render it into the page, or consume on page load.
export const AccountLink = ({ verification = false }) => {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const readFragment = () => {
      const latest = window.location.hash.slice(1);
      if (!latest) return;
      setToken(latest); setDone(false); setError('');
      window.history.replaceState(null, '', window.location.pathname);
    };
    readFragment();
    window.addEventListener('hashchange', readFragment);
    return () => window.removeEventListener('hashchange', readFragment);
  }, []);
  const submit = async event => {
    event.preventDefault(); setError('');
    const fields = new FormData(event.currentTarget);
    if (!verification && fields.get('password') !== fields.get('confirmPassword')) { setError('Passwords do not match.'); return; }
    if (!verification && new TextEncoder().encode(fields.get('password')).length > 72) { setError('Use a password of at most 72 UTF-8 bytes.'); return; }
    setPending(true);
    try {
      await customFetch.post(verification ? '/auth/email-verifications' : '/auth/password-resets', { token, ...(!verification ? { password: fields.get('password') } : {}) });
      setDone(true);
    } catch (failure) { setError(failure.response?.data?.msg || 'Unable to confirm this request. Please try again.'); }
    finally { setPending(false); }
  };
  return <AuthLayout><form className="auth-form" onSubmit={submit}>
    <div className="page-heading"><h2>{done ? (verification ? 'Email verified' : 'Password updated') : verification ? 'Verify your email' : 'Reset your password'}</h2>
      <p>{done ? (verification ? 'Your email is confirmed. Return to your account to continue.' : 'Your previous sessions have ended. Sign in with your new password.') : verification ? 'Confirm your email to continue setting up your account.' : 'Choose a new password for your account.'}</p></div>
    {!done && !token && <p className="form-error" role="alert">This link is missing or has expired. Open the latest email link or request another.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!done && token && <>
      {!verification && <div className="auth-fields">
        <FormRow name="password" type="password" labelText="New password" minLength={12} maxLength={72} autoComplete="new-password" help="12–72 characters; at most 72 UTF-8 bytes." />
        <FormRow name="confirmPassword" type="password" labelText="Confirm password" minLength={12} maxLength={72} autoComplete="new-password" />
      </div>}
      <button className="btn btn-block" type="submit" disabled={pending}>{pending ? 'Confirming…' : verification ? 'Verify email' : 'Save new password'}</button>
    </>}
    {done && verification && <Link className="btn btn-block" to="/dashboard">Return to my account</Link>}
    {!verification && !done && <p className="auth-switch"><Link to="/forgot-password">Request a new reset link</Link></p>}
    <p className="auth-switch"><Link to="/">Back to sign in</Link></p>
  </form></AuthLayout>;
};

export const ForgotPassword = () => {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setPending(true); setError('');
    const email = new FormData(event.currentTarget).get('email');
    try { await customFetch.post('/auth/recovery-requests', { email }); setDone(true); }
    catch (failure) { setError(failure.response?.data?.msg || 'Unable to request a reset link. Please try again.'); }
    finally { setPending(false); }
  };
  return <AuthLayout><form className="auth-form" onSubmit={submit}>
    <div className="page-heading"><h2>{done ? 'Check your email' : 'Forgot your password?'}</h2><p>{done ? 'If an eligible account exists for that email, a reset link has been requested. Use the latest link within 30 minutes.' : 'Enter your account email to request a password reset link.'}</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!done && <><FormRow type="email" name="email" labelText="Email" maxLength={254} autoComplete="email" />
      <button className="btn btn-block" type="submit" disabled={pending}>{pending ? 'Requesting…' : 'Send reset link'}</button></>}
    <p className="auth-switch"><Link to="/">Back to sign in</Link></p>
  </form></AuthLayout>;
};
