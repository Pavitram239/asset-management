import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import useTheme from '../utils/useTheme';

const AuthLayout = ({ children }) => {
  const { isDarkTheme, toggleDarkTheme } = useTheme();
  return <main className="auth-layout">
    <aside className="auth-welcome">
      <Logo inverse />
      <div className="welcome-message"><h1>A clear view of<br />your shared assets.</h1><p>Keep every item, department and assignment in one focused workspace.</p></div>
      <div className="department-illustration"><h2>ONE CONNECTED INVENTORY</h2>
        {['kitchen', 'accounts', 'decoration', 'all'].map((department) => <div key={department}><span>{department}</span><span aria-hidden="true">→</span></div>)}
      </div>
      <p className="welcome-footnote">Asset Manager · Department-based access</p>
    </aside>
    <section className="auth-content">
      <header className="auth-header"><span className="auth-eyebrow">YOUR WORKSPACE, SIMPLIFIED</span><div className="mobile-brand"><Logo /></div><ThemeToggle isDarkTheme={isDarkTheme} onToggle={toggleDarkTheme} /></header>
      {children}
      <p className="caption auth-footnote">Access is based on your account role and department.</p>
    </section>
  </main>;
};
export default AuthLayout;
