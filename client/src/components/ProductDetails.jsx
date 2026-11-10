import dayjs from 'dayjs';
import DesignIcon from './DesignIcon';

export const StatusBadge = ({ status }) => {
  let badgeClass = 'status-muted';
  const s = (status || '').toLowerCase();
  if (['in department', 'in_dept', 'available'].includes(s)) {
    badgeClass = 'status-success';
  } else if (['out of campus', 'under_maintenance', 'out_of_campus'].includes(s)) {
    badgeClass = 'status-warning';
  } else if (['damaged', 'scrap', 'lost'].includes(s)) {
    badgeClass = 'status-danger';
  } else if (['not in department', 'assigned', 'in use', 'in_use'].includes(s)) {
    badgeClass = 'status-neutral';
  }
  return <span className={`status-pill ${badgeClass}`}>{status || 'Unassigned'}</span>;
};

export const AssetImage = ({ product, large = false }) => product.productImg
  ? <img className={large ? 'detail-image' : 'asset-thumbnail'} src={product.productImg} alt={product.name} />
  : <div className={large ? 'detail-image image-fallback' : 'asset-thumbnail image-fallback'}><DesignIcon name="image" /><span>No Image</span></div>;

const ProductDetails = ({ product }) => {
  const displayDate = (date) => (date && dayjs(date).isValid() ? dayjs(date).format('DD MMM YYYY') : '—');

  return (
    <article className="asset-detail">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '40px' }}>
        <h3 className="dialog-heading" id="dialog-title-detail" style={{ margin: 0 }}>
          Asset Details
        </h3>
        <StatusBadge status={product.status} />
      </div>

      <AssetImage product={product} large />

      <div className="detail-identity" style={{ gap: '6px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: 'var(--text-color)' }}>
          {product.name}
        </h2>
        <p style={{ color: 'var(--text-secondary-color)', fontSize: '14px', margin: 0 }}>
          {product.company} · ID: <code style={{ fontSize: '12px' }}>{product._id || product.id}</code>
        </p>
      </div>

      {product.catalogItemId && (
        <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '13px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DesignIcon name="info" />
          <span>
            <strong>Catalog Inventory Ledger:</strong> Physical custody, locations, and disposals are tracked via Inventory Stock Movements.
          </span>
        </div>
      )}

      {product.damageNotes && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <DesignIcon name="info-warning" />
          <div>
            <strong>Reported Issue / Damage:</strong>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{product.damageNotes}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary-color)', marginBottom: '8px' }}>
            Custody & Location
          </h4>
          <dl className="detail-metadata">
            <div><dt>Assigned To</dt><dd>{product.assignedTo || 'Unassigned'}</dd></div>
            <div><dt>Department</dt><dd>{product.department || '—'}</dd></div>
          </dl>
        </div>

        <div>
          <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary-color)', marginBottom: '8px' }}>
            Warranty & Lifecycle
          </h4>
          <dl className="detail-metadata">
            <div><dt>Purchase Date</dt><dd>{displayDate(product.purchaseDate)}</dd></div>
            <div><dt>Warranty Status</dt><dd>{product.warranty || 'Available'}</dd></div>
            {product.warrantyDate && <div><dt>Warranty Expiry</dt><dd>{displayDate(product.warrantyDate)}</dd></div>}
            {product.customerCare && <div><dt>Customer Care</dt><dd>{product.customerCare}</dd></div>}
          </dl>
        </div>

        {(product.serialNumber || product.power || product.capacity) && (
          <div>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary-color)', marginBottom: '8px' }}>
              Specifications
            </h4>
            <dl className="detail-metadata">
              {product.serialNumber && <div><dt>Serial Number</dt><dd>{product.serialNumber}</dd></div>}
              {product.power && <div><dt>Power</dt><dd>{product.power}</dd></div>}
              {product.capacity && <div><dt>Capacity</dt><dd>{product.capacity}</dd></div>}
            </dl>
          </div>
        )}
      </div>

      {product.invoice && /^\/api\/v1\/products\//.test(product.invoice) && (
        <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--grey-200)' }}>
          <a className="btn btn-secondary" href={product.invoice} target="_blank" rel="noopener noreferrer">
            View Invoice ↗
          </a>
        </div>
      )}
    </article>
  );
};

export default ProductDetails;
