import { useCallback, useEffect, useState } from 'react';
import { useDashboardContext } from './DashboardLayout';
import customFetch from '../utils/customFetch';
import { hasPermission } from '../utils/permissions';
import DesignIcon from '../components/DesignIcon';
import Modal from '../components/Modal';

const STATUS_PILLS = {
  pending_approval: { label: 'Pending Approval', cls: 'status-warning' },
  approved: { label: 'Approved (Ready for Pickup)', cls: 'status-info' },
  rejected: { label: 'Rejected', cls: 'status-danger' },
  fulfilled: { label: 'In Custody / Loaned', cls: 'status-success' },
  returned: { label: 'Returned to Store', cls: 'status-neutral' },
  cancelled: { label: 'Cancelled', cls: 'status-muted' },
};

export default function Requisitions() {
  const { user, activeOrganizationId } = useDashboardContext();

  const canApprove = hasPermission(user, 'requisition.approve');
  const canFulfill = hasPermission(user, 'requisition.fulfill');
  const canCreate = hasPermission(user, 'requisition.create');

  // Sub-tab: 'my_requests' | 'approvals' | 'handover'
  const [tab, setTab] = useState('my_requests');

  // Data state
  const [requisitions, setRequisitions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Search & filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [approvingReq, setApprovingReq] = useState(null);
  const [approvalDecision, setApprovalDecision] = useState('approve');
  const [approvalRemarks, setApprovalRemarks] = useState('');

  const [fulfillingReq, setFulfillingReq] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');

  const [returningReq, setReturningReq] = useState(null);
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnNotes, setReturnNotes] = useState('');

  // Load Requisitions
  const loadData = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      const [reqRes, deptsRes, assetsRes] = await Promise.all([
        customFetch.get('/requisitions', {
          params: {
            status: statusFilter !== 'all' ? statusFilter : undefined,
            urgency: urgencyFilter !== 'all' ? urgencyFilter : undefined,
            search: search.trim() || undefined,
          },
        }),
        customFetch.get('/users/departments').catch(() => ({ data: { departments: [] } })),
        customFetch.get('/products').catch(() => ({ data: { products: [] } })),
      ]);

      setRequisitions(reqRes.data.requisitions || []);
      setDepartments(deptsRes.data.departments || []);
      setAvailableAssets(
        (assetsRes.data.products || []).filter((p) => p.status === 'available' || p.status === true)
      );
      setError('');
    } catch (err) {
      setError(err.response?.data?.msg || 'Unable to load requisitions.');
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, statusFilter, urgencyFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Create Submission
  const handleCreateRequisition = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = {
      itemName: fd.get('itemName')?.trim(),
      purpose: fd.get('purpose')?.trim(),
      urgency: fd.get('urgency'),
      departmentCode: fd.get('departmentCode'),
      neededUntil: fd.get('neededUntil'),
      targetAssetId: fd.get('targetAssetId') || undefined,
    };

    try {
      const res = await customFetch.post('/requisitions', body);
      setNotice(`Requisition ${res.data.requisition.requisition_number} submitted successfully.`);
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to submit requisition.');
    } finally {
      setBusy(false);
    }
  };

  // Handle Approval / Rejection
  const handleConfirmApproval = async (e) => {
    e.preventDefault();
    if (!approvingReq) return;
    setBusy(true);
    setError('');
    try {
      await customFetch.patch(`/requisitions/${approvingReq.id}/approval`, {
        decision: approvalDecision,
        remarks: approvalRemarks,
      });
      setNotice(`Requisition ${approvingReq.requisition_number} ${approvalDecision === 'approve' ? 'approved' : 'rejected'}.`);
      setApprovingReq(null);
      setApprovalRemarks('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Approval decision failed.');
    } finally {
      setBusy(false);
    }
  };

  // Handle Fulfillment (Store Handover)
  const handleConfirmFulfillment = async (e) => {
    e.preventDefault();
    if (!fulfillingReq || !selectedAssetId) return;
    setBusy(true);
    setError('');
    try {
      await customFetch.patch(`/requisitions/${fulfillingReq.id}/fulfillment`, {
        issuedAssetId: selectedAssetId,
      });
      setNotice(`Asset officially issued and handed over for ${fulfillingReq.requisition_number}.`);
      setFulfillingReq(null);
      setSelectedAssetId('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Asset issuance failed.');
    } finally {
      setBusy(false);
    }
  };

  // Handle Return Check-in
  const handleConfirmReturn = async (e) => {
    e.preventDefault();
    if (!returningReq) return;
    setBusy(true);
    setError('');
    try {
      await customFetch.patch(`/requisitions/${returningReq.id}/return`, {
        returnCondition,
        returnNotes,
      });
      setNotice(`Asset for ${returningReq.requisition_number} returned and inspected (${returnCondition}).`);
      setReturningReq(null);
      setReturnNotes('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Return check-in failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <div className="panel empty-state">
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '8px' }}>
          <DesignIcon name="package" />
        </div>
        <h2>Requisitions & Approvals</h2>
        <p>Please select an active company to manage equipment requisitions, approvals, and handovers.</p>
      </div>
    );
  }

  // Filtered lists for the active sub-tab
  const myRequests = requisitions.filter((r) => r.requester_id === user._id || r.requester_id === user.id || tab === 'my_requests');
  const pendingApprovals = requisitions.filter((r) => r.status === 'pending_approval');
  const handoverQueue = requisitions.filter((r) => ['approved', 'fulfilled'].includes(r.status));

  const displayList = tab === 'my_requests' ? myRequests : tab === 'approvals' ? pendingApprovals : handoverQueue;

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Asset Requisitions & Approvals</h2>
          <p>Request equipment, approve departmental requisitions, and record storekeeper handovers & returns.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="btn"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <DesignIcon name="plus-white" />
            + Request Asset
          </button>
        )}
      </div>

      {/* Modern Sub-Tab Pill Bar */}
      <div className="access-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'my_requests'}
          className={`access-tab ${tab === 'my_requests' ? 'active' : ''}`}
          onClick={() => setTab('my_requests')}
        >
          <span>My Requisitions</span>
          <span className="badge">{myRequests.length}</span>
        </button>

        {canApprove && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'approvals'}
            className={`access-tab ${tab === 'approvals' ? 'active' : ''}`}
            onClick={() => setTab('approvals')}
          >
            <span>Pending Approvals</span>
            <span className="badge" style={{ background: pendingApprovals.length ? '#fef08a' : undefined, color: pendingApprovals.length ? '#854d0e' : undefined }}>
              {pendingApprovals.length}
            </span>
          </button>
        )}

        {canFulfill && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'handover'}
            className={`access-tab ${tab === 'handover' ? 'active' : ''}`}
            onClick={() => setTab('handover')}
          >
            <span>Store Handover & Returns</span>
            <span className="badge">{handoverQueue.length}</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {notice && (
        <div role="status" style={{ padding: '12px 16px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', marginBottom: '16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DesignIcon name="check" />
          <span>{notice}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="panel" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <input
          type="search"
          placeholder="Search item, req #, or purpose…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minHeight: '36px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--grey-200)', background: 'var(--background-secondary-color)', color: 'var(--text-color)', fontSize: '13px', width: '260px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minHeight: '36px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--grey-200)', background: 'var(--background-secondary-color)', color: 'var(--text-color)', fontSize: '13px' }}
          >
            <option value="all">All Statuses</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="fulfilled">In Custody</option>
            <option value="returned">Returned</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            style={{ minHeight: '36px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--grey-200)', background: 'var(--background-secondary-color)', color: 'var(--text-color)', fontSize: '13px' }}
          >
            <option value="all">All Urgency Levels</option>
            <option value="standard">Standard</option>
            <option value="urgent">Urgent</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Table & Cards */}
      <div className="panel" style={{ padding: '20px' }}>
        {loading ? (
          <p role="status">Loading requisitions…</p>
        ) : !displayList.length ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '12px' }}>
              <DesignIcon name="package" />
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16px' }}>No Requisitions Found</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary-color)', fontSize: '13px' }}>
              {tab === 'approvals' ? 'No incoming requests waiting for your approval.' : tab === 'handover' ? 'No equipment ready for store handover or return.' : 'You have not submitted any equipment requests yet.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="asset-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Req # & Item</th>
                  <th>Requester / Dept</th>
                  <th>Purpose</th>
                  <th>Return Deadline</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((req) => {
                  const statusInfo = STATUS_PILLS[req.status] || { label: req.status, cls: 'status-neutral' };
                  const isOverdue = req.status === 'fulfilled' && new Date(req.needed_until) < new Date();

                  return (
                    <tr key={req.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary-600)' }}>
                            {req.requisition_number}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>{req.item_name}</span>
                          {req.urgency === 'urgent' && (
                            <span style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 700 }}>⚡ URGENT</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>{req.requester_name}</span>
                          <span className="caption">{req.department_code}</span>
                        </div>
                      </td>
                      <td>
                        <p style={{ margin: 0, fontSize: '13px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.purpose}>
                          {req.purpose}
                        </p>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13px', color: isOverdue ? '#b91c1c' : undefined, fontWeight: isOverdue ? 700 : 400 }}>
                            {new Date(req.needed_until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {isOverdue && (
                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>OVERDUE!</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {/* Approval Actions */}
                          {canApprove && req.status === 'pending_approval' && (
                            <>
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => {
                                  setApprovingReq(req);
                                  setApprovalDecision('approve');
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '12px', color: '#b91c1c' }}
                                onClick={() => {
                                  setApprovingReq(req);
                                  setApprovalDecision('reject');
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {/* Storekeeper Handover Action */}
                          {canFulfill && req.status === 'approved' && (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 12px', fontSize: '12px', background: '#059669' }}
                              onClick={() => {
                                setFulfillingReq(req);
                                setSelectedAssetId(req.target_asset_id || availableAssets[0]?.id || availableAssets[0]?._id || '');
                              }}
                            >
                              Issue & Handover 📦
                            </button>
                          )}

                          {/* Storekeeper Return Check-in Action */}
                          {canFulfill && req.status === 'fulfilled' && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 12px', fontSize: '12px' }}
                              onClick={() => setReturningReq(req)}
                            >
                              Check-In Return ↩
                            </button>
                          )}

                          {/* Detailed View / Info */}
                          {req.approval_remarks && (
                            <span className="caption" title={`Remarks: ${req.approval_remarks}`}>
                              💬 Remarks
                            </span>
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

      {/* ============================================================== */}
      {/* MODAL 1: SUBMIT NEW REQUISITION                                */}
      {/* ============================================================== */}
      {showCreateModal && (
        <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} center>
          <div style={{ padding: '24px', maxWidth: '520px', width: '100%' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>Request an Asset</h3>
            <p className="caption" style={{ margin: '0 0 16px 0' }}>
              Submit an equipment requisition for approval by your department head.
            </p>

            <form onSubmit={handleCreateRequisition} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="form-row">
                <span className="form-label">Item / Equipment Name *</span>
                <input className="form-input" name="itemName" required placeholder="e.g. Sony 4K Projector or Banquet Chairs" />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="form-row">
                  <span className="form-label">Department *</span>
                  <select className="form-select" name="departmentCode" required defaultValue={user.department || departments[0] || 'IT'}>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </label>

                <label className="form-row">
                  <span className="form-label">Urgency *</span>
                  <select className="form-select" name="urgency" defaultValue="standard">
                    <option value="low">Low Priority</option>
                    <option value="standard">Standard</option>
                    <option value="urgent">Urgent (Event / Critical)</option>
                  </select>
                </label>
              </div>

              <label className="form-row">
                <span className="form-label">Return Deadline (Needed Until) *</span>
                <input
                  type="date"
                  className="form-input"
                  name="neededUntil"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  defaultValue={new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]}
                />
              </label>

              <label className="form-row">
                <span className="form-label">Purpose / Event Details *</span>
                <textarea
                  className="form-input"
                  name="purpose"
                  required
                  rows={3}
                  placeholder="Explain why this equipment is needed and which event/project it supports…"
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit Requisition'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: APPROVAL / REJECTION DECISION                         */}
      {/* ============================================================== */}
      {approvingReq && (
        <Modal open={Boolean(approvingReq)} onClose={() => setApprovingReq(null)} center>
          <div style={{ padding: '24px', maxWidth: '480px', width: '100%' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 600 }}>
              {approvalDecision === 'approve' ? 'Approve Requisition' : 'Reject Requisition'}
            </h3>
            <p className="caption" style={{ margin: '0 0 16px 0' }}>
              {approvingReq.requisition_number} · {approvingReq.item_name} for {approvingReq.requester_name}
            </p>

            <form onSubmit={handleConfirmApproval} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="form-row">
                <span className="form-label">Remarks / Instructions</span>
                <textarea
                  className="form-input"
                  rows={3}
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  placeholder={approvalDecision === 'approve' ? 'e.g. Approved. Please pick up from Room 204 before 3 PM.' : 'Reason for rejection…'}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setApprovingReq(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{ background: approvalDecision === 'approve' ? '#059669' : '#dc2626' }}
                  disabled={busy}
                >
                  {busy ? 'Saving…' : approvalDecision === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: STOREKEEPER HANDOVER / ISSUANCE                       */}
      {/* ============================================================== */}
      {fulfillingReq && (
        <Modal open={Boolean(fulfillingReq)} onClose={() => setFulfillingReq(null)} center>
          <div style={{ padding: '24px', maxWidth: '500px', width: '100%' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>Physical Handover & Issuance</h3>
            <p className="caption" style={{ margin: '0 0 16px 0' }}>
              Assign custody to <strong>{fulfillingReq.requester_name}</strong> for {fulfillingReq.item_name}.
            </p>

            <form onSubmit={handleConfirmFulfillment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="form-row">
                <span className="form-label">Select Physical Asset (or Scan QR Tag) *</span>
                <select
                  className="form-select"
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  required
                >
                  <option value="">-- Choose available asset to issue --</option>
                  {availableAssets.map((a) => (
                    <option key={a.id || a._id} value={a.id || a._id}>
                      {a.name} ({a.department || a.department_code || 'General Store'})
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '13px', color: '#065f46' }}>
                <strong>Return Due Date:</strong> {new Date(fulfillingReq.needed_until).toLocaleDateString()}
                <br />
                Custody will officially transfer to the requester upon confirmation.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setFulfillingReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" style={{ background: '#059669' }} disabled={busy || !selectedAssetId}>
                  {busy ? 'Issuing…' : 'Confirm Handover'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: RETURN CHECK-IN & CONDITION INSPECTION                */}
      {/* ============================================================== */}
      {returningReq && (
        <Modal open={Boolean(returningReq)} onClose={() => setReturningReq(null)} center>
          <div style={{ padding: '24px', maxWidth: '480px', width: '100%' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>Return Check-In & Inspection</h3>
            <p className="caption" style={{ margin: '0 0 16px 0' }}>
              Receiving return of {returningReq.item_name} from {returningReq.requester_name}.
            </p>

            <form onSubmit={handleConfirmReturn} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="form-row">
                <span className="form-label">Inspected Physical Condition *</span>
                <select
                  className="form-select"
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                >
                  <option value="good">🟢 Good / Fully Functional</option>
                  <option value="minor_wear">🟡 Minor Wear & Tear (Acceptable)</option>
                  <option value="damaged">🔴 Damaged / Needs Repair</option>
                </select>
              </label>

              <label className="form-row">
                <span className="form-label">Inspection Notes / Remarks</span>
                <textarea
                  className="form-input"
                  rows={3}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder={returnCondition === 'damaged' ? 'Describe damage, missing parts, or malfunction…' : 'All items verified and returned to shelf.'}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setReturningReq(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Recording…' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
