import { useRef, useState } from 'react';
import { FormRow } from '../components';
import { useDashboardContext } from './DashboardLayout';
import { onboardingCommand } from '../utils/onboardingCommand';

export default function Workspaces() {
  const { user, organizations, switchOrganization } = useDashboardContext();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  const submit = async event => {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try { const workspace = await onboardingCommand('createWorkspace', '/workspaces', input, user._id, true); switchOrganization(workspace.id); }
    catch (failure) { setError(failure.response?.data?.msg || 'The result could not be confirmed. Retry the same details to recover it.'); pending.current = false; setBusy(false); }
  };
  return <>
    <div className="page-heading"><h2>Your workspaces</h2><p>Each company has its own people, assets and permissions.</p></div>
    <div className="form-layout"><section className="panel"><h3>Create a company workspace</h3>
      {!user.emailVerified ? <p>Verify your email using the notice above before creating a workspace.</p> : <form onSubmit={submit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <FormRow name="name" labelText="Company name" maxLength={200} autoComplete="organization" />
        <FormRow name="currency" labelText="Currency code" defaultValue="INR" maxLength={3} pattern="[A-Z]{3}" help="A supported three-letter currency, such as INR or USD." />
        <FormRow name="timeZone" labelText="Company time zone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'} maxLength={100} help="For example, Asia/Kolkata or UTC." />
        <p className="caption">You will own this new company. Creating it grants no access to other companies.</p>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
      </form>}
    </section><section className="panel"><h3>Your companies</h3>
      {organizations.length ? organizations.map(org => <div className="workspace-choice" key={org.id}><strong>{org.name}</strong><button className="btn" type="button" disabled={busy} onClick={() => switchOrganization(org.id)}>Open workspace</button></div>) : <p>You have no active memberships yet. Create your company or reopen an invitation email after verifying your account.</p>}
    </section></div>
  </>;
}
