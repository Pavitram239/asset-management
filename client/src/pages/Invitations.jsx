import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormRow } from '../components';
import Modal from '../components/Modal';
import DesignIcon from '../components/DesignIcon';
import customFetch from '../utils/customFetch';
import { hasPermission } from '../utils/permissions';
import { onboardingCommand } from '../utils/onboardingCommand';
import { useDashboardContext } from './DashboardLayout';

export default function Invitations() {
  const { user, activeOrganizationId } = useDashboardContext();
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roleId, setRoleId] = useState('');
  const [scope, setScope] = useState('self');
  const [searchFilter, setSearchFilter] = useState('');
  const [revokingRow, setRevokingRow] = useState(null);

  const pending = useRef(false);
  const eligible =
    activeOrganizationId &&
    user.emailVerified &&
    hasPermission(user, 'membership.manage') &&
    hasPermission(user, 'access.manage');

  const load = useCallback(
    async (after = null) => {
      setLoading(true);
      try {
        const [list, configuration] = await Promise.all([
          customFetch.get('/invitations', { params: after ? { cursor: after } : {} }),
          customFetch.get('/access/management'),
        ]);
        setRows((previous) => (after ? [...previous, ...list.data.data] : list.data.data));
        setCursor(list.data.meta.nextCursor);
        setSettings(configuration.data);
        setError('');
        setRoleId((previous) => previous || configuration.data.roles.find((role) => role.name === 'Employee')?.id || '');
      } catch (failure) {
        setError(failure.response?.data?.msg || 'Unable to load invitations.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (eligible) load();
    else setLoading(false);
  }, [eligible, load]);

  const run = async (operation, path, input) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onboardingCommand(operation, path, input, user._id);
      setNotice('Invitation operation completed successfully.');
      await load();
      return true;
    } catch (failure) {
      setError(failure.response?.data?.msg || 'The result could not be confirmed. Retry the same request to recover it.');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <div className="panel empty-state">
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '8px' }}>
          <DesignIcon name="users" />
        </div>
        <h2>Invitations</h2>
        <p>You must have an active company workspace selected to manage employee invitations.</p>
        <Link to="/dashboard/workspaces" className="btn" style={{ marginTop: '8px' }}>
          Go to Workspaces
        </Link>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="panel empty-state">
        <h2>Invitations unavailable</h2>
        <p>A verified email address plus employee and access management permissions are required to invite colleagues.</p>
      </div>
    );
  }

  const roles = settings?.roles.filter((role) => role.active && role.permissions.length && !role.permissions.includes('ownership.manage')) || [];

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const grant = {
      roleId,
      scope,
      ...(scope === 'department' ? { departmentCode: data.get('department') } : {}),
      ...(scope === 'location' ? { locationId: data.get('locationId') } : {}),
    };
    if (await run('inviteEmployee', '/invitations', { email: data.get('email'), grants: [grant] })) {
      form.reset();
    }
  };

  const filteredRows = rows.filter((r) => {
    if (!searchFilter.trim()) return true;
    return (r.email || '').toLowerCase().includes(searchFilter.toLowerCase());
  });

  return (
    <>
      <div className="page-heading">
        <h2>Employee Invitations</h2>
        <p>Invite prospective colleagues to this workspace. Access begins when they accept using their verified account.</p>
      </div>

      {error && (
        <div role="alert" className="form-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DesignIcon name="check" />
          <span>{notice}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Send Invitation Form */}
        <section className="panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Send New Invitation</h3>
            <p className="caption" style={{ marginTop: '2px' }}>
              Assign a pre-configured role and access boundary to an incoming employee.
            </p>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="field-grid">
              <FormRow type="email" name="email" labelText="Employee Email Address *" maxLength={254} autoComplete="off" placeholder="colleague@example.com" required />
              
              <label className="form-row">
                <span className="form-label">Invitation Role *</span>
                <select
                  className="form-select"
                  aria-label="Invitation role"
                  required
                  value={roleId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setRoleId(id);
                    setScope(roles.find((role) => role.id === id)?.name === 'Employee' ? 'self' : 'organization');
                  }}
                >
                  <option value="">Choose a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-row">
                <span className="form-label">Access Scope *</span>
                <select
                  className="form-select"
                  aria-label="Invitation scope"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="self">Self (Their assigned assets only)</option>
                  <option value="department">Department specific</option>
                  <option value="location">Location and descendants</option>
                  <option value="organization">Entire company organization</option>
                </select>
              </label>

              {scope === 'department' && (
                <label className="form-row">
                  <span className="form-label">Target Department *</span>
                  <select className="form-select" aria-label="Invitation department" name="department" required>
                    <option value="">Choose a department</option>
                    {settings?.departments
                      .filter((dept) => dept.active)
                      .map((dept) => (
                        <option key={dept.code} value={dept.code}>
                          {dept.name} ({dept.code})
                        </option>
                      ))}
                  </select>
                </label>
              )}

              {scope === 'location' && (
                <label className="form-row">
                  <span className="form-label">Target Location *</span>
                  <select className="form-select" aria-label="Invitation location" name="locationId" required>
                    <option value="">Choose a location</option>
                    {settings?.locations
                      .filter((location) => location.active)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            <p className="caption" style={{ margin: '4px 0 0 0' }}>
              Delegate only access within your authorized boundary. Need a customized role?{' '}
              <Link to="/dashboard/access?tab=roles" style={{ color: 'var(--primary-600)', fontWeight: 500 }}>
                Manage roles and permission packages
              </Link>.
            </p>

            <button className="btn" type="submit" disabled={busy || loading || !roleId} style={{ alignSelf: 'flex-start', minWidth: '150px' }}>
              {busy ? 'Sending…' : 'Send Invitation'}
            </button>
          </form>
        </section>

        {/* Invitation History */}
        <section className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Invitation History ({rows.length})</h3>
              <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                Track pending, accepted, and expired workspace invitations.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="search"
                placeholder="Filter by email…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  minHeight: '36px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  background: 'var(--background-secondary-color)',
                  color: 'var(--text-color)',
                  fontSize: '13px',
                  width: '200px',
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading || busy}
                onClick={() => load()}
                style={{ minHeight: '36px', padding: '6px 14px', fontSize: '12px' }}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          {!filteredRows.length && !loading ? (
            <div style={{ padding: '28px', textAlign: 'center', background: 'var(--background-color)', borderRadius: '8px', border: '1px dashed var(--grey-300)' }}>
              <p className="caption" style={{ margin: 0 }}>
                {rows.length === 0 ? 'No employee invitations sent yet.' : 'No invitations match your search filter.'}
              </p>
            </div>
          ) : (
            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Granted Role & Scope</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const statusClass =
                      row.status === 'accepted'
                        ? 'status-success'
                        : row.status === 'pending'
                        ? 'status-neutral'
                        : row.status === 'revoked'
                        ? 'status-danger'
                        : 'status-muted';

                    return (
                      <tr key={row.id}>
                        <td>
                          <strong style={{ fontSize: '13px', color: 'var(--text-color)' }}>{row.email}</strong>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {row.grants.map((grant, idx) => {
                              const role = roles.find((r) => r.id === grant.roleId);
                              return (
                                <span key={idx} style={{ fontSize: '12px', color: 'var(--text-color)' }}>
                                  <strong>{role?.name || grant.permissionCode || 'Standard Role'}</strong>{' '}
                                  <span className="caption">
                                    ({grant.scope}
                                    {grant.departmentCode ? ` · ${grant.departmentCode}` : ''})
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${statusClass}`} style={{ textTransform: 'capitalize' }}>
                            {row.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary-color)', whiteSpace: 'nowrap' }}>
                          {new Date(row.expiresAt).toLocaleDateString()}
                        </td>
                        <td>
                          {row.allowedActions.includes('revokeInvitation') && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={busy}
                              onClick={() => setRevokingRow(row)}
                              style={{ minHeight: '32px', padding: '3px 10px', fontSize: '12px' }}
                            >
                              Revoke…
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {cursor && (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={loading || busy}
              onClick={() => load(cursor)}
              style={{ marginTop: '14px', alignSelf: 'flex-start' }}
            >
              Load More Invitations
            </button>
          )}
        </section>
      </div>

      {/* Revoke Invitation Modal */}
      {revokingRow && (
        <Modal open onClose={() => setRevokingRow(null)} variant="fields">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Revoke Invitation</h3>
              <p className="caption" style={{ marginTop: '2px' }}>
                Cancel workspace access invitation sent to <strong>{revokingRow.email}</strong>.
              </p>
            </div>

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const reason = new FormData(event.currentTarget).get('reason');
                const ok = await run('revokeInvitation', `/invitations/${revokingRow.id}/revocations`, {
                  expectedVersion: revokingRow.version,
                  reason,
                });
                if (ok) setRevokingRow(null);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <label className="form-row">
                <span className="form-label">Reason for Revocation *</span>
                <input
                  className="form-input"
                  name="reason"
                  placeholder="e.g. Sent in error, or role requirements updated"
                  maxLength={2000}
                  required
                  autoFocus
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setRevokingRow(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={busy} style={{ background: 'var(--red-dark, #dc2626)', color: 'white' }}>
                  {busy ? 'Revoking…' : 'Revoke Invitation'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
