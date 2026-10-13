import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardContext } from '../pages/DashboardLayout';

const LogoutContainer = () => {
  const [open, setOpen] = useState(false);
  const { user, logoutUser } = useDashboardContext();
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  const initials = user.name?.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'U';
  return <div className="user-menu" ref={ref}>
    <button type="button" className="user-menu-trigger" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      {user.avatar ? <img className="user-avatar" src={user.avatar} alt="" /> : <span className="user-avatar">{initials}</span>}
      <span className="user-name">{user.name} <span aria-hidden="true">▾</span></span>
    </button>
    {open && <div className="account-dropdown"><Link to="profile" onClick={() => setOpen(false)}>Your profile</Link>{user.role !== 'user' && <><Link to="users" onClick={() => setOpen(false)}>Users & departments</Link><Link to="admin" onClick={() => setOpen(false)}>Admin statistics</Link></>}<button type="button" onClick={logoutUser}>Log out</button></div>}
  </div>;
};
export default LogoutContainer;
