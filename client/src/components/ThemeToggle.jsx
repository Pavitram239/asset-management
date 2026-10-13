import DesignIcon from './DesignIcon';

const ThemeToggle = ({ isDarkTheme, onToggle }) => (
  <button type="button" className="icon-button theme-toggle" onClick={onToggle}
    aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={isDarkTheme}>
    <DesignIcon name="moon" />
  </button>
);
export default ThemeToggle;
