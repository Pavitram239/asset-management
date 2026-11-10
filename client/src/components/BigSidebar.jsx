import Wrapper from '../assets/wrappers/BigSidebar';
import NavLinks from './NavLinks';
import Logo from './Logo';
import DesignIcon from './DesignIcon';
import { useDashboardContext } from '../pages/DashboardLayout';

const BigSidebar = () => {
  const { sidebarCollapsed, toggleSidebar, logoutUser, organizations, activeOrganizationId } = useDashboardContext();
  const currentOrg = organizations?.find(o => o.id === activeOrganizationId);

  return (
    <Wrapper className="workspace-sidebar">
      <div className="sidebar-header">
        <Logo />
        {currentOrg && (
          <div className="sidebar-workspace-chip" title={`Current Company: ${currentOrg.name}`}>
            <span className="org-avatar">{(currentOrg.name || 'C').charAt(0).toUpperCase()}</span>
            <div className="org-details">
              <span className="org-name">{currentOrg.name}</span>
              <span className="org-role">Active Company</span>
            </div>
          </div>
        )}
      </div>
      <NavLinks />
      <div className="sidebar-footer">
        <button type="button" className="nav-link" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><DesignIcon name="collapse" /><span className="nav-label">{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></button>
        <button type="button" className="nav-link" onClick={logoutUser} title="Log out"><DesignIcon name="logout" /><span className="nav-label">Log out</span></button>
      </div>
    </Wrapper>
  );
};
export default BigSidebar;
