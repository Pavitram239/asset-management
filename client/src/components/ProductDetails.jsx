import dayjs from 'dayjs';
import DesignIcon from './DesignIcon';

export const StatusBadge = ({ status }) => <span className={`status-pill ${status === 'In department' ? 'status-success' : status === 'Out of campus' ? 'status-warning' : 'status-muted'}`}>{status || 'Unknown'}</span>;
export const AssetImage = ({ product, large = false }) => product.productImg
  ? <img className={large ? 'detail-image' : 'asset-thumbnail'} src={product.productImg} alt={product.name} />
  : <div className={large ? 'detail-image image-fallback' : 'asset-thumbnail image-fallback'}><DesignIcon name="image" /><span>No Image</span></div>;

const ProductDetails = ({ product }) => {
  const fields = [
    ['name', 'Name'], ['company', 'Company'], ['purchaseDate', 'Purchase date'], ['warranty', 'Warranty'],
    ['createdBy', 'Created by'], ['assignedTo', 'Assigned to'], ['status', 'Status'], ['department', 'Department'],
    ['warrantyDate', 'Warranty date'], ['customerCare', 'Customer care'], ['power', 'Power'], ['capacity', 'Capacity'], ['serialNumber', 'Serial number'],
  ];
  const display = (key, value) => ['purchaseDate', 'warrantyDate'].includes(key) && value && dayjs(value).isValid() ? dayjs(value).format('DD MMM YYYY') : value || 'Unassigned';
  return <article className="asset-detail">
    <h3 className="dialog-heading" id="dialog-title-detail">Asset details</h3>
    <AssetImage product={product} large />
    <div className="detail-identity"><div className="page-heading"><h2>{product.name}</h2><p>{product.company}</p></div><StatusBadge status={product.status} /></div>
    <dl className="detail-metadata">{fields.filter(([key]) => ['name', 'company', 'assignedTo', 'status', 'department'].includes(key) || (product[key] !== undefined && product[key] !== null && product[key] !== '')).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{display(key, product[key])}</dd></div>)}</dl>
    {product.invoice && /^\/api\/v1\/products\//.test(product.invoice) && <a className="btn btn-secondary" href={product.invoice} target="_blank" rel="noopener noreferrer">Invoice ↗</a>}
  </article>;
};
export default ProductDetails;
