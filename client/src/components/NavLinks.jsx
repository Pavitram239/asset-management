import { useDashboardContext } from '../pages/DashboardLayout';
import { NavLink } from 'react-router-dom';
import links from '../utils/Links';
import DesignIcon from './DesignIcon';

const NavLinks = ({ mobile = false }) => {
  const { user } = useDashboardContext();
  return <nav className={mobile ? 'bottom-navigation' : 'nav-links'} aria-label={mobile ? 'Mobile navigation' : 'Workspace navigation'}>
    {links.filter((link) => (!link.elevated || user.role !== 'user') && (!mobile || ['.', 'add-product', 'profile'].includes(link.path))).map(({ text, path, icon }) =>
      <NavLink to={path} key={path} end title={text} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
        {({ isActive }) => <><DesignIcon name={isActive ? `${icon}-${mobile ? 'mobile-active' : 'active'}` : icon} /><span className="nav-label">{text}</span></>}
      </NavLink>)}
  </nav>;
};
export default NavLinks;
