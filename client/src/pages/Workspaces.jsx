import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardContext } from './DashboardLayout';
import DesignIcon from '../components/DesignIcon';

export default function Workspaces() {
  const { user, organizations, switchOrganization, activeOrganizationId } = useDashboardContext();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOrgs = (organizations || []).filter((org) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return org.name?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Your Authorized Workspaces</h2>
          <p>Switch between the client organizations you belong to. Each organization operates with dedicated business data isolation.</p>
        </div>
        {user.isSuperAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              to="/dashboard/platform"
              className="btn"
              style={{ minHeight: '38px', padding: '8px 18px', fontSize: '13px' }}
            >
              🛡️ Platform Administration
            </Link>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Client Organizations</h3>
            <span className="caption" style={{ color: 'var(--text-secondary-color)' }}>
              Select a workspace below to manage assets, inventory, and team members.
            </span>
          </div>

          {(organizations || []).length > 2 && (
            <input
              type="text"
              placeholder="Filter by organization name…"
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
            <p className="caption" style={{ maxWidth: '440px', margin: '6px 0 16px 0' }}>
              {organizations?.length === 0
                ? 'You do not belong to any client workspaces yet. Client workspaces are provisioned by your platform administrator.'
                : 'No workspaces match your search filter.'}
            </p>
            {user.isSuperAdmin && (
              <Link
                to="/dashboard/platform"
                className="btn"
                style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
              >
                Provision Client in Platform Admin
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
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
                          Status: Active Workspace
                        </span>
                      </div>
                    </div>

                    {isActive && (
                      <span
                        className="status-pill status-success"
                        style={{ fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '4px' }}
                      >
                        ● Active
                      </span>
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
                          Team & Access
                        </Link>
                        <Link
                          to="/dashboard"
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          Inventory
                        </Link>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => switchOrganization(org.id)}
                        style={{ padding: '6px 14px', fontSize: '12px', minHeight: '32px' }}
                      >
                        Switch to this Workspace
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
