import React, { useState } from 'react';
import { useDashboardContext } from '../pages/DashboardLayout';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { hasPermission } from '../utils/permissions';
import links from '../utils/Links';
import DesignIcon from './DesignIcon';

const NavLinks = ({ mobile = false }) => {
  const { user } = useDashboardContext();
  const location = useLocation();
  const isAccessRoute = location.pathname.includes('/access');
  const [dropdownOpen, setDropdownOpen] = useState(true);

  const activeQueryTab = new URLSearchParams(location.search).get('tab') || 'members';

  const visibleLinks = links.filter(
    (link) =>
      (!link.permission || hasPermission(user, link.permission)) &&
      (!link.permissions || link.permissions.some((permission) => hasPermission(user, permission))) &&
      (!mobile || ['.', 'requisitions', 'add-product', 'profile'].includes(link.path))
  );

  let currentSection = null;

  return (
    <nav className={mobile ? 'bottom-navigation' : 'nav-links'} aria-label={mobile ? 'Mobile navigation' : 'Workspace navigation'}>
      {visibleLinks.map((link) => {
        const { text, path, icon, subLinks, section } = link;
        const showSection = !mobile && section && section !== currentSection;
        if (showSection) {
          currentSection = section;
        }

        const linkElement = subLinks && !mobile ? (
          <div key={path} className="nav-group">
            <button
              type="button"
              className={`nav-link nav-dropdown-btn ${isAccessRoute ? 'active-parent' : ''}`}
              onClick={() => setDropdownOpen((prev) => !prev)}
              title={text}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <DesignIcon name={isAccessRoute ? `${icon}-active` : icon} />
                <span className="nav-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {text}
                </span>
              </div>
              <span
                className="nav-arrow"
                style={{
                  fontSize: '10px',
                  marginLeft: 'auto',
                  flexShrink: 0,
                  paddingLeft: '6px',
                  transition: 'transform 150ms ease',
                  transform: dropdownOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              >
                ▼
              </span>
            </button>

            {dropdownOpen && (
              <div className="nav-sub-links">
                {subLinks
                  .filter((sub) => {
                    if (sub.permission && !hasPermission(user, sub.permission)) return false;
                    if (sub.permissions && !sub.permissions.some((p) => hasPermission(user, p))) return false;
                    return true;
                  })
                  .map((sub) => {
                    const isSubActive = isAccessRoute && activeQueryTab === sub.tab;
                    return (
                      <Link
                        key={sub.tab}
                        to={sub.path}
                        className={`nav-sub-link ${isSubActive ? 'active' : ''}`}
                        title={sub.text}
                      >
                        <span className="sub-dot" />
                        <span className="nav-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sub.text}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          <NavLink
            to={path}
            key={path}
            end={path === '.'}
            title={text}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <DesignIcon name={isActive ? `${icon}-${mobile ? 'mobile-active' : 'active'}` : icon} />
                <span className="nav-label">{text}</span>
              </>
            )}
          </NavLink>
        );

        return (
          <React.Fragment key={path}>
            {showSection && (
              <div className="nav-section-title">{section}</div>
            )}
            {linkElement}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default NavLinks;
