import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import customFetch, { organizationKey } from '../utils/customFetch';
import { toast } from 'react-toastify';

export default function SetupAdmin() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => {
    const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
    if (hash) return hash;
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [setupDetails, setSetupDetails] = useState(null);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  useEffect(() => {
    const extractToken = () => {
      const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      if (hash) {
        setToken(hash);
        return hash;
      }
      const params = new URLSearchParams(window.location.search);
      const qToken = params.get('token') || '';
      if (qToken) {
        setToken(qToken);
        return qToken;
      }
      return '';
    };

    const currentToken = token || extractToken();
    if (!currentToken) {
      setLoading(false);
      setError('No setup token found. Please check your invitation email link.');
      return;
    }

    const verifyToken = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await customFetch.get(`/auth/setup-admin/verify?token=${encodeURIComponent(currentToken)}`);
        setSetupDetails(data);
      } catch (err) {
        setError(err.response?.data?.msg || 'Invalid, expired, or already used setup link.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;

    if (!setupDetails?.isExistingUser) {
      if (password.length < 8) {
        toast.error('Password must be at least 8 characters long');
        return;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    } else {
      if (!currentPassword) {
        toast.error('Please enter your current account password');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        token,
        ...(setupDetails?.isExistingUser ? { currentPassword } : { password }),
      };

      const { data } = await customFetch.post('/auth/setup-admin', payload);

      // Clear any prior workspace context and set newly provisioned client workspace
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key !== 'theme') sessionStorage.removeItem(key);
      }
      if (data.organizationId) {
        sessionStorage.setItem(organizationKey, data.organizationId);
      }

      toast.success('Administrator setup completed successfully!');
      window.location.assign('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.msg || 'Failed to complete setup. Please try again.';
      toast.error(msg);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <section className="auth-form" style={{ maxWidth: '480px' }}>
        <div className="page-heading">
          <h2>Client Administrator Setup</h2>
          <p>
            {setupDetails?.organizationName
              ? `Complete your setup for ${setupDetails.organizationName}`
              : 'Activate your client workspace administrator account'}
          </p>
        </div>

        {error && (
          <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p role="status">Verifying your setup token…</p>
        ) : setupDetails ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 16px', background: 'var(--background-secondary-color)', borderRadius: '8px', border: '1px solid var(--grey-200)', fontSize: '13px' }}>
              <p style={{ margin: 0 }}>
                Client Organization: <strong>{setupDetails.organizationName}</strong>
              </p>
              <p style={{ margin: '4px 0 0 0' }}>
                Administrator Email: <strong>{setupDetails.email}</strong>
              </p>
            </div>

            {setupDetails.isExistingUser ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                  An account with this email already exists. Enter your current password to link and activate your administrator privileges for this workspace.
                </p>
                <div className="form-row">
                  <label className="form-label">Current Account Password *</label>
                  <input
                    type="password"
                    name="currentPassword"
                    className="form-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                  Set a secure password for your administrator account.
                </p>
                <div className="form-row">
                  <label className="form-label">New Password (min 8 chars) *</label>
                  <input
                    type="password"
                    name="password"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Confirm Password *</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-block"
              disabled={submitting}
              style={{ marginTop: '8px' }}
            >
              {submitting ? 'Setting up…' : setupDetails.isExistingUser ? 'Activate Workspace Access' : 'Complete Setup & Open Workspace'}
            </button>
          </form>
        ) : (
          <p style={{ marginTop: '16px' }}>
            <Link to="/">Return to Sign In</Link>
          </p>
        )}
      </section>
    </AuthLayout>
  );
}

