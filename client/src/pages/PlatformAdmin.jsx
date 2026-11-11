import React, { useState, useEffect } from 'react';
import { useLoaderData, redirect, useNavigate } from 'react-router-dom';
import customFetch from '../utils/customFetch';
import DesignIcon from '../components/DesignIcon';
import Modal from '../components/Modal';
import { FormRow } from '../components';
import { toast } from 'react-toastify';

export const loader = async () => {
  try {
    const { data: userData } = await customFetch.get('/users/current-user');
    if (!userData.user?.isSuperAdmin) {
      return redirect('/dashboard');
    }
    const { data: clientData } = await customFetch.get('/platform/clients');
    return { user: userData.user, initialClients: clientData.clients || [] };
  } catch (error) {
    if (error.response?.status === 401) return redirect('/');
    return redirect('/dashboard');
  }
};

const PlatformAdmin = () => {
  const { user, initialClients } = useLoaderData();
  const [clients, setClients] = useState(initialClients);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [createdAdminResult, setCreatedAdminResult] = useState(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchClients = async () => {
    try {
      const { data } = await customFetch.get('/platform/clients');
      setClients(data.clients || []);
    } catch (err) {
      toast.error('Failed to refresh clients');
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const { data } = await customFetch.post('/platform/clients', payload);
      toast.success(`Client "${payload.name}" provisioned successfully`);
      setShowCreateModal(false);
      setCreatedAdminResult({
        client: data.client,
        setupToken: data.adminSetupToken,
        adminEmail: payload.adminEmail,
      });
      await fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Failed to provision client');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (client) => {
    if (!window.confirm(`Are you sure you want to suspend "${client.name}"? Users will be blocked from accessing this workspace.`)) return;
    setActionBusy(client.id);
    try {
      await customFetch.patch(`/platform/clients/${client.id}/suspend`, { reason: 'Suspended by super admin' });
      toast.success(`"${client.name}" has been suspended`);
      await fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Failed to suspend client');
    } finally {
      setActionBusy(null);
    }
  };

  const handleReactivate = async (client) => {
    setActionBusy(client.id);
    try {
      await customFetch.patch(`/platform/clients/${client.id}/reactivate`);
      toast.success(`"${client.name}" has been reactivated`);
      await fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Failed to reactivate client');
    } finally {
      setActionBusy(null);
    }
  };

  const handleRetryProvisioning = async (client) => {
    setActionBusy(client.id);
    try {
      await customFetch.post(`/platform/clients/${client.id}/retry`);
      toast.success(`Provisioning retry initiated for "${client.name}"`);
      await fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Retry provisioning failed');
    } finally {
      setActionBusy(null);
    }
  };

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.adminEmail && c.adminEmail.toLowerCase().includes(search.toLowerCase())) ||
    (c.databaseName && c.databaseName.toLowerCase().includes(search.toLowerCase()))
  );

  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.status === 'active' && c.provisioningStatus === 'provisioned').length;
  const suspendedClients = clients.filter(c => c.status === 'suspended').length;
  const failedClients = clients.filter(c => c.provisioningStatus === 'failed' || c.status === 'failed').length;

  return (
    <>
      <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Platform Super Admin
            </span>
          </div>
          <h2>Client Organizations & Databases</h2>
          <p>Provision and manage isolated client organizations, each powered by a dedicated PostgreSQL database.</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setShowCreateModal(true)}
          style={{ minHeight: '38px', padding: '8px 18px', fontSize: '13px' }}
        >
          + Provision New Client
        </button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="panel" style={{ padding: '20px', borderLeft: '4px solid #3b82f6' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase' }}>Total Clients</span>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px' }}>{totalClients}</h3>
        </div>
        <div className="panel" style={{ padding: '20px', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase' }}>Active Clients</span>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', color: '#10b981' }}>{activeClients}</h3>
        </div>
        <div className="panel" style={{ padding: '20px', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase' }}>Suspended</span>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', color: '#f59e0b' }}>{suspendedClients}</h3>
        </div>
        <div className="panel" style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase' }}>Provisioning Errors</span>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', color: '#ef4444' }}>{failedClients}</h3>
        </div>
      </div>

      {/* Initial Admin Setup Invitation Modal / Dialog */}
      {createdAdminResult && (
        <div className="panel" style={{ padding: '20px', marginBottom: '24px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h4 style={{ margin: 0, color: '#065f46' }}>🎉 Client Organization Provisioned!</h4>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setCreatedAdminResult(null)}>
              Dismiss
            </button>
          </div>
          <p style={{ margin: '8px 0', fontSize: '13px', color: '#047857' }}>
            Client <strong>{createdAdminResult.client?.name}</strong> has been provisioned with its separate PostgreSQL database.
          </p>
          {createdAdminResult.setupToken && (
            <div style={{ marginTop: '10px', padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #d1fae5' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
                Expiring Administrator Setup Link (Sent to {createdAdminResult.adminEmail}):
              </span>
              <code style={{ fontSize: '12px', color: '#1e3a8a', wordBreak: 'break-all' }}>
                {window.location.origin}/invite#{createdAdminResult.setupToken}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Clients List Table */}
      <div className="panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ margin: 0 }}>All Managed Clients</h3>
          <input
            type="text"
            className="form-input"
            placeholder="Search by client or admin email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '280px', height: '36px' }}
          />
        </div>

        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary-color)', padding: '32px 0' }}>
            No client organizations found matching your search.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--grey-200)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>Client Organization</th>
                  <th style={{ padding: '12px 16px' }}>Database Routing</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Administrator</th>
                  <th style={{ padding: '12px 16px' }}>Members</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const isSuspended = client.status === 'suspended';
                  const isFailed = client.provisioningStatus === 'failed' || client.status === 'failed';
                  const isProvisioning = client.provisioningStatus === 'provisioning';

                  return (
                    <tr key={client.id} style={{ borderBottom: '1px solid var(--grey-100)', opacity: isSuspended ? 0.75 : 1 }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600 }}>{client.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary-color)' }}>ID: {client.id.slice(0, 8)}…</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--grey-100)', padding: '2px 6px', borderRadius: '4px' }}>
                          {client.databaseName || 'Shared Default'}
                        </span>
                        {client.provisioningError && (
                          <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '4px', maxWidth: '220px' }}>
                            Error: {client.provisioningError}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {isSuspended ? (
                          <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            Suspended
                          </span>
                        ) : isFailed ? (
                          <span className="badge badge-danger" style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            Provision Failed
                          </span>
                        ) : isProvisioning ? (
                          <span className="badge badge-info" style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            Provisioning…
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            Active
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {client.adminEmail || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {client.memberCount || 0}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isFailed && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={actionBusy === client.id}
                              onClick={() => handleRetryProvisioning(client)}
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                            >
                              {actionBusy === client.id ? 'Retrying…' : 'Retry'}
                            </button>
                          )}
                          {!isFailed && !isSuspended && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={actionBusy === client.id}
                              onClick={() => handleSuspend(client)}
                              style={{ padding: '4px 10px', fontSize: '12px', color: '#b45309' }}
                            >
                              Suspend
                            </button>
                          )}
                          {isSuspended && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={actionBusy === client.id}
                              onClick={() => handleReactivate(client)}
                              style={{ padding: '4px 10px', fontSize: '12px', color: '#15803d' }}
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision Client Modal */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateClient} style={{ padding: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '6px' }}>Provision Client Organization</h3>
            <p style={{ color: 'var(--text-secondary-color)', fontSize: '13px', marginBottom: '20px' }}>
              Creates a new client tenant, provisions its dedicated PostgreSQL database, and invites the initial client administrator.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <FormRow
                type="text"
                name="name"
                labelText="Client Organization Name *"
                placeholder="e.g. Acme Logistics or Globex Corp"
                required
              />
              <FormRow
                type="text"
                name="adminName"
                labelText="Initial Administrator Name *"
                placeholder="e.g. Jane Doe"
                required
              />
              <FormRow
                type="email"
                name="adminEmail"
                labelText="Administrator Work Email *"
                placeholder="admin@client.com"
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormRow
                  type="text"
                  name="currency"
                  labelText="Currency"
                  defaultValue="USD"
                  maxLength={3}
                />
                <FormRow
                  type="text"
                  name="timeZone"
                  labelText="Time Zone"
                  defaultValue="UTC"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Provisioning Database…' : 'Create & Provision'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
};

export default PlatformAdmin;

