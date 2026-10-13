import { designAssets } from '../assets/figma';

const DesignIcon = ({ name, className = '' }) => (
  <img className={`design-icon ${className}`} src={designAssets[name]} alt="" aria-hidden="true" />
);
export default DesignIcon;
