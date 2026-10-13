import Wrapper from '../assets/wrappers/BigSidebar';
import NavLinks from './NavLinks';
import Logo from './Logo';
import DesignIcon from './DesignIcon';
import { useDashboardContext } from '../pages/DashboardLayout';

const BigSidebar = () => {
  const { sidebarCollapsed, toggleSidebar, logoutUser } = useDashboardContext();
  return <Wrapper className="workspace-sidebar">
    <Logo /><NavLinks />
    <div className="sidebar-footer">
      <button type="button" className="nav-link" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><DesignIcon name="collapse" /><span className="nav-label">{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></button>
      <button type="button" className="nav-link" onClick={logoutUser} title="Log out"><DesignIcon name="logout" /><span className="nav-label">Log out</span></button>
    </div>
  </Wrapper>;
};
export default BigSidebar;
