import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardContext } from './DashboardLayout';
import customFetch from '../utils/customFetch';
import { hasPermission } from '../utils/permissions';
import { onboardingCommand } from '../utils/onboardingCommand';
import DesignIcon from '../components/DesignIcon';
import Modal from '../components/Modal';

const endpoints = {
  locations: '/locations',
  categories: '/categories',
  units: '/units-of-measure',
};

const permissions = {
  locations: 'location.manage',
  categories: 'category.manage',
  units: 'unit.manage',
};

const LOCATION_KINDS = [
  'branch',
  'building',
  'floor',
  'room',
  'store',
  'offsite',
  'unspecified',
];

const allPages = async (path) => {
  const rows = [];
  let cursor;
  do {
    const result = (
      await customFetch.get(path, {
        params: { pageSize: 100, ...(cursor ? { cursor } : {}) },
      })
    ).data;
    rows.push(...result.data);
    cursor = result.meta.nextCursor;
  } while (cursor);
  return rows;
};

export default function InventorySetup() {
  const { user, activeOrganizationId } = useDashboardContext();
  const [tab, setTab] = useState(() =>
    Object.keys(permissions).find((key) => hasPermission(user, permissions[key])) || 'locations'
  );
  const [data, setData] = useState({ locations: [], categories: [], units: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters & searches
  const [locationSearch, setLocationSearch] = useState('');
  const [locationKindFilter, setLocationKindFilter] = useState('all');
  const [locationStatusFilter, setLocationStatusFilter] = useState('all');

  const [categorySearch, setCategorySearch] = useState('');
  const [categoryStatusFilter, setCategoryStatusFilter] = useState('all');

  const [unitSearch, setUnitSearch] = useState('');

  // Modals & form state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingLocation, setMovingLocation] = useState(null);
  const [movePreviewData, setMovePreviewData] = useState(null);
  const [ackMove, setAckMove] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryFields, setCategoryFields] = useState([]);

  const [showUnitModal, setShowUnitModal] = useState(false);

  const lock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        Object.entries(endpoints).map(async ([key, path]) => [
          key,
          hasPermission(user, permissions[key]) ? await allPages(path) : [],
        ])
      );
      setData(Object.fromEntries(results));
      setError('');
    } catch (failure) {
      setError(failure.response?.data?.msg || 'Unable to load company setup.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeOrganizationId) load();
    else setLoading(false);
  }, [activeOrganizationId, load]);

  const run = async (operation, path, body, method = 'post', refresh = true) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await onboardingCommand(operation, path, body, user._id, false, method);
      if (refresh) {
        await load();
        setNotice('Changes saved successfully.');
      }
      return result;
    } catch (failure) {
      setError(failure.response?.data?.msg || 'The result could not be confirmed. Retry the same details.');
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  // Helper to compute hierarchy breadcrumb
  const getLocationPath = (loc, allLocs) => {
    const parts = [loc.name];
    let current = loc;
    while (current && current.parentId) {
      const parent = allLocs.find((l) => l.id === current.parentId);
      if (parent) {
        parts.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
    }
    return parts.join(' › ');
  };

  // Location Handlers
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name')?.trim();
    if (!name) return;

    if (editingLocation) {
      const res = await run(
        'updateLocation',
        `${endpoints.locations}/${editingLocation.id}`,
        { name, expectedVersion: editingLocation.version },
        'patch'
      );
      if (res) {
        setShowLocationModal(false);
        setEditingLocation(null);
      }
    } else {
      const kind = fd.get('kind');
      const parentId = fd.get('parentId') || undefined;
      const res = await run(
        'createLocation',
        endpoints.locations,
        { name, kind, ...(parentId ? { parentId } : {}) },
        'post'
      );
      if (res) {
        setShowLocationModal(false);
      }
    }
  };

  const handleToggleLocationActive = async (loc) => {
    await run(
      'updateLocation',
      `${endpoints.locations}/${loc.id}`,
      { expectedVersion: loc.version, active: !loc.active },
      'patch'
    );
  };

  const handleOpenMoveModal = (loc) => {
    setMovingLocation(loc);
    setMovePreviewData(null);
    setAckMove(false);
    setShowMoveModal(true);
  };

  const handlePreviewMove = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newParentId = fd.get('newParentId') || null;
    const res = await run(
      'previewLocationMove',
      `/locations/${movingLocation.id}/move-previews`,
      { expectedVersion: movingLocation.version, newParentId },
      'post',
      false
    );
    if (res) {
      setMovePreviewData(res);
    }
  };

  const handleConfirmMove = async (e) => {
    e.preventDefault();
    if (!movePreviewData) return;
    const res = await run(
      'moveLocation',
      `/locations/${movePreviewData.locationId}/moves`,
      {
        expectedVersion: movePreviewData.version,
        newParentId: movePreviewData.newParentId,
        impactPreviewId: movePreviewData.id,
        acknowledgeScopeChanges: ackMove,
      },
      'post'
    );
    if (res) {
      setShowMoveModal(false);
      setMovingLocation(null);
      setMovePreviewData(null);
    }
  };

  // Category Handlers
  const handleOpenCategoryModal = (cat = null) => {
    setEditingCategory(cat);
    if (cat) {
      setCategoryFields(
        (cat.fields || []).map((f) => ({
          ...f,
          choicesText: (f.choices || []).join('\n'),
        }))
      );
    } else {
      setCategoryFields([]);
    }
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name')?.trim();
    if (!name) return;

    const fields = categoryFields.map((f) => ({
      key: f.key.trim().toLowerCase(),
      label: f.label.trim(),
      type: f.type,
      required: Boolean(f.required),
      ...(f.type === 'choice'
        ? {
            choices: (f.choicesText || '')
              .split('\n')
              .map((c) => c.trim())
              .filter(Boolean),
          }
        : {}),
    }));

    const body = { name, fields };
    if (editingCategory) {
      body.expectedVersion = editingCategory.version;
    }

    const res = await run(
      editingCategory ? 'updateCategory' : 'createCategory',
      endpoints.categories + (editingCategory ? `/${editingCategory.id}` : ''),
      body,
      editingCategory ? 'patch' : 'post'
    );
    if (res) {
      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryFields([]);
    }
  };

  const handleToggleCategoryActive = async (cat) => {
    await run(
      'updateCategory',
      `${endpoints.categories}/${cat.id}`,
      { expectedVersion: cat.version, active: cat.status !== 'active' },
      'patch'
    );
  };

  // Unit of Measure Handlers
  const handleSaveUnit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = fd.get('code')?.trim().toUpperCase();
    const name = fd.get('name')?.trim();
    const quantityScale = Number(fd.get('quantityScale') || 0);

    const res = await run(
      'createUnitOfMeasure',
      endpoints.units,
      { code, name, quantityScale },
      'post'
    );
    if (res) {
      setShowUnitModal(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <div className="panel empty-state">
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--primary-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary-600)',
            marginBottom: '8px',
          }}
        >
          <DesignIcon name="package" />
        </div>
        <h2>Inventory Setup</h2>
        <p>Select a company workspace to configure facilities, item categories, and measurement units.</p>
      </div>
    );
  }

  const canManageInventory = ['location.manage', 'category.manage', 'unit.manage'].some((p) => hasPermission(user, p));
  if (!canManageInventory) {
    return (
      <div className="panel empty-state">
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#991b1b',
            marginBottom: '8px',
          }}
        >
          <DesignIcon name="close" />
        </div>
        <h2>Access Denied</h2>
        <p>You do not have administrative privileges to configure facilities, item categories, or measurement units.</p>
        <Link to="/dashboard" className="btn" style={{ marginTop: '16px' }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // Filtered views
  const filteredLocations = (data.locations || []).filter((loc) => {
    if (locationKindFilter !== 'all' && loc.kind !== locationKindFilter) return false;
    if (locationStatusFilter === 'active' && !loc.active) return false;
    if (locationStatusFilter === 'inactive' && loc.active) return false;
    if (locationSearch.trim()) {
      const q = locationSearch.toLowerCase();
      const path = getLocationPath(loc, data.locations || []).toLowerCase();
      return loc.name.toLowerCase().includes(q) || loc.kind.toLowerCase().includes(q) || path.includes(q);
    }
    return true;
  });

  const filteredCategories = (data.categories || []).filter((cat) => {
    if (categoryStatusFilter === 'active' && cat.status !== 'active') return false;
    if (categoryStatusFilter === 'archived' && cat.status === 'active') return false;
    if (categorySearch.trim()) {
      const q = categorySearch.toLowerCase();
      return cat.name.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredUnits = (data.units || []).filter((u) => {
    if (unitSearch.trim()) {
      const q = unitSearch.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <div className="page-heading">
        <h2>Inventory Setup</h2>
        <p>Define physical facilities, classification schemas, and quantity measurement scales.</p>
      </div>

      {/* Modern Sub-Tab Pill Bar */}
      <div className="access-tabs" role="tablist">
        {hasPermission(user, permissions.locations) && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'locations'}
            className={`access-tab ${tab === 'locations' ? 'active' : ''}`}
            onClick={() => setTab('locations')}
          >
            <span>Facilities & Locations</span>
            <span className="badge">{data.locations?.length || 0}</span>
          </button>
        )}
        {hasPermission(user, permissions.categories) && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'categories'}
            className={`access-tab ${tab === 'categories' ? 'active' : ''}`}
            onClick={() => setTab('categories')}
          >
            <span>Asset Categories</span>
            <span className="badge">{data.categories?.length || 0}</span>
          </button>
        )}
        {hasPermission(user, permissions.units) && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'units'}
            className={`access-tab ${tab === 'units' ? 'active' : ''}`}
            onClick={() => setTab('units')}
          >
            <span>Measurement Units</span>
            <span className="badge">{data.units?.length || 0}</span>
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {notice}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: FACILITIES & LOCATIONS                                  */}
      {/* ============================================================== */}
      {tab === 'locations' && hasPermission(user, permissions.locations) && (
        <div className="panel" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Locations & Warehouses</h3>
              <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                Manage physical premises, branches, rooms, and storage hierarchy.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search locations…"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
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
              <select
                value={locationKindFilter}
                onChange={(e) => setLocationKindFilter(e.target.value)}
                aria-label="Filter location kind"
                style={{
                  minHeight: '36px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  background: 'var(--background-secondary-color)',
                  color: 'var(--text-color)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Kinds</option>
                {LOCATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
              <select
                value={locationStatusFilter}
                onChange={(e) => setLocationStatusFilter(e.target.value)}
                aria-label="Filter location status"
                style={{
                  minHeight: '36px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  background: 'var(--background-secondary-color)',
                  color: 'var(--text-color)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Archived Only</option>
              </select>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setEditingLocation(null);
                  setShowLocationModal(true);
                }}
                style={{ minHeight: '36px', padding: '6px 16px', fontSize: '13px' }}
              >
                + Add Location
              </button>
            </div>
          </div>

          {loading ? (
            <p role="status">Loading locations…</p>
          ) : !filteredLocations.length ? (
            (data.locations || []).length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '12px' }}>
                  <DesignIcon name="boxes" />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-color)' }}>No Locations Registered</h4>
                <p className="caption" style={{ maxWidth: '400px', margin: '6px 0 16px 0' }}>
                  Register physical buildings, rooms, floors, or offsite facilities to organize and track physical assets.
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setEditingLocation(null);
                    setShowLocationModal(true);
                  }}
                  style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
                >
                  + Add First Location
                </button>
              </div>
            ) : (
              <p className="caption" style={{ padding: '24px 0', textAlign: 'center' }}>
                No locations match your filter criteria.
              </p>
            )
          ) : (
            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Location Name</th>
                    <th>Kind</th>
                    <th>Hierarchy Breadcrumb</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocations.map((loc) => {
                    const path = getLocationPath(loc, data.locations || []);
                    return (
                      <tr key={loc.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{loc.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span
                            className="status-pill status-neutral"
                            style={{ fontSize: '11px', textTransform: 'capitalize' }}
                          >
                            {loc.kind}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary-color)', fontSize: '12px' }}>
                          <span title={path}>{path}</span>
                        </td>
                        <td>
                          <span className={`status-pill ${loc.active ? 'status-success' : 'status-danger'}`}>
                            {loc.active ? '● Active' : '● Archived'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              disabled={busy}
                              onClick={() => {
                                setEditingLocation(loc);
                                setShowLocationModal(true);
                              }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              disabled={busy}
                              onClick={() => handleOpenMoveModal(loc)}
                            >
                              Move…
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              disabled={busy}
                              onClick={() => handleToggleLocationActive(loc)}
                            >
                              {loc.active ? 'Archive' : 'Reactivate'}
                            </button>
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
      )}

      {/* ============================================================== */}
      {/* TAB 2: ASSET CATEGORIES                                        */}
      {/* ============================================================== */}
      {tab === 'categories' && hasPermission(user, permissions.categories) && (
        <div className="panel" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Asset Categories</h3>
              <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                Classify items and configure category-specific custom attributes.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search categories…"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
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
              <select
                value={categoryStatusFilter}
                onChange={(e) => setCategoryStatusFilter(e.target.value)}
                aria-label="Filter category status"
                style={{
                  minHeight: '36px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  background: 'var(--background-secondary-color)',
                  color: 'var(--text-color)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="archived">Archived Only</option>
              </select>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => handleOpenCategoryModal(null)}
                style={{ minHeight: '36px', padding: '6px 16px', fontSize: '13px' }}
              >
                + Add Category
              </button>
            </div>
          </div>

          {loading ? (
            <p role="status">Loading categories…</p>
          ) : !filteredCategories.length ? (
            (data.categories || []).length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '12px' }}>
                  <DesignIcon name="package" />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-color)' }}>No Asset Categories</h4>
                <p className="caption" style={{ maxWidth: '400px', margin: '6px 0 16px 0' }}>
                  Group assets into categories (e.g. IT Equipment, Machinery, Furniture) and customize custom attributes.
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => handleOpenCategoryModal(null)}
                  style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
                >
                  + Create First Category
                </button>
              </div>
            ) : (
              <p className="caption" style={{ padding: '24px 0', textAlign: 'center' }}>
                No categories match your filter criteria.
              </p>
            )
          ) : (
            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Category Name</th>
                    <th>Custom Fields Schema</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((cat) => (
                    <tr key={cat.id}>
                      <td>
                        <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{cat.name}</strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            className="status-pill status-neutral"
                            style={{ fontSize: '11px', fontWeight: 600 }}
                          >
                            {(cat.fields || []).length} Custom{' '}
                            {(cat.fields || []).length === 1 ? 'Field' : 'Fields'}
                          </span>
                          {(cat.fields || []).slice(0, 3).map((f) => (
                            <span
                              key={f.key}
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-secondary-color)',
                                background: 'var(--background-color)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid var(--grey-200)',
                              }}
                            >
                              {f.label} ({f.type})
                            </span>
                          ))}
                          {(cat.fields || []).length > 3 && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary-color)' }}>
                              +{(cat.fields || []).length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${cat.status === 'active' ? 'status-success' : 'status-danger'}`}
                        >
                          {cat.status === 'active' ? '● Active' : '● Archived'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            disabled={busy}
                            onClick={() => handleOpenCategoryModal(cat)}
                          >
                            Edit Schema
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            disabled={busy}
                            onClick={() => handleToggleCategoryActive(cat)}
                          >
                            {cat.status === 'active' ? 'Archive' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: MEASUREMENT UNITS                                       */}
      {/* ============================================================== */}
      {tab === 'units' && hasPermission(user, permissions.units) && (
        <div className="panel" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Quantity Units of Measure</h3>
              <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                Standard units with locked mathematical precision scales for discrete and continuous items.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search units…"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
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
                className="btn"
                disabled={busy}
                onClick={() => setShowUnitModal(true)}
                style={{ minHeight: '36px', padding: '6px 16px', fontSize: '13px' }}
              >
                + Add Unit
              </button>
            </div>
          </div>

          {loading ? (
            <p role="status">Loading measurement units…</p>
          ) : !filteredUnits.length ? (
            (data.units || []).length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '12px' }}>
                  <DesignIcon name="boxes" />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-color)' }}>No Units of Measure</h4>
                <p className="caption" style={{ maxWidth: '400px', margin: '6px 0 16px 0' }}>
                  Set up standard counting units (e.g. Each, Kilogram, Litre) with fractional precision scales.
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setShowUnitModal(true)}
                  style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
                >
                  + Add First Unit
                </button>
              </div>
            ) : (
              <p className="caption" style={{ padding: '24px 0', textAlign: 'center' }}>
                No units match your search.
              </p>
            )
          ) : (
            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Unit Name</th>
                    <th>Code</th>
                    <th>Fractional Precision Scale</th>
                    <th>Permanent Scale Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnits.map((u) => (
                    <tr key={u.id || u.code}>
                      <td>
                        <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{u.name}</strong>
                      </td>
                      <td>
                        <code
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            background: 'var(--background-color)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--grey-200)',
                          }}
                        >
                          {u.code}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontSize: '13px', color: 'var(--text-color)' }}>
                          {u.quantityScale === 0 ? '0 decimals' : `${u.quantityScale} decimal places`}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${u.quantityScale === 0 ? 'status-neutral' : 'status-info'}`}
                          style={{ fontSize: '11px' }}
                        >
                          {u.quantityScale === 0 ? 'Discrete Whole Items (No Decimals)' : `Continuous Precision (10^−${u.quantityScale})`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: ADD / RENAME LOCATION                                 */}
      {/* ============================================================== */}
      <Modal
        open={showLocationModal}
        onClose={() => {
          setShowLocationModal(false);
          setEditingLocation(null);
        }}
        variant="fields"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              {editingLocation ? 'Rename Facility / Location' : 'Register New Location'}
            </h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              {editingLocation
                ? 'Update the display name of this physical location.'
                : 'Add a new building, room, warehouse, or offsite facility.'}
            </p>
          </div>

          <form onSubmit={handleSaveLocation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label className="form-row">
              <span className="form-label">Location Name *</span>
              <input
                className="form-input"
                name="name"
                required
                maxLength={200}
                defaultValue={editingLocation?.name || ''}
                placeholder="e.g. Headquarters - Floor 3"
              />
            </label>

            {!editingLocation && (
              <>
                <label className="form-row">
                  <span className="form-label">Facility Kind *</span>
                  <select className="form-select" name="kind" defaultValue="room">
                    {LOCATION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind.charAt(0).toUpperCase() + kind.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-row">
                  <span className="form-label">Parent Location</span>
                  <select className="form-select" name="parentId" defaultValue="">
                    <option value="">Company Root (Top-level premises)</option>
                    {(data.locations || [])
                      .filter((loc) => loc.active)
                      .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.kind})
                        </option>
                      ))}
                  </select>
                  <span className="caption">Nest this location inside an existing building, campus, or parent area.</span>
                </label>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowLocationModal(false);
                  setEditingLocation(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : editingLocation ? 'Save Name' : 'Create Location'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 2: MOVE LOCATION WITH LIVE IMPACT PREVIEW                */}
      {/* ============================================================== */}
      <Modal
        open={showMoveModal}
        onClose={() => {
          setShowMoveModal(false);
          setMovingLocation(null);
          setMovePreviewData(null);
        }}
        variant="fields"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              Move Location: {movingLocation?.name}
            </h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              Relocating a facility recalculates inheritance and access scopes for all child areas.
            </p>
          </div>

          {!movePreviewData ? (
            <form onSubmit={handlePreviewMove} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label className="form-row">
                <span className="form-label">New Parent Destination *</span>
                <select className="form-select" name="newParentId" defaultValue="">
                  <option value="">Company Root (Promote to top-level)</option>
                  {(data.locations || [])
                    .filter((l) => l.active && l.id !== movingLocation?.id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.kind})
                      </option>
                    ))}
                </select>
                <span className="caption">
                  Select where this branch should be relocated. Moving recalculates access for all descendant nodes.
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowMoveModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Calculating Impact…' : 'Review Move Impact'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmMove} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '14px', color: '#0f172a' }}>Scope Impact Analysis</strong>
                  <span className="status-pill status-neutral" style={{ fontSize: '11px' }}>
                    Expires {new Date(movePreviewData.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                  This relocation will update coverage for{' '}
                  <strong>{movePreviewData.affectedGrantIds?.length || 0}</strong> user authorization grants.
                </p>
                {movePreviewData.affectedScopes?.length > 0 ? (
                  <ul style={{ margin: '4px 0', paddingLeft: '18px', fontSize: '12px', color: '#334155' }}>
                    {movePreviewData.affectedScopes.map((scope) => (
                      <li key={scope.locationId}>
                        <strong>{scope.locationName}</strong>: {scope.grantCount} access grants will{' '}
                        {scope.change === 'gains' ? (
                          <span style={{ color: '#166534', fontWeight: 600 }}>gain</span>
                        ) : (
                          <span style={{ color: '#991b1b', fontWeight: 600 }}>lose</span>
                        )}{' '}
                        coverage of this node and descendants.
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: '12px', color: '#166534' }}>
                    No member grants lose or gain access from this tree move.
                  </p>
                )}
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '4px 0',
                }}
              >
                <input
                  type="checkbox"
                  required
                  checked={ackMove}
                  onChange={(e) => setAckMove(e.target.checked)}
                />
                <span>I have reviewed the permission scope impact and confirm this move.</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setMovePreviewData(null)}
                >
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy || !ackMove}>
                  {busy ? 'Relocating…' : 'Confirm Location Move'}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 3: ADD / EDIT CATEGORY & DYNAMIC SCHEMA BUILDER          */}
      {/* ============================================================== */}
      <Modal
        open={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
          setCategoryFields([]);
        }}
        variant="fields"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Create Asset Category'}
            </h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              Define schema attributes and custom metadata fields for items in this category.
            </p>
          </div>

          <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label className="form-row">
              <span className="form-label">Category Name *</span>
              <input
                className="form-input"
                name="name"
                required
                maxLength={200}
                defaultValue={editingCategory?.name || ''}
                placeholder="e.g. IT Equipment, Office Furniture"
              />
            </label>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <span className="form-label" style={{ margin: 0 }}>
                  Custom Schema Fields ({categoryFields.length})
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  disabled={categoryFields.length >= 200}
                  onClick={() =>
                    setCategoryFields((old) => [
                      ...old,
                      { key: '', label: '', type: 'text', required: false, choicesText: '' },
                    ])
                  }
                >
                  + Add Field
                </button>
              </div>

              {categoryFields.length === 0 ? (
                <div
                  style={{
                    padding: '16px',
                    textAlign: 'center',
                    background: 'var(--background-color)',
                    border: '1px dashed var(--grey-300)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: 'var(--text-secondary-color)',
                  }}
                >
                  No custom attributes configured. Standard asset properties (Serial No, Cost, Location) apply to all
                  items automatically.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    paddingRight: '4px',
                  }}
                >
                  {categoryFields.map((field, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        background: 'var(--background-color)',
                        border: '1px solid var(--grey-200)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: '13px' }}>Field #{idx + 1}</strong>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            color: '#991b1b',
                            borderColor: '#fca5a5',
                          }}
                          onClick={() => setCategoryFields((old) => old.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '8px' }}>
                        <label className="form-row" style={{ margin: 0 }}>
                          <span className="caption">Field Key *</span>
                          <input
                            className="form-input"
                            required
                            pattern="[a-z][a-z0-9_]{0,63}"
                            placeholder="e.g. ram_size"
                            value={field.key}
                            onChange={(e) =>
                              setCategoryFields((old) =>
                                old.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                              )
                            }
                            style={{ height: '34px', fontSize: '12px' }}
                          />
                        </label>
                        <label className="form-row" style={{ margin: 0 }}>
                          <span className="caption">Display Label *</span>
                          <input
                            className="form-input"
                            required
                            maxLength={100}
                            placeholder="e.g. RAM Capacity (GB)"
                            value={field.label}
                            onChange={(e) =>
                              setCategoryFields((old) =>
                                old.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r))
                              )
                            }
                            style={{ height: '34px', fontSize: '12px' }}
                          />
                        </label>
                        <label className="form-row" style={{ margin: 0 }}>
                          <span className="caption">Type</span>
                          <select
                            className="form-select"
                            value={field.type}
                            onChange={(e) =>
                              setCategoryFields((old) =>
                                old.map((r, i) => (i === idx ? { ...r, type: e.target.value } : r))
                              )
                            }
                            style={{ height: '34px', fontSize: '12px' }}
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="date">Date</option>
                            <option value="choice">Choice</option>
                          </select>
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              setCategoryFields((old) =>
                                old.map((r, i) => (i === idx ? { ...r, required: e.target.checked } : r))
                              )
                            }
                          />
                          <span>Required attribute</span>
                        </label>
                      </div>

                      {field.type === 'choice' && (
                        <label className="form-row" style={{ margin: 0 }}>
                          <span className="caption">Choice options (one per line)</span>
                          <textarea
                            className="form-textarea"
                            required
                            rows={3}
                            placeholder="Option 1&#10;Option 2&#10;Option 3"
                            value={field.choicesText}
                            onChange={(e) =>
                              setCategoryFields((old) =>
                                old.map((r, i) => (i === idx ? { ...r, choicesText: e.target.value } : r))
                              )
                            }
                            style={{ fontSize: '12px' }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                  setCategoryFields([]);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : editingCategory ? 'Save Schema' : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 4: ADD MEASUREMENT UNIT                                  */}
      {/* ============================================================== */}
      <Modal
        open={showUnitModal}
        onClose={() => setShowUnitModal(false)}
        variant="fields"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Create Unit of Measure</h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              Define standard measurement units and permanent fractional precision scales.
            </p>
          </div>

          <form onSubmit={handleSaveUnit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label className="form-row">
              <span className="form-label">Unit Code *</span>
              <input
                className="form-input"
                name="code"
                required
                maxLength={20}
                placeholder="e.g. EA, KG, LTR, BOX, MTR"
                style={{ textTransform: 'uppercase' }}
              />
              <span className="caption">Short uppercase code used in tables and ledger records.</span>
            </label>

            <label className="form-row">
              <span className="form-label">Display Name *</span>
              <input
                className="form-input"
                name="name"
                required
                maxLength={100}
                placeholder="e.g. Each, Kilogram, Litre, Box"
              />
            </label>

            <label className="form-row">
              <span className="form-label">Fractional Digits (Precision Scale) *</span>
              <input
                type="number"
                className="form-input"
                name="quantityScale"
                min={0}
                max={6}
                step={1}
                defaultValue={0}
              />
              <span className="caption">
                Use <strong>0</strong> for whole countable items (e.g. Laptops, Chairs). Use <strong>1–6</strong> for continuous quantities (e.g. 2.5 KG). <em>Note: Precision scale cannot be modified after creation.</em>
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowUnitModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Creating…' : 'Register Unit'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
