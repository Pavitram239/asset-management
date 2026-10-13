import { useLocation } from 'react-router-dom';
import Logo from './Logo';
import { useDashboardContext } from '../pages/DashboardLayout';
import LogoutContainer from './LogoutContainer';
import ThemeToggle from './ThemeToggle';

const Navbar = () => {
  const { isDarkTheme, toggleDarkTheme } = useDashboardContext();
  const { pathname } = useLocation();
  const label = pathname.includes('/add-product') ? 'Add asset' : pathname.includes('/profile') ? 'Profile' : pathname.includes('/users') ? 'Users & departments' : pathname.includes('/admin') ? 'Admin statistics' : pathname.includes('/stats') ? 'Overview' : 'Inventory';
  return <header className="workspace-header">
    <span className="workspace-label">Workspace / {label}</span><div className="mobile-brand"><Logo /></div>
    <div className="header-controls"><ThemeToggle isDarkTheme={isDarkTheme} onToggle={toggleDarkTheme} /><LogoutContainer /></div>
  </header>;
};
export default Navbar;
