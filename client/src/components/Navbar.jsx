import { useLocation } from 'react-router-dom';
import Logo from './Logo';
import { useDashboardContext } from '../pages/DashboardLayout';
import LogoutContainer from './LogoutContainer';
import ThemeToggle from './ThemeToggle';

const getPageTitle = (pathname) => {
  if (pathname.includes('/requisitions')) return 'Asset Requisitions & Approvals';
  if (pathname.includes('/catalog')) return 'Catalog & Stock Inventory';
  if (pathname.includes('/inventory-setup')) return 'Inventory Setup';
  if (pathname.includes('/access')) return 'Access Management & Security';
  if (pathname.includes('/add-product')) return 'Add New Asset';
  if (pathname.includes('/edit-product')) return 'Edit Asset';
  if (pathname.includes('/profile')) return 'Profile Settings';
  if (pathname.includes('/users')) return 'Team Directory';
  if (pathname.includes('/admin')) return 'Executive Statistics';
  if (pathname.includes('/invitations')) return 'Employee Invitations';
  if (pathname.includes('/workspaces')) return 'Companies';
  return 'Inventory Overview';
};

const Navbar = () => {
  const { isDarkTheme, toggleDarkTheme, organizations, activeOrganizationId, switchOrganization } = useDashboardContext();
  const { pathname } = useLocation();
  const label = getPageTitle(pathname);

  const activeOrg = organizations?.find((o) => o.id === activeOrganizationId) || organizations?.[0];

  return (
    <header className="workspace-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="workspace-label" style={{ fontWeight: 600, fontSize: '15px' }}>
          {label}
        </span>
      </div>

      <div className="mobile-brand">
        <Logo />
      </div>

      <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {organizations?.length > 1 ? (
          <label className="organization-picker" style={{ margin: 0 }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary-color)', marginRight: '6px' }}>Company:</span>
            <select
              aria-label="Active company"
              value={activeOrganizationId || ''}
              onChange={(event) => switchOrganization(event.target.value)}
              style={{
                minHeight: '36px',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid var(--grey-200)',
                background: 'var(--background-secondary-color)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div
            className="organization-picker"
            role={!activeOrganizationId && activeOrg?.id ? 'button' : undefined}
            tabIndex={!activeOrganizationId && activeOrg?.id ? 0 : undefined}
            onClick={() => {
              if (!activeOrganizationId && activeOrg?.id) {
                switchOrganization(activeOrg.id);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: 'var(--background-secondary-color)',
              borderRadius: '8px',
              border: '1px solid var(--grey-200)',
              cursor: !activeOrganizationId && activeOrg?.id ? 'pointer' : 'default',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
            <span style={{ color: 'var(--text-secondary-color)', fontSize: '12px' }}>Company:</span>
            <strong style={{ fontSize: '13px', color: 'var(--text-color)' }}>{activeOrg?.name || 'My Organization'}</strong>
          </div>
        )}

        <ThemeToggle isDarkTheme={isDarkTheme} onToggle={toggleDarkTheme} />
        <LogoutContainer />
      </div>
    </header>
  );
};

export default Navbar;
