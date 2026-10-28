import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormRow } from '../components';
import customFetch from '../utils/customFetch';
import { hasPermission } from '../utils/permissions';
import { onboardingCommand } from '../utils/onboardingCommand';
import { useDashboardContext } from './DashboardLayout';

export default function Invitations() {
  const { user, activeOrganizationId } = useDashboardContext();
  const [rows, setRows] = useState([]), [settings, setSettings] = useState(null), [cursor, setCursor] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [roleId, setRoleId] = useState(''), [scope, setScope] = useState('self');
  const pending = useRef(false);
  const eligible = activeOrganizationId && user.emailVerified && hasPermission(user, 'membership.manage') && hasPermission(user, 'access.manage');
  const load = useCallback(async (after = null) => {
    setLoading(true);
    try {
      const [list, configuration] = await Promise.all([customFetch.get('/invitations', { params: after ? { cursor: after } : {} }), customFetch.get('/access/management')]);
      setRows(previous => after ? [...previous, ...list.data.data] : list.data.data); setCursor(list.data.meta.nextCursor);
      setSettings(configuration.data); setError('');
      setRoleId(previous => previous || configuration.data.roles.find(role => role.name === 'Employee')?.id || '');
    } catch (failure) { setError(failure.response?.data?.msg || 'Unable to load invitations.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (eligible) load(); else setLoading(false); }, [eligible, load]);
  const run = async (operation, path, input) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await onboardingCommand(operation, path, input, user._id); setNotice('Invitation saved.'); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.msg || 'The result could not be confirmed. Retry the same request to recover it.'); return false; }
    finally { pending.current = false; setBusy(false); }
  };
  if (!activeOrganizationId) return <section className="panel"><p>Select a company to manage invitations.</p></section>;
  if (!eligible) return <section className="panel"><h2>Invitations unavailable</h2><p>A verified email plus employee and access management permissions are required.</p></section>;
  const roles = settings?.roles.filter(role => role.active && role.permissions.length && !role.permissions.includes('ownership.manage')) || [];
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const grant = { roleId, scope, ...(scope === 'department' ? { departmentCode: data.get('department') } : {}),...(scope==='location'?{locationId:data.get('locationId')}:{}) };
    if (await run('inviteEmployee', '/invitations', { email: data.get('email'), grants: [grant] })) form.reset();
  };
  return <>
    <div className="page-heading"><h2>Employee invitations</h2><p>Access begins when the matching verified account accepts.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Loading invitations…</p>}
    <section className="panel"><h3>Invite an employee</h3><form onSubmit={submit}>
      <FormRow type="email" name="email" labelText="Employee email" maxLength={254} autoComplete="off" />
      <label className="form-row">Role<select className="form-select" aria-label="Invitation role" required value={roleId} onChange={event => { setRoleId(event.target.value); setScope(roles.find(role => role.id === event.target.value)?.name === 'Employee' ? 'self' : 'organization'); }}><option value="">Choose a role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      <label className="form-row">Access scope<select className="form-select" aria-label="Invitation scope" value={scope} onChange={event => setScope(event.target.value)}><option value="self">Their assigned assets</option><option value="department">Selected department</option><option value="location">Location and descendants</option><option value="organization">Entire company</option></select></label>
      {scope === 'department' && <label className="form-row">Department<select className="form-select" aria-label="Invitation department" name="department" required><option value="">Choose a department</option>{settings?.departments.filter(dept => dept.active).map(dept => <option key={dept.code} value={dept.code}>{dept.name}</option>)}</select></label>}
      {scope==='location'&&<label className="form-row">Location<select className="form-select" aria-label="Invitation location" name="locationId" required><option value="">Choose a location</option>{settings?.locations.filter(location=>location.active).map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
      <p className="caption">Administrative roles require company scope. Delegate only access within your own scope. Set the employee’s directory department after they join. <Link to="/dashboard/access">Manage roles and departments</Link>.</p>
      <button className="btn" type="submit" disabled={busy || loading || !roleId}>{busy ? 'Saving…' : 'Send invitation'}</button>
    </form></section>
    <section className="panel invitation-list"><h3>Invitation history</h3>
      {!rows.length && !loading && <p>No invitations yet.</p>}
      {rows.map(row => <article className="invitation-row" key={row.id}><strong>{row.email}</strong><p>Status: {row.status} · Expires {new Date(row.expiresAt).toLocaleDateString()}</p>
        <p className="caption">{row.grants.map(grant => `${roles.find(role => role.id === grant.roleId)?.name || grant.permissionCode || 'Saved role'}: ${grant.scope}${grant.departmentCode ? ' / ' + grant.departmentCode : ''}`).join('; ')}</p>
        {row.allowedActions.includes('revokeInvitation') && <form onSubmit={event => { event.preventDefault(); run('revokeInvitation', `/invitations/${row.id}/revocations`, { expectedVersion: row.version, reason: new FormData(event.currentTarget).get('reason') }); }}>
          <label className="form-row">Reason for revoking<input className="form-input" aria-label={`Revocation reason for ${row.email}`} name="reason" maxLength={2000} required /></label>
          <button className="btn" type="submit" disabled={busy}>Revoke invitation</button>
        </form>}
      </article>)}
      {cursor && <button className="btn" type="button" disabled={loading || busy} onClick={() => load(cursor)}>Load more invitations</button>}
      <button className="btn" type="button" disabled={loading || busy} onClick={() => load()}>Refresh invitations</button>
    </section>
  </>;
}
