import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import customFetch, { organizationKey } from '../utils/customFetch';
import { onboardingCommand } from '../utils/onboardingCommand';

export default function AcceptInvitation() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [account, setAccount] = useState(null), [loading, setLoading] = useState(true);
  const pending = useRef(false);
  useLayoutEffect(() => {
    const fragment = () => { const value = window.location.hash.slice(1); if (value) { setToken(value); setError(''); window.history.replaceState(null, '', window.location.pathname); } };
    fragment(); window.addEventListener('hashchange', fragment);
    return () => window.removeEventListener('hashchange', fragment);
  }, []);
  const loadAccount = async () => {
    setLoading(true); setError('');
    try { setAccount((await customFetch.get('/users/current-user', { identityContext: true })).data.user); }
    catch (failure) { if (failure.response?.status !== 401) setError('Unable to check your account. Please try again.'); setAccount(null); }
    finally { setLoading(false); }
  };
  useLayoutEffect(() => { loadAccount(); }, []);
  const accept = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const workspace = await onboardingCommand('acceptInvitation', '/invitations/acceptance', { token }, account._id, true);
      sessionStorage.setItem(organizationKey, workspace.id); window.location.assign('/dashboard');
    } catch (failure) { setError(failure.response?.data?.msg || 'The result could not be confirmed. Retry this invitation to recover your request.'); setBusy(false); pending.current = false; }
  };
  return <AuthLayout><section className="auth-form"><div className="page-heading"><h2>Join your company</h2><p>Accept using the verified account email that received the invitation.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!token && <p className="form-error" role="alert">Open the latest invitation email link to continue.</p>}
    {loading ? <p role="status">Checking your account…</p> : account ? <>
      <p>Signed in as <strong>{account.email}</strong>.</p>
      {!account.emailVerified && <p>Verify your email from <Link to="/dashboard">your account</Link>, then reopen this invitation.</p>}
      <button className="btn btn-block" type="button" disabled={busy || !token || !account.emailVerified} onClick={accept}>{busy ? 'Joining…' : 'Accept invitation'}</button>
    </> : <p><Link to="/">Sign in</Link> or <Link to="/register">register</Link> with the invited email, verify it, then reopen this link.</p>}
    <button className="btn" type="button" disabled={loading || busy} onClick={loadAccount}>Check account again</button>
    <p className="auth-switch"><Link to="/">Use another account</Link></p>
  </section></AuthLayout>;
}
