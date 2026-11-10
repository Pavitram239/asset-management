import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardContext } from './DashboardLayout';
import customFetch from '../utils/customFetch';
import { hasPermission } from '../utils/permissions';
import { onboardingCommand } from '../utils/onboardingCommand';
import PrivateAttachments from '../components/PrivateAttachments';
import DesignIcon from '../components/DesignIcon';
import Modal from '../components/Modal';

const pages = async (path, params = {}) => {
  const result = [];
  let cursor;
  do {
    const response = (
      await customFetch.get(path, {
        params: { ...params, pageSize: 100, ...(cursor ? { cursor } : {}) },
      })
    ).data;
    result.push(...response.data);
    cursor = response.meta.nextCursor;
  } while (cursor);
  return result;
};

const MODE_LABELS = {
  individual: 'Individually Tracked Reusable',
  reusable_stock: 'Quantity-Tracked Reusable',
  consumable: 'Consumable Stock',
};

const MODE_PILLS = {
  individual: 'status-info',
  reusable_stock: 'status-success',
  consumable: 'status-warning',
};

export default function CatalogInventory() {
  const { user, activeOrganizationId } = useDashboardContext();
  const can = (permission) => hasPermission(user, permission);

  const [activeTab, setActiveTab] = useState('items'); // 'items' | 'stock'
  const [data, setData] = useState({
    items: [],
    balances: [],
    categories: [],
    units: [],
    locations: [],
    departments: [],
  });

  // Selected item & details
  const [selectedItem, setSelectedItem] = useState(null);
  const [lots, setLots] = useState([]);
  const [history, setHistory] = useState([]);
  const [detailTab, setDetailTab] = useState('specs'); // 'specs' | 'lots' | 'history' | 'files'

  // Async state
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [company, setCompany] = useState(null);

  // Filters
  const [itemSearch, setItemSearch] = useState('');
  const [itemModeFilter, setItemModeFilter] = useState('all');
  const [itemCategoryFilter, setItemCategoryFilter] = useState('all');
  const [itemStatusFilter, setItemStatusFilter] = useState('all');

  const [stockSearch, setStockSearch] = useState('');
  const [stockLocationFilter, setStockLocationFilter] = useState('all');

  // Modals
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [openingTargetItem, setOpeningTargetItem] = useState(null);
  const [knownCost, setKnownCost] = useState(false);

  const [supportLot, setSupportLot] = useState(null);

  const locked = useRef(false);
  const generation = useRef(0);
  const currentCompany = useRef(activeOrganizationId);
  currentCompany.current = activeOrganizationId;

  const load = useCallback(async () => {
    const turn = ++generation.current;
    setLoading(true);
    try {
      const read = can('catalog.read');
      const requestable = can('catalog.requestable.read');
      const manage = can('catalog.manage');
      const stock = can('inventory.read');
      const opening = can('inventory.opening');

      const [items, balances, categories, units, locations, settings] = await Promise.all([
        read
          ? pages('/catalog/items')
          : requestable
          ? pages('/catalog/requestable-items')
          : [],
        stock ? pages('/inventory/balances') : [],
        read || requestable || manage ? pages('/categories') : [],
        read || requestable || manage || stock || opening ? pages('/units-of-measure') : [],
        manage || stock || opening ? pages('/locations') : [],
        manage || opening ? customFetch.get('/access/management').then((r) => r.data) : null,
      ]);

      if (turn !== generation.current) return;
      setData({
        items,
        balances,
        categories,
        units,
        locations,
        departments: settings?.departments || [],
      });
      setCompany(settings?.organization || null);
      setError('');
    } catch (failure) {
      if (turn === generation.current) {
        setError(failure.response?.data?.msg || 'Unable to load inventory records.');
      }
    } finally {
      if (turn === generation.current) setLoading(false);
    }
  }, [user, activeOrganizationId]);

  useEffect(() => {
    setSelectedItem(null);
    setLots([]);
    setHistory([]);
    setEditingItem(null);
    setSelectedCategoryId('');
    setShowItemModal(false);
    setShowOpeningModal(false);
    setSupportLot(null);
    setError('');
    setNotice('');
    if (activeOrganizationId) load();
    else setLoading(false);
    return () => {
      generation.current++;
    };
  }, [activeOrganizationId, load]);

  const loadItemDetail = async (id) => {
    const org = currentCompany.current;
    try {
      const [item, itemLots, events] = await Promise.all([
        customFetch.get(`/catalog/items/${id}`).then((r) => r.data.data),
        can('inventory.read') ? pages('/inventory/lots', { itemId: id }) : [],
        pages(`/catalog/items/${id}/history`),
      ]);
      if (org !== currentCompany.current) return;
      setSelectedItem(item);
      setLots(itemLots);
      setHistory(events);
      setSupportLot(null);
      setDetailTab('specs');
    } catch (failure) {
      if (org === currentCompany.current) {
        setError(failure.response?.data?.msg || 'Unable to load details for this item.');
      }
    }
  };

  const run = async (operation, path, body, method = 'post') => {
    if (locked.current) return null;
    const org = currentCompany.current;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await onboardingCommand(operation, path, body, user._id, false, method);
      if (org !== currentCompany.current) return null;
      await load();
      if (org !== currentCompany.current) return null;
      setNotice('Changes saved successfully.');
      return result;
    } catch (failure) {
      if (org === currentCompany.current) {
        setError(failure.response?.data?.msg || 'The operation could not be confirmed. Retry the same details.');
      }
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  // Item Form Submission
  const categoryDefinitions = data.categories.find((c) => c.id === selectedCategoryId)?.fields || [];

  const handleOpenCreateItem = () => {
    setEditingItem(null);
    setSelectedCategoryId(data.categories[0]?.id || '');
    setShowItemModal(true);
  };

  const handleOpenEditItem = (item) => {
    setEditingItem(item);
    setSelectedCategoryId(item.categoryId);
    setShowItemModal(true);
  };

  const handleSubmitItem = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    const attributes = {};

    for (const field of categoryDefinitions) {
      const val = input[`attr_${field.key}`];
      if (val === undefined || val === '') continue;
      attributes[field.key] =
        field.type === 'number' ? Number(val) : field.type === 'boolean' ? val === 'true' : val;
    }

    const body = {
      name: input.name?.trim(),
      categoryId: selectedCategoryId,
      attributes,
      ...(editingItem
        ? {
            expectedVersion: editingItem.version,
            active: input.active === 'true',
            requestable: input.requestable === 'true',
          }
        : {
            unitId: input.unitId,
            trackingMode: input.trackingMode,
            departmentCode: input.departmentCode,
            ...(input.owningLocationId ? { owningLocationId: input.owningLocationId } : {}),
            requestable: input.requestable === 'true',
          }),
    };

    const res = await run(
      editingItem ? 'updateItem' : 'createItem',
      `/catalog/items${editingItem ? `/${editingItem.id}` : ''}`,
      body,
      editingItem ? 'patch' : 'post'
    );

    if (res) {
      setShowItemModal(false);
      setEditingItem(null);
      setSelectedCategoryId('');
      if (can('catalog.read')) await loadItemDetail(res.id);
    }
  };

  // Opening Balance Stock Submission
  const handleOpenRecordStock = (item) => {
    setOpeningTargetItem(item);
    setKnownCost(false);
    setShowOpeningModal(true);
  };

  const handleSubmitOpening = async (e) => {
    e.preventDefault();
    if (!openingTargetItem) return;
    const form = e.currentTarget;
    const input = Object.fromEntries(new FormData(form));

    const warranty = {
      ...(input.expiresOn ? { expiresOn: input.expiresOn } : {}),
      ...(input.coverage ? { coverage: input.coverage } : {}),
      ...(input.supportUrl ? { supportUrl: input.supportUrl } : {}),
    };

    const body = {
      itemId: openingTargetItem.id,
      locationId: input.locationId,
      quantity: input.quantity,
      reason: input.reason,
      receivedOn: input.receivedOn,
      ...(input.purchasedOn ? { purchasedOn: input.purchasedOn } : {}),
      ...(Object.keys(warranty).length ? { warranty } : {}),
      ...(knownCost ? { unitCost: { amount: input.unitCost, currency: input.currency } } : {}),
    };

    if (openingTargetItem.trackingMode === 'individual') {
      body.units = (input.identities || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [assetTag, serialNumber] = line.split('|').map((v) => v.trim());
          return { assetTag, ...(serialNumber ? { serialNumber } : {}) };
        });
    }

    const res = await run('postOpeningBalance', '/inventory/opening-balances', body);
    if (res) {
      setShowOpeningModal(false);
      setKnownCost(false);
      if (selectedItem?.id === openingTargetItem.id) {
        await loadItemDetail(selectedItem.id);
      }
    }
  };

  // Support / Warranty Submission
  const handleSubmitSupport = async (e) => {
    e.preventDefault();
    if (!supportLot || !selectedItem) return;
    const input = Object.fromEntries(new FormData(e.currentTarget));
    const warranty = {
      ...(input.expiresOn ? { expiresOn: input.expiresOn } : {}),
      ...(input.coverage ? { coverage: input.coverage } : {}),
      ...(input.supportUrl ? { supportUrl: input.supportUrl } : {}),
    };

    const res = await run(
      'updateLotSupport',
      `/inventory/lots/${supportLot.id}/support`,
      {
        expectedVersion: supportLot.version,
        warranty,
        reason: input.reason,
      },
      'patch'
    );

    if (res) {
      setSupportLot(null);
      await loadItemDetail(selectedItem.id);
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
        <h2>Catalog & Stock Inventory</h2>
        <p>Select a company workspace to inspect product catalogs and physical stock balances.</p>
      </div>
    );
  }

  // Filtered views
  const filteredItems = (data.items || []).filter((item) => {
    if (itemModeFilter !== 'all' && item.trackingMode !== itemModeFilter) return false;
    if (itemCategoryFilter !== 'all' && item.categoryId !== itemCategoryFilter) return false;
    if (itemStatusFilter === 'active' && !item.active) return false;
    if (itemStatusFilter === 'archived' && item.active) return false;
    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      const catName = data.categories.find((c) => c.id === item.categoryId)?.name || '';
      return item.name.toLowerCase().includes(q) || catName.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredBalances = (data.balances || []).filter((b) => {
    if (stockLocationFilter !== 'all' && b.locationId !== stockLocationFilter) return false;
    if (stockSearch.trim()) {
      const q = stockSearch.toLowerCase();
      return (
        b.itemName?.toLowerCase().includes(q) ||
        b.assetTag?.toLowerCase().includes(q) ||
        b.bucket?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const targetUnit = data.units.find((u) => u.id === openingTargetItem?.unitId);

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
        <h2>Catalog & Stock Inventory</h2>
        <p>Select a company workspace to view and manage catalog blueprints and stock balances.</p>
      </div>
    );
  }

  const hasCatalogAccess = [
    'catalog.read',
    'catalog.manage',
    'catalog.requestable.read',
    'inventory.read',
    'inventory.opening',
  ].some((p) => can(p));

  if (!hasCatalogAccess) {
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
        <p>You do not have permission to view or manage the catalog master or recorded stock balances.</p>
        <Link to="/dashboard" className="btn" style={{ marginTop: '16px' }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <h2>Catalog & Stock Inventory</h2>
        <p>Manage product models, specifications, and physical recorded stock balances across facilities.</p>
      </div>

      {/* Modern Sub-Tab Pill Bar */}
      <div className="access-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'items'}
          className={`access-tab ${activeTab === 'items' ? 'active' : ''}`}
          onClick={() => setActiveTab('items')}
        >
          <span>Catalog Master</span>
          <span className="badge">{data.items?.length || 0}</span>
        </button>

        {can('inventory.read') && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stock'}
            className={`access-tab ${activeTab === 'stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock')}
          >
            <span>Recorded Stock Balances</span>
            <span className="badge">{data.balances?.length || 0}</span>
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
      {/* TAB 1: CATALOG ITEMS MASTER                                    */}
      {/* ============================================================== */}
      {activeTab === 'items' && (
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
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                {can('catalog.read') ? 'Catalog Item Models' : 'Requestable Catalog'}
              </h3>
              <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                Standard item blueprints, classifications, and custom specifications.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search items or categories…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                style={{
                  minHeight: '36px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  background: 'var(--background-secondary-color)',
                  color: 'var(--text-color)',
                  fontSize: '13px',
                  width: '220px',
                }}
              />
              <select
                value={itemModeFilter}
                onChange={(e) => setItemModeFilter(e.target.value)}
                aria-label="Filter tracking mode"
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
                <option value="all">All Tracking Modes</option>
                <option value="individual">Individual Units</option>
                <option value="reusable_stock">Reusable Stock</option>
                <option value="consumable">Consumable Stock</option>
              </select>
              <select
                value={itemCategoryFilter}
                onChange={(e) => setItemCategoryFilter(e.target.value)}
                aria-label="Filter category"
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
                <option value="all">All Categories</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {can('catalog.manage') && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={handleOpenCreateItem}
                  style={{ minHeight: '36px', padding: '6px 16px', fontSize: '13px' }}
                >
                  + Add Catalog Item
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p role="status">Loading catalog records…</p>
          ) : !filteredItems.length ? (
            data.items.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'var(--primary-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-600)',
                    marginBottom: '12px',
                  }}
                >
                  <DesignIcon name="package" />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-color)' }}>
                  No Catalog Items Defined
                </h4>
                <p className="caption" style={{ maxWidth: '400px', margin: '6px 0 16px 0' }}>
                  Register product models, reusable assets, or consumables to start tracking physical quantities.
                </p>
                {can('catalog.manage') && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={handleOpenCreateItem}
                    style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
                  >
                    + Add First Catalog Item
                  </button>
                )}
              </div>
            ) : (
              <p className="caption" style={{ padding: '24px 0', textAlign: 'center' }}>
                No catalog items match your search or filters.
              </p>
            )
          ) : (
            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Tracking Mode</th>
                    <th>Base Unit</th>
                    <th>Owning Context</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const category = data.categories.find((c) => c.id === item.categoryId);
                    const unit = data.units.find((u) => u.id === item.unitId);
                    const location = data.locations.find((l) => l.id === item.owningLocationId);

                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{item.name}</strong>
                            {item.requestable && (
                              <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 500 }}>
                                Requestable by team
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '12px',
                              background: 'var(--background-color)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--grey-200)',
                            }}
                          >
                            {category?.name || 'Unassigned'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${MODE_PILLS[item.trackingMode] || 'status-neutral'}`}
                            style={{ fontSize: '11px' }}
                          >
                            {MODE_LABELS[item.trackingMode] || item.trackingMode}
                          </span>
                        </td>
                        <td>
                          <code
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              background: 'var(--background-color)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              border: '1px solid var(--grey-200)',
                            }}
                          >
                            {unit?.code || '—'}
                          </code>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                          <div>Dept: {item.departmentCode || 'All'}</div>
                          {location && <div>Loc: {location.name}</div>}
                        </td>
                        <td>
                          <span className={`status-pill ${item.active ? 'status-success' : 'status-danger'}`}>
                            {item.active ? '● Active' : '● Archived'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {can('catalog.read') && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => loadItemDetail(item.id)}
                              >
                                View Details
                              </button>
                            )}
                            {can('inventory.opening') && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => handleOpenRecordStock(item)}
                              >
                                + Record Stock
                              </button>
                            )}
                            {can('catalog.manage') && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                onClick={() => handleOpenEditItem(item)}
                              >
                                Edit
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
      )}

      {/* ============================================================== */}
      {/* TAB 2: RECORDED STOCK BALANCES                                 */}
      {/* ============================================================== */}
      {activeTab === 'stock' && can('inventory.read') && (
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
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Physical Stock Balances</h3>
              <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                On-hand inventory by location, condition bucket, and individual asset tags.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search item or asset tag…"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                style={{
                  minHeight: '36px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  background: 'var(--background-secondary-color)',
                  color: 'var(--text-color)',
                  fontSize: '13px',
                  width: '220px',
                }}
              />
              <select
                value={stockLocationFilter}
                onChange={(e) => setStockLocationFilter(e.target.value)}
                aria-label="Filter location"
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
                <option value="all">All Locations</option>
                {data.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p role="status">Loading stock balances…</p>
          ) : !filteredBalances.length ? (
            data.balances.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'var(--primary-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-600)',
                    marginBottom: '12px',
                  }}
                >
                  <DesignIcon name="boxes" />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-color)' }}>
                  No Physical Stock Recorded Yet
                </h4>
                <p className="caption" style={{ maxWidth: '420px', margin: '6px 0 16px 0' }}>
                  No stock has been posted to the inventory ledger. Go to the Catalog tab and click &ldquo;+ Record
                  Stock&rdquo; to add initial inventory.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveTab('items')}
                  style={{ minHeight: '38px', padding: '8px 20px', fontSize: '13px' }}
                >
                  View Catalog Items
                </button>
              </div>
            ) : (
              <p className="caption" style={{ padding: '24px 0', textAlign: 'center' }}>
                No stock balances match your filter criteria.
              </p>
            )
          ) : (
            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Item & Asset Tag</th>
                    <th>On-Hand Quantity</th>
                    <th>Condition Bucket</th>
                    <th>Storage Location</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.map((bal) => {
                    const loc = data.locations.find((l) => l.id === bal.locationId);
                    return (
                      <tr key={bal.accountId}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{bal.itemName}</strong>
                            {bal.assetTag && (
                              <code
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--primary-600)',
                                  marginTop: '2px',
                                }}
                              >
                                Tag: {bal.assetTag}
                              </code>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>
                            {bal.quantity} {bal.unitCode}
                          </strong>
                        </td>
                        <td>
                          <span
                            className="status-pill status-neutral"
                            style={{ fontSize: '11px', textTransform: 'capitalize' }}
                          >
                            {(bal.bucket || 'available').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: '13px', color: 'var(--text-secondary-color)' }}>
                          {loc?.name || 'No fixed premises'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {bal.unitId && can('asset.read') && (
                            <Link
                              to={`/dashboard?search=${encodeURIComponent(bal.itemName)}`}
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                            >
                              Inspect Asset Unit
                            </Link>
                          )}
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
      {/* MODAL 1: CREATE / EDIT CATALOG ITEM                            */}
      {/* ============================================================== */}
      <Modal
        open={showItemModal}
        onClose={() => {
          setShowItemModal(false);
          setEditingItem(null);
        }}
        variant="fields"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              {editingItem ? `Edit Item: ${editingItem.name}` : 'Create Catalog Item'}
            </h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              Define standard product specifications and inventory classifications.
            </p>
          </div>

          <form onSubmit={handleSubmitItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label className="form-row">
              <span className="form-label">Item Model / Name *</span>
              <input
                className="form-input"
                name="name"
                required
                maxLength={200}
                defaultValue={editingItem?.name || ''}
                placeholder="e.g. Dell Latitude 7420, Ergonomic Mesh Chair"
              />
            </label>

            <label className="form-row">
              <span className="form-label">Classification Category *</span>
              <select
                className="form-select"
                required
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
              >
                <option value="" disabled>
                  Choose a category
                </option>
                {data.categories
                  .filter((c) => c.status === 'active' || c.id === editingItem?.categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>

            {!editingItem && (
              <>
                <label className="form-row">
                  <span className="form-label">Tracking Mode *</span>
                  <select className="form-select" name="trackingMode" defaultValue="individual">
                    {Object.entries(MODE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="caption">
                    Individual: unique tag/serial per item. Reusable: identical pooled stock. Consumable: depleting
                    supplies.
                  </span>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label className="form-row">
                    <span className="form-label">Base Unit of Measure *</span>
                    <select className="form-select" name="unitId" required defaultValue={data.units[0]?.id || ''}>
                      <option value="" disabled>
                        Select unit
                      </option>
                      {data.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.code}) · {u.quantityScale} decimals
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-row">
                    <span className="form-label">Owning Department *</span>
                    <select
                      className="form-select"
                      name="departmentCode"
                      required
                      defaultValue={data.departments[0]?.code || ''}
                    >
                      <option value="" disabled>
                        Select department
                      </option>
                      {data.departments
                        .filter((d) => d.active)
                        .map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <label className="form-row">
                  <span className="form-label">Owning Location (Optional)</span>
                  <select className="form-select" name="owningLocationId" defaultValue="">
                    <option value="">No fixed default location</option>
                    {data.locations
                      .filter((l) => l.active)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.kind})
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}

            {/* Dynamic Category Custom Attributes */}
            {categoryDefinitions.length > 0 && (
              <div
                style={{
                  padding: '12px',
                  background: 'var(--background-color)',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <strong style={{ fontSize: '13px', color: 'var(--text-color)' }}>
                  Category Specifications ({categoryDefinitions.length})
                </strong>
                {categoryDefinitions.map((field) => (
                  <label className="form-row" key={field.key} style={{ margin: 0 }}>
                    <span className="form-label">
                      {field.label} {field.required && '*'}
                    </span>
                    {field.type === 'choice' ? (
                      <select
                        className="form-select"
                        name={`attr_${field.key}`}
                        required={field.required}
                        defaultValue={String(editingItem?.attributes?.[field.key] ?? '')}
                      >
                        <option value="">Choose an option…</option>
                        {(field.choices || []).map((ch) => (
                          <option key={ch} value={ch}>
                            {ch}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'boolean' ? (
                      <select
                        className="form-select"
                        name={`attr_${field.key}`}
                        required={field.required}
                        defaultValue={String(editingItem?.attributes?.[field.key] ?? '')}
                      >
                        <option value="">Choose…</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        name={`attr_${field.key}`}
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        step={field.type === 'number' ? 'any' : undefined}
                        required={field.required}
                        defaultValue={editingItem?.attributes?.[field.key] ?? ''}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}

            <label className="form-row">
              <span className="form-label">Team Request Catalog Visibility</span>
              <select
                className="form-select"
                name="requestable"
                defaultValue={String(editingItem?.requestable ?? true)}
              >
                <option value="true">Visible & requestable by authorized employees</option>
                <option value="false">Hidden from employee self-service catalog</option>
              </select>
            </label>

            {editingItem && (
              <label className="form-row">
                <span className="form-label">Status</span>
                <select className="form-select" name="active" defaultValue={String(editingItem.active)}>
                  <option value="true">Active</option>
                  <option value="false">Archived</option>
                </select>
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowItemModal(false);
                  setEditingItem(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : editingItem ? 'Save Item Changes' : 'Create Item'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 2: RECORD OPENING PHYSICAL STOCK                         */}
      {/* ============================================================== */}
      <Modal
        open={showOpeningModal}
        onClose={() => {
          setShowOpeningModal(false);
          setOpeningTargetItem(null);
        }}
        variant="detail"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              Record Existing Stock: {openingTargetItem?.name}
            </h3>
            <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
              Post verified physical quantities to the inventory ledger.
            </p>
          </div>

          <form onSubmit={handleSubmitOpening} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="form-row">
                <span className="form-label">Quantity ({targetUnit?.code || 'Base Unit'}) *</span>
                <input
                  className="form-input"
                  name="quantity"
                  required
                  inputMode="decimal"
                  pattern="(0|[1-9][0-9]{0,13})(\.[0-9]{1,6})?"
                  placeholder="e.g. 10"
                />
                <span className="caption">Max {targetUnit?.quantityScale ?? 0} fractional digits.</span>
              </label>

              <label className="form-row">
                <span className="form-label">Storage Location *</span>
                <select className="form-select" name="locationId" required defaultValue="">
                  <option value="" disabled>
                    Choose location…
                  </option>
                  {data.locations
                    .filter((l) => l.active)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.kind})
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="form-row">
                <span className="form-label">Date Stock Was Received *</span>
                <input
                  type="date"
                  className="form-input"
                  name="receivedOn"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                />
              </label>

              <label className="form-row">
                <span className="form-label">Original Purchase Date</span>
                <input type="date" className="form-input" name="purchasedOn" />
              </label>
            </div>

            <label className="form-row">
              <span className="form-label">Stock Entry Reason / Notes</span>
              <input
                className="form-input"
                name="reason"
                maxLength={2000}
                placeholder="e.g. Initial inventory audit cutoff"
              />
            </label>

            {openingTargetItem?.trackingMode === 'individual' && (
              <label className="form-row">
                <span className="form-label">Asset Tags & Serial Numbers (One per line) *</span>
                <textarea
                  className="form-textarea"
                  name="identities"
                  required
                  rows={4}
                  placeholder={'TAG-001 | SN-987654\nTAG-002 | SN-987655\nTAG-003'}
                />
                <span className="caption">
                  Format each line as <code>AssetTag | SerialNumber</code> (serial number after the pipe is optional).
                </span>
              </label>
            )}

            {/* Financial Cost Fields */}
            {can('cost.read') && (
              <div
                style={{
                  padding: '12px',
                  background: 'var(--background-color)',
                  borderRadius: '8px',
                  border: '1px solid var(--grey-200)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={knownCost}
                    onChange={(e) => setKnownCost(e.target.checked)}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Acquisition unit cost is known</span>
                </label>

                {knownCost && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px', marginTop: '10px' }}>
                    <label className="form-row" style={{ margin: 0 }}>
                      <span className="caption">Cost Amount *</span>
                      <input
                        className="form-input"
                        name="unitCost"
                        required
                        inputMode="decimal"
                        placeholder="e.g. 850.00"
                      />
                    </label>
                    <label className="form-row" style={{ margin: 0 }}>
                      <span className="caption">Currency</span>
                      <input
                        className="form-input"
                        name="currency"
                        required
                        maxLength={3}
                        pattern="[A-Z]{3}"
                        defaultValue={company?.currency || 'USD'}
                        style={{ textTransform: 'uppercase' }}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Warranty & Product Support */}
            <div
              style={{
                padding: '12px',
                background: 'var(--background-color)',
                borderRadius: '8px',
                border: '1px solid var(--grey-200)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <strong style={{ fontSize: '13px', color: 'var(--text-color)' }}>Warranty & Support (Optional)</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="form-row" style={{ margin: 0 }}>
                  <span className="caption">Warranty Expiry Date</span>
                  <input type="date" className="form-input" name="expiresOn" />
                </label>
                <label className="form-row" style={{ margin: 0 }}>
                  <span className="caption">Support URL (HTTPS)</span>
                  <input
                    type="url"
                    className="form-input"
                    name="supportUrl"
                    placeholder="https://support.vendor.com"
                  />
                </label>
              </div>
              <label className="form-row" style={{ margin: 0 }}>
                <span className="caption">Coverage Details</span>
                <input
                  className="form-input"
                  name="coverage"
                  maxLength={4000}
                  placeholder="e.g. 3-Year On-Site Hardware Replacement"
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowOpeningModal(false);
                  setOpeningTargetItem(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Posting to Ledger…' : 'Post Opening Stock'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 3: ITEM DETAIL DRAWER & ATTACHMENTS                      */}
      {/* ============================================================== */}
      {selectedItem && (
        <Modal
          open={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          variant="detail"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>{selectedItem.name}</h3>
                  <span
                    className={`status-pill ${MODE_PILLS[selectedItem.trackingMode] || 'status-neutral'}`}
                    style={{ fontSize: '11px' }}
                  >
                    {MODE_LABELS[selectedItem.trackingMode]}
                  </span>
                  <span className={`status-pill ${selectedItem.active ? 'status-success' : 'status-danger'}`}>
                    {selectedItem.active ? '● Active' : '● Archived'}
                  </span>
                </div>
                <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                  Item ID: <code>{selectedItem.id}</code>
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {can('inventory.opening') && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '6px 14px', fontSize: '12px' }}
                    onClick={() => handleOpenRecordStock(selectedItem)}
                  >
                    + Record Stock
                  </button>
                )}
                {selectedItem.allowedActions?.includes('updateItem') && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '12px' }}
                    onClick={() => {
                      setSelectedItem(null);
                      handleOpenEditItem(selectedItem);
                    }}
                  >
                    Edit Item
                  </button>
                )}
              </div>
            </div>

            {selectedItem.attributeIssues?.length > 0 && (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  color: '#92400e',
                  fontSize: '13px',
                }}
              >
                ⚠️ Category fields have evolved: {selectedItem.attributeIssues.join('; ')}. Review this item before
                adding more stock.
              </div>
            )}

            {/* Sub-Tabs inside Detail Drawer */}
            <div className="access-tabs" style={{ marginBottom: '12px' }}>
              <button
                type="button"
                className={`access-tab ${detailTab === 'specs' ? 'active' : ''}`}
                onClick={() => setDetailTab('specs')}
                style={{ minHeight: '34px', padding: '4px 12px', fontSize: '12px' }}
              >
                Specifications
              </button>
              <button
                type="button"
                className={`access-tab ${detailTab === 'lots' ? 'active' : ''}`}
                onClick={() => setDetailTab('lots')}
                style={{ minHeight: '34px', padding: '4px 12px', fontSize: '12px' }}
              >
                Lots & Warranty ({lots.length})
              </button>
              <button
                type="button"
                className={`access-tab ${detailTab === 'history' ? 'active' : ''}`}
                onClick={() => setDetailTab('history')}
                style={{ minHeight: '34px', padding: '4px 12px', fontSize: '12px' }}
              >
                History ({history.length})
              </button>
              {(can('attachment.read') || can('attachment.write')) && (
                <button
                  type="button"
                  className={`access-tab ${detailTab === 'files' ? 'active' : ''}`}
                  onClick={() => setDetailTab('files')}
                  style={{ minHeight: '34px', padding: '4px 12px', fontSize: '12px' }}
                >
                  Private Files
                </button>
              )}
            </div>

            {/* 1. Specifications Tab */}
            {detailTab === 'specs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '10px', background: 'var(--background-color)', borderRadius: '8px', border: '1px solid var(--grey-200)' }}>
                    <span className="caption" style={{ fontSize: '11px' }}>Category</span>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      {data.categories.find((c) => c.id === selectedItem.categoryId)?.name || 'None'}
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--background-color)', borderRadius: '8px', border: '1px solid var(--grey-200)' }}>
                    <span className="caption" style={{ fontSize: '11px' }}>Base Unit</span>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      {data.units.find((u) => u.id === selectedItem.unitId)?.name} (
                      {data.units.find((u) => u.id === selectedItem.unitId)?.code})
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--background-color)', borderRadius: '8px', border: '1px solid var(--grey-200)' }}>
                    <span className="caption" style={{ fontSize: '11px' }}>Department</span>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{selectedItem.departmentCode || 'All'}</div>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--background-color)', borderRadius: '8px', border: '1px solid var(--grey-200)' }}>
                    <span className="caption" style={{ fontSize: '11px' }}>Requestable by Team</span>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{selectedItem.requestable ? 'Yes' : 'No'}</div>
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--text-color)', display: 'block', marginBottom: '8px' }}>
                    Custom Attributes
                  </strong>
                  {Object.keys(selectedItem.attributes || {}).length === 0 ? (
                    <p className="caption">No custom specifications defined for this item.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                      {Object.entries(selectedItem.attributes).map(([key, val]) => {
                        const label =
                          data.categories
                            .find((c) => c.id === selectedItem.categoryId)
                            ?.fields?.find((f) => f.key === key)?.label || key;
                        return (
                          <div
                            key={key}
                            style={{
                              padding: '8px 12px',
                              background: 'var(--background-color)',
                              borderRadius: '6px',
                              border: '1px solid var(--grey-200)',
                            }}
                          >
                            <span className="caption" style={{ fontSize: '11px' }}>{label}</span>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-color)' }}>
                              {String(val)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Acquisition Lots & Warranty Tab */}
            {detailTab === 'lots' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {!can('inventory.read') ? (
                  <p className="caption">Stock details require inventory access permission.</p>
                ) : !lots.length ? (
                  <p className="caption">No acquisition lots posted yet for this catalog item.</p>
                ) : (
                  lots.map((lot, idx) => (
                    <div
                      key={lot.id}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: 'var(--background-color)',
                        border: '1px solid var(--grey-200)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>
                          Stock Entry #{idx + 1}
                        </strong>
                        <span className="caption" style={{ fontSize: '12px' }}>
                          Received on {lot.receivedOn}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary-color)' }}>
                        Quantity: <strong>{lot.quantityReceived}</strong>{' '}
                        {data.units.find((u) => u.id === selectedItem.unitId)?.code}
                        {can('cost.read') && lot.unitCost && (
                          <span>
                            {' '}
                            · Unit Cost:{' '}
                            <strong>
                              {lot.unitCost.amount} {lot.unitCost.currency}
                            </strong>
                          </span>
                        )}
                      </p>
                      {lot.warranty?.expiresOn && (
                        <p style={{ margin: 0, fontSize: '12px', color: '#92400e' }}>
                          🛡️ Warranty Coverage until: <strong>{lot.warranty.expiresOn}</strong>
                          {lot.warranty.coverage ? ` (${lot.warranty.coverage})` : ''}
                        </p>
                      )}
                      {lot.warranty?.supportUrl && (
                        <div>
                          <a
                            href={lot.warranty.supportUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '12px', color: 'var(--primary-600)' }}
                          >
                            ↗ Vendor Support Link
                          </a>
                        </div>
                      )}
                      {can('catalog.manage') && (
                        <div style={{ marginTop: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '3px 10px', fontSize: '11px' }}
                            onClick={() => setSupportLot(lot)}
                          >
                            Update Warranty & Support
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 3. History Tab */}
            {detailTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!history.length ? (
                  <p className="caption">No revision history recorded.</p>
                ) : (
                  history.map((rev) => (
                    <div
                      key={rev.version}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--background-color)',
                        borderRadius: '6px',
                        border: '1px solid var(--grey-200)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '13px' }}>Revision {rev.version}</strong>
                        <span className="caption" style={{ marginLeft: '8px', fontSize: '12px' }}>
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <span className={`status-pill ${rev.active ? 'status-success' : 'status-danger'}`}>
                        {rev.active ? 'Active' : 'Archived'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 4. Private Files Tab */}
            {detailTab === 'files' && (
              <PrivateAttachments
                key={`${activeOrganizationId}:${selectedItem.id}`}
                user={user}
                organizationId={activeOrganizationId}
                item={selectedItem}
                lots={lots}
                balances={data.balances}
              />
            )}
          </div>
        </Modal>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: UPDATE WARRANTY & SUPPORT MODAL                       */}
      {/* ============================================================== */}
      {supportLot && (
        <Modal open={Boolean(supportLot)} onClose={() => setSupportLot(null)} variant="fields">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Update Product Support</h3>
              <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
                Manage warranty contracts and external service links for this acquisition lot.
              </p>
            </div>

            <form onSubmit={handleSubmitSupport} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label className="form-row">
                <span className="form-label">Warranty Expiry Date</span>
                <input
                  type="date"
                  className="form-input"
                  name="expiresOn"
                  defaultValue={supportLot.warranty?.expiresOn || ''}
                />
              </label>

              <label className="form-row">
                <span className="form-label">Warranty Coverage Description</span>
                <input
                  className="form-input"
                  name="coverage"
                  maxLength={4000}
                  defaultValue={supportLot.warranty?.coverage || ''}
                  placeholder="e.g. Parts & labor, on-site technician"
                />
              </label>

              <label className="form-row">
                <span className="form-label">Vendor Support Link (HTTPS)</span>
                <input
                  type="url"
                  className="form-input"
                  name="supportUrl"
                  defaultValue={supportLot.warranty?.supportUrl || ''}
                  placeholder="https://support.vendor.com/case-submission"
                />
              </label>

              <label className="form-row">
                <span className="form-label">Reason for Change *</span>
                <input
                  className="form-input"
                  name="reason"
                  required
                  maxLength={2000}
                  placeholder="e.g. Contract extension purchased"
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSupportLot(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Saving Support…' : 'Save Support Details'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
