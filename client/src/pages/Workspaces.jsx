import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormRow } from '../components';
import { useDashboardContext } from './DashboardLayout';
import { onboardingCommand } from '../utils/onboardingCommand';
import DesignIcon from '../components/DesignIcon';
import Modal from '../components/Modal';

export default function Workspaces() {
  const { user, organizations, switchOrganization, activeOrganizationId } = useDashboardContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const pending = useRef(false);

  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const workspace = await onboardingCommand('createWorkspace', '/workspaces', input, user._id, true);
      setShowCreateModal(false);
      switchOrganization(workspace.id);
    } catch (failure) {
      setError(failure.response?.data?.msg || 'The workspace could not be created. Please try again.');
      pending.current = false;
      setBusy(false);
    }
  };

  const filteredOrgs = (organizations || []).filter((org) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return org.name?.toLowerCase().includes(q) || org.schema_name?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Your Company Workspaces</h2>
          <p>Each workspace operates as an isolated organization with its own dedicated database schema, inventory, and access controls.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn"
            disabled={busy || !user.emailVerified}
            onClick={() => setShowCreateModal(true)}
            style={{ minHeight: '38px', padding: '8px 18px', fontSize: '13px' }}
          >
            + Create Workspace
          </button>
        </div>
      </div>

      {!user.emailVerified && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: '10px',
            color: '#92400e',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '20px' }}>⚠️</div>
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>Email Verification Required</strong>
            <span style={{ fontSize: '13px' }}>
              Please verify your email address to unlock creating new company workspaces.
            </span>
          </div>
        </div>
      )}

      {/* Main Workspace List Panel */}
      <div className="panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Active Memberships ({organizations?.length || 0})</h3>
            <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
              Companies you own or participate in as a team member.
            </p>
          </div>
          {(organizations?.length || 0) > 3 && (
            <input
              type="search"
              placeholder="Filter workspaces…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                minHeight: '36px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--grey-200)',
                background: 'var(--background-secondary-color)',
                color: 'var(--text-color)',
                fontSize: '13px',
                width: '240px',
              }}
            />
          )}
        </div>

        {!filteredOrgs.length ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '12px' }}>
              <DesignIcon name="package" />
            </div>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-color)' }}>No Workspaces Found</h4>
            <p className="caption" style={{ maxWidth: '400px', margin: '6px 0 16px 0' }}>
              {organizations?.length === 0
                ? 'You do not belong to any workspaces yet. Create your first company workspace to get started.'
                : 'No workspaces match your search filter.'}
            </p>
            {user.emailVerified && organizations?.length === 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowCreateModal(true)}
                style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
              >
                + Create First Workspace
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {filteredOrgs.map((org) => {
              const isActive = org.id === activeOrganizationId;
              const firstLetter = (org.name || 'W').charAt(0).toUpperCase();

              return (
                <div
                  key={org.id}
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    border: `1px solid ${isActive ? 'var(--primary-600)' : 'var(--grey-200)'}`,
                    background: isActive ? 'var(--primary-50)' : 'var(--background-secondary-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: isActive ? '0 2px 8px rgba(23, 37, 84, 0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          background: isActive ? '#172554' : 'var(--primary-100)',
                          color: isActive ? '#ffffff' : 'var(--primary-700)',
                          fontWeight: 700,
                          fontSize: '16px',
                          flexShrink: 0,
                        }}
                      >
                        {firstLetter}
                      </span>
                      <div>
                        <strong style={{ fontSize: '15px', color: 'var(--text-color)', display: 'block' }}>
                          {org.name}
                        </strong>
                        <span className="caption" style={{ fontSize: '11px', color: 'var(--text-secondary-color)' }}>
                          ID: {org.id.slice(0, 8)}…
                        </span>
                      </div>
                    </div>

                    {isActive && (
                      <span
                        className="status-pill status-success"
                        style={{ fontSize: '11px', fontWeight: 600 }}
                      >
                        ● Active
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Isolation Model:</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>Dedicated Schema</span>
                    </div>
                    {org.schema_name && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Schema:</span>
                        <code style={{ fontSize: '11px', background: 'var(--background-color)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--grey-200)' }}>
                          {org.schema_name}
                        </code>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--grey-200)' }}>
                    {isActive ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link
                          to="/dashboard/access"
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          Access
                        </Link>
                        <Link
                          to="/dashboard/catalog"
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          Inventory
                        </Link>
                      </div>
                    ) : (
                      <div />
                    )}

                    <button
                      className={`btn ${isActive ? 'btn-secondary' : ''}`}
                      type="button"
                      disabled={busy}
                      onClick={() => switchOrganization(org.id)}
                      style={{ minHeight: '34px', padding: '6px 14px', fontSize: '12px' }}
                    >
                      {isActive ? 'Current' : 'Switch Workspace →'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL: CREATE WORKSPACE                                        */}
      {/* ============================================================== */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        variant="fields"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Create a Company Workspace</h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              Set up a private, isolated business environment with its own dedicated database schema.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormRow
              name="name"
              labelText="Company / Workspace Name *"
              placeholder="e.g. Acme Logistics, Modi Tech"
              maxLength={200}
              autoComplete="organization"
              required
            />

            <div className="field-grid">
              <FormRow
                name="currency"
                labelText="Currency Code *"
                defaultValue="INR"
                maxLength={3}
                pattern="[A-Z]{3}"
                help="3-letter ISO code (e.g. INR, USD, EUR)"
                required
              />
              <FormRow
                name="timeZone"
                labelText="Time Zone *"
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
                maxLength={100}
                help="e.g. Asia/Kolkata or UTC"
                required
              />
            </div>

            <div
              style={{
                padding: '12px',
                background: 'var(--background-color)',
                borderRadius: '8px',
                border: '1px solid var(--grey-200)',
                fontSize: '12px',
                color: 'var(--text-secondary-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <strong style={{ color: 'var(--text-color)' }}>Database Isolation Notice</strong>
              <span>
                Creating this workspace automatically provisions a dedicated PostgreSQL schema. You will be assigned as
                the primary <strong>Workspace Owner</strong> with full administrative authority.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Provisioning Schema…' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
