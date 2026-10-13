import DesignIcon from './DesignIcon';

const Logo = ({ inverse = false, compact = false }) => (
  <span className={`brand ${inverse ? 'brand-inverse' : ''} ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-mark"><DesignIcon name={inverse ? 'boxes-inverse' : 'boxes'} /></span>
    <span className="brand-name">Asset Manager</span>
  </span>
);
export default Logo;
