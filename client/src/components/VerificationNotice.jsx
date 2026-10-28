import { useState } from 'react';
import { Link } from 'react-router-dom';
import customFetch from '../utils/customFetch';

const VerificationNotice = ({ user, refresh }) => {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (user.emailVerified) return null;
  const resend = async () => {
    setPending(true); setMessage(''); setError('');
    const storageKey = `asset-verification-intent:${user._id}:${user.email}`;
    try {
      const key = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      await customFetch.post('/auth/verification-requests', {}, { headers: { 'Idempotency-Key': key } });
      sessionStorage.removeItem(storageKey);
      setMessage('Verification requested. Check your email and use the latest link.');
    } catch (failure) {
      const retry = failure.response?.headers?.['retry-after'];
      setError(failure.response?.status === 429 ? `Please wait ${retry || 'a few'} seconds before trying again.` : failure.response?.data?.msg || 'Request could not be confirmed. Try again to recover the same request.');
    } finally { setPending(false); }
  };
  return <section className="panel verification-notice" aria-label="Email verification">
    <h3>Verify your email</h3>
    <p>Confirm <strong>{user.email}</strong> using the link in your email. <Link to="/dashboard/profile">Update your email</Link> if needed.</p>
    <div className="verification-actions">
      <button className="btn" type="button" onClick={resend} disabled={pending}>{pending ? 'Requesting…' : 'Send verification link'}</button>
      <button className="btn btn-outline" type="button" onClick={refresh} disabled={pending}>I have verified my email</button>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
};
export default VerificationNotice;
