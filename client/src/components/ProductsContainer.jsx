import { useState } from 'react';
import { Form, Link } from 'react-router-dom';
import { useAllProductsContext } from '../pages/AllProducts';
import Modal from './Modal';
import ProductDetails, { AssetImage, StatusBadge } from './ProductDetails';
import DesignIcon from './DesignIcon';
import QrDownload from './QrDownload';
import PageBtnContainer from './PageBtnContainer';

const ProductsContainer = () => {
  const { data, searchValues } = useAllProductsContext();
  const [dialog, setDialog] = useState(null);
  const { products, totalProducts } = data;

  const sortLabels = { newest: 'Newest first', oldest: 'Oldest first', 'a-z': 'Name A–Z', 'z-a': 'Name Z–A' };
  const deleteForm = (asset) => <Form method="post" action={`delete-product/${asset._id}`}><button className="icon-button" type="submit" aria-label={`Delete ${asset.name}`} title="Delete asset"><DesignIcon name="trash" /></button></Form>;
  const rowActions = (asset) => <div className="table-actions">
    <button type="button" className="icon-button" onClick={() => setDialog({ type: 'detail', asset })} aria-label={`View ${asset.name}`} title="View asset"><DesignIcon name="eye" /></button>
    <button type="button" className="icon-button" onClick={() => setDialog({ type: 'qr', asset })} aria-label={`Download QR for ${asset.name}`} title="Download QR"><DesignIcon name="qr" /></button>
    {asset.capabilities?.update && <><Link className="icon-button" to={`edit-product/${asset._id}`} aria-label={`Edit ${asset.name}`} title="Edit asset"><DesignIcon name="pencil" /></Link>{asset.capabilities?.delete && deleteForm(asset)}</>}{!asset.capabilities?.update && asset.capabilities?.delete && deleteForm(asset)}
  </div>;
  return <section className="inventory-results">
    <div className="results-heading"><h3>{totalProducts} {totalProducts === 1 ? 'asset' : 'assets'}</h3><span className="caption">{sortLabels[searchValues.sort] || sortLabels.newest}</span></div>
    {!products.length ? <div className="panel empty-state"><h3>No assets found</h3><p>Try clearing your filters or add your first asset.</p><Link to="/dashboard" className="btn btn-secondary">Clear filters</Link></div> : <>
      <div className="desktop-asset-table"><table className="asset-table"><thead><tr><th>Asset / company</th><th>Assigned to</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{products.map((asset) => <tr key={asset._id}>
        <td><div className="asset-identity"><AssetImage product={asset} /><div><button className="asset-name" onClick={() => setDialog({ type: 'detail', asset })}>{asset.name}</button><small>{asset.company}</small></div></div></td>
        <td>{asset.assignedTo || 'Unassigned'}</td><td className="muted">{asset.department || '—'}</td><td><StatusBadge status={asset.status} /></td><td>{rowActions(asset)}</td>
      </tr>)}</tbody></table></div>
      <div className="asset-card-grid">{products.map((asset) => <article className="asset-card" key={asset._id}>
        <div className="card-identity"><AssetImage product={asset} /><div className="card-name"><h3>{asset.name}</h3><p>{asset.company}</p></div>
          <details className="card-context-menu"><summary className="icon-button" aria-label={`Actions for ${asset.name}`}><DesignIcon name="ellipsis" /></summary><div className="card-dropdown"><button type="button" onClick={() => setDialog({ type: 'detail', asset })}>View details</button>{asset.capabilities?.update && <><Link to={`edit-product/${asset._id}`}>Edit asset</Link>{asset.capabilities?.delete && deleteForm(asset)}</>}{!asset.capabilities?.update && asset.capabilities?.delete && deleteForm(asset)}</div></details>
        </div>
        <div className="card-assignment"><span>{asset.assignedTo || 'Unassigned'}</span><span>{asset.department || '—'}</span></div>
        <StatusBadge status={asset.status} />
        <div className="card-actions"><button type="button" className="btn btn-secondary" onClick={() => setDialog({ type: 'detail', asset })}>View</button><button type="button" className="btn btn-secondary" onClick={() => setDialog({ type: 'qr', asset })}><DesignIcon name="qr" />Download QR</button></div>
      </article>)}</div>
    </>}
    <PageBtnContainer />
    {dialog && <Modal open onClose={() => setDialog(null)} variant={dialog.type} title={dialog.type === 'qr' ? 'Download QR code' : 'Asset details'}>
      {dialog.type === 'qr' ? <QrDownload product={dialog.asset} onClose={() => setDialog(null)} /> : <ProductDetails product={dialog.asset} />}
    </Modal>}
  </section>;
};
export default ProductsContainer;
