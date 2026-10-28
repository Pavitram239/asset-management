import { useLocation } from 'react-router-dom';
import Logo from './Logo';
import { useDashboardContext } from '../pages/DashboardLayout';
import LogoutContainer from './LogoutContainer';
import ThemeToggle from './ThemeToggle';

const Navbar = () => {
  const { isDarkTheme, toggleDarkTheme, organizations, activeOrganizationId, switchOrganization } = useDashboardContext();
  const { pathname } = useLocation();
  const label = pathname.includes('/workspaces') ? 'Workspaces' : pathname.includes('/invitations') ? 'Invitations' : pathname.includes('/access') ? 'Access management' : pathname.includes('/add-product') ? 'Add asset' : pathname.includes('/profile') ? 'Profile' : pathname.includes('/users') ? 'Users & departments' : pathname.includes('/admin') ? 'Admin statistics' : pathname.includes('/stats') ? 'Overview' : 'Inventory';
  return <header className="workspace-header">
    <span className="workspace-label">Workspace / {label}</span><div className="mobile-brand"><Logo /></div>
    <div className="header-controls"><label className="organization-picker">Organization <select aria-label="Active organization" value={activeOrganizationId || ''} onChange={event=>switchOrganization(event.target.value)}><option value="" disabled>Select organization</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><ThemeToggle isDarkTheme={isDarkTheme} onToggle={toggleDarkTheme} /><LogoutContainer /></div>
  </header>;
};
export default Navbar;
